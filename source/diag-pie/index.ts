// diag-pie（⑧ pie 包）：契约 A(pie) → 契约 B（docs/redesign/04-转义层/07-pie包）
//
// 语义照抄研究对照：起始角 = 12 点方向（-90°）顺时针累加、扇区 Pin=圆心
// LocPin=0、W=H=2R、ArcTo A=-sagitta（勿改负号）、缺色 #CCCCCC。

import { isNoUnitCell } from '../common/units.js';
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../xml/index.js';
import { kPageContentType, kPageUri } from '../xml/constants.js';
import { fmtInch } from '../common/geometry/transform.js';
import { part, type XmlPart } from '../contracts/index.js';
import type { PieChart } from '../contracts/index.js';

const kPi = 3.14159265358979323846;

interface PieCtx {
    shapes: XmlNode[];
    nextId: number;
    pageHpx: number;
    pxPerInch: number;
}

const kIn = (v: number) => fmtInch(v);

function ck(ctx: PieCtx, px: number, py: number): { x: number; y: number } {
    const k = ctx.pxPerInch;
    return { x: px / k, y: (ctx.pageHpx - py) / k };
}

function newShape(ctx: PieCtx): XmlNode {
    const el = makeElement('Shape');
    setAttribute(el, 'ID', String(ctx.nextId++));
    setAttribute(el, 'Type', 'Shape');
    ctx.shapes.push(el);
    return el;
}

function cNode(el: XmlNode, name: string, value: number, unit = 'IN'): void {
    const c = makeElement('Cell');
    setAttribute(c, 'N', name);
    setAttribute(c, 'V', kIn(value));
    if (!isNoUnitCell(name)) setAttribute(c, 'U', unit);
    el.children.push(c);
}

function sNode(el: XmlNode, name: string, value: string): void {
    const c = makeElement('Cell');
    setAttribute(c, 'N', name);
    setAttribute(c, 'V', value);
    el.children.push(c);
}

function geo(el: XmlNode, rows: Array<unknown[]>): void {
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    const nf = makeElement('Cell');
    setAttribute(nf, 'N', 'NoFill');
    setAttribute(nf, 'V', '0');
    g.children.push(nf);
    for (const row of rows) {
        const kind = row[0] as string;
        const ix = row[1] as number;
        const cells = row.slice(2) as Array<string | number | [string, string | number]>;
        const r = makeElement('Row');
        setAttribute(r, 'T', kind);
        setAttribute(r, 'IX', String(ix));
        for (const cell of cells) {
            const name = Array.isArray(cell) ? (cell[0] as string) : String(cell);
            const v = Array.isArray(cell) ? (cell[1] as string | number) : '';
            const c = makeElement('Cell');
            setAttribute(c, 'N', name);
            const num = typeof v === 'number';
            setAttribute(c, 'V', num ? kIn(v) : String(v));
            if (num && !isNoUnitCell(name)) setAttribute(c, 'U', 'IN');
            r.children.push(c);
        }
        g.children.push(r);
    }
    el.children.push(g);
}

/** 无边框无填充文本框（水平居中；CJK 按 UTF-8 字节估宽 0.55/0.28/0.42/0.36）。 */
function addTextLabel(ctx: PieCtx, px: number, py: number, text: string, fontSizePt: number): void {
    if (text.length === 0) return;
    let tw = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0)!;
        if (code >= 0x80) tw += (fontSizePt * 0.55) / 72 * utf8Bytes(code);
        else if (ch === ' ') tw += (fontSizePt * 0.28) / 72;
        else if (ch === '%') tw += (fontSizePt * 0.42) / 72;
        else tw += (fontSizePt * 0.36) / 72;
    }
    const w = tw + 0.1;
    const h = (fontSizePt / 72) * 1.4;
    const ns = newShape(ctx);
    const p = ck(ctx, px, py);
    cNode(ns, 'PinX', p.x);
    cNode(ns, 'PinY', p.y);
    cNode(ns, 'Width', w);
    cNode(ns, 'Height', h);
    cNode(ns, 'LocPinX', w / 2);
    cNode(ns, 'LocPinY', h / 2);
    cNode(ns, 'LinePattern', 0);
    cNode(ns, 'FillPattern', 0);
    cNode(ns, 'ShapeFixedCode', 1);
    const ch = makeElement('Section');
    setAttribute(ch, 'N', 'Character');
    const cr = makeElement('Row');
    setAttribute(cr, 'IX', '0');
    const color = makeElement('Cell');
    setAttribute(color, 'N', 'Color');
    setAttribute(color, 'V', '#333333');
    cr.children.push(color);
    const size = makeElement('Cell');
    setAttribute(size, 'N', 'Size');
    setAttribute(size, 'V', kIn(fontSizePt / 72));
    setAttribute(size, 'U', 'PT');
    cr.children.push(size);
    ch.children.push(cr);
    ns.children.push(ch);
    const pg = makeElement('Section');
    setAttribute(pg, 'N', 'Paragraph');
    const prow = makeElement('Row');
    setAttribute(prow, 'IX', '0');
    const ha = makeElement('Cell');
    setAttribute(ha, 'N', 'HorzAlign');
    setAttribute(ha, 'V', '1');
    prow.children.push(ha);
    pg.children.push(prow);
    ns.children.push(pg);
    textNode(ns, text);
}

function utf8Bytes(code: number): number {
    if (code < 0x80) return 1;
    if (code < 0x800) return 2;
    if (code < 0x10000) return 3;
    return 4;
}

/** 图例色块：实心小矩形。 */
function addSwatch(ctx: PieCtx, cx: number, cy: number, color: string, size: number): void {
    const ns = newShape(ctx);
    const p = ck(ctx, cx, cy);
    cNode(ns, 'PinX', p.x);
    cNode(ns, 'PinY', p.y);
    cNode(ns, 'Width', size);
    cNode(ns, 'Height', size);
    cNode(ns, 'LocPinX', size / 2);
    cNode(ns, 'LocPinY', size / 2);
    sNode(ns, 'FillForegnd', color);
    sNode(ns, 'FillBkgnd', color);
    cNode(ns, 'FillPattern', 1);
    sNode(ns, 'LineColor', '#000000');
    cNode(ns, 'LinePattern', 1);
    cNode(ns, 'LineWeight', 0.25 / 72, 'PT');
    geo(ns, [
        ['MoveTo', 1, ['X', 0], ['Y', 0]],
        ['LineTo', 2, ['X', size]],
        ['LineTo', 3, ['X', size], ['Y', size]],
        ['LineTo', 4, ['Y', size]],
        ['LineTo', 5, ['X', 0], ['Y', 0]],
    ]);
    textNode(ns, '');
}

function textNode(el: XmlNode, text: string): void {
    const t = makeElement('Text');
    t.children.push(text);
    el.children.push(t);
}

function decl(root: XmlNode): string {
    setAttribute(root, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
    return serializeDocument(root, {
        declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        indent: 0,
    });
}

/** 饼图渲染：扇区 + 百分比 + 标题 + 图例。 */
export class PieRenderer {
    render(a: { pie?: PieChart }, pageHpx: number, pxPerInch = 96): XmlPart {
        const pie = a.pie as PieChart;
        const ctx: PieCtx = { shapes: [], nextId: 1, pageHpx, pxPerInch };
        if (pie.slices.length > 0) {
            let total = 0;
            for (const s of pie.slices) total += s.value;
            if (total > 0) {
                const c = ck(ctx, pie.cx, pie.cy);
                const R = (pie.r > 0 ? pie.r : 185) / pxPerInch;
                const rpx = pie.r > 0 ? pie.r : 185;
                let start = -kPi / 2;
                for (const s of pie.slices) {
                    const arc = (s.value / total) * 2 * kPi;
                    const end = start + arc;
                    const q0 = ck(ctx, pie.cx + rpx * Math.cos(start), pie.cy + rpx * Math.sin(start));
                    const q1 = ck(ctx, pie.cx + rpx * Math.cos(end), pie.cy + rpx * Math.sin(end));
                    const lx0 = q0.x - c.x;
                    const ly0 = q0.y - c.y;
                    const lx1 = q1.x - c.x;
                    const ly1 = q1.y - c.y;
                    const color = s.color.length === 0 ? '#CCCCCC' : s.color;
                    const ns = newShape(ctx);
                    cNode(ns, 'PinX', c.x);
                    cNode(ns, 'PinY', c.y);
                    cNode(ns, 'Width', 2 * R);
                    cNode(ns, 'Height', 2 * R);
                    cNode(ns, 'LocPinX', 0);
                    cNode(ns, 'LocPinY', 0);
                    sNode(ns, 'FillForegnd', color);
                    sNode(ns, 'FillBkgnd', color);
                    cNode(ns, 'FillPattern', 1);
                    sNode(ns, 'LineColor', '#000000');
                    cNode(ns, 'LinePattern', 1);
                    cNode(ns, 'LineWeight', 0.5 / 72, 'PT');
                    const sagitta = R * (1 - Math.cos(Math.abs(arc) / 2));
                    geo(ns, [
                        ['MoveTo', 1, ['X', 0], ['Y', 0]],
                        ['LineTo', 2, ['X', lx0], ['Y', ly0]],
                        ['ArcTo', 3, ['X', lx1], ['Y', ly1], ['A', -sagitta]],
                        ['LineTo', 4, ['X', 0], ['Y', 0]],
                    ]);
                    textNode(ns, '');
                    const mid = (start + end) / 2;
                    const lpP = ck(ctx, pie.cx + rpx * 0.72 * Math.cos(mid), pie.cy + rpx * 0.72 * Math.sin(mid));
                    addTextLabel(ctx, lpP.x, lpP.y, `${Math.round((s.value / total) * 100)}%`, 12);
                    start = end;
                }
                if (pie.title.length > 0) {
                    const tp = ck(ctx, pie.cx, pie.cy - rpx - 15);
                    addTextLabel(ctx, tp.x, tp.y, pie.title, 18);
                }
                const lx = pie.cx + rpx + 40;
                let ly = pie.cy - (pie.slices.length - 1) * 11;
                for (const s of pie.slices) {
                    addSwatch(ctx, lx, ly, s.color.length === 0 ? '#CCCCCC' : s.color, 18 / pxPerInch);
                    addTextLabel(ctx, lx + 26, ly, s.label, 12);
                    ly += 22;
                }
            }
        }
        return buildPage1Part(ctx);
    }
}

function buildPage1Part(ctx: PieCtx): XmlPart {
    const root = makeElement('PageContents');
    const shapes = makeElement('Shapes');
    for (const s of ctx.shapes) shapes.children.push(s);
    const connects = makeElement('Connects');
    root.children.push(shapes, connects);
    return part(kPageUri, kPageContentType, decl(root));
}
