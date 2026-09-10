// parser 渲染器：进程内 Chromium（docs/redesign/03-解析层/01-parser）
//
// 注入顺序：提取脚本（ext/*.mjs 拼接 IIFE）→ 页面桥（ext/bridge.mjs）→
// mermaid UMD（node_modules/mermaid/dist/mermaid.min.js）。
// 生命周期：惰性单例、串行队列、一次失败重建、shutdown 关闭浏览器。

import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** mermaid 渲染失败（语法错等）。 */
export class MermaidParseError extends Error {
    constructor(message: string) {
        super(`[parse] ${message}`);
        this.name = 'MermaidParseError';
    }
}

export interface SnapshotJson {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    clusters: Array<Record<string, unknown>>;
    diagramType: string;
    direction: string;
    boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}

const kExtractFiles = ['generic.mjs', 'pie.mjs', 'quadrant.mjs', 'state.mjs', 'git.mjs', 'sequence.mjs', 'mindmap.mjs', 'c4.mjs', 'xy.mjs', 'class.mjs', 'er.mjs', 'gantt.mjs', 'bridge.mjs'];

export class SnapshotRenderer {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private queue: Promise<unknown> = Promise.resolve();

    /** 惰性启动并预热。 */
    private async ensure(): Promise<Page> {
        if (this.page) return this.page;
        const browser = await chromium.launch();
        this.browser = browser;
        const page = await browser.newPage();
        await page.setContent('<!doctype html><html><head></head><body></body></html>');
        await page.addScriptTag({
            content: readFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8'),
        });
        for (const f of kExtractFiles) {
            await page.addScriptTag({ content: readFileSync(join(here, 'ext', f), 'utf8') });
        }
        // 预热：mermaid 首次初始化开销大
        await this.call(page, 'graph TB; A-->B', 'mmd-preheat');
        this.page = page;
        return page;
    }

    private async call(page: Page, text: string, ns: string): Promise<SnapshotJson> {
        const r = (await page.evaluate(
            `window.__mmdRender(${JSON.stringify({ text, ns })})`,
        )) as { ok: boolean; data?: unknown; error?: string };
        if (!r.ok) throw new MermaidParseError(r.error ?? '未知渲染错误');
        return r.data as SnapshotJson;
    }

    /** 串行渲染一个 mermaid 文本 → 提取 JSON。 */
    async render(text: string, ns = 'mmd'): Promise<SnapshotJson> {
        const run = async (): Promise<SnapshotJson> => this.call(await this.ensure(), text, ns);
        const result = this.queue.then(run, run) as Promise<SnapshotJson>;
        this.queue = result.catch(() => undefined);
        try {
            return await result;
        } catch {
            // 一次失败：重建页面重试
            await this.rebuild();
            return this.call(await this.ensure(), text, ns);
        }
    }

    private async rebuild(): Promise<void> {
        await this.shutdown();
        this.page = null;
        this.browser = null;
    }

    async shutdown(): Promise<void> {
        await this.browser?.close().catch(() => undefined);
        this.browser = null;
        this.page = null;
    }
}
