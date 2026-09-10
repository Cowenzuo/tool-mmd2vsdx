// diag-sequence：契约 A → 契约 B（source/diag/sequence.ts；docs/redesign/04-转义层 对应篇）
// 结构与金标准同构：每参与者 1 生命线组（组上带名，内含头框+竖线），
// 每消息 1 线（2 条 Connects），每激活 1 竖条（2 条 Connects），每个片段 1 框+1 标签。
// 布局常量与 parser/ext/sequence.mjs 保持一致（行距 52px、首行 y=85px 等）。

import { isNoUnitCell } from '../common/units.js';
import { attr, makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type SequenceModel } from '../contracts/index.js';

const kIn = (v: number) => {
    const n = Math.round(v * 1e6) / 1e6;
    return String(n);
};

const kHeaderTop = 20;
const kHeaderH = 40;
const kRowGap = 52;
const kFirstRowY = 85;
const kXW = 150;

interface SeqCtx {
    shapes: XmlNode[];
    children: XmlNode[];
    nextId: number;
    pageHpx: number;
    pxPerInch: number;
}

function rowY(i: number): number {
    return kFirstRowY + i * kRowGap;
}

function newShape(ctx: SeqCtx): XmlNode {
    const el = makeElement('Shape');
    setAttribute(el, 'ID', String(ctx.nextId++));
    setAttribute(el, 'Type', 'Shape');
    ctx.shapes.push(el);
    return el;
}

function c(el: XmlNode, name: string, value: number | string): void {
    const cell = makeElement('Cell');
    setAttribute(cell, 'N', name);
    if (typeof value === 'number' && !isNoUnitCell(name)) {
        setAttribute(cell, 'V', kIn(value));
        setAttribute(cell, 'U', 'IN');
    } else {
        setAttribute(cell, 'V', String(value));
    }
    el.children.push(cell);
}

function textNode(el: XmlNode, text: string): void {
    const t = makeElement('Text');
    if (text) t.children.push(text);
    el.children.push(t);
}

/** 生命线时间点连接行（sequence 专篇 2.2/s-5：100 行、6.35mm 步长、X 公式 Controls.Row_1）。 */
function timeConnectionSection(xIn: number, rowCount = 100, stepIn = 0.25): XmlNode {
    const sec = makeElement('Section');
    setAttribute(sec, 'N', 'Connection');
    for (let ix = 0; ix < rowCount; ix++) {
        const row = makeElement('Row');
        setAttribute(row, 'T', 'Connection');
        setAttribute(row, 'IX', String(ix));
        const stepMM = Math.round(stepIn * 25.4 * 100) / 100;
        const yF =
            ix === 0
                ? `IF(Controls.Row_1.Y<-${stepMM}MM,-${stepMM}MM,Controls.Row_1.Y)`
                : `IF(Controls.Row_1.Y<-${(ix + 1) * stepMM}MM,-${(ix + 1) * stepMM}MM,Controls.Row_1.Y+MODULUS(ABS(Controls.Row_1.Y),${stepMM}))`;
        row.children.push(
            cellNodeF('X', kIn(xIn), 'IN', 'Controls.Row_1'),
            cellNodeF('Y', kIn(-ix * stepIn), 'IN', yF),
            cellNode('DirX', '0'),
            cellNode('DirY', '1'),
            cellNode('Type', '0'),
            cellNode('AutoGen', '0'),
            cellNode('Prompt', ''),
        );
        sec.children.push(row);
    }
    return sec;
}

/** 时间原点句柄（sequence 专篇 2.2：Controls.Row_1 = 时间原点）。 */
function timeOriginControl(xIn: number): XmlNode {
    const ctrl = makeElement('Section');
    setAttribute(ctrl, 'N', 'Control');
    const cRow = makeElement('Row');
    setAttribute(cRow, 'N', 'Row_1');
    cRow.children.push(
        cellNodeF('X', kIn(xIn), 'IN', 'Width*0.5'),
        cellNodeF('Y', kIn(0), 'IN', 'Height*1'),
        cellNodeF('XDyn', kIn(xIn), 'IN', 'Controls.Row_1'),
        cellNodeF('YDyn', kIn(0), 'IN', 'Controls.Row_1.Y'),
        cellNode('XCon', '0'),
        cellNode('YCon', '1'),
        cellNode('CanGlue', '0'),
        cellNode('Prompt', '时间原点'),
    );
    ctrl.children.push(cRow);
    return ctrl;
}

/** 五行连接点不再用于生命线（已由 timeConnectionSection 取代），保留定义以满足矩形语义的其它形状？未使用——移除。 */

function cellNode(name: string, value: string, unit?: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', name);
    setAttribute(el, 'V', value);
    if (unit) setAttribute(el, 'U', unit);
    return el;
}

function cellNodeF(name: string, value: string, unit: string, formula: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', name);
    setAttribute(el, 'V', value);
    setAttribute(el, 'U', unit);
    setAttribute(el, 'F', formula);
    return el;
}

/** 矩形几何（5.4.3.3 写法：V=英寸缓存 U=MM、F=Width/Height 公式、显式闭合）；参数为英寸。 */
function writeRectBody(el: XmlNode, wpx: number, hpx: number): void {
    const w = wpx;
    const h = hpx;
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    for (const [t, ix, xv, xf, yv, yf] of [
        ['MoveTo', 1, '0', 'Width*0', '0', 'Height*0'],
        ['LineTo', 2, String(w), 'Width*1', '0', 'Height*0'],
        ['LineTo', 3, String(w), 'Width*1', String(h), 'Height*1'],
        ['LineTo', 4, '0', 'Width*0', String(h), 'Height*1'],
        ['LineTo', 5, '0', 'Geometry1.X1', '0', 'Geometry1.Y1'],
    ] as Array<[string, number, string, string, string, string]>) {
        const r = makeElement('Row');
        setAttribute(r, 'T', t);
        setAttribute(r, 'IX', String(ix));
        r.children.push(cellNodeF('X', kIn(Number(xv)), 'MM', xf), cellNodeF('Y', kIn(Number(yv)), 'MM', yf));
        g.children.push(r);
    }
    el.children.push(g);
}

/** 直线几何（6.2.4：无 F 无 U，局部英寸字面量）。 */
function writeLineBody(el: XmlNode, dxpx: number, dypx: number): void {
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    for (const [t, ix, xo, yo] of [
        ['MoveTo', 1, -dxpx / 2, -dypx / 2],
        ['LineTo', 2, dxpx / 2, dypx / 2],
    ] as Array<[string, number, number, number]>) {
        const r = makeElement('Row');
        setAttribute(r, 'T', t);
        setAttribute(r, 'IX', String(ix));
        r.children.push(cellNode('X', kIn(xo)), cellNode('Y', kIn(yo)));
        g.children.push(r);
    }
    el.children.push(g);
}

function connectRec(id: number, fromCell: string, toSheet: number, toCell: string): XmlNode {
    const el = makeElement('Connect');
    setAttribute(el, 'FromSheet', String(id));
    setAttribute(el, 'FromCell', fromCell);
    setAttribute(el, 'FromPart', fromCell === 'BeginX' ? '9' : '12');
    setAttribute(el, 'ToSheet', String(toSheet));
    setAttribute(el, 'ToCell', toCell);
    // research 5.5.3.4：ToPart=100+连接点行号（X1=100、X2=101…）
    const m = /X(\d+)/.exec(toCell);
    setAttribute(el, 'ToPart', String(m ? 100 + (Number(m[1]) - 1) : 100));
    return el;
}

/** 直线几何（局部坐标）；1-D 端点供 Connects 引用（5.5.3.3）。 */
function writeLine(
    ctx: SeqCtx,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    opts: { pattern?: number; arrow?: number } = {},
): XmlNode {
    const el = newShape(ctx);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    c(el, 'PinX', mx / ctx.pxPerInch);
    c(el, 'PinY', (ctx.pageHpx - my) / ctx.pxPerInch);
    c(el, 'Width', Math.abs(x2 - x1) / ctx.pxPerInch);
    c(el, 'Height', Math.abs(y2 - y1) / ctx.pxPerInch);
    c(el, 'LocPinX', Math.abs(x2 - x1) / 2 / ctx.pxPerInch);
    c(el, 'LocPinY', Math.abs(y2 - y1) / 2 / ctx.pxPerInch);
    c(el, 'BeginX', x1 / ctx.pxPerInch);
    c(el, 'BeginY', (ctx.pageHpx - y1) / ctx.pxPerInch);
    c(el, 'EndX', x2 / ctx.pxPerInch);
    c(el, 'EndY', (ctx.pageHpx - y2) / ctx.pxPerInch);
    c(el, 'GlueType', 2);
    c(el, 'ObjType', 2);
    c(el, 'LineColor', '#000000');
    c(el, 'LinePattern', opts.pattern ?? 1);
    // 消息箭头（sequence 专篇 3.2：Message=4、Return=3、Self=4、Async=3）
    c(el, 'EndArrow', opts.arrow ?? 4);
    c(el, 'FillPattern', 0);
    writeLineBody(el, (x2 - x1) / ctx.pxPerInch, (y2 - y1) / ctx.pxPerInch);
    return el;
}

export class SeqRenderer {
    render(a: { sequence?: SequenceModel }, pageHpx: number, pxPerInch = 96): XmlPart {
        const seq = a.sequence ?? { actors: [], messages: [], activations: [], fragments: [] };
        const ctx: SeqCtx = { shapes: [], children: [], nextId: 1, pageHpx, pxPerInch };
        const connects: XmlNode[] = [];
        const groupIds = new Map<string, number>();

        // 参与者生命线组：头框（组带文本）+ 竖线子形状 + 五行连接点
        for (const act of seq.actors) {
            const headcy = kHeaderTop + kHeaderH / 2;
            const grp = newShape(ctx);
            setAttribute(grp, 'Type', 'Group');
            c(grp, 'PinX', act.x / pxPerInch);
            c(grp, 'PinY', (pageHpx - headcy) / pxPerInch);
            c(grp, 'Width', kXW / pxPerInch);
            c(grp, 'Height', kHeaderH / pxPerInch);
            c(grp, 'LocPinX', kXW / 2 / pxPerInch);
            c(grp, 'LocPinY', kHeaderH / 2 / pxPerInch);
            // 生命线时间点连接（sequence 专篇 2.2：100 时间格）+ 时间原点句柄
            grp.children.push(timeConnectionSection(act.x / pxPerInch));
            grp.children.push(timeOriginControl(act.x / pxPerInch));
            const child = makeElement('Shapes');
            // 头框
            const hb = makeElement('Shape');
            setAttribute(hb, 'ID', String(ctx.nextId++));
            hb.children.push(
                cellNode('PinX', kIn(act.x / pxPerInch), 'IN'),
                cellNode('PinY', kIn((pageHpx - headcy) / pxPerInch), 'IN'),
                cellNode('Width', kIn(kXW / pxPerInch), 'IN'),
                cellNode('Height', kIn(kHeaderH / pxPerInch), 'IN'),
                cellNode('LocPinX', kIn(kXW / 2 / pxPerInch), 'IN'),
                cellNode('LocPinY', kIn(kHeaderH / 2 / pxPerInch), 'IN'),
                cellNode('LineColor', '#000000'),
                cellNode('LinePattern', '1'),
                cellNode('FillForegnd', '#FFFFFF'),
                cellNode('FillPattern', '1'),
            );
            writeRectBody(hb, kXW / pxPerInch, kHeaderH / pxPerInch);
            child.children.push(hb);
            // 竖线
            const top = kHeaderTop + kHeaderH;
            const bottom = pageHpx - 40;
            const lf = makeElement('Shape');
            setAttribute(lf, 'ID', String(ctx.nextId++));
            lf.children.push(
                cellNode('PinX', kIn(act.x / pxPerInch), 'IN'),
                cellNode('PinY', kIn((pageHpx - (top + bottom) / 2) / pxPerInch), 'IN'),
                cellNode('Width', kIn(0), 'IN'),
                cellNode('Height', kIn((bottom - top) / pxPerInch), 'IN'),
                cellNode('LocPinX', kIn(0), 'IN'),
                cellNode('LocPinY', kIn((bottom - top) / 2 / pxPerInch), 'IN'),
                cellNode('LineColor', '#000000'),
                cellNode('LinePattern', '1'),
                cellNode('FillPattern', '0'),
            );
            writeLineBody(lf, 0, (bottom - top) / pxPerInch);
            child.children.push(lf);
            grp.children.push(child);
            textNode(grp, act.label);
            groupIds.set(act.id, Number(attr(grp, 'ID')));
        }

        // 消息（含标记行占位：仅绘制 sync/return/self/async/note）
        for (let i = 0; i < seq.messages.length; i++) {
            const m = seq.messages[i]!;
            if (m.kind !== 'sync' && m.kind !== 'return' && m.kind !== 'self' && m.kind !== 'async' && m.kind !== 'note') continue;
            const x1 = seq.actors.find((ac) => ac.id === m.from)?.x ?? 0;
            const x2 = seq.actors.find((ac) => ac.id === m.to)?.x ?? 0;
            const y = rowY(i);
            const el = writeLine(ctx, x1, y, x2, y, {
                pattern: m.kind === 'return' ? 2 : 1,
                arrow: m.kind === 'return' || m.kind === 'async' ? 3 : 4,
            });
            const gid = Number(attr(el, 'ID'));
            textNode(el, m.label);
            const s = groupIds.get(m.from);
            const t = groupIds.get(m.to);
            // 粘到生命线时间格（sequence 专篇 2.3：ToPart=100+行号，行号由布局层写入）
            const bRow = Math.min(20 + 2 * i, 99);
            const eRow = Math.min(21 + 2 * i, 99);
            if (s !== undefined) connects.push(connectRec(gid, 'BeginX', s, `Connections.X${bRow + 1}`));
            if (t !== undefined) connects.push(connectRec(gid, 'EndX', t, `Connections.X${eRow + 1}`));
        }

        // 激活竖条：两端粘附到所属生命线（与金标准一致：两端同组）
        for (const v of seq.activations) {
            const el = newShape(ctx);
            const h = v.yBottom - v.yTop;
            c(el, 'PinX', v.x / pxPerInch);
            c(el, 'PinY', (pageHpx - (v.yTop + v.yBottom) / 2) / pxPerInch);
            c(el, 'Width', v.width / pxPerInch);
            c(el, 'Height', h / pxPerInch);
            c(el, 'LocPinX', v.width / 2 / pxPerInch);
            c(el, 'LocPinY', h / 2 / pxPerInch);
            // 1-D 端点（sequence 专篇 s-4：激活条带 BeginX/EndX；Connects 引用有效 cell）
            c(el, 'BeginX', v.x / pxPerInch);
            c(el, 'BeginY', (pageHpx - v.yTop) / pxPerInch);
            c(el, 'EndX', v.x / pxPerInch);
            c(el, 'EndY', (pageHpx - v.yBottom) / pxPerInch);
            c(el, 'GlueType', 2);
            c(el, 'ObjType', 2);
            c(el, 'LockHeight', 1);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 0);
            c(el, 'FillForegnd', '#808080');
            c(el, 'FillPattern', 1);
            writeRectBody(el, v.width / pxPerInch, h / pxPerInch);
            textNode(el, '');
            const s = groupIds.get(v.actorId);
            if (s !== undefined) {
                connects.push(connectRec(Number(attr(el, 'ID')), 'BeginX', s, 'Connections.X2'));
                connects.push(connectRec(Number(attr(el, 'ID')), 'EndX', s, 'Connections.X2'));
            }
        }

        // 片段：框 + 标签（loop/alt/opt 等）
        for (const f of seq.fragments) {
            const box = newShape(ctx);
            c(box, 'PinX', f.x / pxPerInch);
            c(box, 'PinY', (pageHpx - (f.y + f.height / 2)) / pxPerInch);
            c(box, 'Width', f.width / pxPerInch);
            c(box, 'Height', f.height / pxPerInch);
            c(box, 'LocPinX', f.width / 2 / pxPerInch);
            c(box, 'LocPinY', f.height / 2 / pxPerInch);
            c(box, 'LineColor', '#000000');
            c(box, 'LinePattern', 1);
            c(box, 'FillPattern', 0);
            writeRectBody(box, f.width / pxPerInch, f.height / pxPerInch);
            textNode(box, '');
            const lbl = newShape(ctx);
            c(lbl, 'PinX', (f.x - f.width / 2 + 24) / pxPerInch);
            c(lbl, 'PinY', (pageHpx - (f.y + 10)) / pxPerInch);
            c(lbl, 'Width', 0.6);
            c(lbl, 'Height', 0.2);
            c(lbl, 'LocPinX', 0.3);
            c(lbl, 'LocPinY', 0.1);
            c(lbl, 'LinePattern', 0);
            c(lbl, 'FillPattern', 0);
            textNode(lbl, f.kind === 'alt' ? 'alt' : f.kind === 'opt' ? 'opt' : 'loop');
        }

        const root = makeElement('PageContents');
        const shapes = makeElement('Shapes');
        for (const s of ctx.shapes) shapes.children.push(s);
        const conns = makeElement('Connects');
        for (const cn of connects) conns.children.push(cn);
        root.children.push(shapes, conns);
        setAttribute(root, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
        const xml = serializeDocument(root, {
            declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            indent: 0,
        });
        return part(kPageUri, kPageContentType, xml);
    }
}
