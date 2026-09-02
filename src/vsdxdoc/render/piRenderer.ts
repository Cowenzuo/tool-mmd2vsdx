// mmd2vsdx - vsdxdoc/render：pieRenderer（饼图：扇区/标题/图例）
//
// C++ render/pierenderer.cpp（196 行）平移（坑位 ⑧-8.4）。
// 关键语义照抄：
//   - mermaid 起始角 = 12 点方向（-90°），SVG 顺时针累加；
//   - 扇区形状 Pin=圆心、LocPin=0（锚圆心=本地原点）、W=H=2R；
//   - ArcTo A = -sagitta（照抄代码负号，勿按注释"正值画凸弧"修正——
//     869a0f6/d44c34d 历史教训）；sagitta=R*(1-cos(|arc|/2))；
//   - 缺色 → #CCCCCC；百分比 0.72r 角中点 12pt lround；图例圆右侧 +40px、
//     行距 22px、色块 18px；估宽 pie 档（CJK fs*0.55/72、空格 0.28、% 0.42、
//     其他 0.36——勿与 quadrant 档混用）。

import type { PageModel } from '../docmodel/model.js';
import type { PieChart } from '../../core/types.js';
import type { CoordinateTransform } from '../translate/coordinateTransform.js';
import {
    appendCellNumber,
    appendCellString,
    appendRow,
    appendSection,
    replaceShapeText,
    setNumericCell,
    setStringCell,
} from '../../xml/xmlBuilder.js';
import { appendChild, makeElement, setAttribute } from '../../xml/xmlNode.js';
import type { XmlNode } from '../../xml/xmlNode.js';
import { pageShapes } from './renderer.js';

const kPi = 3.14159265358979323846;

function newPlainShape(page: PageModel): { id: number; node: XmlNode } {
    const id = page.nextShapeId++;
    const node = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(node, 'ID', String(id));
    setAttribute(node, 'Type', 'Shape');
    return { id, node };
}

/** 无边框无填充文本框（水平居中，指定字号；CJK 估宽档：0.55/0.28(空格)/0.42(%)/0.36）。 */
function addTextLabel(page: PageModel, px: number, py: number, text: string,
                      fontSizePt: number): void {
    if (text.length === 0) return;
    let tw = 0.0;
    for (const ch of text) {
        const code = ch.codePointAt(0)!;
        if (code >= 0x80) tw += fontSizePt * 0.55 / 72.0; // 中文
        else if (ch === ' ') tw += fontSizePt * 0.28 / 72.0;
        else if (ch === '%') tw += fontSizePt * 0.42 / 72.0;
        else tw += fontSizePt * 0.36 / 72.0;
    }
    const w = tw + 0.1;
    const h = fontSizePt / 72.0 * 1.4;
    const ns = newPlainShape(page);
    setNumericCell(ns.node, 'PinX', px, 'IN');
    setNumericCell(ns.node, 'PinY', py, 'IN');
    setNumericCell(ns.node, 'Width', w, 'IN');
    setNumericCell(ns.node, 'Height', h, 'IN');
    setNumericCell(ns.node, 'LocPinX', w / 2, 'IN');
    setNumericCell(ns.node, 'LocPinY', h / 2, 'IN');
    setNumericCell(ns.node, 'LinePattern', 0);
    setNumericCell(ns.node, 'FillPattern', 0);
    setNumericCell(ns.node, 'ShapeFixedCode', 1);
    const character = appendSection(ns.node, 'Character');
    const characterRow = appendRow(character, null, 0);
    appendCellString(characterRow, 'Color', '#333333');
    appendCellNumber(characterRow, 'Size', fontSizePt / 72.0, 'PT');
    const paragraph = appendSection(ns.node, 'Paragraph');
    const paragraphRow = appendRow(paragraph, null, 0);
    appendCellNumber(paragraphRow, 'HorzAlign', 1);
    replaceShapeText(ns.node, text);
}

/** 图例色块：实心小矩形（指定颜色与边长）。 */
function addSwatch(page: PageModel, cx: number, cy: number, color: string,
                   size: number): void {
    const ns = newPlainShape(page);
    setNumericCell(ns.node, 'PinX', cx, 'IN');
    setNumericCell(ns.node, 'PinY', cy, 'IN');
    setNumericCell(ns.node, 'Width', size, 'IN');
    setNumericCell(ns.node, 'Height', size, 'IN');
    setNumericCell(ns.node, 'LocPinX', size / 2, 'IN');
    setNumericCell(ns.node, 'LocPinY', size / 2, 'IN');
    setStringCell(ns.node, 'FillForegnd', color);
    setStringCell(ns.node, 'FillBkgnd', color);
    setNumericCell(ns.node, 'FillPattern', 1);
    setStringCell(ns.node, 'LineColor', '#000000');
    setNumericCell(ns.node, 'LinePattern', 1);
    setNumericCell(ns.node, 'LineWeight', 0.25 / 72.0, 'PT');
    const geo = appendSection(ns.node, 'Geometry', 0);
    appendCellNumber(geo, 'NoFill', 0);
    const m = appendRow(geo, 'MoveTo', 1);
    appendCellNumber(m, 'X', 0, 'IN');
    appendCellNumber(m, 'Y', 0, 'IN');
    const l2 = appendRow(geo, 'LineTo', 2);
    appendCellNumber(l2, 'X', size, 'IN');
    const l3 = appendRow(geo, 'LineTo', 3);
    appendCellNumber(l3, 'X', size, 'IN');
    appendCellNumber(l3, 'Y', size, 'IN');
    const l4 = appendRow(geo, 'LineTo', 4);
    appendCellNumber(l4, 'Y', size, 'IN');
    const l5 = appendRow(geo, 'LineTo', 5);
    appendCellNumber(l5, 'X', 0, 'IN');
    appendCellNumber(l5, 'Y', 0, 'IN');
    replaceShapeText(ns.node, '');
}

/** 饼图渲染（空图/总值≤0 直接返回）。 */
export function renderPie(page: PageModel, pie: PieChart,
                          transform: CoordinateTransform): void {
    if (pie.slices.length === 0) return;
    let total = 0.0;
    for (const s of pie.slices) total += s.value;
    if (total <= 0.0) return;

    const c = transform.point(pie.cx, pie.cy);
    const R = transform.length(pie.r > 0 ? pie.r : 185.0);
    const rpx = pie.r > 0 ? pie.r : 185.0;

    // 1) 扇区（mermaid 起始角 = 12 点方向 -90°，SVG 顺时针累加）
    let start = -kPi / 2;
    for (const s of pie.slices) {
        const arc = (s.value / total) * 2 * kPi;
        const end = start + arc;
        const q0 = transform.point(pie.cx + rpx * Math.cos(start), pie.cy + rpx * Math.sin(start));
        const q1 = transform.point(pie.cx + rpx * Math.cos(end), pie.cy + rpx * Math.sin(end));
        const lx0 = q0.x - c.x;
        const ly0 = q0.y - c.y;
        const lx1 = q1.x - c.x;
        const ly1 = q1.y - c.y;
        const color = s.color.length === 0 ? '#CCCCCC' : s.color;

        const ns = newPlainShape(page);
        setNumericCell(ns.node, 'PinX', c.x, 'IN');
        setNumericCell(ns.node, 'PinY', c.y, 'IN');
        setNumericCell(ns.node, 'Width', 2 * R, 'IN');
        setNumericCell(ns.node, 'Height', 2 * R, 'IN');
        setNumericCell(ns.node, 'LocPinX', 0, 'IN');
        setNumericCell(ns.node, 'LocPinY', 0, 'IN');
        setStringCell(ns.node, 'FillForegnd', color);
        setStringCell(ns.node, 'FillBkgnd', color);
        setNumericCell(ns.node, 'FillPattern', 1);
        setStringCell(ns.node, 'LineColor', '#000000');
        setNumericCell(ns.node, 'LinePattern', 1);
        setNumericCell(ns.node, 'LineWeight', 0.5 / 72.0, 'PT');
        const geo = appendSection(ns.node, 'Geometry', 0);
        appendCellNumber(geo, 'NoFill', 0);
        const m = appendRow(geo, 'MoveTo', 1);
        appendCellNumber(m, 'X', 0, 'IN');
        appendCellNumber(m, 'Y', 0, 'IN');
        const l0 = appendRow(geo, 'LineTo', 2);
        appendCellNumber(l0, 'X', lx0, 'IN');
        appendCellNumber(l0, 'Y', ly0, 'IN');
        // ArcTo：A = -sagitta（照抄代码负号，勿按注释"正值"修正）
        const sagitta = R * (1.0 - Math.cos(Math.abs(arc) / 2.0));
        const e = appendRow(geo, 'ArcTo', 3);
        appendCellNumber(e, 'X', lx1, 'IN');
        appendCellNumber(e, 'Y', ly1, 'IN');
        appendCellNumber(e, 'A', -sagitta, 'IN');
        const l1 = appendRow(geo, 'LineTo', 4);
        appendCellNumber(l1, 'X', 0, 'IN');
        appendCellNumber(l1, 'Y', 0, 'IN');
        replaceShapeText(ns.node, '');

        // 百分比标签（扇区角中点 0.72r）
        const mid = (start + end) / 2;
        const lp = rpx * 0.72;
        const lpPt = transform.point(pie.cx + lp * Math.cos(mid), pie.cy + lp * Math.sin(mid));
        const pct = Math.round(s.value / total * 100);
        addTextLabel(page, lpPt.x, lpPt.y, pct + '%', 12);

        start = end;
    }

    // 2) 标题（圆心上方）
    if (pie.title.length > 0) {
        const tp = transform.point(pie.cx, pie.cy - rpx - 15);
        addTextLabel(page, tp.x, tp.y, pie.title, 18);
    }

    // 3) 图例（圆右侧：色块 + 名称，自上而下）
    const lx = pie.cx + rpx + 40;
    let ly = pie.cy - (pie.slices.length - 1) * 11.0;
    for (const s of pie.slices) {
        const cp = transform.point(lx, ly);
        const np = transform.point(lx + 26, ly);
        addSwatch(page, cp.x, cp.y,
            s.color.length === 0 ? '#CCCCCC' : s.color, transform.length(18));
        addTextLabel(page, np.x, np.y, s.label, 12);
        ly += 22;
    }
}
