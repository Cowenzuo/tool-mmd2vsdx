// service 门面：转换内核。服务进程用它，不落盘、不碰路径。
// 对应 docs/接口协议.md：HTTP 层只做传输与回执整形，转换逻辑在这里。
import { Parser, type RendererState } from '../parser/index.js';
import { toServiceError } from './errors.js';
import { renderVsdx } from './render.js';
import { receiptOf, type RenderReceipt } from './receipt.js';

export interface ConvertResult {
    /** .vsdx 字节，直接交给调用方。 */
    bytes: Buffer;
    receipt: RenderReceipt;
}

export class ServiceSession {
    private readonly parser = new Parser();

    /** 转换：mermaid 文本 → vsdx 字节加回执。任何失败抛 ServiceError。 */
    async convert(text: unknown, timeoutMs = 0): Promise<ConvertResult> {
        try {
            const { bytes, a } = await renderVsdx(this.parser, text, timeoutMs);
            return { bytes, receipt: receiptOf(a, bytes) };
        } catch (e) {
            throw toServiceError(e);
        }
    }

    /** 浏览器状态：cold / warming / ready，供 /health 观察。 */
    get chromium(): RendererState {
        return this.parser.state;
    }

    /** 预热浏览器。失败不致命，只是首个请求要自己吃冷启动。 */
    async warmup(): Promise<void> {
        await this.parser.warmup();
    }

    /** 关掉浏览器资源；可重复调用。 */
    async shutdown(): Promise<void> {
        await this.parser.shutdown();
    }
}

export { ServiceError, toServiceError } from './errors.js';
export type { ServiceErrorCode, ServiceErrorInfo } from './errors.js';
export type { RenderReceipt } from './receipt.js';
export {
    kDefaultIdleBrowserSec,
    kDefaultTimeoutMs,
    kMaxInputBytes,
    kMaxOutputBytes,
    kMaxQueue,
} from './limits.js';
