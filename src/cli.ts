#!/usr/bin/env node
// mmd2vsdx - cli：命令行入口
// 用法：
//   mmd2vsdx <in.mmd> [out.vsdx|outDir]
//   mmd2vsdx --dir <inputDir> <outputDir>
//   mmd2vsdx --serve [--port N]
// 退出码：0 成功 / 1 业务错误 / 2 用法错误
import { application } from './app/application.js';
import { phaseError } from './app/application.js';

/** 收尾关渲染器（幂等、吞错）：否则 chromium 子进程句柄悬挂、进程不退出。 */
async function shutdownQuietly(): Promise<void> {
    await application.shutdown().catch(() => {});
}

async function main(): Promise<number> {
    const argv = process.argv.slice(2);
    const positional: string[] = [];

    let servePort: number | null = null;
    const parsePort = (value: string): number | null => {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) return null;
        return port;
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === '--serve') {
            servePort = 12138;
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                const port = parsePort(next);
                if (port === null) return usage(); // 与 --port 同一校验口径（exit 2）
                servePort = port;
                i++;
            }
        } else if (a === '--port') {
            const next = argv[i + 1];
            if (next === undefined) return usage();
            const port = parsePort(next);
            if (port === null) return usage();
            servePort = port;
            i++;
        } else if (a === '--dir') {
            const inDir = argv[i + 1];
            const outDir = argv[i + 2];
            if (inDir === undefined || outDir === undefined) return usage();
            i += 2;
            try {
                const outputs = await application.convertDir(inDir, outDir);
                for (const o of outputs) process.stdout.write('ok  ' + o + '\n');
                return 0;
            } catch (e) {
                process.stderr.write('error: ' + phaseError(e, 'convert') + '\n');
                return 1;
            } finally {
                await shutdownQuietly();
            }
        } else if (a.startsWith('-')) {
            return usage();
        } else {
            positional.push(a);
        }
    }

    if (servePort !== null) {
        try {
            const server = await application.serve(servePort);
            const address = server.address();
            const actual = typeof address === 'object' && address !== null ? address.port : servePort;
            process.stdout.write(JSON.stringify({ status: 'ready', port: actual }) + '\n');
            const shutdown = async () => {
                server.close();
                await application.shutdown();
                process.exit(0);
            };
            process.on('SIGTERM', () => { void shutdown(); });
            process.on('SIGINT', () => { void shutdown(); });
            return 0; // serve 常驻（keep-alive 由事件循环维持）
        } catch (e) {
            process.stderr.write('error: ' + phaseError(e, 'serve') + '\n');
            return 1;
        }
    }

    if (positional.length === 0) return usage();
    const inFile = positional[0]!;
    const outPath = positional[1] ?? process.cwd();
    if (positional.length > 2) return usage();
    try {
        const out = await application.convertFile(inFile, outPath);
        process.stdout.write('ok  ' + out + '\n');
        return 0;
    } catch (e) {
        process.stderr.write('error: ' + phaseError(e, 'convert') + '\n');
        return 1;
    } finally {
        await shutdownQuietly();
    }
}

function usage(): number {
    process.stderr.write(
        '用法：mmd2vsdx <in.mmd> [out.vsdx|outDir]\n' +
        '      mmd2vsdx --dir <inputDir> <outputDir>\n' +
        '      mmd2vsdx --serve [--port N]\n');
    return 2;
}

const code = await main();
process.exitCode = code;
