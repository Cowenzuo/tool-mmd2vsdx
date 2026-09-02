// tests/helpers.ts — 共享测试工具（fixtures 定位、临时目录、结构比较）
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const testsDir = fileURLToPath(new URL('.', import.meta.url));
export const fixturesDir = path.join(testsDir, 'fixtures');
export const goldenDir = path.join(fixturesDir, 'golden');
export const snapshotDir = path.join(fixturesDir, 'snapshot');

/** 16 份金标准产物名（字典序，与 C++ FileScanner 一致）。 */
export function goldenVsdxFiles(): string[] {
    return readdirSync(goldenDir)
        .filter((f) => f.toLowerCase().endsWith('.vsdx'))
        .sort();
}

/** 独立临时目录（测试自清理）。 */
export function makeTempDir(prefix: string): string {
    return mkdtempSync(path.join(tmpdir(), prefix));
}

export function removeDir(dir: string): void {
    rmSync(dir, { recursive: true, force: true });
}

/** 结构深比较（JSON 序列化口径，节点/属性/文本/顺序全保真）。 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
