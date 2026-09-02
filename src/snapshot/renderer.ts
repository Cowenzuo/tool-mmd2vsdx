// mmd2vsdx - snapshot：renderer（进程内 Mermaid 渲染器）
//
// mermaid-snapshot/snapshot.mjs 进程内化（06 §1、坑位 ② 全组）：
//   - 无子进程/HTTP：直接 page.evaluate 调 window.__mermaidSnapshot；
//   - extract/*.mjs 原样收编（P2 前不做 TS 化——浏览器内 bundle 只能 IIFE，
//     保持"读源码 → 剥 export → 按依赖序拼接"注入机制，零行为风险）；
//   - 生命周期：惰性单例、预热（graph TB; A-->B）、串行队列（同一页面不可
//     并发 evaluate）、失败重建页面一次、shutdown 关浏览器无残留；
//   - mermaid 走 npm 官方包 node_modules/mermaid/dist/mermaid.min.js（UMD）。

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SnapshotResult } from '../core/snapshotTypes.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

// 拼接顺序 = snapshot.mjs EXTRACT_FILES（依赖序，勿改）
const kExtractFiles = [
    'dom.mjs',
    'flowchart.mjs',
    'er.mjs',
    'sequence.mjs',
    'class.mjs',
    'state.mjs',
    'c4.mjs',
    'gantt.mjs',
    'git.mjs',
    'mindmap.mjs',
    'pie.mjs',
    'quadrant.mjs',
    'generic.mjs',
    'main.mjs',
];

function buildExtractBundle(): string {
    const parts = kExtractFiles.map((f) =>
        readFileSync(path.join(here, 'extract', f), 'utf8').replace(/^export\s+/gm, ''));
    return parts.join('\n') + '\nwindow.__mermaidSnapshot = makeExtractFn();\n';
}

function mermaidPath(): string {
    return require.resolve('mermaid/dist/mermaid.min.js');
}

const kWarmupText = 'graph TB; A-->B';

/** 浏览器注入面（page.evaluate 回调内 globalThis 即 window；回调内联强转，
 *  不得引用模块级函数——Playwright 序列化不了闭包外符号）。 */
interface BrowserSnapshotGlobal {
    mermaid?: { initialize: (opts: Record<string, unknown>) => void };
    __mermaid?: unknown;
    __mermaidSnapshot?: (text: string) => Promise<unknown>;
}

export class SnapshotRenderer {
    private browser_: Browser | null = null;
    private page_: Page | null = null;
    private queue_: Promise<unknown> = Promise.resolve();
    private closed_ = false;

    private async ensurePage(): Promise<Page> {
        if (this.page_) return this.page_;
        if (!this.browser_) {
            this.browser_ = await chromium.launch({ headless: true });
        }
        const page = await this.browser_.newPage();
        await page.addScriptTag({ content: buildExtractBundle() });
        await page.addScriptTag({ path: mermaidPath() });
        await page.evaluate(() => {
            const w = globalThis as unknown as BrowserSnapshotGlobal;
            if (!w.mermaid) {
                throw new Error('mermaid not initialized from node_modules/mermaid/dist/mermaid.min.js');
            }
            w.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
            w.__mermaid = w.mermaid;
        });
        // 预热（失败忽略：真实转换时再触发一次重建）
        try {
            await page.evaluate((t) => {
                const w = globalThis as unknown as BrowserSnapshotGlobal;
                return w.__mermaidSnapshot!(t);
            }, kWarmupText);
        } catch {
            // 预热失败不致命
        }
        this.page_ = page;
        return page;
    }

    /** 渲染 Mermaid 文本 → SnapshotResult（串行；失败重建页面一次）。 */
    async renderDiagram(text: string): Promise<SnapshotResult> {
        if (this.closed_) throw new Error('[snapshot] renderer is closed');
        const task = this.queue_.then(async () => {
            try {
                return await this.evaluate(text);
            } catch (first) {
                // 崩溃/页面失效：重建页面重试一次（对齐原"崩溃自动重启"语义）
                await this.recreatePage();
                try {
                    return await this.evaluate(text);
                } catch (second) {
                    throw second;
                }
            }
        });
        this.queue_ = task.catch(() => {});
        return (await task) as SnapshotResult;
    }

    private async evaluate(text: string): Promise<unknown> {
        const page = await this.ensurePage();
        return page.evaluate((t) => {
            const w = globalThis as unknown as BrowserSnapshotGlobal;
            if (typeof w.__mermaidSnapshot !== 'function') {
                throw new Error('[snapshot] extract bundle not loaded');
            }
            return w.__mermaidSnapshot(t);
        }, text.replace(/\r/g, ''));
    }

    private async recreatePage(): Promise<void> {
        if (this.page_) {
            await this.page_.close().catch(() => {});
            this.page_ = null;
        }
    }

    /** 释放浏览器（幂等）。 */
    async shutdown(): Promise<void> {
        this.closed_ = true;
        if (this.page_) {
            await this.page_.close().catch(() => {});
            this.page_ = null;
        }
        if (this.browser_) {
            await this.browser_.close().catch(() => {});
            this.browser_ = null;
        }
    }
}

/** 结果守卫：确认快照结构可用（宽松校验关键字段）。 */
export function isSnapshotResult(value: unknown): value is SnapshotResult {
    if (typeof value !== 'object' || value === null) return false;
    const rec = value as Record<string, unknown>;
    return typeof rec['svg'] === 'string' && Array.isArray(rec['nodes']) &&
        Array.isArray(rec['edges']) && typeof rec['diagramType'] === 'string';
}
