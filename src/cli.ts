#!/usr/bin/env node
// mmd2vsdx - cli：命令行入口
// 用法：
//   mmd2vsdx <in.mmd> [out.vsdx|outDir]
//   mmd2vsdx --dir <inputDir> <outputDir>
//   mmd2vsdx --serve [--port N]
// 母版资产（官方模具不随包分发）：
//   --stencil-dir <dir>      模具目录（官方 .vssx/.vstx，现场提取）
//   --stencil-asset <file>   预生成资产 JSON（stencil-data.json，可私下分发）
//   --no-stencil-search      禁用首次自动搜寻本机 Visio
// 缺省：首次真实母版转换自动搜寻本机 Visio（找不到报 [assets] 引导错误）。
// 退出码：0 成功 / 1 业务错误 / 2 用法错误
import { application } from './app/application.js';
import { phaseError } from './app/application.js';
import type { StencilAssetsConfig } from './app/application.js';

/** 收尾关渲染器（幂等、吞错）：否则 chromium 子进程句柄悬挂、进程不退出。 */
async function shutdownQuietly(): Promise<void> {
    await application.shutdown().catch(() => {});
}

/** 错误打印：消息已带 [phase] 前缀则原样输出（防 convertFile→CLI 双包）。 */
function printError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.startsWith('[') ? msg : phaseError(e, 'convert');
}

async function main(): Promise<number> {
    const argv = process.argv.slice(2);
    const positional: string[] = [];
    const stencilArg: StencilAssetsConfig = {};

    let servePort: number | null = null;
    const parsePort = (value: string): number | null => {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) return null;
        return port;
    };
    const needValue = (i: number): string | null => {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) return null;
        return next;
    };
    const explicitStencils = (): boolean =>
        stencilArg.stencilDir !== undefined || stencilArg.assetFile !== undefined ||
        stencilArg.search === false;
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
        } else if (a === '--stencil-dir') {
            const v = needValue(i);
            if (v === null) return usage();
            stencilArg.stencilDir = v;
            i++;
        } else if (a === '--stencil-asset') {
            const v = needValue(i);
            if (v === null) return usage();
            stencilArg.assetFile = v;
            i++;
        } else if (a === '--no-stencil-search') {
            stencilArg.search = false;
        } else if (a === '--dir') {
            const inDir = argv[i + 1];
            const outDir = argv[i + 2];
            if (inDir === undefined || outDir === undefined) return usage();
            i += 2;
            try {
                if (explicitStencils()) await application.configureStencils(stencilArg);
                const outputs = await application.convertDir(inDir, outDir);
                for (const o of outputs) process.stdout.write('ok  ' + o + '\n');
                return 0;
            } catch (e) {
                process.stderr.write('error: ' + printError(e) + '\n');
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
            if (explicitStencils()) await application.configureStencils(stencilArg);
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
        if (explicitStencils()) await application.configureStencils(stencilArg);
        const out = await application.convertFile(inFile, outPath);
        process.stdout.write('ok  ' + out + '\n');
        return 0;
    } catch (e) {
        process.stderr.write('error: ' + printError(e) + '\n');
        return 1;
    } finally {
        await shutdownQuietly();
    }
}

function usage(): number {
    process.stderr.write(
        '用法：mmd2vsdx <in.mmd> [out.vsdx|outDir]\n' +
        '      mmd2vsdx --dir <inputDir> <outputDir>\n' +
        '      mmd2vsdx --serve [--port N]\n' +
        '资产：--stencil-dir <dir> | --stencil-asset <file> | --no-stencil-search\n');
    return 2;
}

const code = await main();
process.exitCode = code;
