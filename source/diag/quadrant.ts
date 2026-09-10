// diag-quadrant：契约 A → 契约 B（source/diag/quadrant.ts；docs/redesign/04-转义层 对应篇）
// 结构目标（golden 13-quadrant-1）：6 线（四边框+十字）+ 4 圆点 + 4 点标签
// + 标题 + 4 轴标签 = 19 形状。布局取语义点，坐标换算像素→英寸。

import { isNoUnitCell } from '../common/units.js';
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { fmtInch } from '../common/geometry/transform.js';
import { part, type XmlPart } from '../contracts/index.js';
import type { QuadrantChart } from '../contracts/index.js';

const kIn = (v: number) => fmtInch(v);

interface QCtx {
    shapes: XmlNode[];
    nextId: number;
    pageHpx: number;
    pxPerInch: number;
}

function ck(ctx: QCtx, px: number, py: number): { x: number; y: number } {
    const k = ctx.pxPerInch;
    return { x: px / k, y: (ctx.pageHpx - py) / k };
}

function newShape(ctx: QCtx): XmlNode {
    const el = makeElement('Shape');
    setAttribute(el, 'ID', String(ctx.nextId++));
    setAttribute(el, 'Type', 'Shape');
    ctx.shapes.push(el);
    return el;
}

function c(el: XmlNode, name: string, value: number | string, unit = 'IN'): void {
    const cell = makeElement('Cell');
    setAttribute(cell, 'N', name);
    const num = typeof value === 'number';
    setAttribute(cell, 'V', num ? kIn(value) : String(value));
    if (num && !isNoUnitCell(name)) setAttribute(cell, 'U', unit);
    el.children.push(cell);
}

/** 两行线段形状（Pin 在中点，几何为相对偏移的 MoveTo/LineTo）。 */
function writeLine(ctx: QCtx, p1: { x: number; y: number }, p2: { x: number; y: number }): void {
    const el = newShape(ctx);
    const mid = ck(ctx, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
    c(el, 'PinX', mid.x);
    c(el, 'PinY', mid.y);
    c(el, 'Width', Math.abs(p2.x - p1.x) / ctx.pxPerInch);
    c(el, 'Height', Math.abs(p2.y - p1.y) / ctx.pxPerInch);
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    const r1 = makeElement('Row');
    setAttribute(r1, 'T', 'MoveTo');
    setAttribute(r1, 'IX', '1');
    c(r1, 'X', (p1.x - (p1.x + p2.x) / 2) / ctx.pxPerInch);
    c(r1, 'Y', ((p1.y - (p1.y + p2.y) / 2) * -1) / ctx.pxPerInch);
    const r2 = makeElement('Row');
    setAttribute(r2, 'T', 'LineTo');
    setAttribute(r2, 'IX', '2');
    c(r2, 'X', (p2.x - (p1.x + p2.x) / 2) / ctx.pxPerInch);
    c(r2, 'Y', ((p2.y - (p1.y + p2.y) / 2) * -1) / ctx.pxPerInch);
    g.children.push(r1, r2);
    el.children.push(g);
    textNode(el, '');
}

/** 圆点（本地两段 EllipticalArcTo + 填充色）。 */
function writeDot(ctx: QCtx, cx: number, cy: number, r: number): void {
    const el = newShape(ctx);
    const p = ck(ctx, cx, cy);
    c(el, 'PinX', p.x);
    c(el, 'PinY', p.y);
    c(el, 'Width', 2 * r);
    c(el, 'Height', 2 * r);
    c(el, 'LocPinX', r);
    c(el, 'LocPinY', r);
    c(el, 'FillForegnd', '#3399CC');
    c(el, 'FillPattern', 1);
    c(el, 'LineColor', '#000000');
    c(el, 'LinePattern', 1);
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    const r1 = makeElement('Row');
    setAttribute(r1, 'T', 'MoveTo');
    setAttribute(r1, 'IX', '1');
    c(r1, 'X', -r);
    c(r1, 'Y', 0);
    const r2 = makeElement('Row');
    setAttribute(r2, 'T', 'EllipticalArcTo');
    setAttribute(r2, 'IX', '2');
    c(r2, 'X', r);
    c(r2, 'Y', 0);
    c(r2, 'A', r);
    const r3 = makeElement('Row');
    setAttribute(r3, 'T', 'EllipticalArcTo');
    setAttribute(r3, 'IX', '3');
    c(r3, 'X', -r);
    c(r3, 'Y', 0);
    c(r3, 'A', r);
    g.children.push(r1, r2, r3);
    el.children.push(g);
    textNode(el, '');
}

/** 无边框无填充文本（沿用 pie 风格）。 */
function writeLabel(ctx: QCtx, px: number, py: number, text: string, fontSizePt = 12): void {
    if (!text) return;
    const el = newShape(ctx);
    const p = ck(ctx, px, py);
    const w = text.length * 0.08;
    const h = (fontSizePt / 72) * 1.4;
    c(el, 'PinX', p.x);
    c(el, 'PinY', p.y);
    c(el, 'Width', w);
    c(el, 'Height', h);
    c(el, 'LocPinX', w / 2);
    c(el, 'LocPinY', h / 2);
    c(el, 'LinePattern', 0);
    c(el, 'FillPattern', 0);
    c(el, 'ShapeFixedCode', 1);
    textNode(el, text);
}

function textNode(el: XmlNode, text: string): void {
    const t = makeElement('Text');
    if (text) t.children.push(text);
    el.children.push(t);
}

export class QuadrantRenderer {
    render(a: { quadrant?: QuadrantChart }, pageHpx: number, pxPerInch = 96): XmlPart {
        const q: QuadrantChart = a.quadrant ?? {
            title: '',
            xLabelLow: '',
            xLabelHigh: '',
            yLabelLow: '',
            yLabelHigh: '',
            minX: 0,
            minY: 0,
            maxX: 400,
            maxY: 400,
            crossX: 200,
            crossY: 200,
            points: [],
        };
        const ctx: QCtx = { shapes: [], nextId: 1, pageHpx, pxPerInch };
        const pts = q.points;
        if (pts.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of pts) {
                minX = Math.min(minX, p.cx);
                minY = Math.min(minY, p.cy);
                maxX = Math.max(maxX, p.cx);
                maxY = Math.max(maxY, p.cy);
            }
            const pad = 30;
            minX -= pad;
            minY -= pad;
            maxX += pad;
            maxY += pad;
            const midX = (minX + maxX) / 2;
            const midY = (minY + maxY) / 2;
            // 四边框 + 十字线
            writeLine(ctx, { x: minX, y: minY }, { x: maxX, y: minY });
            writeLine(ctx, { x: minX, y: maxY }, { x: maxX, y: maxY });
            writeLine(ctx, { x: minX, y: minY }, { x: minX, y: maxY });
            writeLine(ctx, { x: maxX, y: minY }, { x: maxX, y: maxY });
            writeLine(ctx, { x: midX, y: minY }, { x: midX, y: maxY });
            writeLine(ctx, { x: minX, y: midY }, { x: maxX, y: midY });
            for (const p of pts) {
                writeDot(ctx, p.cx, p.cy, 6);
                writeLabel(ctx, p.cx, p.cy - 14, p.label, 12);
            }
            if (q.title) writeLabel(ctx, midX, maxY + 20, q.title, 16);
            // 轴标签
            writeLabel(ctx, minX, minY - 24, q.xLabelLow, 12);
            writeLabel(ctx, maxX, minY - 24, q.xLabelHigh, 12);
            writeLabel(ctx, minX - 30, minY, q.yLabelLow, 12);
            writeLabel(ctx, minX - 30, maxY, q.yLabelHigh, 12);
        }
        const root = makeElement('PageContents');
        const shapes = makeElement('Shapes');
        for (const s of ctx.shapes) shapes.children.push(s);
        root.children.push(shapes, makeElement('Connects'));
        setAttribute(root, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
        const xml = serializeDocument(root, {
            declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            indent: 0,
        });
        return part(kPageUri, kPageContentType, xml);
    }
}
