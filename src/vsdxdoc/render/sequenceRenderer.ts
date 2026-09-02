// mmd2vsdx - vsdxdoc/render：sequenceRenderer（时序图专用渲染）
//
// C++ render/sequencerenderer.cpp（442 行）平移（坑位 ⑧-8.2）。
// 语义照抄：
//   - 生命线 Group 母版实例只写 PinX/PinY（头/虚线长由母版提供；
//     masterless 时无 Master/骨架但结构保留）；
//   - Connection 点沿生命线分布（IX=0..38，MM cap 表），位置=max(cap,ctrlY)；
//     就近匹配用 MM 距离（ctrlY 固定 -152.4MM = 6"）；
//   - 激活条只写 PinX/PinY+Begin/End，绝不写 Angle（写 0 会变宽条）；
//     两端 PAR 到 lifeline Connection 点、ToPart=102；
//   - 消息：实线 Message.21/虚线 Return Message.22；条高统一正框架
//     barH=0.19685039370079（Word 嵌入去负实测修复，勿"还原"负值）；
//     BegTrigger/EndTrigger _XFTRIGGER(EventXFMod)、TxtPin SETATREF 零偏移、
//     TxtHeight/TxtLocPinY GUARD 钉死；Geometry1 线段 + Geometry2 箭头
//     （公式引用）+ Del 占位行；ToPart=100；
//   - 循环片段：自建纯几何矩形框（无填充）+ 左上角标签（stencil 无母版）。

import type { PageModel } from '../docmodel/model.js';
import type { Diagram } from '../../core/types.js';
import type { CoordinateTransform } from '../translate/coordinateTransform.js';
import {
    appendCellNumber,
    appendCellString,
    appendNamedRow,
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

const kMmPerInch = 25.4;

/** lifeline Connection 点 cap（MM，相对头中心），IX=0..38（坑位 ⑧-8.2 表照抄）。 */
const kLifelineConnCapMM = [
    -6, -12, -18, -25, -30, -40, -45, -50, -57, -65, -70, -75, -83, -90,
    -95, -100, -108, -115, -121, -125, -133, -140, -146, -150, -159, -165,
    -171, -178, -184, -190, -197, -203, -210, -216, -222, -229, -235, -241,
    -248,
];
const kLifelineConnCount = 39;

interface LifelineInfo {
    id: number;
    pinY: number; // 头中心页面 Y
    ctrlYMM: number; // Controls.Row_1.Y（MM，负）
}

/** 页面 Y → lifeline 最近 Connection 点 IX。 */
function nearestLifelineConn(pageY: number, line: LifelineInfo): number {
    const localMM = (pageY - line.pinY) * kMmPerInch;
    let best = 0;
    let bestD = Number.MAX_VALUE;
    for (let i = 0; i < kLifelineConnCount; i++) {
        const y = Math.max(kLifelineConnCapMM[i]!, line.ctrlYMM);
        const d = Math.abs(y - localMM);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    return best;
}

function ensureConnects(page: PageModel): XmlNode | null {
    if (!page.connectsNode) {
        if (!page.root) throw new Error('[render] page root is not initialized');
        page.connectsNode = appendChild(page.root, makeElement('Connects'));
    }
    return page.connectsNode;
}

/** 生命线：Group 母版实例（只写 PinX/PinY）+ MasterShape 骨架。 */
function addLifeline(page: PageModel, kind: string, label: string,
                     x: number, y: number, transform: CoordinateTransform,
                     masters: MasterClient): LifelineInfo {
    const masterName = kind === 'actor' ? 'Actor lifeline' : 'Object lifeline';
    const id = page.nextShapeId++;
    const shape = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(shape, 'ID', String(id));
    setAttribute(shape, 'Type', 'Group');
    const master = masters.masterIdFor(masterName);
    if (master !== 0) {
        setAttribute(shape, 'Master', String(master));
        setAttribute(shape, 'NameU', masterName);
        setAttribute(shape, 'Name', masterName);
    }
    const c = transform.point(x, y);
    setNumericCell(shape, 'PinX', c.x, 'IN');
    setNumericCell(shape, 'PinY', c.y, 'IN');

    const childIds = masters.masterChildShapeIds(masterName);
    if (childIds.length > 0) {
        const shapesNode = appendChild(shape, makeElement('Shapes'));
        for (const childId of childIds) {
            const subId = page.nextShapeId++;
            const sub = appendChild(shapesNode, makeElement('Shape'));
            setAttribute(sub, 'ID', String(subId));
            setAttribute(sub, 'Type', 'Shape');
            setAttribute(sub, 'MasterShape', String(childId));
        }
    }
    replaceShapeText(shape, label);
    return { id, pinY: c.y, ctrlYMM: -152.4 }; // -6" * 25.4
}

/** 激活条：Activation 母版 1-D 竖条，两端粘 lifeline Connection 点（禁写 Angle）。 */
function addActivation(page: PageModel, actorId: string, x: number, yTop: number,
                       yBottom: number, line: LifelineInfo,
                       transform: CoordinateTransform, masters: MasterClient): void {
    const id = page.nextShapeId++;
    const shape = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(shape, 'ID', String(id));
    setAttribute(shape, 'Type', 'Shape');
    const master = masters.masterIdFor('Activation');
    if (master !== 0) {
        setAttribute(shape, 'Master', String(master));
        setAttribute(shape, 'NameU', 'Activation');
        setAttribute(shape, 'Name', 'Activation');
    }
    const top = transform.point(x, yTop);
    const bot = transform.point(x, yBottom);
    const botConn = nearestLifelineConn(bot.y, line);
    const topConn = nearestLifelineConn(top.y, line);
    const srcSheet = String(line.id);
    const connRef = (index: number) =>
        'PAR(PNT(Sheet.' + srcSheet + '!Connections.X' + index +
        ',Sheet.' + srcSheet + '!Connections.Y' + index + '))';

    setNumericCell(shape, 'PinX', top.x, 'IN', 'Inh');
    setNumericCell(shape, 'PinY', (top.y + bot.y) / 2, 'IN', 'Inh');
    setNumericCell(shape, 'BeginX', top.x, 'IN', connRef(botConn));
    setNumericCell(shape, 'BeginY', bot.y, 'IN', connRef(botConn));
    setNumericCell(shape, 'EndX', top.x, 'IN', connRef(topConn));
    setNumericCell(shape, 'EndY', top.y, 'IN', connRef(topConn));
    replaceShapeText(shape, '');

    const connects = ensureConnects(page);
    if (connects) {
        const beginConnect = appendChild(connects, makeElement('Connect'));
        setAttribute(beginConnect, 'FromSheet', String(id));
        setAttribute(beginConnect, 'FromCell', 'BeginX');
        setAttribute(beginConnect, 'FromPart', '9');
        setAttribute(beginConnect, 'ToSheet', srcSheet);
        setAttribute(beginConnect, 'ToCell', 'Connections.X' + botConn);
        setAttribute(beginConnect, 'ToPart', '102');
        const endConnect = appendChild(connects, makeElement('Connect'));
        setAttribute(endConnect, 'FromSheet', String(id));
        setAttribute(endConnect, 'FromCell', 'EndX');
        setAttribute(endConnect, 'FromPart', '12');
        setAttribute(endConnect, 'ToSheet', srcSheet);
        setAttribute(endConnect, 'ToCell', 'Connections.X' + topConn);
        setAttribute(endConnect, 'ToPart', '102');
    }
    void actorId;
}

/** 消息：Message.21/Return Message.22，两端粘 lifeline Connection 点。 */
function addMessage(page: PageModel, from: string, to: string, label: string,
                    dashed: boolean, waypoints: Array<{ x: number; y: number }>,
                    lifelines: Map<string, LifelineInfo>,
                    transform: CoordinateTransform, masters: MasterClient): void {
    if (waypoints.length < 2) return;
    const fromLine = lifelines.get(from);
    const toLine = lifelines.get(to);
    if (!fromLine || !toLine) return;

    const masterName = dashed ? 'Return Message.22' : 'Message.21';
    const begin = transform.point(waypoints[0]!.x, waypoints[0]!.y);
    const end = transform.point(waypoints[waypoints.length - 1]!.x, waypoints[waypoints.length - 1]!.y);
    const srcConn = nearestLifelineConn(begin.y, fromLine);
    const dstConn = nearestLifelineConn(end.y, toLine);
    const srcSheet = String(fromLine.id);
    const dstSheet = String(toLine.id);
    const srcRef = 'PAR(PNT(Sheet.' + srcSheet + '!Connections.X' + srcConn +
        ',Sheet.' + srcSheet + '!Connections.Y' + srcConn + '))';
    const dstRef = 'PAR(PNT(Sheet.' + dstSheet + '!Connections.X' + dstConn +
        ',Sheet.' + dstSheet + '!Connections.Y' + dstConn + '))';

    const id = page.nextShapeId++;
    const shape = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(shape, 'ID', String(id));
    setAttribute(shape, 'Type', 'Shape');
    const master = masters.masterIdFor(masterName);
    if (master !== 0) {
        setAttribute(shape, 'Master', String(master));
        setAttribute(shape, 'NameU', masterName);
        setAttribute(shape, 'Name', masterName);
    }

    const w = end.x - begin.x;
    const midX = (begin.x + end.x) / 2;
    const midY = (begin.y + end.y) / 2;
    const locX = w / 2;
    // 消息条高统一取正（Word 嵌入去负实测修复，勿"还原"）
    const barH = 0.19685039370079;

    setNumericCell(shape, 'PinX', midX, 'IN', 'Inh');
    setNumericCell(shape, 'PinY', midY, 'IN', 'Inh');
    setNumericCell(shape, 'Width', w, 'IN', 'GUARD(EndX-BeginX)');
    setNumericCell(shape, 'Height', barH, 'IN', 'GUARD(0.19685039370079DL)');
    setNumericCell(shape, 'LocPinX', locX, 'IN', 'Inh');
    setNumericCell(shape, 'LocPinY', barH / 2, 'IN', 'Inh');
    setNumericCell(shape, 'BeginX', begin.x, 'IN', srcRef);
    setNumericCell(shape, 'BeginY', begin.y, 'IN', srcRef);
    setNumericCell(shape, 'EndX', end.x, 'IN', dstRef);
    setNumericCell(shape, 'EndY', end.y, 'IN', dstRef);
    setNumericCell(shape, 'LayerMember', 0);
    setNumericCell(shape, 'BegTrigger', 2, undefined,
        '_XFTRIGGER(Sheet.' + srcSheet + '!EventXFMod)');
    setNumericCell(shape, 'EndTrigger', 2, undefined,
        '_XFTRIGGER(Sheet.' + dstSheet + '!EventXFMod)');
    const txtPinY = Math.abs(barH) / 2;
    setNumericCell(shape, 'TxtPinX', locX, 'IN', 'SETATREF(Controls.TextPosition)');
    setNumericCell(shape, 'TxtPinY', txtPinY, 'IN', 'SETATREF(Controls.TextPosition.Y)');
    setNumericCell(shape, 'TxtHeight', 0.244, 'IN', 'GUARD(0.244)');
    setNumericCell(shape, 'TxtLocPinY', 0.122, 'IN', 'GUARD(0.122)');
    setNumericCell(shape, 'Angle', 0, 'DEG');
    setNumericCell(shape, 'LineWeight', 0.5 / 72.0, 'PT');
    setStringCell(shape, 'LineColor', '#000000');
    setNumericCell(shape, 'LinePattern', dashed ? 2 : 1);

    // 显式箭头几何：Geometry1 线段 + Geometry2 箭头（公式引用）+ Del 占位
    const barY = barH / 2;
    const geo1 = appendSection(shape, 'Geometry', 0);
    const m1 = appendRow(geo1, 'MoveTo', 1);
    appendCellNumber(m1, 'Y', barY);
    const l2 = appendRow(geo1, 'LineTo', 2);
    appendCellNumber(l2, 'X', w);
    appendCellNumber(l2, 'Y', barY);
    const delG = appendRow(geo1, 'LineTo', 3);
    setAttribute(delG, 'Del', '1');
    const geo2 = appendSection(shape, 'Geometry', 1);
    const a1 = appendRow(geo2, 'MoveTo', 1);
    appendCellNumber(a1, 'Y', barY, undefined, 'Geometry1.Y1');
    const a2 = appendRow(geo2, 'LineTo', 2);
    appendCellNumber(a2, 'X', w + 0.25, undefined, 'Geometry1.X2+0.25IN');
    appendCellNumber(a2, 'Y', barY, undefined, 'Geometry1.Y1');
    const a3 = appendRow(geo2, 'LineTo', 3);
    appendCellNumber(a3, 'X', w + 0.25, undefined, 'Geometry1.X2+0.25IN');
    appendCellNumber(a3, 'Y', barY, undefined, 'Geometry1.Y2');
    const a4 = appendRow(geo2, 'LineTo', 4);
    appendCellNumber(a4, 'X', w, undefined, 'Geometry1.X2');
    appendCellNumber(a4, 'Y', barY, undefined, 'Geometry1.Y2');

    const ctl = appendSection(shape, 'Control');
    const ctlRow = appendNamedRow(ctl, 'TextPosition');
    appendCellNumber(ctlRow, 'X', locX, 'IN', 'Width*0.5');
    appendCellNumber(ctlRow, 'Y', txtPinY, 'IN', 'ABS(Height)*0.5');
    appendCellNumber(ctlRow, 'XDyn', locX, 'IN', 'Inh');
    appendCellNumber(ctlRow, 'YDyn', txtPinY, 'IN', 'Inh');
    appendCellNumber(ctlRow, 'XCon', 0, undefined, 'Inh');

    const character = appendSection(shape, 'Character');
    const characterRow = appendRow(character, null, 0);
    appendCellString(characterRow, 'Color', '#000000');
    appendCellNumber(characterRow, 'Size', 10.0 / 72.0, 'PT');
    replaceShapeText(shape, label);

    const connects = ensureConnects(page);
    if (connects) {
        const beginConnect = appendChild(connects, makeElement('Connect'));
        setAttribute(beginConnect, 'FromSheet', String(id));
        setAttribute(beginConnect, 'FromCell', 'BeginX');
        setAttribute(beginConnect, 'FromPart', '9');
        setAttribute(beginConnect, 'ToSheet', srcSheet);
        setAttribute(beginConnect, 'ToCell', 'Connections.X' + srcConn);
        setAttribute(beginConnect, 'ToPart', '100');
        const endConnect = appendChild(connects, makeElement('Connect'));
        setAttribute(endConnect, 'FromSheet', String(id));
        setAttribute(endConnect, 'FromCell', 'EndX');
        setAttribute(endConnect, 'FromPart', '12');
        setAttribute(endConnect, 'ToSheet', dstSheet);
        setAttribute(endConnect, 'ToCell', 'Connections.X' + dstConn);
        setAttribute(endConnect, 'ToPart', '100');
    }
}

/** 循环片段：自建直角矩形框 + 左上角类型标签。 */
function addFragment(page: PageModel, kind: string, x: number, y: number,
                     width: number, height: number,
                     transform: CoordinateTransform): void {
    const tl = transform.point(x, y);
    const w = Math.max(transform.length(width), 0.1);
    const h = Math.max(transform.length(height), 0.1);
    const cx = tl.x + w / 2;
    const cy = tl.y - h / 2;

    const boxId = page.nextShapeId++;
    const box = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(box, 'ID', String(boxId));
    setAttribute(box, 'Type', 'Shape');
    setNumericCell(box, 'PinX', cx, 'IN');
    setNumericCell(box, 'PinY', cy, 'IN');
    setNumericCell(box, 'Width', w, 'IN');
    setNumericCell(box, 'Height', h, 'IN');
    setNumericCell(box, 'LocPinX', w / 2, 'IN');
    setNumericCell(box, 'LocPinY', h / 2, 'IN');
    setNumericCell(box, 'Angle', 0, 'DEG');
    setNumericCell(box, 'LineWeight', 0.5 / 72.0, 'PT');
    setStringCell(box, 'LineColor', '#000000');
    setNumericCell(box, 'LinePattern', 1);
    setNumericCell(box, 'FillPattern', 0);
    const geo = appendSection(box, 'Geometry', 0);
    appendCellNumber(geo, 'NoFill', 1);
    const m = appendRow(geo, 'MoveTo', 1);
    appendCellNumber(m, 'X', 0, 'IN');
    appendCellNumber(m, 'Y', 0, 'IN');
    const l1 = appendRow(geo, 'LineTo', 2);
    appendCellNumber(l1, 'X', w, 'IN');
    appendCellNumber(l1, 'Y', 0, 'IN');
    const l2 = appendRow(geo, 'LineTo', 3);
    appendCellNumber(l2, 'X', w, 'IN');
    appendCellNumber(l2, 'Y', h, 'IN');
    const l3 = appendRow(geo, 'LineTo', 4);
    appendCellNumber(l3, 'X', 0, 'IN');
    appendCellNumber(l3, 'Y', h, 'IN');
    const l4 = appendRow(geo, 'LineTo', 5);
    appendCellNumber(l4, 'X', 0, 'IN');
    appendCellNumber(l4, 'Y', 0, 'IN');
    replaceShapeText(box, '');

    const label = kind.length === 0 ? 'loop' : kind;
    if (label.length > 0) {
        const labelId = page.nextShapeId++;
        const labelShape = appendChild(pageShapes(page), makeElement('Shape'));
        setAttribute(labelShape, 'ID', String(labelId));
        setAttribute(labelShape, 'Type', 'Shape');
        setNumericCell(labelShape, 'PinX', tl.x + 0.3, 'IN');
        setNumericCell(labelShape, 'PinY', tl.y - 0.1, 'IN');
        setNumericCell(labelShape, 'Width', 0.6, 'IN');
        setNumericCell(labelShape, 'Height', 0.2, 'IN');
        setNumericCell(labelShape, 'LocPinX', 0.3, 'IN');
        setNumericCell(labelShape, 'LocPinY', 0.1, 'IN');
        setNumericCell(labelShape, 'Angle', 0, 'DEG');
        setNumericCell(labelShape, 'LinePattern', 0);
        setNumericCell(labelShape, 'FillPattern', 0);
        setNumericCell(labelShape, 'ShapeFixedCode', 1);
        const character = appendSection(labelShape, 'Character');
        const cr = appendRow(character, null, 0);
        appendCellString(cr, 'Color', '#333333');
        appendCellNumber(cr, 'Size', 10.0 / 72.0, 'PT');
        const para = appendSection(labelShape, 'Paragraph');
        const pr = appendRow(para, null, 0);
        appendCellNumber(pr, 'HorzAlign', 1);
        replaceShapeText(labelShape, label);
    }
}

/** 时序图渲染（空节点直接返回；顺序：生命线→激活条→消息→片段=z 序）。 */
export function renderSequence(page: PageModel, diagram: Diagram,
                               transform: CoordinateTransform,
                               masters: MasterClient = masterlessClient): void {
    if (diagram.nodes.length === 0) return;

    const lifelines = new Map<string, LifelineInfo>();
    for (const node of diagram.nodes) {
        lifelines.set(node.id, addLifeline(page, node.lifelineKind, node.label,
            node.x, node.y, transform, masters));
    }
    for (const act of diagram.sequence.activations) {
        const line = lifelines.get(act.actorId);
        if (!line) continue;
        addActivation(page, act.actorId, act.x, act.yTop, act.yBottom, line,
            transform, masters);
    }
    for (const edge of diagram.edges) {
        addMessage(page, edge.from, edge.to, edge.label, edge.style === 'dotted',
            edge.waypoints, lifelines, transform, masters);
    }
    for (const frag of diagram.sequence.fragments) {
        addFragment(page, frag.kind, frag.x, frag.y, frag.width, frag.height, transform);
    }
}
