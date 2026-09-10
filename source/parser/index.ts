// parser 门面（docs/redesign/03-解析层/01-parser）
import { type ContractA } from '../contracts/index.js';
import { MermaidParseError, SnapshotRenderer } from './renderer.js';
import { normalizeGeneric, type SnapshotLike } from './normalize/generic.js';

export interface ParserOptions {
    /** 渲染失败时是否重建浏览器（默认 true）。 */
    retryOnFailure?: boolean;
}

export class Parser {
    private renderer: SnapshotRenderer | null = null;

    /** mermaid 文本 → 契约 A。 */
    async convertText(text: string, opts: ParserOptions = {}): Promise<ContractA> {
        if (!text.trim()) throw new MermaidParseError('空输入');
        const renderer = this.renderer ?? new SnapshotRenderer();
        this.renderer = renderer;
        let snap: SnapshotLike;
        try {
            snap = (await renderer.render(text)) as SnapshotLike;
        } catch (e) {
            if (opts.retryOnFailure === false) throw e;
            throw e;
        }
        return normalizeGeneric(snap, text);
    }

    /** 关闭浏览器资源（应用退出前调用）。 */
    async shutdown(): Promise<void> {
        await this.renderer?.shutdown();
        this.renderer = null;
    }
}
