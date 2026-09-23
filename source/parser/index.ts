// parser 门面（docs/开发过程/01-结构设计.md）
import { type ContractA } from '../contracts/index.js';
import {
    MermaidParseError,
    RendererClosedError,
    RenderTimeoutError,
    SnapshotRenderer,
    type RendererState,
} from './renderer.js';
import { normalizeGeneric, type SnapshotLike } from './normalize/generic.js';

interface ParserOptions {
    /** 单次渲染超时毫秒数，0 或省略表示不限时（服务层按请求传）。 */
    renderTimeoutMs?: number;
}

export class Parser {
    private renderer: SnapshotRenderer | null = null;
    private readonly renderTimeoutMs: number;

    constructor(opts: ParserOptions = {}) {
        this.renderTimeoutMs = opts.renderTimeoutMs ?? 0;
    }

    /** mermaid 文本 → 契约 A。 */
    async convertText(text: string, opts: ParserOptions = {}): Promise<ContractA> {
        if (!text.trim()) throw new MermaidParseError('空输入');
        const timeoutMs = opts.renderTimeoutMs ?? this.renderTimeoutMs;
        const snap = await this.withRenderer(async (renderer) => renderer.render(text, 'mmd', timeoutMs));
        try {
            return normalizeGeneric(snap as SnapshotLike, text);
        } catch (e) {
            if (e instanceof MermaidParseError) throw e;
            // 归一化抛出的普通错误（如不支持的图型）统一成解析错误类型
            throw new MermaidParseError(String((e as Error)?.message ?? e).replace(/^\[parse\]\s*/, ''));
        }
    }

    /**
     * 渲染一次，撞上"实例正好被回收关掉"就换一个新实例重来。
     * 这是空闲回收与请求并发的唯一交界面，处理不当会留下无人跟踪的浏览器。
     */
    private async withRenderer<T>(use: (renderer: SnapshotRenderer) => Promise<T>): Promise<T> {
        const renderer = this.renderer ?? new SnapshotRenderer();
        this.renderer = renderer;
        try {
            return await use(renderer);
        } catch (e) {
            if (!(e instanceof RendererClosedError)) throw e;
            const fresh = new SnapshotRenderer();
            this.renderer = fresh;
            return await use(fresh);
        }
    }

    /** 浏览器状态：cold / warming / ready。 */
    get state(): RendererState {
        return this.renderer?.state ?? 'cold';
    }

    /** 提前把浏览器拉起来预热，供常驻服务启动时调用。 */
    async warmup(): Promise<void> {
        await this.withRenderer(async (renderer) => {
            await renderer.warmup();
        });
    }

    /** 关闭浏览器资源（回收或退出前调用）。 */
    async shutdown(): Promise<void> {
        const renderer = this.renderer;
        if (!renderer) return;
        await renderer.shutdown();
        // 回收途中若已有新实例接手（请求撞上关闭后换的实例），别把新的丢掉
        if (this.renderer === renderer) this.renderer = null;
    }
}

export { MermaidParseError, RendererClosedError, RenderTimeoutError };
export type { RendererState };
