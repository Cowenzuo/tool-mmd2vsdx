// mmd2vsdx - vsdxdoc/render：gitRenderer（gitGraph 专用渲染）
//
// C++ render/gitrenderer.cpp（281 行）平移（坑位 ⑧-8.3）。
// 语义照抄：
//   - 分支线 = 2-D 折线（非 1-D；commit 移动不重路由为已知限制）；虚线
//     LinePattern=2、分支色、0.75pt；x2<=x1 跳过；分支名标签在左端左侧；
//   - 2-D 折线通用写法：Pin=bbox 中心、Geometry=点-左下、W/H 下限 0.001、
//     FillPattern=0+NoFill=1、空文本；
//   - commit = Circle 母版实例（merge 双圈内圈 d*6/9 描边 #ECECFF；
//     HIGHLIGHT 描边 #000000 1.5pt；cherry-pick 浅描边）；
//   - 标签 8pt 估宽档（CJK 0.11、MWmw 0.075、空格 0.035、窄字 0.03、其他 0.05）；
//   - tag 在圆点上方、与 label 相同不重复；isDarkColor 亮度阈值 150 判黑/白字；
//   - branch 创建线虚线、seq/merge 实线、2pt；线色按 GitArrow.branchIndex。

import type { PageModel } from '../docmodel/model.js';
import type { GitGraph } from '../../core/types.js';
import type { CoordinateTransform } from './coordinateTransform.js';
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

function newPlainShape(page: PageModel): XmlNode {
    const id = page.nextShapeId++;
    const node = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(node, 'ID', String(id));
    setAttribute(node, 'Type', 'Shape');
    return node;
}

interface PagePointLike {
    x: number;
    y: number;
}

/** 2-D 折线/分支线：Pin=bbox 中心，Geometry=点-bbox 左下。 */
function addPolyline(page: PageModel, pts: PagePointLike[], color: string,
                     linePattern: number, lineWeightPt: number): void {
    if (pts.length < 2) return;
    let minX = pts[0]!.x;
    let minY = pts[0]!.y;
    let maxX = pts[0]!.x;
    let maxY = pts[0]!.y;
    for (const p of pts) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    const w = Math.max(maxX - minX, 0.001);
    const h = Math.max(maxY - minY, 0.001);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const ns = newPlainShape(page);
    setNumericCell(ns, 'PinX', cx, 'IN');
    setNumericCell(ns, 'PinY', cy, 'IN');
    setNumericCell(ns, 'Width', w, 'IN');
    setNumericCell(ns, 'Height', h, 'IN');
    setNumericCell(ns, 'LocPinX', w / 2, 'IN');
    setNumericCell(ns, 'LocPinY', h / 2, 'IN');
    setNumericCell(ns, 'Angle', 0, 'DEG');
    setNumericCell(ns, 'LineWeight', lineWeightPt / 72.0, 'PT');
    setStringCell(ns, 'LineColor', color);
    setNumericCell(ns, 'LinePattern', linePattern);
    setNumericCell(ns, 'FillPattern', 0);
    const geo = appendSection(ns, 'Geometry', 0);
    appendCellNumber(geo, 'NoFill', 1);
    appendCellNumber(geo, 'NoLine', 0);
    const move = appendRow(geo, 'MoveTo', 1);
    appendCellNumber(move, 'X', pts[0]!.x - minX, 'IN');
    appendCellNumber(move, 'Y', pts[0]!.y - minY, 'IN');
    for (let i = 1; i < pts.length; i++) {
        const line = appendRow(geo, 'LineTo', i + 1);
        appendCellNumber(line, 'X', pts[i]!.x - minX, 'IN');
        appendCellNumber(line, 'Y', pts[i]!.y - minY, 'IN');
    }
    replaceShapeText(ns, '');
}

/** commit 圆点：Circle 母版实例（无文本）；inner=merge 内圈。 */
function addCommitCircle(page: PageModel, px: number, py: number, diameter: number,
                         color: string, inner: boolean, highlight = false,
                         reverse = false, masters: MasterClient): void {
    const masterId = masters.masterIdFor('Circle');
    const node = newPlainShape(page);
    if (masterId !== 0) setAttribute(node, 'Master', String(masterId));
    setNumericCell(node, 'PinX', px, 'IN');
    setNumericCell(node, 'PinY', py, 'IN');
    setNumericCell(node, 'Width', diameter, 'IN');
    setNumericCell(node, 'Height', diameter, 'IN');
    setNumericCell(node, 'LocPinX', diameter / 2, 'IN', 'Width*0.5');
    setNumericCell(node, 'LocPinY', diameter / 2, 'IN', 'Height*0.5');
    setNumericCell(node, 'Angle', 0, 'DEG');
    setNumericCell(node, 'FlipX', 0);
    setNumericCell(node, 'FlipY', 0);
    let lineColor = color;
    let lineWeight = 1.0 / 72.0;
    if (inner) {
        lineColor = '#ECECFF';
        lineWeight = 0.5 / 72.0;
    } else if (reverse) {
        lineColor = '#ECECFF';
    } else if (highlight) {
        lineColor = '#000000';
        lineWeight = 1.5 / 72.0;
    }
    setNumericCell(node, 'LineWeight', lineWeight, 'PT');
    setStringCell(node, 'LineColor', lineColor);
    setNumericCell(node, 'LinePattern', 1);
    setStringCell(node, 'FillForegnd', color);
    setStringCell(node, 'FillBkgnd', color);
    setNumericCell(node, 'FillPattern', 1);
    replaceShapeText(node, '');
}

/** 文本宽度粗估（8pt 档；UTF-8 字节常量按码点折算，⑧-8.3）。 */
function estimateTextWidth(text: string): number {
    let tw = 0.0;
    for (const ch of text) {
        const code = ch.codePointAt(0)!;
        if (code >= 0x80) tw += 0.11; // 中文等宽
        else if (ch === 'M' || ch === 'W' || ch === 'm' || ch === 'w') tw += 0.075;
        else if (ch === ' ') tw += 0.035;
        else if ('ilIjtf.'.includes(ch)) tw += 0.03;
        else tw += 0.05;
    }
    return tw;
}

/** hex #rrggbb 亮度（0~255）：<150 判暗色（白字）。 */
export function isDarkColor(hex: string): boolean {
    if (hex.length < 7 || hex[0] !== '#') return true;
    const val = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    const r = val(1);
    const g = val(3);
    const b = val(5);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 150.0;
}

/** 分支名标签：Rounded Rectangle 母版实例（分支色背景 + 黑/白字）。 */
function addBranchLabel(page: PageModel, px: number, py: number, text: string,
                        color: string, masters: MasterClient): void {
    if (text.length === 0) return;
    const w = estimateTextWidth(text) + 0.22;
    const h = 0.18;
    const masterId = masters.masterIdFor('Rounded Rectangle');
    const node = newPlainShape(page);
    if (masterId !== 0) setAttribute(node, 'Master', String(masterId));
    setNumericCell(node, 'PinX', px, 'IN');
    setNumericCell(node, 'PinY', py, 'IN');
    setNumericCell(node, 'Width', w, 'IN');
    setNumericCell(node, 'Height', h, 'IN');
    setNumericCell(node, 'LocPinX', w / 2, 'IN', 'Width*0.5');
    setNumericCell(node, 'LocPinY', h / 2, 'IN', 'Height*0.5');
    setNumericCell(node, 'Angle', 0, 'DEG');
    setStringCell(node, 'FillForegnd', color);
    setStringCell(node, 'FillBkgnd', color);
    setNumericCell(node, 'FillPattern', 1);
    setNumericCell(node, 'LinePattern', 0);
    const textColor = isDarkColor(color) ? '#FFFFFF' : '#000000';
    const character = appendSection(node, 'Character');
    const characterRow = appendRow(character, null, 0);
    appendCellString(characterRow, 'Color', textColor);
    appendCellNumber(characterRow, 'Size', 8.0 / 72.0, 'PT');
    const paragraph = appendSection(node, 'Paragraph');
    const paragraphRow = appendRow(paragraph, null, 0);
    appendCellNumber(paragraphRow, 'HorzAlign', 1);
    replaceShapeText(node, text);
}

/** commit 标签：水平文本框（无边框无填充 8pt）。 */
function addLabel(page: PageModel, px: number, py: number, text: string): void {
    if (text.length === 0) return;
    const w = estimateTextWidth(text) + 0.12;
    const h = 0.14;
    const ns = newPlainShape(page);
    setNumericCell(ns, 'PinX', px, 'IN');
    setNumericCell(ns, 'PinY', py, 'IN');
    setNumericCell(ns, 'Width', w, 'IN');
    setNumericCell(ns, 'Height', h, 'IN');
    setNumericCell(ns, 'LocPinX', w / 2, 'IN');
    setNumericCell(ns, 'LocPinY', h / 2, 'IN');
    setNumericCell(ns, 'LinePattern', 0);
    setNumericCell(ns, 'FillPattern', 0);
    setNumericCell(ns, 'ShapeFixedCode', 1);
    const character = appendSection(ns, 'Character');
    const characterRow = appendRow(character, null, 0);
    appendCellString(characterRow, 'Color', '#333333');
    appendCellNumber(characterRow, 'Size', 8.0 / 72.0, 'PT');
    const paragraph = appendSection(ns, 'Paragraph');
    const paragraphRow = appendRow(paragraph, null, 0);
    appendCellNumber(paragraphRow, 'HorzAlign', 1);
    replaceShapeText(ns, text);
}

/** gitGraph 渲染（空图直接返回）。 */
export function renderGitGraph(page: PageModel, git: GitGraph,
                               transform: CoordinateTransform,
                               masters: MasterClient = masterlessClient): void {
    if (git.commits.length === 0) return;

    const colors = new Map<number, string>();
    for (const b of git.branches) colors.set(b.index, b.color);
    const colorOf = (index: number) => colors.get(index) ?? '#000000';

    // 1) 分支线：水平虚线 + 左端左侧标签
    for (const b of git.branches) {
        if (b.x2 <= b.x1) continue;
        const p1 = transform.point(b.x1, b.y);
        const p2 = transform.point(b.x2, b.y);
        addPolyline(page, [p1, p2], b.color, 2, 0.75);
        if (b.name.length > 0) {
            const labelW = estimateTextWidth(b.name) + 0.22;
            addBranchLabel(page, p1.x - 0.1 - labelW / 2, p1.y, b.name,
                b.color, masters);
        }
    }

    // 2) commit 圆点（merge 双圈）+ 3) 标签/ tag
    for (const c of git.commits) {
        const p = transform.point(c.x, c.y);
        const d = transform.length(c.r * 2);
        const color = colorOf(c.branchIndex);
        if (c.merge) {
            addCommitCircle(page, p.x, p.y, d, color, false, false, false, masters);
            addCommitCircle(page, p.x, p.y, d * (6.0 / 9.0), color, true, false, false, masters);
        } else {
            addCommitCircle(page, p.x, p.y, d, color, false, c.highlight, c.reverse, masters);
        }
        if (c.label.length > 0) {
            const lp = transform.point(c.x, c.y + c.r + 10);
            addLabel(page, lp.x, lp.y, c.label);
        }
        if (c.tag.length > 0 && c.tag !== c.label) {
            const tp = transform.point(c.x, c.y - c.r - 10);
            addLabel(page, tp.x, tp.y, c.tag);
        }
    }

    // 4) 推进/分支创建/merge 线（弧线已在提取层采样为折线）
    for (const a of git.arrows) {
        if (a.waypoints.length < 2) continue;
        const pts = a.waypoints.map((wp) => transform.point(wp.x, wp.y));
        const color = colorOf(a.branchIndex);
        const pattern = (a.kind === 'branch') ? 2 : 1;
        addPolyline(page, pts, color, pattern, 2.0);
    }
}
