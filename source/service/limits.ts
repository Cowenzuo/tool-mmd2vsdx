// service 输入上限与基本校验（对应需求规格 NFR-4）
import { ServiceError } from './errors.js';

/** 单次输入文本上限（UTF-8 字节）。 */
export const kMaxInputBytes = 256 * 1024;
/** 单个产物上限。 */
export const kMaxOutputBytes = 8 * 1024 * 1024;
/** 排队等待渲染的请求数上限，到顶回 429；0 表示不排队。 */
export const kMaxQueue = 32;
/** 单请求渲染超时（毫秒），对应启动参数 --timeout 的默认值。 */
export const kDefaultTimeoutMs = 15_000;
/** 空闲回收浏览器的默认秒数，对应启动参数 --idle-browser。 */
export const kDefaultIdleBrowserSec = 300;

/** 校验入参文本：非空且不超上限。 */
export function checkText(text: unknown): string {
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new ServiceError('parse_error', '输入为空', '请求体里放 mermaid 原文，例如 "flowchart LR\\n  A-->B"');
    }
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > kMaxInputBytes) {
        throw new ServiceError(
            'too_large',
            `输入 ${bytes} 字节，超过上限 ${kMaxInputBytes} 字节`,
            '把图拆小，再分多次请求',
        );
    }
    return text;
}

/** 校验产物尺寸。 */
export function checkOutputSize(bytes: number): void {
    if (bytes > kMaxOutputBytes) {
        throw new ServiceError(
            'too_large',
            `产物 ${bytes} 字节，超过上限 ${kMaxOutputBytes} 字节`,
            '图过大时拆成多张，或降低元素数量',
        );
    }
}
