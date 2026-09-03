// tests/helpers.ts — 共享测试工具（fixtures 定位、临时目录、结构比较、资产加载）
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ensureStencilAssets } from '../src/vsdxdoc/masters/stencilAssets.js';

export const testsDir = fileURLToPath(new URL('.', import.meta.url));
export const fixturesDir = path.join(testsDir, 'fixtures');
export const goldenDir = path.join(fixturesDir, 'golden');
export const snapshotDir = path.join(fixturesDir, 'snapshot');

/** 仓库内开发资产（assets/stencils/stencil-data.json；运行包不分发此文件）。 */
export function repoStencilAssetFile(): string {
    return path.join(testsDir, '..', 'assets', 'stencils', 'stencil-data.json');
}

/** 加载母版资产（幂等；真实母版路径的测试依赖它）。 */
export async function ensureTestStencils(): Promise<string> {
    return ensureStencilAssets({ assetFile: repoStencilAssetFile() });
}

// 统一供给：涉及 translate（真实母版）的测试文件经此就绪（vitest 每文件隔离，
// 这里按文件幂等执行一次；纯 JSON 解析开销约几十 ms，不触浏览器）
await ensureTestStencils();

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
