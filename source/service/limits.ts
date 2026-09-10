// service 输入上限与基本校验（对应需求规格 NFR-4）
import { ServiceError } from './errors.js';

/** 单次输入文本上限（UTF-8 字节）。 */
export const kMaxInputBytes = 256 * 1024;
/** 单个产物上限。 */
export const kMaxOutputBytes = 8 * 1024 * 1024;
/** 批量单次条数上限。 */
export const kMaxBatchItems = 50;
/** 检视时可读取的文件上限。 */
export const kMaxInspectBytes = 64 * 1024 * 1024;
/** 检视回执里的文本条目上限。 */
export const kMaxInspectTexts = 100;

/** 校验入参文本：非空且不超上限。 */
export function checkText(text: unknown): string {
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new ServiceError('parse_error', '输入为空', '传入 mermaid 文本，例如 "flowchart LR\\n  A-->B"');
    }
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > kMaxInputBytes) {
        throw new ServiceError(
            'too_large',
            `输入 ${bytes} 字节，超过上限 ${kMaxInputBytes} 字节`,
            '把图拆小，或改为按文件路径传入',
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
