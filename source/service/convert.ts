// 转换适配：mermaid 文本 → .vsdx 文件；单次与批量走同一实现
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { ContractA } from '../contracts/index.js';
import { renderContract } from '../convert.js';
import { PartsAssembler } from '../xml-parts/index.js';
import { Squeeze } from '../squeeze/index.js';
import type { Parser } from '../parser/index.js';
import { ServiceError, toServiceError, type ServiceErrorInfo } from './errors.js';
import { checkOutputSize, checkText, kMaxBatchItems, kMaxInputBytes } from './limits.js';
import { prepareTarget, resolveOutputDir, resolveOutputPath, suggestFileName, type PathPolicy } from './paths.js';
import { probePageStats, probePages } from './xmlProbe.js';

export interface ConvertRequest {
    text: string;
    /** 输出路径，绝对或相对工作目录；缺省走策略的兜底目录。 */
    path?: string | undefined;
    /** 目标已存在时是否允许覆盖，默认 false。 */
    overwrite?: boolean | undefined;
}

export interface ConvertReceipt {
    path: string;
    bytes: number;
    sha256: string;
    kind: string;
    pageSize: { widthIn: number; heightIn: number };
    shapeCount: number;
    warnings: string[];
}

export interface BatchItem {
    /** 内联 mermaid 文本，与 file 二选一。 */
    text?: string | undefined;
    /** 输入文件路径（相对工作目录）。 */
    file?: string | undefined;
    /** 输出文件名，缺省按文件来源或标题推导。 */
    name?: string | undefined;
}

export interface BatchItemResult {
    index: number;
    ok: boolean;
    path?: string;
    kind?: string;
    bytes?: number;
    sha256?: string;
    error?: ServiceErrorInfo;
}

export interface BatchReceipt {
    outDir: string;
    total: number;
    ok: number;
    failed: number;
    results: BatchItemResult[];
}

/** 契约 A 里值得提示但不阻断转换的项。 */
export function warningsOf(a: ContractA): string[] {
    const out: string[] = [];
    if (a.kind === 'class' && a.classModel) {
        const others = new Set<string>();
        for (const c of a.classModel.classes) {
            for (const s of c.stereotypes) if (s !== 'interface') others.add(s);
        }
        if (others.size > 0) out.push(`构造型 ${[...others].join('、')} 没有官方母版，按普通类盒渲染`);
    }
    if (a.kind === 'sequence' && a.sequence && a.sequence.actors.length === 0) {
        out.push('时序图没有参与者，产物只有空白页面');
    }
    return out;
}

/** 既有管线四步：文本 → 契约 A → 契约 B → 部件 → 字节。 */
export async function renderVsdx(parser: Parser, text: string): Promise<{ bytes: Buffer; a: ContractA }> {
    const a = await parser.convertText(text);
    const b = renderContract(a);
    const assembled = new PartsAssembler().assemble(b.parts);
    const bytes = new Squeeze().pack(assembled);
    checkOutputSize(bytes.length);
    return { bytes, a };
}

/** 原子落盘：先写临时文件再改名，避免留半写产物。 */
export function writeAtomic(absPath: string, bytes: Buffer): void {
    const tmp = `${absPath}.tmp-${process.pid.toString(36)}`;
    try {
        writeFileSync(tmp, bytes);
        renameSync(tmp, absPath);
    } catch (e) {
        rmSync(tmp, { force: true });
        throw e;
    }
}

function receiptOf(a: ContractA, bytes: Buffer, outPath: string): ConvertReceipt {
    const parts = Squeeze.open(bytes).parts;
    const pages = probePages(parts);
    const stats = probePageStats(parts, 1);
    const first = pages[0];
    return {
        path: outPath,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        kind: a.kind,
        pageSize: { widthIn: first?.widthIn ?? 0, heightIn: first?.heightIn ?? 0 },
        shapeCount: stats.shapeCount,
        warnings: warningsOf(a),
    };
}

/** 单次转换：解析 → 渲染 → 落盘 → 回执。 */
export async function convertToFile(parser: Parser, policy: PathPolicy, req: ConvertRequest): Promise<ConvertReceipt> {
    const text = checkText(req.text);
    const { bytes, a } = await renderVsdx(parser, text);
    const outPath = resolveOutputPath(policy, req.path, suggestFileName(a.meta.title));
    prepareTarget(outPath, req.overwrite ?? false);
    writeAtomic(outPath, bytes);
    return receiptOf(a, bytes, outPath);
}

/** 批量转换：逐项隔离失败，复用同一个解析器（浏览器只起一次）。 */
export async function convertBatch(
    parser: Parser,
    policy: PathPolicy,
    items: BatchItem[],
    outDir?: string | undefined,
    overwrite = false,
): Promise<BatchReceipt> {
    if (!Array.isArray(items) || items.length === 0) {
        throw new ServiceError('invalid_argument', '批量输入为空', 'items 至少给一项，单次上限 50 项');
    }
    if (items.length > kMaxBatchItems) {
        throw new ServiceError('too_large', `批量 ${items.length} 项，超过上限 ${kMaxBatchItems} 项`, '拆成多次调用');
    }
    const dir = resolveOutputDir(policy, outDir);
    const used = new Set<string>();
    const results: BatchItemResult[] = [];
    for (let index = 0; index < items.length; index++) {
        const item = items[index]!;
        try {
            const source = item.file !== undefined ? readTextFile(policy, item.file) : checkText(item.text);
            const { bytes, a } = await renderVsdx(parser, source);
            const base = item.name && item.name.trim()
                ? item.name.trim()
                : item.file !== undefined
                    ? `${basename(item.file, extname(item.file))}.vsdx`
                    : suggestFileName(a.meta.title);
            const name = uniqueName(used, base);
            used.add(name);
            const outPath = resolveOutputPath(policy, join(dir, name), name);
            prepareTarget(outPath, overwrite);
            writeAtomic(outPath, bytes);
            const r = receiptOf(a, bytes, outPath);
            results.push({ index, ok: true, path: r.path, kind: r.kind, bytes: r.bytes, sha256: r.sha256 });
        } catch (e) {
            results.push({ index, ok: false, error: toServiceError(e).info() });
        }
    }
    const ok = results.filter((r) => r.ok).length;
    return { outDir: dir, total: results.length, ok, failed: results.length - ok, results };
}

/** 同名冲突时加序号，保证同一批内文件名唯一。 */
function uniqueName(used: Set<string>, base: string): string {
    if (!used.has(base)) return base;
    const ext = extname(base);
    const stem = base.slice(0, base.length - ext.length);
    for (let i = 2; i < 1000; i++) {
        const candidate = `${stem}-${i}${ext}`;
        if (!used.has(candidate)) return candidate;
    }
    throw new ServiceError('invalid_argument', `同名项过多：${base}`, '给每项显式指定 name');
}

/** 读文本入参文件，带大小上限。 */
export function readTextFile(policy: PathPolicy, file: string): string {
    const abs = resolveOutputPath(policy, file, basename(file));
    let buf: Buffer;
    try {
        buf = readFileSync(abs);
    } catch (e) {
        throw new ServiceError('invalid_argument', `读不到输入文件：${abs}`, String((e as Error).message));
    }
    if (buf.length > kMaxInputBytes) {
        throw new ServiceError('too_large', `输入文件 ${buf.length} 字节，超过上限 ${kMaxInputBytes} 字节`, '拆小输入文件');
    }
    return buf.toString('utf8');
}
