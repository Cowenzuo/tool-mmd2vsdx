// CLI：子命令与 MCP 工具一一对应，回执走 stdout、日志与提示走 stderr
// 退出码约定：0 成功，1 处理失败，2 用法错误
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { ServiceError, ServiceSession, toServiceError, type ServiceErrorInfo } from '../service/index.js';

export interface CliIo {
    out: (text: string) => void;
    err: (text: string) => void;
    readStdin: () => Promise<string>;
}

export const kUsage = `用法：mmd2vsdx <命令> [参数]

命令：
  convert <文件|->        把 mermaid 转成 .vsdx，回执为 JSON
  validate <文件|->       只解析校验，回执为 JSON
  batch <目录|文件...>    批量转换，回执为汇总 JSON
  inspect <文件.vsdx>     检视自产产物的部件与页面结构

参数：
  --out <路径>            输出文件或目录，缺省用配置根目录（MMD2VSDX_OUTPUT_DIR 或工作目录下 vsdx-output）
  --overwrite             允许覆盖既有产物
  -h, --help              显示本帮助

退出码：0 成功，1 处理失败，2 用法错误`;

interface ParsedArgs {
    positionals: string[];
    flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
    const positionals: string[] = [];
    const flags = new Map<string, string | true>();
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === '-' || !a.startsWith('--')) {
            positionals.push(a);
            continue;
        }
        if (a === '--') {
            positionals.push(...argv.slice(i + 1));
            break;
        }
        const name = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
            flags.set(name, next);
            i++;
        } else {
            flags.set(name, true);
        }
    }
    return { positionals, flags };
}

function flagText(flags: Map<string, string | true>, name: string): string | undefined {
    const v = flags.get(name);
    return typeof v === 'string' ? v : undefined;
}

function json(io: CliIo, value: unknown): void {
    io.out(JSON.stringify(value, null, 2));
}

function fail(io: CliIo, err: ServiceErrorInfo | ServiceError): number {
    const info = err instanceof ServiceError ? err.info() : err;
    json(io, { ok: false, error: info });
    io.err(`[${info.code}] ${info.message}${info.hint ? ` —— ${info.hint}` : ''}`);
    return 1;
}

/** 输入路径统一按会话工作目录解析（对外只暴露相对路径更安全）。 */
function toAbs(session: ServiceSession, p: string): string {
    return isAbsolute(p) ? p : resolve(session.policy.cwd, p);
}

/** 读输入：`-` 表示 stdin，其余当文件路径。 */
async function readInput(io: CliIo, session: ServiceSession, target: string): Promise<string> {
    if (target === '-') return io.readStdin();
    const abs = toAbs(session, target);
    try {
        return readFileSync(abs, 'utf8');
    } catch (e) {
        throw new ServiceError('invalid_argument', `读不到输入文件：${abs}`, String((e as Error).message));
    }
}

function expandInputs(session: ServiceSession, targets: string[]): string[] {
    const files: string[] = [];
    for (const t of targets) {
        const abs = toAbs(session, t);
        let st;
        try {
            st = statSync(abs);
        } catch (e) {
            throw new ServiceError('invalid_argument', `路径不存在：${abs}`, String((e as Error).message));
        }
        if (st.isDirectory()) {
            for (const name of readdirSync(abs).sort()) {
                if (name.toLowerCase().endsWith('.mmd')) files.push(join(abs, name));
            }
        } else {
            files.push(abs);
        }
    }
    return files;
}

async function cmdConvert(argv: string[], io: CliIo, session: ServiceSession): Promise<number> {
    const { positionals, flags } = parseArgs(argv);
    const input = positionals[0];
    if (!input) {
        io.err('convert 需要一个输入：文件路径或 -（stdin）');
        return 2;
    }
    const text = await readInput(io, session, input);
    const receipt = await session.convert({
        text,
        path: flagText(flags, 'out'),
        overwrite: flags.has('overwrite'),
    });
    json(io, { ok: true, ...receipt });
    io.err(`[convert] ${receipt.kind} → ${receipt.path}（${receipt.bytes} 字节）`);
    return 0;
}

async function cmdValidate(argv: string[], io: CliIo, session: ServiceSession): Promise<number> {
    const { positionals } = parseArgs(argv);
    const input = positionals[0];
    if (!input) {
        io.err('validate 需要一个输入：文件路径或 -（stdin）');
        return 2;
    }
    const receipt = await session.validate(await readInput(io, session, input));
    json(io, receipt);
    io.err(receipt.ok ? `[validate] ${receipt.kind} 通过` : `[validate] ${receipt.error?.code}: ${receipt.error?.message}`);
    return receipt.ok ? 0 : 1;
}

async function cmdBatch(argv: string[], io: CliIo, session: ServiceSession): Promise<number> {
    const { positionals, flags } = parseArgs(argv);
    if (positionals.length === 0) {
        io.err('batch 需要至少一个输入：目录或 mmd 文件');
        return 2;
    }
    const files = expandInputs(session, positionals);
    if (files.length === 0) {
        io.err('输入目录里没有 .mmd 文件');
        return 2;
    }
    const receipt = await session.convertMany(
        files.map((f) => ({ file: f })),
        flagText(flags, 'out'),
    );
    json(io, { ...receipt, ok: receipt.failed === 0 });
    io.err(`[batch] 共 ${receipt.total} 项，成功 ${receipt.succeeded}，失败 ${receipt.failed} → ${receipt.outDir}`);
    return receipt.failed === 0 ? 0 : 1;
}

function cmdInspect(argv: string[], io: CliIo, session: ServiceSession): number {
    const { positionals } = parseArgs(argv);
    const input = positionals[0];
    if (!input) {
        io.err('inspect 需要一个 .vsdx 路径');
        return 2;
    }
    const receipt = session.inspect(toAbs(session, input));
    json(io, { ok: true, ...receipt });
    io.err(`[inspect] ${receipt.parts.length} 个部件，${receipt.shapeCount} 个形状`);
    return 0;
}

/** 执行一次 CLI 调用，返回退出码。测试直接调它。 */
export async function runCli(argv: string[], io: CliIo, session?: ServiceSession): Promise<number> {
    const s = session ?? new ServiceSession();
    const owns = session === undefined;
    const command = argv[0];
    try {
        if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
            io.out(kUsage);
            return command === undefined ? 2 : 0;
        }
        const rest = argv.slice(1);
        switch (command) {
            case 'convert':
            case 'validate':
            case 'batch':
            case 'inspect':
                break;
            default:
                io.err(`未知命令：${command}`);
                io.out(kUsage);
                return 2;
        }
        if (rest.includes('-h') || rest.includes('--help')) {
            io.out(kUsage);
            return 0;
        }
        if (command === 'convert') return await cmdConvert(rest, io, s);
        if (command === 'validate') return await cmdValidate(rest, io, s);
        if (command === 'batch') return await cmdBatch(rest, io, s);
        return cmdInspect(rest, io, s);
    } catch (e) {
        return fail(io, toServiceError(e));
    } finally {
        if (owns) await s.shutdown();
    }
}

/** 真进程入口（bin 调用）。 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
    const io: CliIo = {
        out: (t) => process.stdout.write(`${t}\n`),
        err: (t) => process.stderr.write(`${t}\n`),
        readStdin: () =>
            new Promise<string>((resolveText, rejectText) => {
                const chunks: Buffer[] = [];
                process.stdin.on('data', (c: Buffer) => chunks.push(c));
                process.stdin.on('end', () => resolveText(Buffer.concat(chunks).toString('utf8')));
                process.stdin.on('error', rejectText);
            }),
    };
    const code = await runCli(argv, io);
    process.exitCode = code;
}
