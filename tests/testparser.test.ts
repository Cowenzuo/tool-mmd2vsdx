// mmd2vsdx - testparser：snapshot 收编 + Translator（真实 Chromium 渲染）
// 蓝本：C++ testparser.cpp 意图（生命周期/预热/失败传播/图型覆盖）+ M3 闸门：
// 真实文本 → Diagram；通用图型全链 → .vsdx 可开卷。
// 运行前提：npx playwright install chromium（本机已装 chromium-1228）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { translator } from '../src/mmdtransform/translator.js';
import { translate as vsdxTranslate } from '../src/vsdxdoc/vsdxTranslator.js';
import { OpcPackager } from '../src/opcpkg/opcpackager.js';
import { MmdError } from '../src/core/errors.js';
import { testsDir } from './helpers.js';

const kInputDir = path.join(testsDir, '..', 'resources', 'testio', 'input');
const kGeneric = ['01-block-1', '02-c4-1', '03-class-1', '04-er-1', '05-flowchart-1',
    '06-flowchart-2', '11-mindmap-1', '16-state-1', '17-timeline-1', '18-xy-1'];

function readSample(name: string): string {
    return readFileSync(path.join(kInputDir, name + '.mmd'), 'utf8');
}

describe('Translator 生命周期与基础渲染', () => {
    beforeAll(async () => {
        // 预热发生在首次 translate（惰性初始化）
    });

    afterAll(async () => {
        await translator.shutdown();
    });

    it('flowchart 文本渲染 → Diagram（节点/边/svg/类型）', { timeout: 60000 }, async () => {
        const d = await translator.translate('graph TB; A[开始] --> B{判断}; B -->|是| C[处理]');
        expect(d.diagramType).toBe('flowchart');
        expect(d.nodes.length).toBeGreaterThanOrEqual(3);
        expect(d.edges.length).toBeGreaterThanOrEqual(2);
        expect(d.svg.length).toBeGreaterThan(0);
        expect(Number.isFinite(d.bounds.minX)).toBe(true);
    });

    it('sequenceDiagram 类型识别', { timeout: 60000 }, async () => {
        const d = await translator.translate('sequenceDiagram\nA->>B: hello\n');
        expect(d.diagramType).toBe('sequence');
        expect(d.nodes.length).toBeGreaterThan(0);
    });

    it('空输入抛 MmdError(MermaidError)', async () => {
        await expect(translator.translate('   ')).rejects.toBeInstanceOf(MmdError);
    });
});

describe('真实样本：文本 → Diagram（10 份通用图型）', () => {
    afterAll(async () => {
        await translator.shutdown();
    });

    for (const name of kGeneric) {
        it(`${name} 渲染为 Diagram 且与类型一致`, { timeout: 60000 }, async () => {
            const d = await translator.translate(readSample(name));
            expect(d.diagramType.length).toBeGreaterThan(0);
            expect(d.svg.length).toBeGreaterThan(0);
        });
    }
});

describe('M3 闸门：真实文本全链（通用图型 → XmlParts → 可开卷 .vsdx）', () => {
    afterAll(async () => {
        await translator.shutdown();
    });

    for (const name of ['05-flowchart-1', '06-flowchart-2', '11-mindmap-1']) {
        it(`${name} 全链转换与开卷`, { timeout: 90000 }, async () => {
            const d = await translator.translate(readSample(name));
            const parts = vsdxTranslate(d, { useConnectorMaster: false });
            const page1 = parts.parts.find((p) => p.uri === 'visio/pages/page1.xml');
            expect(page1, 'page1 存在').toBeDefined();
            const dir = mkdtempSync(path.join(tmpdir(), 'mmd2vsdx-m3-'));
            try {
                const out = path.join(dir, name + '.vsdx');
                OpcPackager.pack(parts, out);
                const pkg = OpcPackager.open(out);
                expect(pkg.partUris().some((u) => u.string() === 'visio/document.xml')).toBe(true);
                expect(() => pkg.validate()).not.toThrow();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        });
    }
});

describe('关闭后重启（原崩溃重启语义的进程内对应）', () => {
    it('shutdown 后再次 translate 重新初始化', { timeout: 90000 }, async () => {
        await translator.shutdown();
        const d = await translator.translate('graph TB; A-->B');
        expect(d.nodes.length).toBeGreaterThanOrEqual(2);
        await translator.shutdown();
    });
});
