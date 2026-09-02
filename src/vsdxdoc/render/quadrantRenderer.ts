// mmd2vsdx - vsdxdoc/render：quadrantRenderer（象限图）
//
// C++ render/quadrantrenderer.cpp（175 行）平移（坑位 ⑧-8.4）。
// 语义照抄：边框 4 线（0.5pt）+ 十字 2 线（0.75pt）色 #888888；
// 数据点 = Circle 母版实例（masterless 时无 Master）r=5px 固定色 #4472C4；
// 标签文本框估宽 quadrant 档（CJK fs*0.55/72、其他 0.36——无空格/% 特例，
// 勿与 pie 档混用）；2-D 线 Width/Height 下限 0.001 退化保护、
// FillPattern=0+NoFill=1、空文本。

import type { PageModel } from '../docmodel/model.js';
import type { QuadrantChart } from '../../core/types.js';
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
import type { MasterClient } from '../masters/masterClient.js';
import { masterlessClient } from '../masters/masterClient.js';
import { pageShapes } from './renderer.js';

function newShape(page: PageModel): XmlNode {
    const id = page.nextShapeId++;
    const node = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(node, 'ID', String(id));
    setAttribute(node, 'Type', 'Shape');
    return node;
}

/** 无母版纯几何 2-D 线（Pin=bbox 中心；W/H 下限 0.001）。 */
function addLine2D(page: PageModel, x1: number, y1: number, x2: number, y2: number,
                   lineWeightPt = 0.5): void {
    const w = Math.max(Math.abs(x2 - x1), 0.001);
    const h = Math.max(Math.abs(y2 - y1), 0.001);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const node = newShape(page);
    setNumericCell(node, 'PinX', cx, 'IN');
    setNumericCell(node, 'PinY', cy, 'IN');
    setNumericCell(node, 'Width', w, 'IN');
    setNumericCell(node, 'Height', h, 'IN');
    setNumericCell(node, 'LocPinX', w / 2, 'IN');
    setNumericCell(node, 'LocPinY', h / 2, 'IN');
    setNumericCell(node, 'LineWeight', lineWeightPt / 72.0, 'PT');
    setStringCell(node, 'LineColor', '#888888');
    setNumericCell(node, 'LinePattern', 1);
    setNumericCell(node, 'FillPattern', 0);
    const geo = appendSection(node, 'Geometry', 0);
    appendCellNumber(geo, 'NoFill', 1);
    const m = appendRow(geo, 'MoveTo', 1);
    appendCellNumber(m, 'X', x1 - cx + w / 2, 'IN');
    appendCellNumber(m, 'Y', y1 - cy + h / 2, 'IN');
    const l = appendRow(geo, 'LineTo', 2);
    appendCellNumber(l, 'X', x2 - cx + w / 2, 'IN');
    appendCellNumber(l, 'Y', y2 - cy + h / 2, 'IN');
    replaceShapeText(node, '');
}

/** 无边框无填充文本框（quadrant 估宽档）。 */
function addTextBox(page: PageModel, px: number, py: number, text: string,
                    fontSizePt = 12): void {
    if (text.length === 0) return;
    let tw = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0)!;
        if (code >= 0x80) tw += fontSizePt * 0.55 / 72.0;
        else tw += fontSizePt * 0.36 / 72.0;
    }
    const w = tw + 0.1;
    const h = fontSizePt / 72.0 * 1.4;
    const node = newShape(page);
    setNumericCell(node, 'PinX', px, 'IN');
    setNumericCell(node, 'PinY', py, 'IN');
    setNumericCell(node, 'Width', w, 'IN');
    setNumericCell(node, 'Height', h, 'IN');
    setNumericCell(node, 'LocPinX', w / 2, 'IN');
    setNumericCell(node, 'LocPinY', h / 2, 'IN');
    setNumericCell(node, 'LinePattern', 0);
    setNumericCell(node, 'FillPattern', 0);
    setNumericCell(node, 'ShapeFixedCode', 1);
    const character = appendSection(node, 'Character');
    const cr = appendRow(character, null, 0);
    appendCellString(cr, 'Color', '#333333');
    appendCellNumber(cr, 'Size', fontSizePt / 72.0, 'PT');
    const para = appendSection(node, 'Paragraph');
    const pr = appendRow(para, null, 0);
    appendCellNumber(pr, 'HorzAlign', 1);
    replaceShapeText(node, text);
}

/** 象限图渲染（空图直接返回）。 */
export function renderQuadrant(page: PageModel, chart: QuadrantChart,
                               transform: CoordinateTransform,
                               masters: MasterClient = masterlessClient): void {
    if (chart.points.length === 0) return;

    const tl = transform.point(chart.minX, chart.minY);
    const br = transform.point(chart.maxX, chart.maxY);
    const tr = transform.point(chart.maxX, chart.minY);
    const bl = transform.point(chart.minX, chart.maxY);
    const cl = transform.point(chart.minX, chart.crossY);
    const cr = transform.point(chart.maxX, chart.crossY);
    const ct = transform.point(chart.crossX, chart.minY);
    const cb = transform.point(chart.crossX, chart.maxY);

    // 1) 边框线 4 条 + 十字线 2 条
    addLine2D(page, tl.x, tl.y, tr.x, tr.y);
    addLine2D(page, bl.x, bl.y, br.x, br.y);
    addLine2D(page, tl.x, tl.y, bl.x, bl.y);
    addLine2D(page, tr.x, tr.y, br.x, br.y);
    addLine2D(page, ct.x, ct.y, cb.x, cb.y, 0.75);
    addLine2D(page, cl.x, cl.y, cr.x, cr.y, 0.75);

    // 2) 数据点：Circle 母版实例（r=5px）+ 标签（点下方）
    const dotR = transform.length(5.0);
    for (const pt of chart.points) {
        const pc = transform.point(pt.cx, pt.cy);
        const masterId = masters.masterIdFor('Circle');
        const node = newShape(page);
        if (masterId !== 0) setAttribute(node, 'Master', String(masterId));
        setNumericCell(node, 'PinX', pc.x, 'IN');
        setNumericCell(node, 'PinY', pc.y, 'IN');
        setNumericCell(node, 'Width', 2 * dotR, 'IN');
        setNumericCell(node, 'Height', 2 * dotR, 'IN');
        setNumericCell(node, 'LocPinX', dotR, 'IN', 'Width*0.5');
        setNumericCell(node, 'LocPinY', dotR, 'IN', 'Height*0.5');
        setStringCell(node, 'FillForegnd', '#4472C4');
        setStringCell(node, 'FillBkgnd', '#4472C4');
        setNumericCell(node, 'FillPattern', 1);
        setStringCell(node, 'LineColor', '#4472C4');
        setNumericCell(node, 'LinePattern', 1);
        replaceShapeText(node, '');
        const lp = transform.point(pt.cx, pt.cy + 10);
        addTextBox(page, lp.x, lp.y, pt.label, 10);
    }

    // 3) 标题（画布上方）
    if (chart.title.length > 0) {
        const tp = transform.point((chart.minX + chart.maxX) / 2, chart.minY - 25);
        addTextBox(page, tp.x, tp.y, chart.title, 16);
    }

    // 4) x 轴标签（底部 Low/High）
    if (chart.xLabelLow.length > 0) {
        const xl = transform.point(chart.minX, chart.maxY + 20);
        addTextBox(page, xl.x, xl.y, chart.xLabelLow, 10);
    }
    if (chart.xLabelHigh.length > 0) {
        const xh = transform.point(chart.maxX, chart.maxY + 20);
        addTextBox(page, xh.x, xh.y, chart.xLabelHigh, 10);
    }

    // 5) y 轴标签（左侧 Low/High）
    if (chart.yLabelLow.length > 0) {
        const yl = transform.point(chart.minX - 40, chart.maxY);
        addTextBox(page, yl.x, yl.y, chart.yLabelLow, 10);
    }
    if (chart.yLabelHigh.length > 0) {
        const yh = transform.point(chart.minX - 40, chart.minY);
        addTextBox(page, yh.x, yh.y, chart.yLabelHigh, 10);
    }
}
