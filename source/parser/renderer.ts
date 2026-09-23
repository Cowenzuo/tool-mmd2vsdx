// parser 渲染器：进程内 Chromium（docs/开发过程/01-结构设计.md）
//
// 注入顺序：提取脚本（ext/*.mjs 拼接 IIFE）→ 页面桥（ext/bridge.mjs）→
// mermaid UMD（node_modules/mermaid/dist/mermaid.min.js）。
// 生命周期：惰性单例、串行队列、一次失败重建、超时重建、shutdown 关闭浏览器。
// 常驻服务形态下两条硬要求：渲染要有超时（挂死会占住串行队列），
// shutdown 要与渲染串行（不能从正在渲染的调用脚下把浏览器抽走）。

import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** 浏览器状态：cold 未启动、warming 启动中、ready 可渲染。 */
export type RendererState = 'cold' | 'warming' | 'ready';

/** mermaid 渲染失败（语法错等）。 */
export class MermaidParseError extends Error {
    constructor(message: string) {
        super(`[parse] ${message}`);
        this.name = 'MermaidParseError';
    }
}

/** 单次渲染超时。抛出它时浏览器已经重建，后续请求不会排在挂死的调用后面。 */
export class RenderTimeoutError extends Error {
    readonly timeoutMs: number;

    constructor(timeoutMs: number) {
        super(`渲染超时：${timeoutMs} 毫秒内没有返回`);
        this.name = 'RenderTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}

/**
 * 渲染器已经关闭。空闲回收与请求会撞车：回收把实例关掉的同时，
 * 恰好有请求拿到了这个实例。此时调用方要换一个新实例，而不是复活旧的。
 */
export class RendererClosedError extends Error {
    constructor() {
        super('渲染器已关闭，需要换一个实例');
        this.name = 'RendererClosedError';
    }
}

interface SnapshotJson {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    clusters: Array<Record<string, unknown>>;
    diagramType: string;
    direction: string;
    boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}

// 提取器注入清单：只保留支持图型（2026-09 收敛：block/class/er/flowchart/sequence）。
// 其余图型的提取器已删除——不支持的图型在归一化阶段直接抛错，不做兜底降级。
const kExtractFiles = ['generic.mjs', 'sequence.mjs', 'class.mjs', 'er.mjs', 'bridge.mjs'];

/** 关浏览器的等待上限：超时就不再等，别让挂死的 Chromium 拖住下一次预热。 */
const kCloseGraceMs = 2000;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    if (!ms || ms <= 0) return p;
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new RenderTimeoutError(ms)), ms);
        p.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (e: unknown) => {
                clearTimeout(timer);
                reject(e);
            },
        );
    });
}

export class SnapshotRenderer {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private pending: Promise<Page> | null = null;
    private queue: Promise<unknown> = Promise.resolve();
    private closed = false;

    /** 当前状态，供服务的 /health 观察。 */
    get state(): RendererState {
        if (this.page) return 'ready';
        return this.pending ? 'warming' : 'cold';
    }

    /** 启动并预热浏览器；并发调用共用同一次启动。 */
    async warmup(): Promise<void> {
        this.assertOpen();
        await this.ensure();
    }

    private assertOpen(): void {
        if (this.closed) throw new RendererClosedError();
    }

    /** 惰性启动并预热；同一时刻只允许一次启动在跑。 */
    private async ensure(): Promise<Page> {
        if (this.page) return this.page;
        if (!this.pending) {
            this.pending = this.launch().finally(() => {
                this.pending = null;
            });
        }
        return this.pending;
    }

    private async launch(): Promise<Page> {
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

    /** 串行渲染一个 mermaid 文本 → 提取 JSON；timeoutMs 为 0 表示不限时。 */
    async render(text: string, ns = 'mmd', timeoutMs = 0): Promise<SnapshotJson> {
        this.assertOpen();
        const run = async (): Promise<SnapshotJson> => this.call(await this.ensure(), text, ns);
        const result = this.queue.then(run, run) as Promise<SnapshotJson>;
        this.queue = result.catch(() => undefined);
        try {
            return await withTimeout(result, timeoutMs);
        } catch (e) {
            if (e instanceof RenderTimeoutError) {
                // 放弃这一单：队列指针重置，后续请求不排在挂死的 promise 后面
                this.queue = Promise.resolve();
                await this.closeBrowser();
                throw e;
            }
            // 一次失败：重建页面重试
            await this.closeBrowser();
            return withTimeout(this.call(await this.ensure(), text, ns), timeoutMs);
        }
    }

    /**
     * 关闭浏览器。与渲染串行：正在渲染时先等它结束，再从队列后面关，
     * 免得把浏览器从一次进行中的渲染脚下抽走。
     */
    async shutdown(): Promise<void> {
        this.closed = true;
        const result = this.queue.then(
            () => this.closeBrowser(),
            () => this.closeBrowser(),
        );
        this.queue = result.catch(() => undefined);
        await result;
    }

    private async closeBrowser(): Promise<void> {
        const browser = this.browser;
        this.browser = null;
        this.page = null;
        if (!browser) return;
        // 关不掉也不再等：Chromium 通过管道连着我们，进程退出时它会跟着退
        await Promise.race([browser.close().catch(() => undefined), delay(kCloseGraceMs)]);
    }
}
