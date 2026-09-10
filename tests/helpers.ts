// tests/helpers.ts — 共享测试工具（fixtures 定位、临时目录、结构比较、资产加载）
import { mkdtempSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ensureStencilAssets } from '../src/vsdxdoc/masters/stencilAssets.js';

export const testsDir = fileURLToPath(new URL('.', import.meta.url));
export const fixturesDir = path.join(testsDir, 'fixtures');
export const goldenDir = path.join(fixturesDir, 'golden');
export const snapshotDir = path.join(fixturesDir, 'snapshot');

/** 仓库内开发资产路径（assets/stencils/stencil-data.json）。公开克隆不含
 *  模具相关文件（合规红线，见 docs/usage.md §〇·一）——本地/私有 CI 提供。 */
export function repoStencilAssetFile(): string {
    return path.join(testsDir, '..', 'assets', 'stencils', 'stencil-data.json');
}

/** 母版资产是否可用（公开克隆为 false → 真实母版用例经 skipIf 跳过）。 */
export const stencilAssetsAvailable: boolean = existsSync(repoStencilAssetFile());

/** 加载母版资产（有资产才加载；返回是否可用）。 */
export async function ensureTestStencils(): Promise<boolean> {
    if (!stencilAssetsAvailable) return false;
    await ensureStencilAssets({ assetFile: repoStencilAssetFile() });
    return true;
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
