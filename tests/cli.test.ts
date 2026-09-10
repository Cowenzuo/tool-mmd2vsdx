// M2 验收：四个子命令、退出码、stdin 输入与错误回执
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, type CliIo } from '../source/cli/index.js';
import { ServiceSession } from '../source/service/index.js';

const kFlow = 'flowchart LR\n  A[开始] --> B[结束]';
const kGantt = 'gantt\n  title 排期\n  section 阶段\n  任务一: 2026-01-01, 3d';

let dir = '';
let session: ServiceSession;

function makeIo(stdin = ''): { io: CliIo; out: string[]; err: string[] } {
    const out: string[] = [];
    const err: string[] = [];
    return {
        io: {
            out: (t) => out.push(t),
            err: (t) => err.push(t),
            readStdin: async () => stdin,
        },
        out,
        err,
    };
}

function firstJson(out: string[]): Record<string, unknown> {
    return JSON.parse(out.join('\n')) as Record<string, unknown>;
}

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mmd2vsdx-cli-'));
    session = new ServiceSession({ cwd: dir });
    writeFileSync(join(dir, 'a.mmd'), kFlow, 'utf8');
    writeFileSync(join(dir, 'b.mmd'), 'classDiagram\n  class A\n  class B\n  A <|-- B', 'utf8');
    writeFileSync(join(dir, 'bad.mmd'), '这不是图', 'utf8');
    const warm = await runCli(['convert', 'a.mmd', '--out', 'warm.vsdx', '--overwrite'], makeIo().io, session);
    expect(warm).toBe(0);
});

afterAll(async () => {
    await session.shutdown();
    rmSync(dir, { recursive: true, force: true });
});

describe('cli：用法', () => {
    it('无参数与未知命令都返回 2，帮助返回 0', async () => {
        expect(await runCli([], makeIo().io, session)).toBe(2);
        expect(await runCli(['nope'], makeIo().io, session)).toBe(2);
        const help = makeIo();
        expect(await runCli(['--help'], help.io, session)).toBe(0);
        expect(help.out.join('\n')).toContain('用法：mmd2vsdx');
    });

    it('缺输入参数返回 2', async () => {
        expect(await runCli(['convert'], makeIo().io, session)).toBe(2);
        expect(await runCli(['inspect'], makeIo().io, session)).toBe(2);
    });
});

describe('cli：convert 与 validate', () => {
    it('文件输入落盘并回执 JSON', async () => {
        const c = makeIo();
        const code = await runCli(['convert', 'a.mmd', '--out', 'cli-out.vsdx', '--overwrite'], c.io, session);
        expect(code).toBe(0);
        const receipt = firstJson(c.out);
        expect(receipt.ok).toBe(true);
        expect(receipt.kind).toBe('flowchart');
        expect(typeof receipt.path).toBe('string');
        expect(existsSync(String(receipt.path))).toBe(true);
        expect(c.err.join('\n')).toContain('[convert]');
    });

    it('stdin 输入可用', async () => {
        const c = makeIo(kFlow);
        const code = await runCli(['convert', '-', '--out', 'stdin-out.vsdx', '--overwrite'], c.io, session);
        expect(code).toBe(0);
        expect(existsSync(join(dir, 'stdin-out.vsdx'))).toBe(true);
    });

    it('validate 通过返回 0，不支持的图型返回 1', async () => {
        const ok = makeIo();
        expect(await runCli(['validate', 'a.mmd'], ok.io, session)).toBe(0);
        expect(firstJson(ok.out).ok).toBe(true);

        const bad = makeIo(kGantt);
        expect(await runCli(['validate', '-'], bad.io, session)).toBe(1);
        const receipt = firstJson(bad.out) as { ok: boolean; error: { code: string } };
        expect(receipt.ok).toBe(false);
        expect(receipt.error.code).toBe('unsupported_kind');
    });

    it('越界输出返回 1 且错误码为 path_denied', async () => {
        const c = makeIo();
        const code = await runCli(['convert', 'a.mmd', '--out', join(dir, '..', 'outside.vsdx')], c.io, session);
        expect(code).toBe(1);
        const receipt = firstJson(c.out) as { error: { code: string } };
        expect(receipt.error.code).toBe('path_denied');
    });
});

describe('cli：batch 与 inspect', () => {
    it('批量目录里有坏输入时返回 1，并给出逐项结果', async () => {
        const src = join(dir, 'src');
        mkdirSync(src, { recursive: true });
        writeFileSync(join(src, 'one.mmd'), kFlow, 'utf8');
        writeFileSync(join(src, 'two.mmd'), kGantt, 'utf8');
        const c = makeIo();
        const code = await runCli(['batch', 'src', '--out', 'batch-out'], c.io, session);
        expect(code).toBe(1);
        const receipt = firstJson(c.out) as { total: number; succeeded: number; failed: number; results: Array<{ path?: string }> };
        expect(receipt.total).toBe(2);
        expect(receipt.succeeded).toBe(1);
        expect(receipt.failed).toBe(1);
        expect(existsSync(String(receipt.results[0]?.path))).toBe(true);
    });

    it('inspect 回报部件与形状数', async () => {
        const c = makeIo();
        const code = await runCli(['inspect', 'cli-out.vsdx'], c.io, session);
        expect(code).toBe(0);
        const receipt = firstJson(c.out) as { parts: unknown[]; shapeCount: number; pages: unknown[] };
        expect(receipt.parts.length).toBeGreaterThan(3);
        expect(receipt.shapeCount).toBeGreaterThan(0);
        expect(receipt.pages.length).toBe(1);
    });
});
