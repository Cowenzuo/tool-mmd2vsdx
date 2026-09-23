// service 错误契约：错误码与修复建议，HTTP 层按它映射状态码
// 对应 docs/接口协议.md 的错误码表
import { MermaidParseError, RenderTimeoutError } from '../parser/renderer.js';

export type ServiceErrorCode =
    | 'parse_error'
    | 'unsupported_kind'
    | 'invalid_argument'
    | 'not_found'
    | 'method_not_allowed'
    | 'forbidden'
    | 'too_large'
    | 'unsupported_media_type'
    | 'queue_full'
    | 'timeout'
    | 'renderer_unavailable'
    | 'internal';

export interface ServiceErrorInfo {
    code: ServiceErrorCode;
    message: string;
    hint?: string;
}

export class ServiceError extends Error {
    readonly code: ServiceErrorCode;
    readonly hint: string | undefined;

    constructor(code: ServiceErrorCode, message: string, hint?: string) {
        super(message);
        this.name = 'ServiceError';
        this.code = code;
        this.hint = hint;
    }

    info(): ServiceErrorInfo {
        return this.hint === undefined
            ? { code: this.code, message: this.message }
            : { code: this.code, message: this.message, hint: this.hint };
    }
}

/** 浏览器起不来时的特征（Playwright 的报错文案随版本变，这里取稳定的几段）。 */
const kBrowserHints = /Executable doesn't exist|browserType\.launch|Failed to launch|playwright install|Chromium/i;

/** 不支持的图型：解析层抛的是「不支持的图型：xxx」。 */
const kUnsupportedHint = /不支持的图型/;

/** 任意异常 → ServiceError（HTTP 层的公开边界统一走它）。 */
export function toServiceError(e: unknown): ServiceError {
    if (e instanceof ServiceError) return e;
    if (e instanceof RenderTimeoutError) {
        return new ServiceError(
            'timeout',
            e.message,
            '重试一次；反复超时说明这张图触发了渲染侧的病态输入，把原文反馈回来',
        );
    }
    const raw = e instanceof Error ? e.message : String(e);
    if (kBrowserHints.test(raw)) {
        return new ServiceError(
            'renderer_unavailable',
            '浏览器不可用，无法渲染 mermaid',
            '先执行 npx playwright install chromium 安装 Chromium；服务器环境需具备运行浏览器的依赖',
        );
    }
    if (e instanceof MermaidParseError || kUnsupportedHint.test(raw)) {
        const message = raw.replace(/^\[parse\]\s*/, '').replace(/^\[[a-z-]+\]\s*/, '');
        if (kUnsupportedHint.test(raw)) {
            return new ServiceError(
                'unsupported_kind',
                message,
                '当前只支持 flowchart、block、class、er、sequence 五类图型，不支持时不降级',
            );
        }
        return new ServiceError('parse_error', message, '检查 mermaid 语法；空输入也会报这一条');
    }
    return new ServiceError('internal', raw || '未知错误');
}
