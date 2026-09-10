// diag-gantt（＝ gantt 包）：契约 A(gantt) → 契约 B 页面部件
// 结构与金标准同构（73 形状模型）：1 底板 + 6 表头标签 + 1 表头线 + 14 日格 +
// 2 列分隔线 + 8 行号 + 7 任务条 + 1 里程碑 + 1 追加标记 + 32 行单元。
// 布局为确定性网格，坐标像素→英寸；行/列参数与金标准同数量级。

import { isNoUnitCell } from '../common/units.js';
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../xml/index.js';
import { kPageContentType, kPageUri } from '../xml/constants.js';
import { part, type XmlPart, type GanttModel } from '../contracts/index.js';

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
        const rw = makeElement('Row');
        setAttribute(rw, 'T', t);
        setAttribute(rw, 'IX', String(ix));
        const xc = makeElement('Cell');
        setAttribute(xc, 'N', 'X');
        setAttribute(xc, 'V', kIn(Number(xv)));
        setAttribute(xc, 'U', 'MM');
        setAttribute(xc, 'F', xf);
        const yc = makeElement('Cell');
        setAttribute(yc, 'N', 'Y');
        setAttribute(yc, 'V', kIn(Number(yv)));
        setAttribute(yc, 'U', 'MM');
        setAttribute(yc, 'F', yf);
        rw.children.push(xc, yc);
        g.children.push(rw);
    }
    el.children.push(g);
}

/** 线段几何（6.2.4：无 F 无 U，局部英寸字面量）。 */
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

export class GanttRenderer {
    render(a: { gantt?: GanttModel }, pageHpx: number, pxPerInch = 96): XmlPart {
        const g: GanttModel = a.gantt ?? { title: '', dateFormat: '', startSerial: 0, endSerial: 0, sections: [], tasks: [] };
        const ctx: Ctx = { shapes: [], nextId: 1, pageHpx, pxPerInch };

        const rows = g.tasks;
        const rowGap = 28;
        const headerH = 24;
        const dayW = 24;
        const nameW = 150;
        const colX = 24; // 行号列宽
        const dayX0 = colX + nameW + 3 * dayW + 8;
        const startSerial = g.startSerial;
        const tasks = rows.filter((t) => t.milestone !== true);
        const milestones = rows.filter((t) => t.milestone === true);
        const dayCount = Math.max(g.endSerial - g.startSerial + 2, rows.length ? 8 : 1);

        const rowY = (i: number) => headerH + 8 + rowGap * (i + 0.5);
        const chartW = dayX0 + dayCount * dayW + 40;
        const chartH = headerH + 8 + rowGap * rows.length + 20;
        const chartX0 = 20;

        // 1 底板
        const bg = newShape(ctx);
        c(bg, 'PinX', chartX0 + chartW / 2 / pxPerInch);
        c(bg, 'PinY', (pageHpx - chartH / 2) / pxPerInch);
        c(bg, 'Width', chartW / pxPerInch);
        c(bg, 'Height', chartH / pxPerInch);
        c(bg, 'LocPinX', chartW / 2 / pxPerInch);
        c(bg, 'LocPinY', chartH / 2 / pxPerInch);
        c(bg, 'LineColor', '#000000');
        c(bg, 'LinePattern', 1);
        c(bg, 'FillForegnd', '#FFFFFF');
        c(bg, 'FillPattern', 1);
        writeRectBody(bg, chartW / pxPerInch, chartH / pxPerInch);
        textNode(bg, '');

        // 2 表头标签 ×6（5 个有文本 + 1 个空白宽格）
        const headers: Array<[string, number]> = [
            ['ID', 24],
            ['任务名称', nameW],
            ['开始时间', dayW * 2],
            ['完成', dayW * 2],
            ['持续时间', dayW * 4],
            ['', dayCount * dayW],
        ];
        let hx = chartX0;
        for (const [label, w] of headers) {
            const el = newShape(ctx);
            c(el, 'PinX', (hx + w / 2) / pxPerInch);
            c(el, 'PinY', (pageHpx - headerH / 2) / pxPerInch);
            c(el, 'Width', w / pxPerInch);
            c(el, 'Height', headerH / pxPerInch);
            c(el, 'LocPinX', w / 2 / pxPerInch);
            c(el, 'LocPinY', headerH / 2 / pxPerInch);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillForegnd', '#FFFFFF');
            c(el, 'FillPattern', 1);
            writeRectBody(el, w / pxPerInch, headerH / pxPerInch);
            textNode(el, label);
            hx += w;
        }

        // 3 表头线（数据区上沿）
        const hline = newShape(ctx);
        c(hline, 'PinX', (chartX0 + dayX0 + dayCount * dayW / 2) / pxPerInch);
        c(hline, 'PinY', (pageHpx - (headerH + 1)) / pxPerInch);
        c(hline, 'Width', (dayCount * dayW) / pxPerInch);
        c(hline, 'Height', 1 / pxPerInch);
        c(hline, 'LocPinX', dayCount * dayW / 2 / pxPerInch);
        c(hline, 'LocPinY', 0);
        c(hline, 'LineColor', '#000000');
        c(hline, 'LinePattern', 1);
        c(hline, 'FillPattern', 0);
        writeLineBody(hline, dayCount * dayW / pxPerInch, 0);
        textNode(hline, '');

        // 4 日格 ×dayCount（表头下的小格；Field 段提供日期值——gantt 专篇 3.2）
        const kExcelEpoch = 25569; // 1970-01-01 的 Excel 序列（1899-12-30=0）
        for (let i = 0; i < dayCount; i++) {
            const el = newShape(ctx);
            const x = chartX0 + dayX0 + i * dayW + dayW / 2;
            c(el, 'PinX', x / pxPerInch);
            c(el, 'PinY', (pageHpx - headerH) / pxPerInch);
            c(el, 'Width', dayW / pxPerInch);
            c(el, 'Height', 1 / pxPerInch);
            c(el, 'LocPinX', dayW / 2 / pxPerInch);
            c(el, 'LocPinY', 0);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillPattern', 0);
            writeLineBody(el, dayW / pxPerInch, 0);
            const dateStr = new Date((startSerial + i - kExcelEpoch) * 86400000).toISOString().slice(0, 10);
            const fld = makeElement('Section');
            setAttribute(fld, 'N', 'Field');
            const frow = makeElement('Row');
            setAttribute(frow, 'IX', '1');
            frow.children.push(cellP('Value', dateStr));
            fld.children.push(frow);
            el.children.push(fld);
            textNode(el, '');
        }

        // 5 列分隔线 ×2（数据区内，跨度=正文高度）
        const bodyTop = headerH + 4;
        const bodyH = chartH - bodyTop - 8;
        for (const dayIdx of [2, Math.max(2, Math.floor(dayCount * 0.7))]) {
            const el = newShape(ctx);
            const x = chartX0 + dayX0 + dayIdx * dayW;
            c(el, 'PinX', x / pxPerInch);
            c(el, 'PinY', (pageHpx - (bodyTop + bodyH / 2)) / pxPerInch);
            c(el, 'Width', 1 / pxPerInch);
            c(el, 'Height', bodyH / pxPerInch);
            c(el, 'LocPinX', 0);
            c(el, 'LocPinY', bodyH / 2 / pxPerInch);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillPattern', 0);
            writeLineBody(el, 0, bodyH / pxPerInch);
            textNode(el, '');
        }

        // 6 行号 ×rows（1..N）
        for (let i = 0; i < rows.length; i++) {
            const el = newShape(ctx);
            c(el, 'PinX', (chartX0 + colX / 2) / pxPerInch);
            c(el, 'PinY', (pageHpx - rowY(i)) / pxPerInch);
            c(el, 'Width', colX / pxPerInch);
            c(el, 'Height', rowGap / pxPerInch);
            c(el, 'LocPinX', colX / 2 / pxPerInch);
            c(el, 'LocPinY', rowGap / 2 / pxPerInch);
            c(el, 'LinePattern', 0);
            c(el, 'FillPattern', 0);
            textNode(el, String(i + 1));
        }

        // 7 任务条 ×nTasks（组：起止按日跨度；命名连接行/Property/8 子形状——gantt 专篇 4.1/4.2）
        for (const t of tasks) {
            if (t.startSerial === null || t.startSerial === undefined) continue;
            const i = rows.indexOf(t);
            const x = chartX0 + dayX0 + (t.startSerial - startSerial) * dayW + dayW / 2;
            const w = Math.max(t.duration * dayW, dayW) - 2;
            const el = newShape(ctx);
            setAttribute(el, 'Type', 'Group');
            c(el, 'PinX', x / pxPerInch);
            c(el, 'PinY', (pageHpx - rowY(i)) / pxPerInch);
            c(el, 'Width', w / pxPerInch);
            c(el, 'Height', (rowGap - 4) / pxPerInch);
            c(el, 'LocPinX', w / 2 / pxPerInch);
            c(el, 'LocPinY', (rowGap - 4) / 2 / pxPerInch);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillForegnd', '#DCDCDC');
            c(el, 'FillPattern', 1);
            writeRectBody(el, w / pxPerInch, (rowGap - 4) / pxPerInch);
            // 命名连接行（gantt 专篇 4.3：LeftSide.X/RightSide.X；ToPart 100/101）
            const conn = makeElement('Section');
            setAttribute(conn, 'N', 'Connection');
            for (const [n, xf, dir] of [
                ['LeftSide', 'Width*0', '1'],
                ['RightSide', 'Width*1', '-1'],
            ] as Array<[string, string, string]>) {
                const crow = makeElement('Row');
                setAttribute(crow, 'T', 'Connection');
                setAttribute(crow, 'N', n);
                crow.children.push(
                    cellP('X', kIn(xf === 'Width*0' ? 0 : w / pxPerInch)),
                    cellP('Y', kIn((rowGap - 4) / 2 / pxPerInch)),
                    cellP('DirX', dir),
                    cellP('DirY', '0'),
                    cellP('Type', '0'),
                    cellP('AutoGen', '0'),
                    cellP('Prompt', ''),
                );
                conn.children.push(crow);
            }
            el.children.push(conn);
            // Property 段（gantt 专篇 4.3/g-2）
            const prop = makeElement('Section');
            setAttribute(prop, 'N', 'Property');
            const prow = makeElement('Row');
            setAttribute(prow, 'N', 'TaskName');
            prow.children.push(cellP('Value', t.name));
            prop.children.push(prow);
            el.children.push(prop);
            // 8 子形状（gantt 专篇 4.1：时间条/进度/符号/文字占位）
            const kids = makeElement('Shapes');
            for (let kk = 0; kk < 8; kk++) {
                const k = makeElement('Shape');
                setAttribute(k, 'ID', String(ctx.nextId++));
                const kw = 0.08;
                const kx = (kk - 3.5) * 0.12;
                k.children.push(
                    cellP('PinX', kIn(x / pxPerInch + kx)),
                    cellP('PinY', kIn((pageHpx - rowY(i)) / pxPerInch)),
                    cellP('Width', kIn(kw)),
                    cellP('Height', kIn((rowGap - 6) / pxPerInch)),
                    cellP('LocPinX', kIn(kw / 2)),
                    cellP('LocPinY', kIn((rowGap - 6) / 2 / pxPerInch)),
                    cellP('LineColor', '#000000'),
                    cellP('LinePattern', '1'),
                    cellP('FillForegnd', '#FFFFFF'),
                    cellP('FillPattern', '1'),
                );
                const kg = makeElement('Section');
                setAttribute(kg, 'N', 'Geometry');
                setAttribute(kg, 'IX', '0');
                for (const [t, ix, xo, yo] of [
                    ['MoveTo', 1, -kw / 2, -(rowGap - 6) / 2 / pxPerInch],
                    ['LineTo', 2, kw / 2, -(rowGap - 6) / 2 / pxPerInch],
                    ['LineTo', 3, kw / 2, (rowGap - 6) / 2 / pxPerInch],
                    ['LineTo', 4, -kw / 2, (rowGap - 6) / 2 / pxPerInch],
                    ['LineTo', 5, -kw / 2, -(rowGap - 6) / 2 / pxPerInch],
                ] as Array<[string, number, number, number]>) {
                    const rw = makeElement('Row');
                    setAttribute(rw, 'T', t);
                    setAttribute(rw, 'IX', String(ix));
                    rw.children.push(cellP('X', kIn(xo)), cellP('Y', kIn(yo)));
                    kg.children.push(rw);
                }
                k.children.push(kg);
                kids.children.push(k);
            }
            el.children.push(kids);
            textNode(el, '');
        }

        // 8 里程碑（0d → 小方块；与任务条同集团：8 子形状 + 命名连接行 + Property——4.1/4.5）
        for (const t of milestones) {
            if (t.startSerial === null || t.startSerial === undefined) continue;
            const i = rows.indexOf(t);
            const x = chartX0 + dayX0 + (t.startSerial - startSerial) * dayW + dayW / 2;
            const el = newShape(ctx);
            setAttribute(el, 'Type', 'Group');
            const mw = 10 / pxPerInch;
            const mh = 10 / pxPerInch;
            c(el, 'PinX', x / pxPerInch);
            c(el, 'PinY', (pageHpx - rowY(i)) / pxPerInch);
            c(el, 'Width', mw);
            c(el, 'Height', mh);
            c(el, 'LocPinX', mw / 2);
            c(el, 'LocPinY', mh / 2);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillForegnd', '#FFFFFF');
            c(el, 'FillPattern', 1);
            writeRectBody(el, mw, mh);
            const conn = makeElement('Section');
            setAttribute(conn, 'N', 'Connection');
            for (const [n, xv, dir] of [
                ['LeftSide', '0', '1'],
                ['RightSide', mw, '-1'],
            ] as Array<[string, string, string]>) {
                const crow = makeElement('Row');
                setAttribute(crow, 'T', 'Connection');
                setAttribute(crow, 'N', n);
                crow.children.push(
                    cellP('X', kIn(Number(xv))),
                    cellP('Y', kIn(mh / 2)),
                    cellP('DirX', dir),
                    cellP('DirY', '0'),
                    cellP('Type', '0'),
                    cellP('AutoGen', '0'),
                    cellP('Prompt', ''),
                );
                conn.children.push(crow);
            }
            el.children.push(conn);
            const prop = makeElement('Section');
            setAttribute(prop, 'N', 'Property');
            const prow = makeElement('Row');
            setAttribute(prow, 'N', 'TaskName');
            prow.children.push(cellP('Value', t.name));
            prop.children.push(prow);
            el.children.push(prop);
            const kids = makeElement('Shapes');
            for (let kk = 0; kk < 8; kk++) {
                const k = makeElement('Shape');
                setAttribute(k, 'ID', String(ctx.nextId++));
                k.children.push(
                    cellP('PinX', kIn(x / pxPerInch + (kk - 3.5) * 0.05)),
                    cellP('PinY', kIn((pageHpx - rowY(i)) / pxPerInch)),
                    cellP('Width', kIn(0.04)),
                    cellP('Height', kIn(0.04)),
                    cellP('LocPinX', kIn(0.02)),
                    cellP('LocPinY', kIn(0.02)),
                    cellP('LineColor', '#000000'),
                    cellP('LinePattern', '1'),
                    cellP('FillForegnd', '#FFFFFF'),
                    cellP('FillPattern', '1'),
                );
                const kg = makeElement('Section');
                setAttribute(kg, 'N', 'Geometry');
                setAttribute(kg, 'IX', '0');
                for (const [tt, ix, xo, yo] of [
                    ['MoveTo', 1, -0.02, -0.02],
                    ['LineTo', 2, 0.02, -0.02],
                    ['LineTo', 3, 0.02, 0.02],
                    ['LineTo', 4, -0.02, 0.02],
                    ['LineTo', 5, -0.02, -0.02],
                ] as Array<[string, number, number, number]>) {
                    const rw = makeElement('Row');
                    setAttribute(rw, 'T', tt);
                    setAttribute(rw, 'IX', String(ix));
                    rw.children.push(cellP('X', kIn(xo)), cellP('Y', kIn(yo)));
                    kg.children.push(rw);
                }
                k.children.push(kg);
                kids.children.push(k);
            }
            el.children.push(kids);
            textNode(el, '');
        }

        // 9 追加标记（最后一个任务条右缘下侧的小标记）
        if (tasks.length > 0) {
            const last = tasks[tasks.length - 1]!;
            const i = rows.indexOf(last);
            const x = chartX0 + dayX0 + (last.startSerial - startSerial) * dayW + last.duration * dayW + 12;
            const el = newShape(ctx);
            c(el, 'PinX', x / pxPerInch);
            c(el, 'PinY', (pageHpx - (rowY(i) + rowGap / 2)) / pxPerInch);
            c(el, 'Width', 8 / pxPerInch);
            c(el, 'Height', 6 / pxPerInch);
            c(el, 'LocPinX', 4 / pxPerInch);
            c(el, 'LocPinY', 3 / pxPerInch);
            c(el, 'LineColor', '#000000');
            c(el, 'LinePattern', 1);
            c(el, 'FillForegnd', '#FFFFFF');
            c(el, 'FillPattern', 1);
            writeRectBody(el, 8 / pxPerInch, 6 / pxPerInch);
            textNode(el, '');
        }

        // 10 行单元 ×rows×4（名称 + 3 数据小格）
        for (let i = 0; i < rows.length; i++) {
            const xs = [chartX0 + colX, chartX0 + colX + nameW, chartX0 + colX + nameW + dayW, chartX0 + colX + nameW + 2 * dayW];
            const ws = [nameW, dayW, dayW, dayW];
            for (let k = 0; k < 4; k++) {
                const el = newShape(ctx);
                c(el, 'PinX', (xs[k]! + ws[k]! / 2) / pxPerInch);
                c(el, 'PinY', (pageHpx - rowY(i)) / pxPerInch);
                c(el, 'Width', ws[k]! / pxPerInch);
                c(el, 'Height', (rowGap - 2) / pxPerInch);
                c(el, 'LocPinX', ws[k]! / 2 / pxPerInch);
                c(el, 'LocPinY', (rowGap - 2) / 2 / pxPerInch);
                c(el, 'LineColor', '#000000');
                c(el, 'LinePattern', 1);
                c(el, 'FillForegnd', '#FFFFFF');
                c(el, 'FillPattern', 1);
                writeRectBody(el, ws[k]! / pxPerInch, (rowGap - 2) / pxPerInch);
                textNode(el, '');
            }
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
