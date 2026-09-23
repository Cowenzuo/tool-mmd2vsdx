// 产物回执：字节 → 元数据，HTTP 层按它写响应头（docs/接口协议.md 第 4 节）
import { createHash } from 'node:crypto';
import type { ContractA } from '../contracts/index.js';
import { Squeeze } from '../squeeze/index.js';
import { probePages, probeShapeCount } from './xmlProbe.js';

export interface RenderReceipt {
    /** 图型：flowchart、block、class、er、sequence。 */
    kind: string;
    /** 产物字节数。 */
    bytes: number;
    /** 内容哈希，可用于比对与去重。 */
    sha256: string;
    /** 页面尺寸（英寸）。 */
    pageSize: { widthIn: number; heightIn: number };
    /** 页面内形状总数。 */
    shapeCount: number;
    /** 不阻断的提示。 */
    warnings: string[];
    /** 建议文件名，取图标题推导。 */
    filename: string;
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

/** 产物字节 → 回执。 */
export function receiptOf(a: ContractA, bytes: Buffer): RenderReceipt {
    const parts = Squeeze.open(bytes).parts;
    const pages = probePages(parts);
    const shapeCount = probeShapeCount(parts);
    const first = pages[0];
    return {
        kind: a.kind,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        pageSize: { widthIn: first?.widthIn ?? 0, heightIn: first?.heightIn ?? 0 },
        shapeCount,
        warnings: warningsOf(a),
        filename: suggestFileName(a.meta.title),
    };
}

/** 把标题变成安全的文件名主体。 */
export function suggestFileName(title: string | undefined): string {
    const base = (title ?? '').trim() || 'diagram';
    const slug = base
        .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return `${slug || 'diagram'}.vsdx`;
}
