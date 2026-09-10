// diag-class（＝ class 包）：契约 A(classModel) → 契约 B 页面部件
// 结构与金标准同构（扁平）：每类 1 组（文本=标记\n类名）+ 每属性 1 行 + 1 分隔线
// + 每方法 1 行；每条关系 1 连接线（2 条 Connects）。
// 布局为确定性网格（列数固定 2，容器尺寸按类数计算），坐标像素→英寸。

import { isNoUnitCell } from '../common/units.js';
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../xml/index.js';
import { kPageContentType, kPageUri } from '../xml/constants.js';
import { part, type XmlPart, type ClassModel } from '../contracts/index.js';

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

function c(el: XmlNode, name: string, value: number | string, formula?: string): void {
    const cell = makeElement('Cell');
    setAttribute(cell, 'N', name);
    if (typeof value === 'number' && !isNoUnitCell(name)) {
        setAttribute(cell, 'V', kIn(value));
        setAttribute(cell, 'U', 'IN');
    } else {
        setAttribute(cell, 'V', String(value));
    }
    if (formula) setAttribute(cell, 'F', formula);
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

/** 成员行 User 段（class 专篇 3.2：成员名/ContainerMargin/WidthMin/背景两件）。 */
function addMemberUser(el: XmlNode, member: string, hostId: number): void {
    const us = makeElement('Section');
    setAttribute(us, 'N', 'User');
    for (const [n, v, f] of [
        [`${member}`, member, 'Inh'],
        ['ContainerMargin', '0.03937007874015748', `IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)`],
        ['WidthMin', '0', `IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN<TEXTWIDTH(TheText),TEXTWIDTH(TheText),LISTSHEETREF()!User.WIDTHMIN),0)`],
        ['BACKGRND', '#f2f2f2', 'IFERROR(LISTSHEETREF()!User.BACKGRND,FillForegnd)'],
        ['BACKGRNDLINE', '0', 'IFERROR(LISTSHEETREF()!User.BACKGRNDLINE,LineColor)'],
    ] as Array<[string, string, string]>) {
        const row = makeElement('Row');
        setAttribute(row, 'N', n);
        const cv = makeElement('Cell');
        setAttribute(cv, 'N', 'Value');
        setAttribute(cv, 'V', v);
        setAttribute(cv, 'F', f);
        row.children.push(cv);
        us.children.push(row);
    }
    void hostId;
    el.children.push(us);
}

/** 类系列四行连接点（class 专篇 2.4：IX0 左、IX1 右、IX2 下、IX3 上中点；W-11）。 */
function classConnectionSection(wpx: number, hpx: number): XmlNode {
    const sec = makeElement('Section');
    setAttribute(sec, 'N', 'Connection');
    const xs = [0, 1, 0.5, 0.5];
    const ys = [0.5, 0.5, 0, 1];
    const xF = ['Width*0', 'Width*1', 'Width*0.5', 'Width*0.5'];
    const yF = ['Height*0.5', 'Height*0.5', 'Height*0', 'Height*1'];
    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];
    for (let ix = 0; ix <= 3; ix++) {
        const row = makeElement('Row');
        setAttribute(row, 'T', 'Connection');
        setAttribute(row, 'IX', String(ix));
        row.children.push(
            cellUF('X', kIn(wpx * xs[ix]!), 'IN', xF[ix]!),
            cellUF('Y', kIn(hpx * ys[ix]!), 'IN', yF[ix]!),
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

function cellUF(name: string, value: string, unit: string, formula: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', name);
    setAttribute(el, 'V', value);
    setAttribute(el, 'U', unit);
    setAttribute(el, 'F', formula);
    return el;
}

/** 行宽控制点（class 专篇 2.2：Control Row_1，Prompt=调整列表大小）。 */
function classRowOneControl(wIn: number): XmlNode {
    const ctrl = makeElement('Section');
    setAttribute(ctrl, 'N', 'Control');
    const cRow = makeElement('Row');
    setAttribute(cRow, 'N', 'Row_1');
    cRow.children.push(
        cellUF('X', kIn(wIn), 'IN', 'Width*1'),
        cellUF('Y', kIn(0), 'IN', 'Height*0.5'),
        cellUF('XDyn', kIn(wIn), 'IN', 'Controls.Row_1'),
        cellUF('YDyn', kIn(0), 'IN', 'Controls.Row_1.Y'),
        cellP('XCon', '2'),
        cellP('YCon', '1'),
        cellP('CanGlue', '0'),
        cellP('Prompt', '调整列表大小'),
    );
    ctrl.children.push(cRow);
    return ctrl;
}

/** User 段写手。 */
function addUserSec(el: XmlNode, rows: Array<[string, string, string?]>, _u?: string): void {
    const us = makeElement('Section');
    setAttribute(us, 'N', 'User');
    for (const [n, v, unit] of rows) {
        const row = makeElement('Row');
        setAttribute(row, 'N', n);
        row.children.push(cellP('Value', v) );
        void unit;
        us.children.push(row);
    }
    el.children.push(us);
}

/** 圆角矩形几何（5.4.3.3 F 式 + EllipticalArcTo 弧行，class 专篇 2.2）。 */
function writeRoundBody(el: XmlNode, wpx: number, hpx: number, rpx: number): void {
    const w = wpx;
    const h = hpx;
    const r = Math.min(rpx, w / 4, h / 4);
    const g = makeElement('Section');
    setAttribute(g, 'N', 'Geometry');
    setAttribute(g, 'IX', '0');
    // 从底左起绘制：M(r,0) → L(w-r,0) → A w,r → L(w,h-r) → A → L(r,h) → A → L(0,r) → A 闭合
    const seq: Array<[string, number, string, string, string, string, string?]> = [
        ['MoveTo', 1, String(r), 'Width*0', '0', 'Height*0'],
        ['LineTo', 2, String(w - r), 'Width*1', '0', 'Height*0'],
        ['EllipticalArcTo', 3, String(w - r), 'Width*1', String(r), 'Height*0'],
        ['LineTo', 4, String(w), 'Width*1', String(h - r), 'Height*1'],
        ['EllipticalArcTo', 5, String(w - r), 'Width*1', String(h - r), 'Height*1'],
        ['LineTo', 6, String(r), 'Width*0', String(h), 'Height*1'],
        ['EllipticalArcTo', 7, String(r), 'Width*0', String(h - r), 'Height*1'],
        ['LineTo', 8, '0', 'Width*0', String(r), 'Height*0'],
        ['EllipticalArcTo', 9, String(r), 'Width*0', '0', 'Height*0'],
    ];
    for (const [t, ix, xv, xf, yv, yf, arc] of seq) {
        const rw = makeElement('Row');
        setAttribute(rw, 'T', t);
        setAttribute(rw, 'IX', String(ix));
        rw.children.push(cellUF('X', kIn(Number(xv)), 'MM', xf), cellUF('Y', kIn(Number(yv)), 'MM', yf));
        if (t === 'EllipticalArcTo' && arc) {
            rw.children.push(cellP('B', kIn(Number(arc))));
        }
        g.children.push(rw);
    }
    el.children.push(g);
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

/** 线段几何（6.2.4：无 F 无 U，局部英寸字面量；V 应为英寸值）。 */
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

class LayoutEngine {
    private n: number;
    private cols = 2;
    private cw = 200;
    private ch = 130;
    private gap = 80;

    constructor(n: number) {
        this.n = n;
    }

    pos(i: number): Pos {
        const row = Math.floor(i / this.cols);
        const col = i % this.cols;
        return {
            x: 150 + col * (this.cw + this.gap),
            y: 120 + row * (this.ch + this.gap),
            w: this.cw,
            h: this.ch,
        };
    }

    totalW(): number {
        const w = 2 * 150 + (this.cols - 1) * (this.cw + this.gap);
        return w;
    }

    totalH(): number {
        const rows = Math.ceil(this.n / this.cols);
        return 120 + rows * (this.ch + this.gap);
    }
}

export class ClassRenderer {
    render(a: { classModel?: ClassModel }, pageHpx: number, pxPerInch = 96): XmlPart {
        const m = a.classModel ?? { classes: [], relations: [] };
        const ctx: Ctx = { shapes: [], nextId: 1, pageHpx, pxPerInch };
        const connects: XmlNode[] = [];
        const lay = new LayoutEngine(m.classes.length);
        const ids = new Map<string, number>();
        const boxes = new Map<string, Pos>();

        const rowH = 16;
        const headerH = 24;

        m.classes.forEach((cls, i) => {
            const p = lay.pos(i);
            boxes.set(cls.id, p);
            // 类组：文本 = «标记»\n类名（无标记仅类名）；组带外框几何（可见性）
            const grp = newShape(ctx);
            setAttribute(grp, 'Type', 'Group');
            c(grp, 'PinX', p.x / pxPerInch);
            c(grp, 'PinY', (pageHpx - p.y) / pxPerInch);
            c(grp, 'Width', p.w / pxPerInch);
            c(grp, 'Height', p.h / pxPerInch);
            c(grp, 'LocPinX', p.w / 2 / pxPerInch);
            c(grp, 'LocPinY', p.h / 2 / pxPerInch);
            // 类盒组字段面（class 专篇 2.2：容器锁定/放置样式/隐藏句柄）
            c(grp, 'ObjType', 1);
            c(grp, 'ShapePlaceStyle', 15);
            c(grp, 'NoObjHandles', 1);
            c(grp, 'LockWidth', 1);
            c(grp, 'LockHeight', 1);
            c(grp, 'LockRotate', 1);
            grp.children.push(classConnectionSection(p.w / pxPerInch, p.h / pxPerInch));
            writeRoundBody(grp, p.w / pxPerInch, p.h / pxPerInch, 6 / pxPerInch);
            // User 段（2.2：EntityName/容器边距/最小宽度）
            addUserSec(grp, [
                ['WidthMin', '0.882', 'DL'],
                ['EntityName', cls.name, 'STR'],
                ['msvSDContainerMargin', '0.03937007874015748'],
            ], undefined);
            // Control Row_1（2.2：行宽控制点）
            grp.children.push(classRowOneControl(p.w / pxPerInch));
            // 嵌套子形状（2.2 最小实例：标题条，页级坐标）
            {
                const kids = makeElement('Shapes');
                const k = makeElement('Shape');
                setAttribute(k, 'ID', String(ctx.nextId++));
                k.children.push(
                    cellP('PinX', kIn(p.x / pxPerInch)),
                    cellP('PinY', kIn((pageHpx - (p.y - p.h / 2 + headerH / 2)) / pxPerInch)),
                    cellP('Width', kIn(p.w / pxPerInch)),
                    cellP('Height', kIn(headerH / pxPerInch)),
                    cellP('LocPinX', kIn(p.w / 2 / pxPerInch)),
                    cellP('LocPinY', kIn(headerH / 2 / pxPerInch)),
                    cellP('LineColor', '#000000'),
                    cellP('LinePattern', '1'),
                    cellP('FillForegnd', '#FFFFFF'),
                    cellP('FillPattern', '1'),
                );
                writeRectBody(k, p.w / pxPerInch, headerH / pxPerInch);
                kids.children.push(k);
                grp.children.push(kids);
            }
            const st = cls.stereotypes.map((s) => `«${s}»`).join(' ');
            textNode(grp, st ? `${st}\n${cls.name}` : cls.name);
            ids.set(cls.id, Number((grp.attrs.find((x) => x.name === 'ID') as { value: string }).value));

            // 行：属性行、分隔线、方法行（均扁平，位于类框内往下排）
            const top = p.y - p.h / 2 + headerH + rowH / 2;
            const cx = p.x;
            const rowW = p.w;
            let yy = top;
            for (const at of cls.attributes) {
                const row = newShape(ctx);
                c(row, 'PinX', cx / pxPerInch);
                c(row, 'PinY', (pageHpx - yy) / pxPerInch);
                c(row, 'Width', rowW / pxPerInch);
                c(row, 'Height', rowH / pxPerInch);
                c(row, 'LocPinX', rowW / 2 / pxPerInch);
                c(row, 'LocPinY', rowH / 2 / pxPerInch);
                c(row, 'LineColor', '#000000');
                c(row, 'LinePattern', 1);
                c(row, 'FillForegnd', '#FFFFFF');
                c(row, 'FillPattern', 1);
                const hostId = ids.get(cls.id) ?? 0;
                // 成员行容器公式（class 专篇 3.2/3.3：ShapeFixedCode/GlueType/Relationships 回指）
                c(row, 'ShapeFixedCode', 1);
                c(row, 'GlueType', 8);
                c(row, 'Relationships', 0, `SUM(DEPENDSON(${hostId},Sheet.${hostId}!SheetRef()))`);
                addMemberUser(row, at.name, hostId);
                writeRectBody(row, rowW / pxPerInch, rowH / pxPerInch);
                textNode(row, `${at.visibility}${at.name}`);
                yy += rowH;
            }
            if (cls.attributes.length > 0 && cls.operations.length > 0) {
                const sep = newShape(ctx);
                c(sep, 'PinX', cx / pxPerInch);
                c(sep, 'PinY', (pageHpx - yy) / pxPerInch);
                c(sep, 'Width', rowW / pxPerInch);
                c(sep, 'Height', 1 / pxPerInch);
                c(sep, 'LocPinX', rowW / 2 / pxPerInch);
                c(sep, 'LocPinY', 0);
                c(sep, 'LineColor', '#000000');
                c(sep, 'LinePattern', 1);
                c(sep, 'FillPattern', 0);
                writeLineBody(sep, rowW / pxPerInch, 0);
                textNode(sep, '');
                yy += rowH;
            }
            for (const op of cls.operations) {
                const row = newShape(ctx);
                c(row, 'PinX', cx / pxPerInch);
                c(row, 'PinY', (pageHpx - yy) / pxPerInch);
                c(row, 'Width', rowW / pxPerInch);
                c(row, 'Height', rowH / pxPerInch);
                c(row, 'LocPinX', rowW / 2 / pxPerInch);
                c(row, 'LocPinY', rowH / 2 / pxPerInch);
                c(row, 'LineColor', '#000000');
                c(row, 'LinePattern', 1);
                c(row, 'FillForegnd', '#FFFFFF');
                c(row, 'FillPattern', 1);
                // 方法行同为成员（class 专篇 3.2：容器公式）
                const hostId2 = ids.get(cls.id) ?? 0;
                c(row, 'ShapeFixedCode', 1);
                c(row, 'GlueType', 8);
                c(row, 'Relationships', 0, `SUM(DEPENDSON(${hostId2},Sheet.${hostId2}!SheetRef()))`);
                addMemberUser(row, op.name, hostId2);
                writeRectBody(row, rowW / pxPerInch, rowH / pxPerInch);
                textNode(row, `${op.visibility}${op.name}`);
                yy += rowH;
            }
        });

        // 关系：连接线
        for (const r of m.relations) {
            const a = boxes.get(r.from);
            const b = boxes.get(r.to);
            if (!a || !b) continue;
            const sx = a.x + a.w / 2;
            const sy = a.y;
            const tx = b.x - b.w / 2;
            const ty = b.y;
            const el2 = newShape(ctx);
            c(el2, 'PinX', (sx + tx) / 2 / pxPerInch);
            c(el2, 'PinY', (pageHpx - (sy + ty) / 2) / pxPerInch);
            c(el2, 'Width', Math.abs(tx - sx) / pxPerInch);
            c(el2, 'Height', Math.abs(ty - sy) / pxPerInch);
            c(el2, 'LocPinX', Math.abs(tx - sx) / 2 / pxPerInch);
            c(el2, 'LocPinY', Math.abs(ty - sy) / 2 / pxPerInch);
            // 1-D 端点（Connects 引用 BeginX/EndX，须有对应 cell——5.5.3.3）
            c(el2, 'BeginX', sx / pxPerInch);
            c(el2, 'BeginY', (pageHpx - sy) / pxPerInch);
            c(el2, 'EndX', tx / pxPerInch);
            c(el2, 'EndY', (pageHpx - ty) / pxPerInch);
            c(el2, 'GlueType', 2);
            c(el2, 'ObjType', 2);
            c(el2, 'LineColor', '#000000');
            c(el2, 'LinePattern', r.kind === 'realization' ? 2 : 1);
            // UML 语义（class 专篇 4.3：依赖/实现 EndArrow=12、继承=14；触发器=1）
            c(el2, 'EndArrow', r.kind === 'inheritance' ? 14 : 12);
            c(el2, 'BegTrigger', 1);
            c(el2, 'EndTrigger', 1);
            c(el2, 'FillPattern', 0);
            writeLineBody(el2, (tx - sx) / pxPerInch, (ty - sy) / pxPerInch);
            textNode(el2, '');
            const gid = Number((el2.attrs.find((x) => x.name === 'ID') as { value: string }).value);
            const fs = ids.get(r.from);
            const ts = ids.get(r.to);
            if (fs !== undefined) connects.push(connectRec(gid, 'BeginX', fs, 'Connections.X2'));
            if (ts !== undefined) connects.push(connectRec(gid, 'EndX', ts, 'Connections.X4'));
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
