// 启动配置：少量参数加环境变量，默认值写进 docs/接口协议.md 第 2 节
import { readFileSync } from 'node:fs';
import { kDefaultIdleBrowserSec, kDefaultTimeoutMs } from '../service/index.js';
import { parseLogLevel, type LogLevel } from './log.js';

/** 契约版本：HTTP 契约的版本号，破坏性变更才升，写在 /health 里。 */
export const kContractVersion = 1;
/** 默认端口，属于公开契约，改它等于破坏兼容。 */
const kDefaultPort = 17321;
/** 只绑回环，不提供改地址的开关。 */
export const kHost = '127.0.0.1';

function packageVersion(): string {
    try {
        const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
        const pkg = JSON.parse(raw) as { version?: string };
        return pkg.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/** 服务版本，等于包版本。 */
export const kServiceVersion = packageVersion();

export interface ServerConfig {
    port: number;
    /** 空闲多久关掉 Chromium；0 表示不回收。 */
    idleBrowserMs: number;
    /** 单请求渲染超时毫秒数。 */
    timeoutMs: number;
    logLevel: LogLevel;
}

type ParsedArgs =
    | { kind: 'run'; config: ServerConfig }
    | { kind: 'help' }
    | { kind: 'version' };

export class UsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UsageError';
    }
}

export const kUsage = `用法：mmd2vsdx-server [参数]

本机常驻 HTTP 服务：POST /convert 送 mermaid 原文，响应体是 .vsdx 字节。
只监听 ${kHost}，不读文件也不写文件。契约见 docs/接口协议.md。

参数：
  --port <端口>          监听端口，默认 ${kDefaultPort}（环境变量 MMD2VSDX_PORT）
  --idle-browser <秒>    空闲多久关掉 Chromium，默认 ${kDefaultIdleBrowserSec}，0 表示不回收
                         （环境变量 MMD2VSDX_IDLE_BROWSER）
  --timeout <秒>         单请求渲染超时，默认 ${kDefaultTimeoutMs / 1000}
                         （环境变量 MMD2VSDX_TIMEOUT）
  --version              打印服务版本后退出
  -h, --help             显示本帮助

环境变量：
  MMD2VSDX_LOG           silent | error | info | debug，默认 info

退出码：0 正常退出，或端口上已有本家实例；1 启动失败；2 用法错误；
        3 端口被非本服务占用`;

function num(text: string, name: string, min: number, max: number): number {
    const value = Number(text);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new UsageError(`${name} 需要 ${min} 到 ${max} 之间的整数，收到「${text}」`);
    }
    return value;
}

function fromEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
    const raw = env[key];
    return raw === undefined || raw.trim() === '' ? undefined : raw.trim();
}

/** 解析启动参数：命令行优先于环境变量，环境变量优先于默认值。 */
export function parseServerArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedArgs {
    const flags = new Map<string, string>();
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === undefined) break;
        if (a === '-h' || a === '--help') return { kind: 'help' };
        if (a === '--version') return { kind: 'version' };
        if (!a.startsWith('--')) throw new UsageError(`不认识的参数：${a}`);
        const eq = a.indexOf('=');
        const name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
        const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
        if (name !== 'port' && name !== 'idle-browser' && name !== 'timeout') {
            throw new UsageError(`不认识的参数：--${name}`);
        }
        const value = inline ?? argv[++i];
        if (value === undefined || value.startsWith('--')) {
            throw new UsageError(`--${name} 缺值`);
        }
        flags.set(name, value);
    }

    const portText = flags.get('port') ?? fromEnv(env, 'MMD2VSDX_PORT') ?? String(kDefaultPort);
    const idleText = flags.get('idle-browser') ?? fromEnv(env, 'MMD2VSDX_IDLE_BROWSER') ?? String(kDefaultIdleBrowserSec);
    const timeoutText = flags.get('timeout') ?? fromEnv(env, 'MMD2VSDX_TIMEOUT') ?? String(kDefaultTimeoutMs / 1000);
    const levelText = fromEnv(env, 'MMD2VSDX_LOG');
    const level = parseLogLevel(levelText);
    if (levelText !== undefined && level === null) {
        throw new UsageError(`MMD2VSDX_LOG 只认 silent / error / info / debug，收到「${levelText}」`);
    }

    return {
        kind: 'run',
        config: {
            port: num(portText, '--port', 0, 65535),
            idleBrowserMs: num(idleText, '--idle-browser', 0, 86_400) * 1000,
            timeoutMs: num(timeoutText, '--timeout', 1, 3600) * 1000,
            logLevel: level ?? 'info',
        },
    };
}
