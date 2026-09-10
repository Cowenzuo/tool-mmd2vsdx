// 端口组：连接行读取与端口选择（docs/开发过程/01-结构设计.md）
//
// 依据 research 结论：Xn=行 IX(n-1) 标准五行（下/右/上/左/中）、
// 类系列四行（左/右/下/上）、命名行（LeftSide/RightSide.X）、
// 生命线时间格（IX 0..99）。本组只读与选，不写公式。

export interface ConnectionRow {
    /** 行号（IX），命名行为 -1。 */
    ix: number;
    /** 行名（命名行），普通行无。 */
    name?: string;
    /** X 公式原文（如 'Width*0.5'）。 */
    xFormula: string;
    /** Y 公式原文。 */
    yFormula: string;
}

/** 从母版内容 XML 文本读取 Connection 行（单双引号、命名行均支持）。 */
export function findConnectionRows(masterXml: string): ConnectionRow[] {
    const out: ConnectionRow[] = [];
    const section = /<Section\sN=["']Connection["'][^>]*>([\s\S]*?)<\/Section>/.exec(masterXml)?.[1];
    if (!section) return out;
    const rowRe = /<Row\s([^>]*)>([\s\S]*?)<\/Row>/g;
    for (const m of section.matchAll(rowRe)) {
        const attrs = m[1]!;
        const ixText = attrs.match(/(?:^|\s)IX=["'](\d+)["']/)?.[1];
        const name = attrs.match(/(?:^|\s)N=["']([^"']+)["']/)?.[1];
        const body = m[2]!;
        const xFormula = /<Cell\sN=["']X["'][^>]*?F=["']([^"']*)["']/.exec(body)?.[1] ?? '';
        const yFormula = /<Cell\sN=["']Y["'][^>]*?F=["']([^"']*)["']/.exec(body)?.[1] ?? '';
        out.push({
            ix: ixText !== undefined ? Number.parseInt(ixText, 10) : -1,
            name,
            xFormula,
            yFormula,
        });
    }
    return out;
}

/** ToPart 计算：行号规则 100+IX；命名行按 Left/Right 取 100/101（research W-12）。 */
export function toPart(ix: number, name?: string): number {
    if (name?.toLowerCase().includes('left')) return 100;
    if (name?.toLowerCase().includes('right')) return 101;
    return 100 + ix;
}

/** 端口意图：粘到目标的哪个位置。 */
export interface PortIntent {
    /** 目标行号（自定布局/时间格），与 namedRow 二选一。 */
    row?: number;
    /** 命名行名（如 'LeftSide'）。 */
    namedRow?: string;
    /** 粘附方式：PAR 行号粘附 | WALKGLUE 走线粘附。 */
    glue: 'par' | 'walkglue';
}

/** 标准矩形五行：下/右/上/左/中（规范版 5.4.3.3 修正版）。 */
export const kStandardRows = {
    bottom: 0,
    right: 1,
    top: 2,
    left: 3,
    center: 4,
} as const;

/** 类系列四行：左/右/下/上（research class 专篇 2.4）。 */
export const kClassRows = {
    left: 0,
    right: 1,
    bottom: 2,
    top: 3,
} as const;
