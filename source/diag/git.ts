// diag-git：契约 A → 契约 B（source/diag/git.ts；docs/redesign/04-转义层 对应篇）
// 结构与金标准同构：每分支（1 线 + 1 带名圆点），每提交（1 矩形点 + 1 标签，
// 合并再 +1 矩形点，带 tag +1 标签），每条父链 1 箭头线。

import { isNoUnitCell } from '../common/units.js';
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { fmtInch } from '../common/geometry/transform.js';
import { part, type XmlPart } from '../contracts/index.js';
import type { GitGraph } from '../contracts/index.js';

const kIn = (v: number) => fmtInch(v);

interface GitCtx {
    shapes: XmlNode[];
    nextId: number;
    pageHpx: number;
    pxPerInch: number;
}

function ck(ctx: GitCtx, px: number, py: number): { x: number; y: number } {
    const k = ctx.pxPerInch;
    return { x: px / k, y: (ctx.pageHpx - py) / k };
}

function newShape(ctx: GitCtx): XmlNode {
    const el = makeElement('Shape');
    setAttribute(el, 'ID', String(ctx.nextId++));
    setAttribute(el, 'Type', 'Shape');
    ctx.shapes.push(el);
    return el;
}

function c(el: XmlNode, name: string, value: number | string): void {
    const cell = makeElement('Cell');
    setAttribute(cell, 'N', name);
    const num = typeof value === 'number';
    setAttribute(cell, 'V', (num ? kIn(value) : String(value)));
    if (num && !isNoUnitCell(name)) setAttribute(cell, 'U', 'IN');
    el.children.push(cell);
}

function textNode(el: XmlNode, text: string): void {
    const t = makeElement('Text');
    if (text) t.children.push(text);
    el.children.push(t);
}

/** 矩形点（提交点，无文本）。 */
function writeDot(ctx: GitCtx, px: number, py: number, w = 24, h = 24): void {
    const el = newShape(ctx);
    const p = ck(ctx, px, py);
    c(el, 'PinX', p.x);
    c(el, 'PinY', p.y);
    c(el, 'Width', w / ctx.pxPerInch);
    c(el, 'Height', h / ctx.pxPerInch);
    c(el, 'LocPinX', w / 2 / ctx.pxPerInch);
    c(el, 'LocPinY', h / 2 / ctx.pxPerInch);
    c(el, 'LineColor', '#000000');
    c(el, 'LinePattern', 1);
    c(el, 'FillForegnd', '#FFFFFF');
    c(el, 'FillPattern', 1);
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    for (const [t, ix, dy] of [['MoveTo', 1, -12], ['LineTo', 2, -12], ['LineTo', 3, 12], ['LineTo', 4, 12], ['LineTo', 5, -12]] as Array<[string, number, number]>) {
        const r = makeElement('Row');
        setAttribute(r, 'T', t);
        setAttribute(r, 'IX', String(ix));
        if (t === 'MoveTo') {
            c(r, 'X', -w / 2);
            c(r, 'Y', dy);
        } else {
            const xs = [w / 2, w / 2, -w / 2, -w / 2];
            c(r, 'X', xs[(ix - 2) % 4]! / 2 + (t === 'LineTo' ? 0 : 0));
            c(r, 'Y', dy);
        }
        g.children.push(r);
    }
    el.children.push(g);
    textNode(el, '');
}

/** 圆点带分支名 / 普通标签文本。 */
function writeLabelShape(ctx: GitCtx, px: number, py: number, text: string, circle = false): void {
    const el = newShape(ctx);
    const p = ck(ctx, px, py);
    c(el, 'PinX', p.x);
    c(el, 'PinY', p.y);
    c(el, 'Width', circle ? 16 / ctx.pxPerInch : text.length * 0.06);
    c(el, 'Height', circle ? 16 / ctx.pxPerInch : 0.15);
    c(el, 'LocPinX', (circle ? 8 : 0) / ctx.pxPerInch);
    c(el, 'LocPinY', (circle ? 8 : 0) / ctx.pxPerInch);
    c(el, 'LinePattern', circle ? 1 : 0);
    c(el, 'FillPattern', 0);
    if (circle) {
        const g = makeElement('Section');
        setAttribute(g, 'N', 'Geometry');
        setAttribute(g, 'IX', '0');
        for (const [t, ix] of [['MoveTo', 1], ['EllipticalArcTo', 2], ['EllipticalArcTo', 3]] as Array<[string, number]>) {
            const r = makeElement('Row');
            setAttribute(r, 'T', t);
            setAttribute(r, 'IX', String(ix));
            if (t === 'MoveTo') c(r, 'X', -8 / ctx.pxPerInch);
            else {
                c(r, 'X', (ix === 2 ? 8 / ctx.pxPerInch : -8 / ctx.pxPerInch));
                c(r, 'A', 8 / ctx.pxPerInch);
            }
            g.children.push(r);
        }
        el.children.push(g);
    }
    textNode(el, text);
}

/** 箭头线（父链，两段折线）。 */
function writeArrow(ctx: GitCtx, p1: { x: number; y: number }, p2: { x: number; y: number }): void {
    const el = newShape(ctx);
    const mid = ck(ctx, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
    c(el, 'PinX', mid.x);
    c(el, 'PinY', mid.y);
    c(el, 'Width', Math.abs(p2.x - p1.x) / ctx.pxPerInch);
    c(el, 'Height', Math.abs(p2.y - p1.y) / ctx.pxPerInch);
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    for (const [t, ix, xo, yo] of [
        ['MoveTo', 1, -Math.abs(p2.x - p1.x) / 2, -Math.abs(p2.y - p1.y) / 2],
        ['LineTo', 2, Math.abs(p2.x - p1.x) / 2, Math.abs(p2.y - p1.y) / 2],
    ] as Array<[string, number, number, number]>) {
        const r = makeElement('Row');
        setAttribute(r, 'T', t);
        setAttribute(r, 'IX', String(ix));
        c(r, 'X', xo / ctx.pxPerInch);
        c(r, 'Y', yo / ctx.pxPerInch);
        g.children.push(r);
    }
    el.children.push(g);
    textNode(el, '');
}

export class GitRenderer {
    render(a: { git?: GitGraph }, pageHpx: number, pxPerInch = 96): XmlPart {
        const g = a.git ?? { commits: [], branches: [], arrows: [] };
        const ctx: GitCtx = { shapes: [], nextId: 1, pageHpx, pxPerInch };
        // 分支：线 + 带名圆点
        for (const b of g.branches) {
            const y0 = (g.commits.find((c) => c.branchIndex === b.index)?.y ?? 0);
            const x0 = 60;
            const x1 = 900;
            const p1 = { x: x0, y: y0 };
            const p2 = { x: x1, y: y0 };
            const el = newShape(ctx);
            const mid = ck(ctx, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
            c(el, 'PinX', mid.x);
            c(el, 'PinY', mid.y);
            c(el, 'Width', Math.abs(p2.x - p1.x) / pxPerInch);
            c(el, 'Height', Math.abs(p2.y - p1.y) / pxPerInch);
            const gs = makeElement('Section');
            setAttribute(gs, 'N', 'Geometry');
            setAttribute(gs, 'IX', '0');
            for (const [t, ix, xo] of [['MoveTo', 1, -Math.abs(p2.x - p1.x) / 2], ['LineTo', 2, Math.abs(p2.x - p1.x) / 2]] as Array<[string, number, number]>) {
                const r = makeElement('Row');
                setAttribute(r, 'T', t);
                setAttribute(r, 'IX', String(ix));
                c(r, 'X', xo / pxPerInch);
                c(r, 'Y', 0);
                gs.children.push(r);
            }
            el.children.push(gs);
            textNode(el, '');
            writeLabelShape(ctx, x0 - 30, y0, b.name, true);
        }
        // 提交：矩形点 + 标签；合并 +1 点；cherry-pick 的 tag 当标签正文；
        // 正常带 tag 的提交再 +1 标签
        for (const cm of g.commits) {
            writeDot(ctx, cm.x, cm.y);
            if (cm.reverse) {
                writeLabelShape(ctx, cm.x + 26, cm.y - 6, cm.tag || cm.label);
            } else {
                writeLabelShape(ctx, cm.x + 26, cm.y - 6, cm.label);
                if (cm.tag) writeLabelShape(ctx, cm.x + 26, cm.y + 16, cm.tag);
            }
            if (cm.merge) writeDot(ctx, cm.x + 26, cm.y);
        }
        // 箭头：每条父链 1 条线
        for (const a of g.arrows) {
            const from = g.commits.find((c) => c.id === a.from);
            const to = g.commits.find((c) => c.id === a.to);
            if (!from || !to) continue;
            writeArrow(ctx, { x: from.x, y: from.y }, { x: to.x, y: to.y });
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
