// HTTP 服务契约验收：路由、字节进出、响应头、错误码、队列与超时、不落盘
// 对应用例见 docs/接口协议.md；改契约必须同步改这里。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Parser, RenderTimeoutError } from '../source/parser/index.js';
import { kContractVersion, parseServerArgs, UsageError } from '../source/server/config.js';
import { createHttpServer, successHeaders } from '../source/server/http.js';
import { createLogger } from '../source/server/log.js';
import { RenderQueue } from '../source/server/queue.js';
import { ServiceSession } from '../source/service/index.js';
import { probeShapeCount } from '../source/service/xmlProbe.js';
import { Squeeze } from '../source/squeeze/index.js';

const kFlow = 'flowchart LR\n  A[开始] --> B[结束]';
const kClass = 'classDiagram\n  class Animal {\n    +String name\n  }\n  class Dog\n  Animal <|-- Dog';
const kGantt = 'gantt\n  title 排期\n  section 阶段\n  任务一: 2026-01-01, 3d';
const kNotDiagram = '这不是一张 mermaid 图';
const kTextPlain = { 'Content-Type': 'text/plain; charset=utf-8' };

interface RawResponse {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
}

interface Running {
    port: number;
    queue: RenderQueue;
    session: ServiceSession;
    close: () => Promise<void>;
}

function call(
    port: number,
    options: { method?: string; path?: string; headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const req = request(
            {
                host: '127.0.0.1',
                port,
                method: options.method ?? 'GET',
                path: options.path ?? '/',
                headers: options.headers,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
                });
            },
        );
        req.on('error', reject);
        if (options.body !== undefined) req.write(options.body);
        req.end();
    });
}

/** /health 的响应体。 */
interface HealthBody {
    ok: boolean;
    serviceVersion: string;
    contractVersion: number;
    chromium: string;
    queue: number;
    maxQueue: number;
    inFlight: number;
    timeoutMs: number;
    uptimeMs: number;
    pid: number;
}

/** 失败响应体：错误契约的唯一形状。 */
interface FailureBody {
    ok: boolean;
    error: { code: string; message: string; hint?: string };
}

function json<T>(res: RawResponse): T {
    return JSON.parse(res.body.toString('utf8')) as T;
}

const parseHealth = (res: RawResponse): HealthBody => json<HealthBody>(res);
const parseFailure = (res: RawResponse): FailureBody['error'] => json<FailureBody>(res).error;

async function start(
    options: { maxQueue?: number; timeoutMs?: number; version?: string; onActivity?: () => void } = {},
): Promise<Running> {
    const session = new ServiceSession();
    const queue = new RenderQueue(options.maxQueue ?? 32);
    const { server } = createHttpServer({
        session,
        config: {
            port: 0,
            idleBrowserMs: 0,
            timeoutMs: options.timeoutMs ?? 15_000,
            logLevel: 'silent',
        },
        log: createLogger('silent'),
        queue,
        version: options.version,
        onActivity: options.onActivity,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    return {
        port,
        queue,
        session,
        close: async () => {
            server.close();
            server.closeIdleConnections();
            await session.shutdown();
        },
    };
}

function convert(port: number, body: string | Buffer, headers: Record<string, string> = kTextPlain): Promise<RawResponse> {
    return call(port, { method: 'POST', path: '/convert', headers, body });
}

let shared: Running;

beforeAll(async () => {
    shared = await start();
    const warm = await convert(shared.port, kFlow);
    expect(warm.status).toBe(200);
});

afterAll(async () => {
    await shared.close();
});

describe('HTTP：健康检查', () => {
    it('回报版本、浏览器状态与队列', async () => {
        const res = await call(shared.port, { path: '/health' });
        expect(res.status).toBe(200);
        const body = parseHealth(res);
        expect(body.ok).toBe(true);
        expect(body.contractVersion).toBe(kContractVersion);
        expect(body.serviceVersion).toMatch(/^\d+\.\d+\.\d+/);
        expect(['cold', 'warming', 'ready']).toContain(body.chromium);
        expect(body.chromium).toBe('ready');
        expect(body.queue).toBe(0);
        expect(body.maxQueue).toBe(32);
        expect(body.inFlight).toBe(0);
        expect(body.timeoutMs).toBe(15_000);
        expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
        expect(typeof body.pid).toBe('number');
        expect(res.headers['x-mmd2vsdx-version']).toBe(body.serviceVersion);
    });

    it('方法不符回 405 并给 Allow', async () => {
        const res = await call(shared.port, { method: 'POST', path: '/health' });
        expect(res.status).toBe(405);
        expect(res.headers['allow']).toBe('GET');
        expect(parseFailure(res).code).toBe('method_not_allowed');
    });
});

describe('HTTP：转换', () => {
    it('原文进、字节出，元数据在响应头', async () => {
        const res = await convert(shared.port, kClass);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/vnd.ms-visio.drawing');
        expect(res.headers['cache-control']).toBe('no-store');
        expect(String(res.headers['content-disposition'])).toContain('filename*=UTF-8');
        expect(res.headers['x-mmd2vsdx-kind']).toBe('class');
        expect(Number(res.headers['x-mmd2vsdx-bytes'])).toBe(res.body.length);
        expect(String(res.headers['x-mmd2vsdx-sha256'])).toMatch(/^[0-9a-f]{64}$/);
        expect(Number(res.headers['x-mmd2vsdx-page-width-in'])).toBeGreaterThan(0);
        expect(Number(res.headers['x-mmd2vsdx-page-height-in'])).toBeGreaterThan(0);
        expect(Number(res.headers['x-mmd2vsdx-shape-count'])).toBeGreaterThan(0);

        // 字节确实是本管线的产物：能当包打开，形状数与头一致
        const parts = Squeeze.open(res.body).parts;
        expect(parts.some((p) => p.uri === '/visio/document.xml')).toBe(true);
        expect(parts.some((p) => p.uri === '/visio/pages/page1.xml')).toBe(true);
        expect(probeShapeCount(parts)).toBe(Number(res.headers['x-mmd2vsdx-shape-count']));
    });

    it('同一段原文两次转换字节一致', async () => {
        const a = await convert(shared.port, kFlow);
        const b = await convert(shared.port, kFlow);
        expect(b.headers['x-mmd2vsdx-sha256']).toBe(a.headers['x-mmd2vsdx-sha256']);
        expect(b.body.equals(a.body)).toBe(true);
    });

    it('预热之后稳态明显快于冷启动', async () => {
        const t = Date.now();
        await convert(shared.port, kFlow);
        expect(Date.now() - t).toBeLessThan(1000);
    });

    it('转换结束后队列归零', async () => {
        const body = parseHealth(await call(shared.port, { path: '/health' }));
        expect(body.queue).toBe(0);
        expect(body.inFlight).toBe(0);
    });
});

describe('HTTP：错误契约', () => {
    it('语法错回 400 parse_error', async () => {
        const res = await convert(shared.port, kNotDiagram);
        expect(res.status).toBe(400);
        const error = parseFailure(res);
        expect(error.code).toBe('parse_error');
        expect(error.hint).toBeTruthy();
    });

    it('空体回 400 parse_error', async () => {
        const res = await convert(shared.port, '');
        expect(res.status).toBe(400);
        expect(parseFailure(res).code).toBe('parse_error');
    });

    it('不支持的图型回 400 unsupported_kind', async () => {
        const res = await convert(shared.port, kGantt);
        expect(res.status).toBe(400);
        expect(parseFailure(res).code).toBe('unsupported_kind');
    });

    it('输入超限回 413 too_large', async () => {
        const res = await convert(shared.port, `flowchart LR\n  A[${'x'.repeat(300 * 1024)}]`);
        expect(res.status).toBe(413);
        expect(parseFailure(res).code).toBe('too_large');
    });

    it('内容类型、字符集与编码不合规回 415', async () => {
        const wrongType = await convert(shared.port, kFlow, { 'Content-Type': 'application/json' });
        expect(wrongType.status).toBe(415);
        expect(parseFailure(wrongType).code).toBe('unsupported_media_type');

        const wrongCharset = await convert(shared.port, kFlow, { 'Content-Type': 'text/plain; charset=gbk' });
        expect(wrongCharset.status).toBe(415);

        const noType = await call(shared.port, { method: 'POST', path: '/convert', body: kFlow });
        expect(noType.status).toBe(415);

        const encoded = await convert(shared.port, kFlow, { ...kTextPlain, 'Content-Encoding': 'gzip' });
        expect(encoded.status).toBe(415);
    });

    it('未知路径回 404，方法不符回 405', async () => {
        const notFound = await call(shared.port, { path: '/nope' });
        expect(notFound.status).toBe(404);
        expect(parseFailure(notFound).code).toBe('not_found');

        const wrongMethod = await call(shared.port, { path: '/convert' });
        expect(wrongMethod.status).toBe(405);
        expect(wrongMethod.headers['allow']).toBe('POST');
    });

    it('带 Origin 或非回环 Host 一律 403', async () => {
        const origin = await call(shared.port, {
            method: 'POST',
            path: '/convert',
            headers: { ...kTextPlain, Origin: 'http://evil.example' },
            body: kFlow,
        });
        expect(origin.status).toBe(403);
        expect(parseFailure(origin).code).toBe('forbidden');

        const badHost = await call(shared.port, {
            method: 'POST',
            path: '/convert',
            headers: { ...kTextPlain, Host: 'evil.example' },
            body: kFlow,
        });
        expect(badHost.status).toBe(403);
    });

    it('错误响应也带版本头，且是 JSON', async () => {
        const res = await convert(shared.port, kNotDiagram);
        expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(String(res.headers['x-mmd2vsdx-version'])).toMatch(/^\d+\.\d+\.\d+/);
        expect(json<FailureBody>(res).ok).toBe(false);
    });
});

describe('HTTP：队列与超时', () => {
    it('队列满回 429 并给 Retry-After', async () => {
        const busy = await start({ maxQueue: 0 });
        try {
            const res = await convert(busy.port, kFlow);
            expect(res.status).toBe(429);
            expect(res.headers['retry-after']).toBe('1');
            expect(parseFailure(res).code).toBe('queue_full');
        } finally {
            await busy.close();
        }
    });

    it('渲染超时回 504 timeout，且服务随后仍能应答', async () => {
        const slow = await start({ timeoutMs: 1 });
        try {
            const res = await convert(slow.port, kFlow);
            expect(res.status).toBe(504);
            expect(parseFailure(res).code).toBe('timeout');

            const probe = await call(slow.port, { path: '/health' });
            expect(probe.status).toBe(200);
            expect(parseHealth(probe).inFlight).toBe(0);
            expect(parseHealth(probe).queue).toBe(0);
        } finally {
            await slow.close();
        }
    });

    it('超时之后渲染队列没有被粘死', async () => {
        const parser = new Parser();
        try {
            await expect(parser.convertText(kFlow, { renderTimeoutMs: 1 })).rejects.toBeInstanceOf(RenderTimeoutError);
            const a = await parser.convertText(kFlow);
            expect(a.kind).toBe('flowchart');
        } finally {
            await parser.shutdown();
        }
    });

    it('回收与请求撞车时不丢浏览器句柄，也不留孤儿', async () => {
        const parser = new Parser();
        try {
            await parser.warmup();
            const closing = parser.shutdown(); // 回收开始，实例随即标记为已关闭
            const converted = await parser.convertText(kFlow); // 回收途中来的请求
            expect(converted.kind).toBe('flowchart');
            await closing;
            // 判错条件：句柄被回收丢掉，报 cold，而实际刚拉起的浏览器无人跟踪
            expect(parser.state).toBe('ready');

            // 再回收一次必须真的关掉：孤儿浏览器会在这一步露出来（state 回不到 cold）
            await parser.shutdown();
            expect(parser.state).toBe('cold');
        } finally {
            await parser.shutdown();
        }
    }, 60_000);
});

describe('HTTP：空闲回收的活动口径', () => {
    it('只有 /convert 算活动，探活与错路都不能把浏览器钉在内存里', async () => {
        let activity = 0;
        const server = await start({ onActivity: () => { activity += 1; } });
        try {
            await call(server.port, { path: '/health' });
            // 判错条件：探活被当成活动（浏览器就会永不回收）
            expect(activity).toBe(0);

            await convert(server.port, kFlow);
            // 判错条件：真转换没有重置空闲计时（浏览器会被过早回收）
            expect(activity).toBe(1);

            await call(server.port, { path: '/nope' });
            expect(activity).toBe(1);
        } finally {
            await server.close();
        }
    }, 60_000);
});

describe('HTTP：响应头构造', () => {
    it('中文提示 base64 成 ASCII 头', () => {
        const headers = successHeaders(
            {
                kind: 'class',
                bytes: 12,
                sha256: 'a'.repeat(64),
                pageSize: { widthIn: 1.5, heightIn: 2.25 },
                shapeCount: 3,
                warnings: ['构造型 Service 没有官方母版，按普通类盒渲染'],
                filename: '图.vsdx',
            },
            '0.1.0-alpha3',
        );
        expect(headers['X-Mmd2Vsdx-Page-Width-In']).toBe('1.5000');
        expect(headers['X-Mmd2Vsdx-Page-Height-In']).toBe('2.2500');
        const warnings = headers['X-Mmd2Vsdx-Warnings'] ?? '';
        expect(warnings).toBeTruthy();
        const decoded = JSON.parse(Buffer.from(warnings, 'base64').toString('utf8'));
        expect(decoded).toEqual(['构造型 Service 没有官方母版，按普通类盒渲染']);
        const disposition = headers['Content-Disposition'] ?? '';
        expect(disposition).toContain("filename*=UTF-8''%E5%9B%BE.vsdx");
        expect(/^[\x20-\x7e]+$/.test(disposition)).toBe(true);
    });
});

describe('HTTP：服务不落盘', () => {
    const kWriteApis = /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|mkdirSync|rmSync|rmdirSync|unlinkSync|renameSync|copyFileSync|cpSync)\b/;

    function sourceFiles(dir: string): string[] {
        const out: string[] = [];
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
            else if (name.endsWith('.ts')) out.push(full);
        }
        return out;
    }

    it('服务层与适配层不出现写文件 API', () => {
        const files = [...sourceFiles('source/server'), ...sourceFiles('source/service')];
        expect(files.length).toBeGreaterThan(5);
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            expect(kWriteApis.test(text), `${file} 出现写文件 API`).toBe(false);
        }
    });
});

describe('启动参数', () => {
    it('默认值、环境变量与命令行优先级', () => {
        const defaults = parseServerArgs([], {});
        expect(defaults).toEqual({
            kind: 'run',
            config: { port: 12138, idleBrowserMs: 300_000, timeoutMs: 15_000, logLevel: 'info' },
        });

        const fromEnv = parseServerArgs([], { MMD2VSDX_PORT: '18000', MMD2VSDX_LOG: 'debug' });
        expect(fromEnv).toMatchObject({ config: { port: 18000, logLevel: 'debug' } });

        const flags = parseServerArgs(['--port', '19000', '--idle-browser', '0', '--timeout', '30'], {
            MMD2VSDX_PORT: '18000',
        });
        expect(flags).toMatchObject({ config: { port: 19000, idleBrowserMs: 0, timeoutMs: 30_000 } });

        expect(parseServerArgs(['--port=19001'], {})).toMatchObject({ config: { port: 19001 } });
    });

    it('帮助与版本', () => {
        expect(parseServerArgs(['-h'], {})).toEqual({ kind: 'help' });
        expect(parseServerArgs(['--help'], {})).toEqual({ kind: 'help' });
        expect(parseServerArgs(['--version'], {})).toEqual({ kind: 'version' });
    });

    it('参数不合规抛用法错误', () => {
        expect(() => parseServerArgs(['--nope'], {})).toThrowError(UsageError);
        expect(() => parseServerArgs(['--port'], {})).toThrowError(UsageError);
        expect(() => parseServerArgs(['--port', '70000'], {})).toThrowError(UsageError);
        expect(() => parseServerArgs(['--timeout', '0'], {})).toThrowError(UsageError);
        expect(() => parseServerArgs(['--idle-browser', '-1'], {})).toThrowError(UsageError);
        expect(() => parseServerArgs([], { MMD2VSDX_LOG: 'loud' })).toThrowError(UsageError);
        expect(() => parseServerArgs(['convert'], {})).toThrowError(UsageError);
    });
});
