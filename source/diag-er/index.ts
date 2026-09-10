// diag-er（＝ er 包）：契约 A(erModel) → 契约 B 页面部件
// 结构与金标准同构（扁平）：每实体 1 组（文本=名称）+ 每属性 1 行（键样式同普通行）
// + 属性行之间分隔线；每关系 1 组（文本=角色名，菱形位姿），2 条 Connects 粘附实体。
// 布局为确定性网格，坐标像素→英寸。

import { isNoUnitCell } from '../common/units.js';
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../xml/index.js';
import { kPageContentType, kPageUri } from '../xml/constants.js';
import { part, type XmlPart, type ErModel } from '../contracts/index.js';

const kIn = (v: number) => String(Math.round(v * 1e6) / 1e6);

interface Ctx {
    shapes: XmlNode[];
    nextId: number;
    pageHpx: number;
    pxPerInch: number;
}

interface Pos {
    x: number;
    y: number;
    w: number;
    h: number;
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

function cellP(name: string, value: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', name);
    setAttribute(el, 'V', value);
    return el;
}

function textNode(el: XmlNode, text: string): void {
    const t = makeElement('Text');
    if (text) t.children.push(text);
    el.children.push(t);
}

/** 连接行（5.4.3.3/C4 骨架：V=英寸缓存 U=IN、F=Width/Height 公式、方向列）。 */
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
        const xCell = makeElement('Cell');
        setAttribute(xCell, 'N', 'X');
        setAttribute(xCell, 'V', kIn(wpx * xRatios[ix]!));
        setAttribute(xCell, 'U', 'IN');
        setAttribute(xCell, 'F', xF[ix]!);
        const yCell = makeElement('Cell');
        setAttribute(yCell, 'N', 'Y');
        setAttribute(yCell, 'V', kIn(hpx * yRatios[ix]!));
        setAttribute(yCell, 'U', 'IN');
        setAttribute(yCell, 'F', yF[ix]!);
        row.children.push(
            xCell,
            yCell,
            cellP('DirX', String(dx[ix]!)),
            cellP('DirY', String(dy[ix]!)),
            cellP('Type', '0'),
            cellP('AutoGen', '0'),
            cellP('Prompt', ''),
        );
        sec.children.push(row);
    }
    return sec;
}

/** 矩形几何（5.4.3.3 写法：V=英寸缓存、U=MM 显示、F=Width/Height 公式、显式闭合）。 */
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
        const rw = makeElement('Row');
        setAttribute(rw, 'T', t);
        setAttribute(rw, 'IX', String(ix));
        const xCell = makeElement('Cell');
        setAttribute(xCell, 'N', 'X');
        setAttribute(xCell, 'V', kIn(Number(xv)));
        setAttribute(xCell, 'U', 'MM');
        setAttribute(xCell, 'F', xf);
        const yCell = makeElement('Cell');
        setAttribute(yCell, 'N', 'Y');
        setAttribute(yCell, 'V', kIn(Number(yv)));
        setAttribute(yCell, 'U', 'MM');
        setAttribute(yCell, 'F', yf);
        rw.children.push(xCell, yCell);
        g.children.push(rw);
    }
    el.children.push(g);
}

function writeLineBody(el: XmlNode, dxpx: number, dypx: number): void {
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    for (const [t, ix, xo, yo] of [
        ['MoveTo', 1, -dxpx / 2, -dypx / 2],
        ['LineTo', 2, dxpx / 2, dypx / 2],
    ] as Array<[string, number, number, number]>) {
        const rw = makeElement('Row');
        setAttribute(rw, 'T', t);
        setAttribute(rw, 'IX', String(ix));
        rw.children.push(cellP('X', kIn(xo)), cellP('Y', kIn(yo)));
        g.children.push(rw);
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
    const m = /X(\d+)/.exec(toCell);
    setAttribute(el, 'ToPart', String(m ? 100 + (Number(m[1]) - 1) : 100));
    return el;
}

/** User 段写手（ER 专篇 2.2/3.2：分类/注册/业务标记）。 */
function addUser(el: XmlNode, rows: Array<[string, string, string?]>): void {
    const us = makeElement('Section');
    setAttribute(us, 'N', 'User');
    for (const [n, v, f] of rows) {
        const row = makeElement('Row');
        setAttribute(row, 'N', n);
        const cv = makeElement('Cell');
        setAttribute(cv, 'N', 'Value');
        setAttribute(cv, 'V', v);
        setAttribute(cv, 'U', 'STR');
        if (f) setAttribute(cv, 'F', f);
        row.children.push(cv);
        us.children.push(row);
    }
    el.children.push(us);
}

export class ErRenderer {
    render(a: { erModel?: ErModel }, pageHpx: number, pxPerInch = 96): XmlPart {
        const m = a.erModel ?? { entities: [], relations: [] };
        const ctx: Ctx = { shapes: [], nextId: 1, pageHpx, pxPerInch };
        const connects: XmlNode[] = [];
        const ids = new Map<string, number>();
        const boxes = new Map<string, Pos>();

        const cols = 2;
        const cw = 180;
        const chGap = 60;
        const cellH = 110;
        const rowH = 16;
        const headerH = 24;
        const x0 = 120;
        const y0 = 120;

        m.entities.forEach((ent, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const nRows = ent.attributes.length;
            const h = headerH + nRows * rowH + (nRows > 1 ? rowH : 0);
            const p: Pos = {
                x: x0 + col * (cw + 120),
                y: y0 + row * (cellH + chGap) + h / 2,
                w: cw,
                h,
            };
            boxes.set(ent.id, p);
            const grp = newShape(ctx);
            setAttribute(grp, 'Type', 'Group');
            c(grp, 'PinX', p.x / pxPerInch);
            c(grp, 'PinY', (pageHpx - p.y) / pxPerInch);
            c(grp, 'Width', p.w / pxPerInch);
            c(grp, 'Height', p.h / pxPerInch);
            c(grp, 'LocPinX', p.w / 2 / pxPerInch);
            c(grp, 'LocPinY', p.h / 2 / pxPerInch);
            grp.children.push(connectionSection(p.w / pxPerInch, p.h / pxPerInch));
            writeRectBody(grp, p.w / pxPerInch, p.h / pxPerInch);
            // 实体容器注册（ER 专篇 2.2：分类与列表项母版声明）
            addUser(grp, [
                ['msvStructureType', 'List'],
                ['msvShapeCategories', 'Database;DbEntity'],
                ['msvSDContainerResize', '2'],
                ['msvSDListAlignment', '0'],
                ['msvSDListDirection', '2'],
                ['msvSDListItemMaster1', '254', 'USE("Primary Key Attribute")'],
                ['msvSDListItemMaster2', '254', 'USE("Primary Key Separator")'],
                ['msvSDListItemMaster3', '254', 'USE("Attribute")'],
                ['msvSDListItemMaster4', '254', 'USE("Attribute")'],
                ['msvSDListRequiredCategories', 'DbListItem'],
            ]);
            textNode(grp, ent.name);
            ids.set(ent.id, Number((grp.attrs.find((x) => x.name === 'ID') as { value: string }).value));

            const top = p.y - p.h / 2 + headerH + rowH / 2;
            let yy = top;
            ent.attributes.forEach((at, ai) => {
                if (ai > 0) {
                    const sep = newShape(ctx);
                    c(sep, 'PinX', p.x / pxPerInch);
                    c(sep, 'PinY', (pageHpx - (yy - rowH / 2)) / pxPerInch);
                    c(sep, 'Width', p.w / pxPerInch);
                    c(sep, 'Height', 1 / pxPerInch);
                    c(sep, 'LocPinX', p.w / 2 / pxPerInch);
                    c(sep, 'LocPinY', 0);
                    c(sep, 'LineColor', '#000000');
                    c(sep, 'LinePattern', 1);
                    c(sep, 'FillPattern', 0);
                    writeLineBody(sep, p.w / pxPerInch, 0);
                    textNode(sep, '');
                }
                const rw = newShape(ctx);
                c(rw, 'PinX', p.x / pxPerInch);
                c(rw, 'PinY', (pageHpx - yy) / pxPerInch);
                c(rw, 'Width', p.w / pxPerInch);
                c(rw, 'Height', rowH / pxPerInch);
                c(rw, 'LocPinX', p.w / 2 / pxPerInch);
                c(rw, 'LocPinY', rowH / 2 / pxPerInch);
                c(rw, 'LineColor', '#000000');
                c(rw, 'LinePattern', 1);
                c(rw, 'FillForegnd', '#FFFFFF');
                c(rw, 'FillPattern', 1);
                writeRectBody(rw, p.w / pxPerInch, rowH / pxPerInch);
                // 属性行业务标记（ER 专篇 3.2：AttributeName=SHAPETEXT、PrimaryKey/FK/Required）
                addUser(rw, [
                    ['msvShapeCategories', 'Database;DbAttribute;DbListItem'],
                    ['AttributeName', `${at.type} ${at.name}`.trim(), 'SHAPETEXT(TheText)'],
                    ['PrimaryKey', at.primaryKey ? '1' : '0', undefined],
                    ['ForeignKey', '0', undefined],
                    ['Required', '0', undefined],
                ]);
                textNode(rw, `${at.type} ${at.name}`.trim());
                yy += rowH;
            });
        });

        // 关系：1-D 线形状（BeginX/EndX 端点 cell；Connects 引用有效 cell，ER 专篇 4.2）
        for (const r of m.relations) {
            const a = boxes.get(r.from);
            const b = boxes.get(r.to);
            if (!a || !b) continue;
            const bx = a.x;
            const by = a.y;
            const ex = b.x;
            const ey = b.y;
            const mx = (bx + ex) / 2;
            const my = (by + ey) / 2;
            const el = newShape(ctx);
            c(el, 'PinX', mx / pxPerInch);
            c(el, 'PinY', (pageHpx - my) / pxPerInch);
            c(el, 'Width', Math.abs(ex - bx) / pxPerInch);
            c(el, 'Height', Math.abs(ey - by) / pxPerInch);
            c(el, 'LocPinX', Math.abs(ex - bx) / 2 / pxPerInch);
            c(el, 'LocPinY', Math.abs(ey - by) / 2 / pxPerInch);
            c(el, 'BeginX', bx / pxPerInch);
            c(el, 'BeginY', (pageHpx - by) / pxPerInch);
            c(el, 'EndX', ex / pxPerInch);
            c(el, 'EndY', (pageHpx - ey) / pxPerInch);
            c(el, 'GlueType', 2);
            c(el, 'ObjType', 2);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillPattern', 0);
            writeLineBody(el, (ex - bx) / pxPerInch, (ey - by) / pxPerInch);
            // User 段（ER 专篇 4.2：RelationshipName/Identifying/ShowMulti）
            addUser(el, [
                ['msvShapeCategories', 'Database;DbRelationship'],
                ['RelationshipName', r.label, 'SHAPETEXT(TheText)'],
                ['Identifying', r.identifying ? '1' : '0'],
                ['ShowMulti', '0'],
            ]);
            textNode(el, r.label);
            const gid = Number((el.attrs.find((x) => x.name === 'ID') as { value: string }).value);
            if (a && ids.get(r.from) !== undefined) connects.push(connectRec(gid, 'BeginX', ids.get(r.from)!, 'Connections.X2'));
            if (b && ids.get(r.to) !== undefined) connects.push(connectRec(gid, 'EndX', ids.get(r.to)!, 'Connections.X4'));
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
