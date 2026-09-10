// diag-mindmap（⬛ mindmap 包）：契约 A(mindmap) → 契约 B 页面部件
// 结构与金标准同构：每节点 1 形状（根=圆、一层=圆角、深层=矩形，带文本），
// 每父子关系 1 连接线（2 条 Connects）。

import { isNoUnitCell } from '../common/units.js';
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../xml/index.js';
import { kPageContentType, kPageUri } from '../xml/constants.js';
import { part, type XmlPart, type MindmapModel } from '../contracts/index.js';

const kIn = (v: number) => String(Math.round(v * 1e6) / 1e6);

interface Ctx {
    shapes: XmlNode[];
    nextId: number;
    pageHpx: number;
    pxPerInch: number;
}

function newShape(ctx: Ctx): XmlNode {
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

function cellUF(name: string, value: string, unit: string, formula: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', name);
    setAttribute(el, 'V', value);
    setAttribute(el, 'U', unit);
    setAttribute(el, 'F', formula);
    return el;
}

/** 连接行（5.4.3.3/C4 骨架：V=英寸缓存 U=IN、F、方向列）；参数为英寸。 */
function connectionSection(wpx: number, hpx: number): XmlNode {
    const sec = makeElement('Section');
    setAttribute(sec, 'N', 'Connection');
    const xRatios = [0.5, 1, 0.5, 0, 0.5];
    const yRatios = [0, 0.5, 1, 0.5, 0.5];
    const xF = ['Width*0.5', 'Width*1', 'Width*0.5', 'Width*0', 'Width*0.5'];
    const yF = ['Height*0', 'Height*0.5', 'Height*1', 'Height*0.5', 'Height*0.5'];
    const dx = [0, -1, 0, 1, 0];
    const dy = [1, 0, -1, 0, 1];
    for (let ix = 0; ix <= 4; ix++) {
        const row = makeElement('Row');
        setAttribute(row, 'T', 'Connection');
        setAttribute(row, 'IX', String(ix));
        row.children.push(
            cellUF('X', kIn(wpx * xRatios[ix]!), 'IN', xF[ix]!),
            cellUF('Y', kIn(hpx * yRatios[ix]!), 'IN', yF[ix]!),
            cell('DirX', String(dx[ix]!)),
            cell('DirY', String(dy[ix]!)),
            cell('Type', '0'),
            cell('AutoGen', '0'),
            cell('Prompt', ''),
        );
        sec.children.push(row);
    }
    return sec;
}

/** 圆角/直角矩形几何（5.4.3.3 写法：V=英寸缓存 U=MM、F=Width/Height 公式、显式闭合）。
 *  参数为英寸；simplified=true 时圆角以直角表达（保持 F 式）。 */
function writeRectBody(el: XmlNode, wpx: number, hpx: number, round: boolean): void {
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    const rows = round
        ? ([
              ['MoveTo', 1, '0', 'Width*0', String(hpx), 'Height*1'],
              ['LineTo', 2, String(wpx), 'Width*1', String(hpx), 'Height*1'],
              ['LineTo', 3, String(wpx), 'Width*1', '0', 'Height*0'],
              ['LineTo', 4, '0', 'Width*0', '0', 'Height*0'],
              ['LineTo', 5, '0', 'Geometry1.X1', '0', 'Geometry1.Y1'],
          ] as Array<[string, number, string, string, string, string]>)
        : ([
              ['MoveTo', 1, '0', 'Width*0', '0', 'Height*0'],
              ['LineTo', 2, String(wpx), 'Width*1', '0', 'Height*0'],
              ['LineTo', 3, String(wpx), 'Width*1', String(hpx), 'Height*1'],
              ['LineTo', 4, '0', 'Width*0', String(hpx), 'Height*1'],
              ['LineTo', 5, '0', 'Geometry1.X1', '0', 'Geometry1.Y1'],
          ] as Array<[string, number, string, string, string, string]>);
    for (const [t, ix, xv, xf, yv, yf] of rows) {
        const rw = makeElement('Row');
        setAttribute(rw, 'T', t);
        setAttribute(rw, 'IX', String(ix));
        rw.children.push(cellUF('X', kIn(Number(xv)), 'MM', xf), cellUF('Y', kIn(Number(yv)), 'MM', yf));
        g.children.push(rw);
    }
    el.children.push(g);
}

function cell(name: string, value: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', name);
    setAttribute(el, 'V', value);
    return el;
}

/** 连接线（1-D：BeginX/EndX 端点为 Connects 引用源——5.5.3.3）。 */
function writeLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): XmlNode {
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
    c(el, 'LinePattern', 1);
    c(el, 'FillPattern', 0);
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    for (const [t, ix, xo, yo] of [
        ['MoveTo', 1, -(x2 - x1) / 2, -(y2 - y1) / 2],
        ['LineTo', 2, (x2 - x1) / 2, (y2 - y1) / 2],
    ] as Array<[string, number, number, number]>) {
        const rw = makeElement('Row');
        setAttribute(rw, 'T', t);
        setAttribute(rw, 'IX', String(ix));
        rw.children.push(cell('X', kIn(xo / ctx.pxPerInch)), cell('Y', kIn(yo / ctx.pxPerInch)));
        g.children.push(rw);
    }
    el.children.push(g);
    textNode(el, '');
    return el;
}

export class MindmapRenderer {
    render(a: { mindmap?: MindmapModel }, pageHpx: number, pxPerInch = 96): XmlPart {
        const m = a.mindmap ?? { rootId: '', nodes: [] };
        const ctx: Ctx = { shapes: [], nextId: 1, pageHpx, pxPerInch };
        const connects: XmlNode[] = [];
        const ids = new Map<string, number>();

        for (const n of m.nodes) {
            const el = newShape(ctx);
            const w = Math.max(n.width, 40);
            const h = Math.max(n.height, 24);
            c(el, 'PinX', n.x / pxPerInch);
            c(el, 'PinY', (pageHpx - n.y) / pxPerInch);
            c(el, 'Width', w / pxPerInch);
            c(el, 'Height', h / pxPerInch);
            c(el, 'LocPinX', w / 2 / pxPerInch);
            c(el, 'LocPinY', h / 2 / pxPerInch);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillForegnd', '#FFFFFF');
            c(el, 'FillPattern', 1);
            if (n.depth === 0) {
                // 根：圆形（局部英寸制，起点 -w/2 的椭圆——EllipticalArcTo 无公式，值为英寸）
                const g = makeElement('Section');
                setAttribute(g, 'N', 'Geometry');
                setAttribute(g, 'IX', '0');
                const wIn = w / pxPerInch;
                const rr = makeElement('Row');
                setAttribute(rr, 'T', 'MoveTo');
                setAttribute(rr, 'IX', '1');
                rr.children.push(cell('X', kIn(-wIn / 2)), cell('Y', kIn(0)));
                g.children.push(rr);
                for (const [t, ix] of [
                    ['EllipticalArcTo', 2],
                    ['EllipticalArcTo', 3],
                ] as Array<[string, number]>) {
                    const rw = makeElement('Row');
                    setAttribute(rw, 'T', t);
                    setAttribute(rw, 'IX', String(ix));
                    rw.children.push(cell('X', kIn(ix === 2 ? wIn / 2 : -wIn / 2)), cell('Y', kIn(0)), cell('A', kIn(wIn / 2)));
                    g.children.push(rw);
                }
                el.children.push(g);
            } else {
                writeRectBody(el, w / pxPerInch, h / pxPerInch, n.depth === 1);
            }
            el.children.push(connectionSection(w / pxPerInch, h / pxPerInch));
            textNode(el, n.label);
            ids.set(n.id, Number((el.attrs.find((a) => a.name === 'ID') as { value: string }).value));
        }

        for (const n of m.nodes) {
            if (!n.parentId) continue;
            const p = m.nodes.find((x) => x.id === n.parentId);
            if (!p) continue;
            const el = writeLine(ctx, p.x, p.y, n.x, n.y);
            const gid = Number((el.attrs.find((a) => a.name === 'ID') as { value: string }).value);
            connects.push(connectRec(gid, 'BeginX', ids.get(p.id)!, 'Connections.X2'));
            connects.push(connectRec(gid, 'EndX', ids.get(n.id)!, 'Connections.X4'));
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

function connectRec(id: number, fromCell: string, toSheet: number, toCell: string): XmlNode {
    const el = makeElement('Connect');
    setAttribute(el, 'FromSheet', String(id));
    setAttribute(el, 'FromCell', fromCell);
    setAttribute(el, 'FromPart', fromCell === 'BeginX' ? '9' : '12');
    setAttribute(el, 'ToSheet', String(toSheet));
    setAttribute(el, 'ToCell', toCell);
    const m = /X(\d+)/.exec(toCell);
    setAttribute(el, 'ToPart', String(m ? 100 + (Number(m[1]) - 1) : 100));
    return el;
}
