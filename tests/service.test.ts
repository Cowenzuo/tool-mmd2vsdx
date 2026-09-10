// M1 适配层验收：转换 / 校验 / 检视 / 批量，含路径策略与错误契约
// 对应用例见 docs/版本开发过程/alpha3/需求规格.md 第六节
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceError, ServiceSession } from '../source/service/index.js';

const kFlow = 'flowchart LR\n  A[开始] --> B[结束]';
const kClass = 'classDiagram\n  class Animal {\n    +String name\n  }\n  class Dog\n  Animal <|-- Dog';
const kGantt = 'gantt\n  title 排期\n  section 阶段\n  任务一: 2026-01-01, 3d';
const kNotDiagram = '这不是一张 mermaid 图';

let dir = '';
let session: ServiceSession;

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mmd2vsdx-service-'));
    session = new ServiceSession({ cwd: dir });
    const warm = await session.convert({ text: kFlow, overwrite: true });
    expect(warm.kind).toBe('flowchart');
});

afterAll(async () => {
    await session.shutdown();
    rmSync(dir, { recursive: true, force: true });
});

describe('service：转换', () => {
    it('落盘并给出回执', async () => {
        const r = await session.convert({ text: kClass, overwrite: true });
        expect(existsSync(r.path)).toBe(true);
        expect(readFileSync(r.path).length).toBe(r.bytes);
        expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(r.kind).toBe('class');
        expect(r.pageSize.widthIn).toBeGreaterThan(0);
        expect(r.pageSize.heightIn).toBeGreaterThan(0);
        expect(r.shapeCount).toBeGreaterThan(0);
        expect(Array.isArray(r.warnings)).toBe(true);
    });

    it('同输入两次转换字节一致', async () => {
        const a = await session.convert({ text: kFlow, path: 'same-1.vsdx', overwrite: true });
        const b = await session.convert({ text: kFlow, path: 'same-1.vsdx', overwrite: true });
        expect(b.sha256).toBe(a.sha256);
    });

    it('默认不覆盖既有文件', async () => {
        await session.convert({ text: kFlow, path: 'keep.vsdx', overwrite: true });
        await expect(session.convert({ text: kFlow, path: 'keep.vsdx' })).rejects.toMatchObject({
            name: 'ServiceError',
            code: 'path_denied',
        });
        const again = await session.convert({ text: kFlow, path: 'keep.vsdx', overwrite: true });
        expect(again.bytes).toBeGreaterThan(0);
    });

    it('输出路径越界被拒', async () => {
        const outside = join(dir, '..', `outside-${Date.now().toString(36)}.vsdx`);
        await expect(session.convert({ text: kFlow, path: outside })).rejects.toBeInstanceOf(ServiceError);
        await expect(session.convert({ text: kFlow, path: outside })).rejects.toMatchObject({ code: 'path_denied' });
    });

    it('输入超限被拒', async () => {
        const huge = `flowchart LR\n  A[${'x'.repeat(300 * 1024)}]`;
        await expect(session.convert({ text: huge })).rejects.toMatchObject({ code: 'too_large' });
    });
});

describe('service：校验', () => {
    it('正常输入给出图型与计数', async () => {
        const r = await session.validate(kFlow);
        expect(r.ok).toBe(true);
        expect(r.kind).toBe('flowchart');
        expect(r.counts.shapes).toBe(2);
        expect(r.counts.edges).toBe(1);
    });

    it('不支持的图型回报 unsupported_kind', async () => {
        const r = await session.validate(kGantt);
        expect(r.ok).toBe(false);
        expect(r.supported).toBe(false);
        expect(r.error?.code).toBe('unsupported_kind');
    });

    it('非图文本回报 parse_error', async () => {
        const r = await session.validate(kNotDiagram);
        expect(r.ok).toBe(false);
        expect(r.error?.code).toBe('parse_error');
        expect(r.error?.hint).toBeTruthy();
    });
});

describe('service：检视', () => {
    it('回报部件、页面尺寸与文本', async () => {
        const made = await session.convert({ text: 'flowchart LR\n  P[唯一标签甲] --> Q[唯一标签乙]', path: 'inspect-me.vsdx', overwrite: true });
        const r = session.inspect(made.path);
        expect(r.bytes).toBe(made.bytes);
        expect(r.parts.some((p) => p.uri === '/visio/document.xml')).toBe(true);
        expect(r.parts.some((p) => p.uri === '/visio/pages/page1.xml')).toBe(true);
        expect(r.pages[0]?.widthIn).toBeGreaterThan(0);
        expect(r.shapeCount).toBeGreaterThan(0);
        expect(r.texts).toContain('唯一标签甲');
    });

    it('越界路径被拒', () => {
        expect(() => session.inspect(join(dir, '..', 'nope.vsdx'))).toThrowError(ServiceError);
    });
});

describe('service：批量', () => {
    it('逐项隔离失败并给出汇总', async () => {
        writeFileSync(join(dir, 'from-file.mmd'), kFlow, 'utf8');
        const r = await session.convertMany([
            { text: kFlow, name: 'a.vsdx' },
            { text: kNotDiagram, name: 'b.vsdx' },
            { file: 'from-file.mmd' },
        ], 'batch-out');
        expect(r.total).toBe(3);
        expect(r.ok).toBe(2);
        expect(r.failed).toBe(1);
        expect(r.results[1]?.ok).toBe(false);
        expect(r.results[1]?.error?.code).toBe('parse_error');
        expect(r.results[0]?.path && existsSync(r.results[0].path)).toBe(true);
        expect(r.results[2]?.path?.endsWith('from-file.vsdx')).toBe(true);
    });

    it('空批量报参数错误', async () => {
        await expect(session.convertMany([])).rejects.toMatchObject({ code: 'invalid_argument' });
    });
});
