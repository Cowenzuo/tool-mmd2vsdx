// 服务入口：解析参数 → 监听 → 预热 → 空闲回收 → 信号退出
// 生命周期规则见 docs/接口协议.md 第 8 节：常驻不退，空闲只回收浏览器。
import type { Server } from 'node:http';
import { ServiceSession, kMaxQueue } from '../service/index.js';
import {
    kContractVersion,
    kHost,
    kServiceVersion,
    kUsage,
    parseServerArgs,
    UsageError,
} from './config.js';
import { createHttpServer } from './http.js';
import { createLogger } from './log.js';
import { RenderQueue } from './queue.js';

/** 退出前等在途请求的上限。 */
const kDrainMs = 10_000;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** 绑定端口，返回实际端口（传 0 时由系统分配）。 */
function listen(server: Server, port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const onError = (e: Error): void => {
            server.off('listening', onListening);
            reject(e);
        };
        const onListening = (): void => {
            server.off('error', onError);
            const address = server.address();
            resolve(typeof address === 'object' && address !== null ? address.port : port);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, kHost);
    });
}

/** 端口被占时先问一句：是本家实例就让位，是别人就报错退出。 */
async function probeExisting(port: number): Promise<boolean> {
    try {
        const res = await fetch(`http://${kHost}:${port}/health`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return false;
        const body = (await res.json()) as { ok?: boolean; contractVersion?: number };
        return body.ok === true && body.contractVersion === kContractVersion;
    } catch {
        return false;
    }
}

function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
    let parsed;
    try {
        parsed = parseServerArgs(argv);
    } catch (e) {
        if (e instanceof UsageError) {
            process.stderr.write(`${e.message}\n\n${kUsage}\n`);
            process.exitCode = 2;
            return;
        }
        throw e;
    }
    if (parsed.kind === 'help') {
        process.stdout.write(`${kUsage}\n`);
        return;
    }
    if (parsed.kind === 'version') {
        process.stdout.write(`${kServiceVersion}\n`);
        return;
    }

    const config = parsed.config;
    const log = createLogger(config.logLevel);
    const session = new ServiceSession();
    const queue = new RenderQueue(kMaxQueue);

    let idleTimer: NodeJS.Timeout | null = null;
    const clearIdle = (): void => {
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    };
    const recycle = async (): Promise<void> => {
        idleTimer = null;
        if (queue.inFlight > 0 || queue.depth > 0) {
            touch();
            return;
        }
        if (session.chromium === 'cold') return;
        log.info('空闲回收：关掉 Chromium，进程继续常驻');
        await session.shutdown().catch((e: unknown) => log.error(`回收失败：${message(e)}`));
    };
    /** 有活动就把空闲计时推后；回收只在彻底空下来之后发生。 */
    const touch = (): void => {
        clearIdle();
        if (config.idleBrowserMs <= 0) return;
        idleTimer = setTimeout(() => {
            void recycle();
        }, config.idleBrowserMs);
        idleTimer.unref?.();
    };

    const { server } = createHttpServer({ session, config, log, queue, onActivity: touch });

    let port: number;
    try {
        port = await listen(server, config.port);
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
            if (await probeExisting(config.port)) {
                log.info(`端口 ${config.port} 上已有本家实例（契约版本 ${kContractVersion}），本次让位退出`);
                return;
            }
            log.error(`端口 ${config.port} 被其它程序占用；换一个 --port，或先停掉占用它的进程`);
            process.exitCode = 3;
            return;
        }
        log.error(`监听失败：${message(e)}`);
        process.exitCode = 1;
        return;
    }

    log.info(`服务已启动 http://${kHost}:${port}（服务版本 ${kServiceVersion}，契约版本 ${kContractVersion}）`);
    touch();
    void session
        .warmup()
        .then(() => {
            log.info('浏览器预热完成');
            touch();
        })
        .catch((e: unknown) => {
            log.error(`浏览器预热失败：${message(e)}；转换请求会回 503，先执行 npx playwright install chromium`);
        });

    server.on('error', (e: Error) => log.error(`服务出错：${message(e)}`));

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info(`收到 ${signal}，停止接收新请求`);
        clearIdle();
        server.close();
        server.closeIdleConnections();
        const deadline = Date.now() + kDrainMs;
        while ((queue.inFlight > 0 || queue.depth > 0) && Date.now() < deadline) {
            await delay(50);
        }
        if (queue.inFlight > 0 || queue.depth > 0) {
            log.error(`还有 ${queue.inFlight + queue.depth} 个请求没做完，直接退出`);
        }
        await session.shutdown().catch(() => undefined);
        log.info('已退出');
        process.exit(0);
    };
    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });
}
