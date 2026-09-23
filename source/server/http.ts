// HTTP 层：路由、体积与类型校验、排队、回执写头、错误映射
// 契约见 docs/接口协议.md，改这里必须同步改那份文档。
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
    ServiceError,
    kMaxInputBytes,
    kMaxQueue,
    toServiceError,
    type RenderReceipt,
    type ServiceErrorCode,
    type ServiceSession,
} from '../service/index.js';
import { kContractVersion, kHost, kServiceVersion, type ServerConfig } from './config.js';
import type { Logger } from './log.js';
import { RenderQueue } from './queue.js';

/** 错误码 → HTTP 状态码，与 docs/接口协议.md 第 6 节的表一一对应。 */
const kStatusOf: Record<ServiceErrorCode, number> = {
    parse_error: 400,
    unsupported_kind: 400,
    invalid_argument: 400,
    not_found: 404,
    method_not_allowed: 405,
    forbidden: 403,
    too_large: 413,
    unsupported_media_type: 415,
    queue_full: 429,
    timeout: 504,
    renderer_unavailable: 503,
    internal: 500,
};

export interface HttpServerOptions {
    session: ServiceSession;
    config: ServerConfig;
    log: Logger;
    /** 排队上限，默认 kMaxQueue；0 表示不排队。 */
    maxQueue?: number;
    /** 复用外部队列；不传就按 maxQueue 建一个。 */
    queue?: RenderQueue;
    /** 版本号，测试可注入。 */
    version?: string;
    /** 每次响应结束的回调，给空闲回收计时用。 */
    onActivity?: () => void;
}

export interface HttpServer {
    server: Server;
    queue: RenderQueue;
}

/** Host 白名单：只认回环地址加当前端口，挡 DNS rebinding。 */
function hostAllowed(req: IncomingMessage): boolean {
    const host = req.headers.host?.toLowerCase();
    if (!host) return false;
    const port = req.socket.localPort;
    return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

/** 内容类型、字符集与编码校验，不合规一律 415。 */
function assertRequestShape(req: IncomingMessage): void {
    const raw = req.headers['content-type'];
    if (raw === undefined) {
        throw new ServiceError(
            'unsupported_media_type',
            '缺少 Content-Type',
            '请求头写 Content-Type: text/plain; charset=utf-8',
        );
    }
    const parts = raw.split(';').map((s) => s.trim());
    const type = (parts.shift() ?? '').toLowerCase();
    if (type !== 'text/plain') {
        throw new ServiceError(
            'unsupported_media_type',
            `Content-Type 必须是 text/plain，收到 ${raw}`,
            '请求体直接放 mermaid 原文，不用 JSON 也不用表单',
        );
    }
    const charset = parts.map((p) => p.toLowerCase()).find((p) => p.startsWith('charset='));
    if (charset !== undefined && charset !== 'charset=utf-8' && charset !== 'charset=utf8') {
        throw new ServiceError('unsupported_media_type', `只接受 UTF-8，收到 ${charset}`, '把请求体转成 UTF-8');
    }
    const encoding = req.headers['content-encoding'];
    if (encoding !== undefined && encoding.toLowerCase() !== 'identity') {
        throw new ServiceError(
            'unsupported_media_type',
            `不接受 Content-Encoding: ${encoding}`,
            '请求体不压缩，直接发原文',
        );
    }
}

/** 读请求体，超过上限立刻拒绝。 */
function readBody(req: IncomingMessage, cap: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const declared = Number(req.headers['content-length']);
        if (Number.isFinite(declared) && declared > cap) {
            reject(
                new ServiceError(
                    'too_large',
                    `请求体声明 ${declared} 字节，超过上限 ${cap} 字节`,
                    '把图拆小，再分多次请求',
                ),
            );
            return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const fail = (err: unknown): void => {
            if (settled) return;
            settled = true;
            reject(err);
        };
        req.on('data', (chunk: Buffer) => {
            if (settled) return;
            size += chunk.length;
            if (size > cap) {
                fail(new ServiceError('too_large', `请求体超过上限 ${cap} 字节`, '把图拆小，再分多次请求'));
                req.pause();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            resolve(Buffer.concat(chunks));
        });
        req.on('aborted', () => fail(new ServiceError('invalid_argument', '请求被中断')));
        req.on('error', (e) => fail(e));
    });
}

/** Content-Disposition：ASCII 回退加 RFC 5987 的 UTF-8 名字。 */
function contentDisposition(filename: string): string {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** 成功响应的头：元数据全在这里，正文只有字节。 */
export function successHeaders(receipt: RenderReceipt, version: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/vnd.ms-visio.drawing',
        'Content-Length': String(receipt.bytes),
        'Cache-Control': 'no-store',
        'Content-Disposition': contentDisposition(receipt.filename),
        'X-Mmd2Vsdx-Version': version,
        'X-Mmd2Vsdx-Kind': receipt.kind,
        'X-Mmd2Vsdx-Bytes': String(receipt.bytes),
        'X-Mmd2Vsdx-Sha256': receipt.sha256,
        'X-Mmd2Vsdx-Page-Width-In': receipt.pageSize.widthIn.toFixed(4),
        'X-Mmd2Vsdx-Page-Height-In': receipt.pageSize.heightIn.toFixed(4),
        'X-Mmd2Vsdx-Shape-Count': String(receipt.shapeCount),
    };
    if (receipt.warnings.length > 0) {
        // 头只保证 ASCII，中文提示先 base64 成 JSON
        headers['X-Mmd2Vsdx-Warnings'] = Buffer.from(JSON.stringify(receipt.warnings), 'utf8').toString('base64');
    }
    return headers;
}

export function createHttpServer(opts: HttpServerOptions): HttpServer {
    const { session, config, log } = opts;
    const version = opts.version ?? kServiceVersion;
    const queue = opts.queue ?? new RenderQueue(opts.maxQueue ?? kMaxQueue);
    const startedAt = Date.now();

    const sendError = (res: ServerResponse, err: ServiceError, extra: Record<string, string> = {}): void => {
        if (res.headersSent) {
            res.destroy();
            return;
        }
        const info = err.info();
        const status = kStatusOf[info.code] ?? 500;
        const body = Buffer.from(JSON.stringify({ ok: false, error: info }), 'utf8');
        const headers: Record<string, string | number> = {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': body.length,
            'Cache-Control': 'no-store',
            'X-Mmd2Vsdx-Version': version,
            ...extra,
        };
        if (info.code === 'queue_full') headers['Retry-After'] = '1';
        // 声明超限时请求体没被读走，关掉连接免得留下半截数据
        if (info.code === 'too_large') headers['Connection'] = 'close';
        res.writeHead(status, headers);
        res.end(body);
        if (status >= 500) log.error(`${info.code}: ${info.message}`);
        else log.debug(`${info.code}: ${info.message}`);
    };

    const methodNotAllowed = (res: ServerResponse, method: string, allow: string[]): void => {
        sendError(res, new ServiceError('method_not_allowed', `不支持的方法：${method}`, `改用 ${allow.join(' 或 ')}`), {
            Allow: allow.join(', '),
        });
    };

    const sendHealth = (res: ServerResponse): void => {
        const body = Buffer.from(
            JSON.stringify({
                ok: true,
                serviceVersion: version,
                contractVersion: kContractVersion,
                chromium: session.chromium,
                queue: queue.depth,
                maxQueue: queue.maxDepth,
                inFlight: queue.inFlight,
                timeoutMs: config.timeoutMs,
                uptimeMs: Date.now() - startedAt,
                pid: process.pid,
            }),
            'utf8',
        );
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': body.length,
            'Cache-Control': 'no-store',
            'X-Mmd2Vsdx-Version': version,
        });
        res.end(body);
    };

    const sendConvert = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        // 只有转换算活动：/health 是探活，监控一直打不能把浏览器钉在内存里
        res.on('finish', () => opts.onActivity?.());
        try {
            assertRequestShape(req);
            const body = await readBody(req, kMaxInputBytes);
            const text = body.toString('utf8');
            const { bytes, receipt } = await queue.run(() => session.convert(text, config.timeoutMs));
            log.debug(`convert ${receipt.kind} ${receipt.bytes}B queue=${queue.depth}`);
            res.writeHead(200, successHeaders(receipt, version));
            res.end(bytes);
        } catch (e) {
            sendError(res, toServiceError(e));
        }
    };

    const handle = (req: IncomingMessage, res: ServerResponse): void => {
        if (!hostAllowed(req)) {
            sendError(
                res,
                new ServiceError('forbidden', `Host 头不是回环地址：${req.headers.host ?? '(缺失)'}`, `本机直连 ${kHost} 或 localhost`),
            );
            return;
        }
        if (req.headers.origin !== undefined) {
            sendError(res, new ServiceError('forbidden', '不接受带 Origin 的请求', '浏览器页面不能调用本服务'));
            return;
        }
        const pathname = new URL(req.url ?? '/', `http://${kHost}`).pathname;
        if (pathname === '/health') {
            if (req.method !== 'GET') {
                methodNotAllowed(res, req.method ?? '', ['GET']);
                return;
            }
            sendHealth(res);
            return;
        }
        if (pathname === '/convert') {
            if (req.method !== 'POST') {
                methodNotAllowed(res, req.method ?? '', ['POST']);
                return;
            }
            void sendConvert(req, res);
            return;
        }
        sendError(res, new ServiceError('not_found', `没有这个路由：${pathname}`, '只有 GET /health 与 POST /convert'));
    };

    const server = createServer((req, res) => {
        try {
            handle(req, res);
        } catch (e) {
            sendError(res, toServiceError(e));
        }
    });
    return { server, queue };
}
