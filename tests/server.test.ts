// 真实进程验收：起真服务、走真 TCP，只看进程级才暴露的行为。
//
// 与 tests/http.test.ts 的分工：那边用进程内 server 覆盖路由与错误契约（快、全），
// 这边覆盖只有真进程才成立的四件事，每条都写明判错条件：
//   1. 启动器的参数与退出码：--version、-h、坏参数退 2，不能落进服务循环；
//   2. 固定端口的两个约定：第二条实例让位退 0，端口被外人占用退 3；
//   3. 生命周期两条声明：空闲只回收浏览器、进程继续常驻；停止后端口立刻可复用；
//   4. 不落盘：以空目录为工作目录起服务，转换若干次后该目录必须还是空的。
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Parser } from '../source/parser/index.js';
import { renderContract } from '../source/convert.js';
import { Squeeze } from '../source/squeeze/index.js';
import { probeShapeCount } from '../source/service/xmlProbe.js';
import { kMaxInputBytes } from '../source/service/limits.js';
import { PartsAssembler } from '../source/xml-parts/index.js';

const kRepoRoot = resolve(import.meta.dirname, '..');
const kLauncher = join(kRepoRoot, 'bin', 'mmd2vsdx-server.mjs');
const kFlow = 'flowchart LR\n  A[开始] --> B[结束]';
const kPackageVersion = (JSON.parse(readFileSync(join(kRepoRoot, 'package.json'), 'utf8')) as { version: string }).version;

/** 用例跑的是 dist 里的真产物，先挡住"忘了构建"这种假绿。 */
function assertDistFresh(): void {
    const entry = join(kRepoRoot, 'dist', 'server', 'index.js');
    if (!existsSync(entry)) {
        throw new Error('真实进程用例要跑 dist：先执行 npm run build');
    }
    const built = statSync(entry).mtimeMs;
    let newest = 0;
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (name.endsWith('.ts')) newest = Math.max(newest, statSync(full).mtimeMs);
        }
    };
    walk(join(kRepoRoot, 'source'));
    if (newest > built) {
        throw new Error('dist 比源码旧：先执行 npm run build，否则测到的是旧产物');
    }
}

beforeAll(() => {
    assertDistFresh();
});

interface HealthBody {
    ok: boolean;
    chromium: string;
    queue: number;
    inFlight: number;
    contractVersion: number;
}

interface Running {
    port: number;
    child: ChildProcess;
    log: () => string;
    exit: () => Promise<number | null>;
    stop: () => Promise<void>;
}

const kTempDirs: string[] = [];

function tempDir(tag: string): string {
    const dir = mkdtempSync(join(tmpdir(), `mmd2vsdx-e2e-${tag}-`));
    kTempDirs.push(dir);
    return dir;
}

/** 起一个真服务；日志写文件而不是管道，免得受 stdio 限制影响。 */
function startServer(port: number, extraArgs: string[] = [], cwd = kRepoRoot): Running {
    const logPath = join(tempDir('log'), 'server.log');
    const fd = openSync(logPath, 'a');
    const child = spawn(
        process.execPath,
        [kLauncher, '--port', String(port), ...extraArgs],
        { cwd, stdio: ['ignore', fd, fd] },
    );
    closeSync(fd);
    let exited: number | null | undefined;
    const done = new Promise<number | null>((resolveExit) => {
        child.once('exit', (code) => {
            exited = code;
            resolveExit(code);
        });
    });
    return {
        port,
        child,
        log: () => {
            try {
                return readFileSync(logPath, 'utf8');
            } catch {
                return '';
            }
        },
        exit: () => done,
        stop: async () => {
            if (exited === undefined) child.kill('SIGTERM');
            await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
        },
    };
}

/** 跑一次只做启动参数处理的调用，等它自然退出。 */
async function runToExit(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
    const dir = tempDir('args');
    const outPath = join(dir, 'out.txt');
    const errPath = join(dir, 'err.txt');
    const child = spawn(process.execPath, [kLauncher, ...args], {
        cwd: kRepoRoot,
        stdio: ['ignore', openSync(outPath, 'a'), openSync(errPath, 'a')],
    });
    const code = await new Promise<number | null>((resolveExit) => child.once('exit', resolveExit));
    return { code, out: readFileSync(outPath, 'utf8'), err: readFileSync(errPath, 'utf8') };
}

async function fetchHealth(port: number, timeoutMs = 2000): Promise<HealthBody> {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return (await res.json()) as HealthBody;
}

async function waitReady(port: number, timeoutMs = 30_000): Promise<HealthBody> {
    const deadline = Date.now() + timeoutMs;
    let last: HealthBody | null = null;
    while (Date.now() < deadline) {
        try {
            last = await fetchHealth(port);
            if (last.chromium === 'ready') return last;
        } catch {
            /* 还没起来 */
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`预热超时，最后一次 /health：${JSON.stringify(last)}`);
}

function convert(port: number, body: string): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body,
    });
}

/** 取失败响应里的错误码；拿不到就是空串，断言会照常失败。 */
function parseErrorCode(body: unknown): string {
    return (body as { error?: { code?: string } }).error?.code ?? '';
}

/** 端口是否已经没人监听。 */
async function portFree(port: number): Promise<boolean> {
    try {
        await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
        return false;
    } catch {
        return true;
    }
}

afterAll(() => {
    for (const dir of kTempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('真实进程：启动器', () => {
    it('--version 打印版本后退出，不落进服务循环', async () => {
        const r = await runToExit(['--version']);
        // 判错条件：退出码不是 0，或输出版本与 package.json 不一致，或进程没退出（上面会卡住超时）
        expect(r.code).toBe(0);
        expect(r.out.trim()).toBe(kPackageVersion);
    });

    it('坏参数退 2 并给出用法，不启动服务', async () => {
        const r = await runToExit(['--port', 'not-a-number']);
        expect(r.code).toBe(2);
        expect(r.err).toContain('--port');
        expect(r.err).toContain('用法');
    });

    it('-h 打印用法后退 0', async () => {
        const r = await runToExit(['-h']);
        expect(r.code).toBe(0);
        expect(r.out).toContain('POST /convert');
        expect(r.out).toContain('只监听 127.0.0.1');
    });
});

describe('真实进程：固定端口的两个约定', () => {
    it('端口已有本家实例时让位退 0，不抢端口', async () => {
        const port = 17531;
        const first = startServer(port);
        try {
            await waitReady(port);
            const second = await runToExit(['--port', String(port)]);
            // 判错条件：第二个实例退出码不是 0（抢端口 / 报错 / 挂死），或原实例被打断
            expect(second.code).toBe(0);
            expect(second.err).toContain('已有本家实例');
            const health = await fetchHealth(port);
            expect(health.ok).toBe(true);
        } finally {
            await first.stop();
        }
    }, 40_000);

    it('端口被非本服务占用时退 3，不盲目重试', async () => {
        const port = 17532;
        const foreign: Server = createServer((_req, res) => res.end('not mmd2vsdx'));
        await new Promise<void>((r) => foreign.listen(port, '127.0.0.1', () => r()));
        try {
            const r = await runToExit(['--port', String(port)]);
            // 判错条件：退出码不是 3（例如误判成本家而让位，或卡住重试）
            expect(r.code).toBe(3);
            expect(r.err).toContain('被其它程序占用');
        } finally {
            foreign.close();
        }
    }, 40_000);
});

describe('真实进程：字节交付', () => {
    it('响应体是完整可解析的 vsdx，且与响应头自洽', async () => {
        const port = 17533;
        const server = startServer(port);
        try {
            await waitReady(port);
            const res = await convert(port, kFlow);
            const body = Buffer.from(await res.arrayBuffer());
            // 判错条件：状态不是 200，或三者（响应体长度、Content-Length、X-..-Bytes）不相等
            expect(res.status).toBe(200);
            expect(Number(res.headers.get('x-mmd2vsdx-bytes'))).toBe(body.length);
            expect(Number(res.headers.get('content-length'))).toBe(body.length);
            // 判错条件：产物打不开，或包内形状数与响应头不符
            const parts = Squeeze.open(body).parts;
            expect(probeShapeCount(parts)).toBe(Number(res.headers.get('x-mmd2vsdx-shape-count')));
            expect(parts.some((p) => p.uri === '/visio/document.xml')).toBe(true);
        } finally {
            await server.stop();
        }
    }, 40_000);

    it('HTTP 产物与仓库管线直出的字节逐字节相同', async () => {
        const port = 17538;
        const server = startServer(port);
        try {
            await waitReady(port);
            const res = await convert(port, kFlow);
            const viaHttp = Buffer.from(await res.arrayBuffer());

            const parser = new Parser();
            let viaPipeline: Buffer;
            try {
                const a = await parser.convertText(kFlow);
                const b = renderContract(a);
                viaPipeline = new Squeeze().pack(new PartsAssembler().assemble(b.parts));
            } finally {
                await parser.shutdown();
            }

            // 判错条件：两者长度或内容不同（服务层动过产物），或响应头哈希不是直出产物的哈希
            expect(viaHttp.length).toBe(viaPipeline.length);
            expect(viaHttp.equals(viaPipeline)).toBe(true);
            expect(res.headers.get('x-mmd2vsdx-sha256')).toBe(createHash('sha256').update(viaPipeline).digest('hex'));
        } finally {
            await server.stop();
        }
    }, 60_000);

    it('输入上限卡在 256KB：差一字节放过，超一字节回 413', async () => {
        const port = 17539;
        const server = startServer(port);
        try {
            await waitReady(port);
            // 判错条件：恰好等于上限的请求被当成超限（上限判早了，会误伤正常调用）
            const under = await convert(port, 'x'.repeat(kMaxInputBytes));
            expect(under.status).not.toBe(413);
            // 上限之内一律按内容判定：这里 mermaid 接受它，所以是 200
            expect(under.status).toBe(200);

            // 判错条件：超限那侧没回 413（漏放或吞成 500）
            const over = await convert(port, 'x'.repeat(kMaxInputBytes + 1));
            expect(over.status).toBe(413);
            expect(parseErrorCode(await over.json())).toBe('too_large');
        } finally {
            await server.stop();
        }
    }, 60_000);
});

describe('真实进程：生命周期', () => {
    it('空闲只回收浏览器，进程继续常驻，回收后再请求照常', async () => {
        const port = 17534;
        const server = startServer(port, ['--idle-browser', '2']);
        try {
            await waitReady(port);
            const first = await convert(port, kFlow);
            expect(first.status).toBe(200);
            await first.arrayBuffer();

            // 等空闲回收：判错条件是 /health 打不通（进程退了）或 chromium 仍为 ready（没回收）
            const deadline = Date.now() + 15_000;
            let chromium = 'ready';
            while (Date.now() < deadline && chromium !== 'cold') {
                await new Promise((r) => setTimeout(r, 500));
                chromium = (await fetchHealth(port)).chromium;
            }
            expect(chromium).toBe('cold');

            // 判错条件：回收之后转换拿不到 200（没能重新预热）
            const again = await convert(port, kFlow);
            expect(again.status).toBe(200);
            await again.arrayBuffer();

            // 判错条件：转换成功但 /health 在 1.5 秒内回不到 ready，
            // 说明回收把句柄丢了、浏览器成了无人跟踪的孤儿（曾实测到过这个竞态）
            const readyBy = Date.now() + 1500;
            let state = '';
            while (Date.now() < readyBy) {
                state = (await fetchHealth(port)).chromium;
                if (state === 'ready') break;
                await new Promise((r) => setTimeout(r, 100));
            }
            expect(state).toBe('ready');
        } finally {
            await server.stop();
        }
    }, 60_000);

    it('停掉之后端口立刻可以复用，不留僵尸监听', async () => {
        const port = 17535;
        const first = startServer(port);
        await waitReady(port);
        await first.stop();
        // 判错条件：停止后 5 秒内端口仍被占用（旧进程没退干净）
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline && !(await portFree(port))) {
            await new Promise((r) => setTimeout(r, 200));
        }
        expect(await portFree(port)).toBe(true);

        // 判错条件：同一端口起不来新实例（TIME_WAIT 之类的残留挡住了重启）
        const second = startServer(port);
        try {
            const health = await waitReady(port);
            expect(health.ok).toBe(true);
        } finally {
            await second.stop();
        }
    }, 60_000);
});

describe('真实进程：不落盘', () => {
    it('以空目录为工作目录跑完整流程，目录必须还是空的', async () => {
        const cwd = tempDir('cwd');
        const port = 17536;
        const server = startServer(port, [], cwd);
        try {
            await waitReady(port);
            for (let i = 0; i < 3; i++) {
                const res = await convert(port, kFlow);
                expect(res.status).toBe(200);
                await res.arrayBuffer();
            }
            // 判错条件：工作目录里出现任何条目（临时文件、日志、产物都算）
            expect(readdirSync(cwd)).toEqual([]);
        } finally {
            await server.stop();
        }
    }, 60_000);
});

describe('真实进程：并发与队列', () => {
    it('并发请求全部成功、结果一致，跑完队列归零', async () => {
        const port = 17537;
        const server = startServer(port);
        try {
            await waitReady(port);
            const responses = await Promise.all(Array.from({ length: 8 }, () => convert(port, kFlow)));
            // 判错条件：任一请求非 200，或同一输入的产物哈希不一致
            for (const res of responses) expect(res.status).toBe(200);
            const hashes = responses.map((r) => r.headers.get('x-mmd2vsdx-sha256'));
            expect(new Set(hashes).size).toBe(1);

            // 判错条件：收尾之后队列没归零（有请求被卡住）
            const health = await fetchHealth(port);
            expect(health.queue).toBe(0);
            expect(health.inFlight).toBe(0);
        } finally {
            await server.stop();
        }
    }, 60_000);
});
