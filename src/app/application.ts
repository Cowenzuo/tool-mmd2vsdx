// mmd2vsdx - app：application（门面编排：文件/目录/服务）
//
// C++ app 层（application/pipeline/input/output/serve）平移 + 纯 Node 化：
//   convertText(text, options?) → ConvertResult{ok, vsdxBase64, diagramType, pageCount}
//   convertFile/convertDir（串行、输入顺序、输出目录解析照抄）
//   serve(port)：POST /convert {text} → ConvertResult JSON；GET /health
// 错误：[phase] 前缀（MmdError/TypeError/Error 统一包装），CLI 打印可读。

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { translator } from '../mmdtransform/translator.js';
import { translate as vsdxTranslate } from '../vsdxdoc/vsdxTranslator.js';
import { OpcPackager } from '../opcpkg/opcpackager.js';
import type { CreateOptions } from '../core/vsdx.js';
import type { ConvertResult, XmlParts } from '../core/xmlparts.js';
import { defaultConvertResult } from '../core/xmlparts.js';
import { MmdError } from '../core/errors.js';

/** 输出路径解析：以 .vsdx 结尾视为文件直接写，否则视为目录写 <stem>.vsdx。 */
export function resolveOutPath(outPath: string, mmdPath: string): string {
    if (outPath.toLowerCase().endsWith('.vsdx')) return outPath;
    const stem = path.basename(mmdPath).replace(/\.mmd$/i, '');
    return path.join(outPath, stem + '.vsdx');
}

export function listMmdFiles(inputDir: string): string[] {
    return readdirSync(inputDir)
        .filter((f) => f.toLowerCase().endsWith('.mmd'))
        .sort(); // 大小写敏感字典序；顶层不递归（FileScanner 语义）
}

/** 错误 → [phase] 消息（CLI 可读）。 */
export function phaseError(e: unknown, phase: string): string {
    const msg = e instanceof Error ? e.message : String(e);
    return `[${phase}] ${msg}`;
}

async function partsToBase64(parts: XmlParts): Promise<string> {
    const dir = mkdtempSync(path.join(tmpdir(), 'mmd2vsdx-'));
    try {
        const file = path.join(dir, 'out.vsdx');
        OpcPackager.pack(parts, file);
        return readFileSync(file).toString('base64');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

export class Application {
    /** 文本 → ConvertResult（真实母版默认选项；失败 ok=false+error）。 */
    async convertText(text: string, options?: Partial<CreateOptions>): Promise<ConvertResult> {
        const result = defaultConvertResult();
        try {
            const diagram = await translator.translate(text);
            const parts = vsdxTranslate(diagram, options);
            result.ok = true;
            result.vsdxBase64 = await partsToBase64(parts);
            result.diagramType = diagram.diagramType;
            result.pageCount = parts.parts.filter((p) =>
                /^visio\/pages\/page\d+\.xml$/.test(p.uri)).length;
            return result;
        } catch (e) {
            result.error = phaseError(e, 'convert');
            return result;
        }
    }

    /** 单文件 → .vsdx（outPath 文件或目录）。 */
    async convertFile(mmdPath: string, outPath: string): Promise<string> {
        const text = readFileSync(mmdPath, 'utf8');
        const result = await this.convertText(text);
        if (!result.ok) throw new Error(result.error);
        const target = resolveOutPath(outPath, mmdPath);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(result.vsdxBase64, 'base64'));
        return target;
    }

    /** 目录 → 串行批量（输出序 = 输入序）。 */
    async convertDir(inputDir: string, outDir: string): Promise<string[]> {
        const files = listMmdFiles(inputDir);
        mkdirSync(outDir, { recursive: true });
        const outputs: string[] = [];
        for (const f of files) {
            outputs.push(await this.convertFile(path.join(inputDir, f), outDir));
        }
        return outputs;
    }

    /** HTTP 服务：POST /convert（base64）、GET /health；串行队列。 */
    async serve(port: number): Promise<Server> {
        let queue: Promise<unknown> = Promise.resolve();
        const server = createServer((req, res) => {
            const send = (code: number, body: unknown) => {
                res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(body));
            };
            if (req.method === 'GET' && req.url === '/health') {
                send(200, { status: 'ok' });
                return;
            }
            if (req.method === 'POST' && req.url === '/convert') {
                let body = '';
                let killed = false;
                req.on('data', (chunk: Buffer) => {
                    body += chunk.toString('utf8');
                    if (body.length > 1024 * 1024) {
                        killed = true;
                        req.destroy();
                    }
                });
                req.on('end', () => {
                    if (killed) return;
                    let text: string;
                    try {
                        const parsed = JSON.parse(body);
                        text = (parsed?.text ?? '') as string;
                    } catch {
                        send(400, { status: 'error', message: 'bad request' });
                        return;
                    }
                    const task = queue.then(async () => {
                        const result = await this.convertText(text);
                        // 协议兼容：业务异常 200 + status:error（勿改 4xx）
                        send(200, result.ok
                            ? { status: 'ok', vsdx: result.vsdxBase64, diagramType: result.diagramType, pageCount: result.pageCount }
                            : { status: 'error', message: result.error });
                    });
                    queue = task.catch(() => {});
                });
                return;
            }
            send(404, { status: 'error', message: 'not found' });
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', resolve);
        });
        return server;
    }

    /** 释放渲染器（幂等）。 */
    async shutdown(): Promise<void> {
        await translator.shutdown();
    }
}

export const application = new Application();

export type { Server };

export function isMmdError(e: unknown): e is MmdError {
    return e instanceof MmdError;
}
