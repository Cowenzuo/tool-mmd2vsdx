// mmd2vsdx - vsdxdoc/render：renderer（渲染策略族：模型 → 树）
//
// C++ render/renderer.cpp（1,171 行）+ render_managed.cpp 平移（坑位 ⑥⑦）。
// 结构：模块函数 + 工厂分派（dividers→类、ER 实体→ER、其余→通用）；
// 节点经参数传入（去指针）；母版查询经 MasterClient 注入——M2 用
// masterlessClient（masterId=0：清 Master 走本地内容），M5 接入真实
// MasterLibrary（pack/mergeStyles/applyInstanceOverrides/masterChildShapeIds）。
// 顺序即协议：cell 写入顺序与 C++ 一致（产物 diff 前提）。

import type { XmlNode } from '../../xml/xmlNode.js';
import { appendChild, makeElement, removeAttribute, setAttribute } from '../../xml/xmlNode.js';
import {
    appendCellNumber,
    appendCellString,
    appendNamedRow,
    appendRow,
    appendSection,
    cppFixed6,
    number,
    replaceShapeText,
    setNumericCell,
    setStringCell,
} from '../../xml/xmlBuilder.js';
import { validateShapeBounds, validateStyle } from '../docmodel/validator.js';
import type { PageModel, ShapeId, ShapeModel, ConnectorModel } from '../docmodel/model.js';
import type { DiagramType, Point } from '../../core/types.js';
import { arrowValue, bindConnector, setConnect } from './connectorBinder.js';
import { resolveDiagramType } from '../masters/masterClient.js';
import type { MasterClient } from '../masters/masterClient.js';

export type { ConnectorModel, ShapeModel };

// ═══════════════════════════════════════════════════════
// 通用渲染器（Flowchart 分支）
// ═══════════════════════════════════════════════════════

function clearNodeChildren(node: XmlNode): void {
    node.children = [];
}

/** 页面 <Shapes> 容器（addPage 后必存在；防空引用；专用渲染器共用）。 */
export function pageShapes(page: PageModel): XmlNode {
    if (!page.shapesNode) throw new Error('[render] page Shapes node is not initialized');
    return page.shapesNode;
}

function renderFlowchartShape(page: PageModel, shape: ShapeModel, node: XmlNode,
                              masters: MasterClient, diagramType: DiagramType): void {
    validateStyle(shape.style);
    if (shape.kind === 'circle') {
        const diameter = Math.max(shape.width, shape.height);
        shape.width = diameter;
        shape.height = diameter;
    }
    // 渲染可重入：先清后写（坑位 ⑥-6.2）
    clearNodeChildren(node);

    // Phase 12：母版实例引用；M2 masterless → 清除 Master 走本地（⑥-6.3）
    const masterName = masters.masterNameForShape(diagramType, shape.kind);
    const masterId = masters.masterIdFor(masterName);
    if (masterId !== 0) {
        setAttribute(node, 'Master', String(masterId));
        // Group 骨架母版多实例：显式页面级骨架子形状（⑥-6.4）
        const childIds = masters.masterChildShapeIds(masterName);
        if (childIds.length > 0) {
            const shapesNode = appendChild(node, makeElement('Shapes'));
            for (const childId of childIds) {
                const id = page.nextShapeId++;
                const sub = appendChild(shapesNode, makeElement('Shape'));
                setAttribute(sub, 'ID', String(id));
                setAttribute(sub, 'Type', 'Shape');
                setAttribute(sub, 'MasterShape', String(childId));
            }
        }
    } else {
        removeAttribute(node, 'Master');
    }

    setNumericCell(node, 'PinX', shape.x, 'IN');
    setNumericCell(node, 'PinY', shape.y, 'IN');
    setNumericCell(node, 'Width', shape.width, 'IN');
    setNumericCell(node, 'Height', shape.height, 'IN');
    setNumericCell(node, 'LocPinX', shape.width / 2, 'IN', 'Width*0.5');
    setNumericCell(node, 'LocPinY', shape.height / 2, 'IN', 'Height*0.5');
    setNumericCell(node, 'Angle', 0, 'DEG');
    setNumericCell(node, 'FlipX', 0);
    setNumericCell(node, 'FlipY', 0);

    // 实例样式覆盖
    setNumericCell(node, 'LineWeight', shape.style.lineWidthPoints / 72.0, 'PT');
    setStringCell(node, 'LineColor', shape.style.lineColor);
    setNumericCell(node, 'LinePattern', 1);
    setStringCell(node, 'FillForegnd', shape.style.fillColor);
    setStringCell(node, 'FillBkgnd', shape.style.fillColor);
    setNumericCell(node, 'FillPattern', 1);

    const character = appendSection(node, 'Character');
    const characterRow = appendRow(character, null, 0);
    appendCellString(characterRow, 'Color', shape.style.textColor);
    appendCellNumber(characterRow, 'Size', shape.style.fontSizePoints / 72.0, 'PT');

    const paragraph = appendSection(node, 'Paragraph');
    const paragraphRow = appendRow(paragraph, null, 0);
    appendCellNumber(paragraphRow, 'HorzAlign', 1);

    const user = appendSection(node, 'User');
    const idRow = appendNamedRow(user, 'MermaidId');
    setStringCell(idRow, 'Value', shape.logicalId, 'STR');

    // 母版实例固化（OLE 快速打开路径兼容；M5 applyInstanceOverrides 接入）
    if (masterId !== 0) {
        masters.applyInstanceOverrides(node, masterName, shape.width, shape.height);
    }
    replaceShapeText(node, shape.text);
}

// ═══════════════════════════════════════════════════════
// UML 类图渲染器（Class Group + 成员/分隔行）
// ═══════════════════════════════════════════════════════

function renderClassShape(page: PageModel, shape: ShapeModel, node: XmlNode,
                          masters: MasterClient): void {
    validateShapeBounds(shape.x, shape.y, shape.width, shape.height);
    validateStyle(shape.style);
    clearNodeChildren(node);

    const masterId = masters.masterIdFor('Class');
    if (masterId !== 0) setAttribute(node, 'Master', String(masterId));
    setAttribute(node, 'Type', 'Group');
    // NameU/Name 保持 Class（裸 Group 会被 Visio 改名，⑥-6.7）
    setAttribute(node, 'NameU', 'Class');
    setAttribute(node, 'Name', 'Class');

    const w = shape.width;

    // 文本分行与 stereotype（«interface» 或 <<）识别
    const lines = shape.text.split('\n');
    let stereotype = '';
    let memberStart = 0;
    if (lines.length > 0 &&
        (lines[0]!.includes('«') || lines[0]!.includes('<<'))) {
        stereotype = lines[0]!;
        memberStart = 1;
    }
    const className = lines.length > memberStart
        ? lines[memberStart]!
        : (lines.length === 0 ? shape.text : lines[0]!);
    const headerText = stereotype.length === 0 ? className : stereotype + '\n' + className;
    const attributes: string[] = [];
    const operations: string[] = [];
    for (let index = memberStart + 1; index < lines.length; index++) {
        if (lines[index]!.includes('(')) operations.push(lines[index]!);
        else attributes.push(lines[index]!);
    }

    // 行高常量必须匹配 Visio 原生排版（实测，⑥-6.7）：不得沿用 mermaid 高
    const hdr = stereotype.length === 0 ? 0.436 : 0.62;
    const rowH = 0.167;
    const sepH = 0.039;
    const nAttr = attributes.length;
    const nOp = operations.length;
    const nSep = (!attributes.length && operations.length) ? 0
        : (attributes.length > 0 && operations.length > 0) ? 1 : 0;
    const nItems = nAttr + nOp + nSep;
    let h = shape.height;
    if (nItems > 0) {
        h = hdr + (nAttr + nOp) * rowH + nSep * sepH + 0.08;
    }
    const hw = w / 2;
    const hh = h / 2;

    setNumericCell(node, 'PinX', shape.x, 'IN');
    setNumericCell(node, 'PinY', shape.y, 'IN');
    setNumericCell(node, 'Width', w, 'IN');
    setNumericCell(node, 'Height', h, 'IN');
    // LocPin 钉死左下角 (0,0)，不写 F（⑥-6.7；F='Inh' 会把 Group 平移到中心）
    setNumericCell(node, 'LocPinX', 0);
    setNumericCell(node, 'LocPinY', 0);
    setNumericCell(node, 'TxtPinX', hw, 'IN', 'Inh');
    setNumericCell(node, 'TxtPinY', h * 0.80, 'IN', 'Inh');
    setNumericCell(node, 'TxtWidth', w, 'IN', 'Inh');
    setNumericCell(node, 'TxtHeight', hdr, 'IN');
    setNumericCell(node, 'TxtLocPinX', hw, 'IN', 'Inh');
    setNumericCell(node, 'TxtLocPinY', hdr / 2, 'IN');

    const user = appendSection(node, 'User');
    const widthMin = appendNamedRow(user, 'WidthMin');
    appendCellNumber(widthMin, 'Value', 0.6737, 'DL');
    const entityName = appendNamedRow(user, 'EntityName');
    setStringCell(entityName, 'Value', headerText, 'STR');
    const headerHeight = appendNamedRow(user, 'HdrHgt');
    appendCellNumber(headerHeight, 'Value', hdr, 'DL');

    const control = appendSection(node, 'Control');
    const row1 = appendNamedRow(control, 'Row_1');
    const boundFormula =
        'BOUND(' + cppFixed6(w) +
        'DL,0,User.Test,25MM,2540MM,NOT(User.Test),User.WidthMin+' +
        'User.msvSDContainerMargin*2,2540MM)';
    appendCellNumber(row1, 'X', w, 'DL', boundFormula);
    appendCellNumber(row1, 'Y', hh, 'IN', 'Inh');
    appendCellNumber(row1, 'XDyn', w, 'DL', 'Inh');
    appendCellNumber(row1, 'YDyn', hh, 'IN', 'Inh');

    const conn = appendSection(node, 'Connection');
    const c0 = appendRow(conn, 'Connection', 0);
    appendCellNumber(c0, 'X', 0, 'IN', 'Inh');
    appendCellNumber(c0, 'Y', hh, 'IN', 'Inh');
    const c1 = appendRow(conn, 'Connection', 1);
    appendCellNumber(c1, 'X', w, 'IN', 'Inh');
    appendCellNumber(c1, 'Y', hh, 'IN', 'Inh');
    const c2 = appendRow(conn, 'Connection', 2);
    appendCellNumber(c2, 'X', hw, 'IN', 'Inh');
    appendCellNumber(c2, 'Y', 0, 'IN', 'Inh');
    const c3 = appendRow(conn, 'Connection', 3);
    appendCellNumber(c3, 'X', hw, 'IN', 'Inh');
    appendCellNumber(c3, 'Y', h, 'IN', 'Inh');

    replaceShapeText(node, headerText);

    const groupId = node.attrs.find((a) => a.name === 'ID')?.value ?? '';

    // MasterShape 子形状（6 外框/7 表头/8·9 占位）
    const shapesNode = appendChild(node, makeElement('Shapes'));

    {
        const id = page.nextShapeId++;
        const sub = appendChild(shapesNode, makeElement('Shape'));
        setAttribute(sub, 'ID', String(id));
        setAttribute(sub, 'Type', 'Shape');
        setAttribute(sub, 'MasterShape', '6');
        setNumericCell(sub, 'PinX', hw, 'IN', 'Inh');
        setNumericCell(sub, 'PinY', hh, 'IN', 'Inh');
        setNumericCell(sub, 'Width', w, 'IN', 'Inh');
        setNumericCell(sub, 'Height', h, 'IN', 'Inh');
        setNumericCell(sub, 'LocPinX', hw, 'IN', 'Inh');
        setNumericCell(sub, 'LocPinY', hh, 'IN', 'Inh');
        const u6 = appendSection(sub, 'User');
        const h6 = appendNamedRow(u6, 'HdrHgt');
        appendCellNumber(h6, 'Value', hdr, 'DL');
        const geo = appendSection(sub, 'Geometry', 0);
        const gym = h - hdr;
        const g1 = appendRow(geo, 'MoveTo', 1);
        appendCellNumber(g1, 'Y', 0, 'IN', 'Inh');
        const g2 = appendRow(geo, 'LineTo', 2);
        appendCellNumber(g2, 'X', w, 'IN', 'Inh');
        appendCellNumber(g2, 'Y', 0, 'IN', 'Inh');
        const g3 = appendRow(geo, 'LineTo', 3);
        appendCellNumber(g3, 'X', w, 'IN', 'Inh');
        appendCellNumber(g3, 'Y', gym, 'IN', 'Inh');
        const g4 = appendRow(geo, 'LineTo', 4);
        appendCellNumber(g4, 'Y', gym, 'IN', 'Inh');
        const g5 = appendRow(geo, 'EllipticalArcTo', 5);
        appendCellNumber(g5, 'Y', gym, 'IN', 'Inh');
        appendCellNumber(g5, 'B', gym, 'DL', 'Inh');
        const g6 = appendRow(geo, 'EllipticalArcTo', 6);
        appendCellNumber(g6, 'Y', gym, 'IN', 'Inh');
        appendCellNumber(g6, 'B', gym, 'DL', 'Inh');
        const g7 = appendRow(geo, 'LineTo', 7);
        appendCellNumber(g7, 'Y', 0, 'IN', 'Inh');
    }
    {
        const id = page.nextShapeId++;
        const sub = appendChild(shapesNode, makeElement('Shape'));
        setAttribute(sub, 'ID', String(id));
        setAttribute(sub, 'Type', 'Shape');
        setAttribute(sub, 'MasterShape', '7');
        setNumericCell(sub, 'PinX', hw, 'IN', 'Inh');
        setNumericCell(sub, 'PinY', h, 'IN', 'Inh');
        setNumericCell(sub, 'Width', w, 'IN', 'Inh');
        setNumericCell(sub, 'Height', hdr, 'IN');
        setNumericCell(sub, 'LocPinX', hw, 'IN', 'Inh');
        setNumericCell(sub, 'LocPinY', hdr, 'IN');
        const u7 = appendSection(sub, 'User');
        const usable = appendNamedRow(u7, 'UsableHgt');
        appendCellNumber(usable, 'Value', hdr, 'DL');
        const role = appendNamedRow(u7, 'UmlRole');
        setStringCell(role, 'Value', headerText, 'STR');
        const geo = appendSection(sub, 'Geometry', 0);
        const h1 = appendRow(geo, 'MoveTo', 1);
        appendCellNumber(h1, 'X', 0, 'IN', 'Inh');
        const h4 = appendRow(geo, 'LineTo', 4);
        appendCellNumber(h4, 'X', w, 'IN', 'Inh');
        const h5 = appendRow(geo, 'LineTo', 5);
        appendCellNumber(h5, 'X', w, 'IN', 'Inh');
        appendCellNumber(h5, 'Y', hdr, 'IN', 'Inh');
        const h6 = appendRow(geo, 'LineTo', 6);
        appendCellNumber(h6, 'X', 0, 'IN', 'Inh');
        appendCellNumber(h6, 'Y', hdr, 'IN', 'Inh');
        const h7 = appendRow(geo, 'LineTo', 7);
        appendCellNumber(h7, 'X', 0, 'IN', 'Inh');
    }
    {
        const id8 = page.nextShapeId++;
        const s8 = appendChild(shapesNode, makeElement('Shape'));
        setAttribute(s8, 'ID', String(id8));
        setAttribute(s8, 'Type', 'Shape');
        setAttribute(s8, 'MasterShape', '8');
        setNumericCell(s8, 'PinX', hw, 'IN', 'Inh');
        setNumericCell(s8, 'PinY', h, 'IN', 'Inh');
        setNumericCell(s8, 'Width', w, 'IN', 'Inh');
        setNumericCell(s8, 'LocPinX', hw, 'IN', 'Inh');

        const id9 = page.nextShapeId++;
        const s9 = appendChild(shapesNode, makeElement('Shape'));
        setAttribute(s9, 'ID', String(id9));
        setAttribute(s9, 'Type', 'Shape');
        setAttribute(s9, 'MasterShape', '9');
        setNumericCell(s9, 'PinX', w - 0.118, 'MM', 'Inh');
        setNumericCell(s9, 'PinY', h, 'IN', 'Inh');
    }

    // 成员/分隔行（页面顶层形状 + 双向 DEPENDSON，⑥-6.7）
    const memberId = masters.masterIdFor('Member');
    const separatorId = masters.masterIdFor('Separator');
    const memberIds: ShapeId[] = [];
    if (groupId.length > 0 && memberId !== 0) {
        const widthFormula =
            'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,' +
            'User.UserWidth)';
        const relToGroup =
            'SUM(DEPENDSON(5,Sheet.' + groupId + '!SheetRef()))';
        let memberY = shape.y + h - hdr - rowH / 2; // 表头之下

        const addMember = (text: string, y: number) => {
            const memberW = w - 2 * 0.03937;
            const id = page.nextShapeId++;
            const m = appendChild(pageShapes(page), makeElement('Shape'));
            setAttribute(m, 'ID', String(id));
            setAttribute(m, 'Type', 'Shape');
            setAttribute(m, 'Master', String(memberId));
            setNumericCell(m, 'PinX', shape.x + hw, 'IN');
            setNumericCell(m, 'PinY', y, 'IN');
            setNumericCell(m, 'Width', memberW, 'IN', widthFormula);
            setNumericCell(m, 'Height', rowH, 'IN');
            setNumericCell(m, 'LocPinX', memberW / 2, 'IN', 'Inh');
            setNumericCell(m, 'LocPinY', rowH / 2, 'IN');
            setNumericCell(m, 'Relationships', 0, undefined, relToGroup);
            setNumericCell(m, 'ShapeFixedCode', 1);
            setNumericCell(m, 'TxtPinY', rowH / 2, 'IN');
            setNumericCell(m, 'TxtWidth', memberW, 'IN', 'Inh');
            setNumericCell(m, 'TxtHeight', rowH, 'IN');
            setNumericCell(m, 'TxtLocPinY', rowH / 2, 'IN');
            const u = appendSection(m, 'User');
            const nameRow = appendNamedRow(u, 'MemberName');
            setStringCell(nameRow, 'Value', text, 'STR');
            const marginRow = appendNamedRow(u, 'ContainerMargin');
            appendCellNumber(marginRow, 'Value', 0.03937, 'MM',
                'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)');
            const wmin = appendNamedRow(u, 'WidthMin');
            appendCellNumber(wmin, 'Value', 0, 'DL',
                'IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN<TEXTWIDTH(TheText),' +
                'SETF(GetRef(LISTSHEETREF()!User.WIDTHMIN),TEXTWIDTH(TheText)),0),0)');
            const bfc = appendNamedRow(u, 'BackFillColor');
            const bfcCell = appendChild(bfc, makeElement('Cell'));
            setAttribute(bfcCell, 'N', 'Value');
            setAttribute(bfcCell, 'V', '#f2f2f2');
            setAttribute(bfcCell, 'U', 'COLOR');
            setAttribute(bfcCell, 'F',
                'IFERROR(LISTSHEETREF()!User.BACKGRND,FillForegnd)');
            const blc = appendNamedRow(u, 'BackLineColor');
            appendCellNumber(blc, 'Value', 0, 'COLOR',
                'IFERROR(LISTSHEETREF()!User.BACKGRNDLINE,LineColor)');
            const isInst = appendNamedRow(u, 'IsInstance');
            appendCellNumber(isInst, 'Value', 1, 'BOOL', 'Inh');
            const geo = appendSection(m, 'Geometry', 0);
            appendCellNumber(geo, 'NoLine', 1, undefined, 'Inh');
            const gm1 = appendRow(geo, 'LineTo', 2);
            appendCellNumber(gm1, 'X', memberW, 'IN', 'Inh');
            const gm2 = appendRow(geo, 'LineTo', 3);
            appendCellNumber(gm2, 'X', memberW, 'IN', 'Inh');
            appendCellNumber(gm2, 'Y', rowH, 'IN', 'Inh');
            const gm3 = appendRow(geo, 'LineTo', 4);
            appendCellNumber(gm3, 'Y', rowH, 'IN', 'Inh');
            replaceShapeText(m, text);
            memberIds.push(id);
        };

        const addSeparator = (y: number) => {
            const memberW = w - 2 * 0.03937;
            const id = page.nextShapeId++;
            const s = appendChild(pageShapes(page), makeElement('Shape'));
            setAttribute(s, 'ID', String(id));
            setAttribute(s, 'Type', 'Shape');
            setAttribute(s, 'Master', String(separatorId));
            setNumericCell(s, 'PinX', shape.x + hw, 'IN');
            setNumericCell(s, 'PinY', y, 'IN');
            setNumericCell(s, 'Width', memberW, 'IN',
                'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,' +
                '48MM)');
            setNumericCell(s, 'LocPinX', memberW / 2, 'IN', 'Inh');
            setNumericCell(s, 'Relationships', 0, undefined, relToGroup);
            setNumericCell(s, 'ShapeFixedCode', 1);
            const u = appendSection(s, 'User');
            const marginRow = appendNamedRow(u, 'ContainerMargin');
            appendCellNumber(marginRow, 'Value', 0.03937, 'MM',
                'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)');
            const idx = appendNamedRow(u, 'ItemIndex');
            appendCellNumber(idx, 'Value', 2, undefined, 'Inh');
            const geo = appendSection(s, 'Geometry', 0);
            const g1 = appendRow(geo, 'LineTo', 2);
            appendCellNumber(g1, 'X', memberW, 'IN', 'Inh');
            memberIds.push(id);
        };

        for (let i = 0; i < attributes.length; i++) {
            addMember(attributes[i]!, memberY);
            const nextIsSep = (i + 1 === attributes.length) && nSep > 0;
            memberY -= nextIsSep ? (rowH + sepH) / 2 : rowH;
        }
        if (nSep > 0) {
            addSeparator(memberY);
            memberY -= (sepH + rowH) / 2;
        }
        for (let i = 0; i < operations.length; i++) {
            addMember(operations[i]!, memberY);
            memberY -= rowH;
        }
    }

    if (memberIds.length > 0) {
        let rel = 'SUM(DEPENDSON(2,';
        for (let i = 0; i < memberIds.length; i++) {
            rel += 'Sheet.' + memberIds[i] + '!SheetRef()';
            if (i + 1 < memberIds.length) rel += ',';
        }
        rel += '))';
        setNumericCell(node, 'Relationships', 0, undefined, rel);
    }
}

// ═══════════════════════════════════════════════════════
// ER 渲染器（Entity Group + 每属性一行）
// ═══════════════════════════════════════════════════════

function estimateTextWidth(s: string): number {
    let w = 0;
    for (const ch of s) {
        const code = ch.codePointAt(0)!;
        if (code >= 0x80) w += 0.16; // 中文等宽
        else if (ch === 'M' || ch === 'W' || ch === 'm' || ch === 'w') w += 0.11;
        else if (ch === ' ') w += 0.05;
        else if ('ilIjtf.,:|'.includes(ch)) w += 0.045;
        else if (ch >= 'A' && ch <= 'Z') w += 0.09;
        else if (ch >= '0' && ch <= '9') w += 0.065;
        else w += 0.075;
    }
    return w;
}

function renderERShape(page: PageModel, shape: ShapeModel, node: XmlNode,
                       masters: MasterClient): void {
    validateShapeBounds(shape.x, shape.y, shape.width, shape.height);
    validateStyle(shape.style);
    clearNodeChildren(node);

    const lines = shape.text.split('\n');
    const entityName = lines.length === 0 ? shape.text : lines[0]!;
    const attributes: string[] = [];
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]!.length > 0) attributes.push(lines[i]!);
    }
    if (entityName.length === 0) {
        // 与 C++ return 同款（无文本不渲染 ER 实体内容）；注释勿改写成"回退
        // 普通路径"——分派（renderManagedShape）按 diagramType 进本函数，
        // 空名仅在 Diagram API 层可达（mermaid 语法不可达），节点保持 addShape
        // 初始结构（已 clear 且不写 cell，产物为空 <Shape/> 由调用方容忍）。
        return;
    }

    const hdr = 0.436;
    const rowH = 0.389;
    const nAttr = attributes.length;

    let contentWidth = estimateTextWidth(entityName);
    for (const a of attributes) contentWidth = Math.max(contentWidth, estimateTextWidth(a));
    const widthMin = contentWidth * 1.25 + 0.2;
    const w = Math.max(shape.width, widthMin) + 0.45;
    const h = hdr + nAttr * rowH;
    const hw = w / 2;
    const hh = h / 2;

    setAttribute(node, 'Type', 'Group');
    const entityMasterId = masters.masterIdFor('Entity');
    if (entityMasterId !== 0) setAttribute(node, 'Master', String(entityMasterId));
    setAttribute(node, 'NameU', 'Entity');
    setAttribute(node, 'Name', 'Entity');
    setNumericCell(node, 'PinX', shape.x, 'IN');
    setNumericCell(node, 'PinY', shape.y, 'IN');
    setNumericCell(node, 'Width', w, 'IN');
    setNumericCell(node, 'Height', h, 'IN');
    setNumericCell(node, 'LocPinX', hw, 'IN', 'Width*0.5');
    setNumericCell(node, 'LocPinY', hh, 'IN', 'Height*0.5');
    setNumericCell(node, 'LockWidth', 0);
    replaceShapeText(node, entityName);

    const user = appendSection(node, 'User');
    const entityNameRow = appendNamedRow(user, 'EntityName');
    setStringCell(entityNameRow, 'Value', entityName, 'STR');
    const hdrRow = appendNamedRow(user, 'HdrHgt');
    appendCellNumber(hdrRow, 'Value', hdr, 'DL');
    const wminRow = appendNamedRow(user, 'WidthMin');
    appendCellNumber(wminRow, 'Value', widthMin, 'DL');

    const control = appendSection(node, 'Control');
    const row1 = appendNamedRow(control, 'Row_1');
    const boundFormula =
        'BOUND(' + cppFixed6(w) +
        'DL,0,User.Test,25MM,2540MM,NOT(User.Test),User.WidthMin+' +
        'User.msvSDContainerMargin*2,2540MM)';
    appendCellNumber(row1, 'X', w, 'DL', boundFormula);
    appendCellNumber(row1, 'Y', hh, 'IN', 'Inh');
    appendCellNumber(row1, 'XDyn', w, 'DL', 'Inh');
    appendCellNumber(row1, 'YDyn', hh, 'IN', 'Inh');

    // MasterShape 6/7/8 骨架
    const shapesNode = appendChild(node, makeElement('Shapes'));
    for (const childId of [6, 7, 8]) {
        const subId = page.nextShapeId++;
        const sub = appendChild(shapesNode, makeElement('Shape'));
        setAttribute(sub, 'ID', String(subId));
        setAttribute(sub, 'Type', 'Shape');
        setAttribute(sub, 'MasterShape', String(childId));
    }

    // 高度回写：连接线粘真实框边。
    // 与 C++ 同款的不对称（基线已验证，勿"修复"）：只回写 h、不回写 w
    // （w 恒 ≥ 模型宽+0.45"），类图重算 h 后也不回写模型——choosePort 等在
    // masterless 静态路径用旧尺寸属已知行为，M5 路径由 Visio recalc/glue 掩盖。
    shape.height = h;

    const groupId = node.attrs.find((a) => a.name === 'ID')?.value ?? '';
    const relToGroup = 'SUM(DEPENDSON(5,Sheet.' + groupId + '!SheetRef()))';
    const itemIds: ShapeId[] = [];

    const pkId = masters.masterIdFor('Primary Key Attribute');
    const sepId = masters.masterIdFor('Primary Key Separator');
    const attrId = masters.masterIdFor('Attribute');
    const widthFormula =
        'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,' +
        'User.UserWidth)';
    let rowY = shape.y + hh - hdr - rowH / 2; // 首行中心

    for (let i = 0; i < nAttr; i++) {
        if (i > 0) {
            rowY -= rowH;
            if (sepId !== 0) {
                const sepShapeId = page.nextShapeId++;
                const s = appendChild(pageShapes(page), makeElement('Shape'));
                setAttribute(s, 'ID', String(sepShapeId));
                setAttribute(s, 'Type', 'Shape');
                setAttribute(s, 'Master', String(sepId));
                setNumericCell(s, 'PinX', shape.x, 'IN');
                setNumericCell(s, 'PinY', rowY + rowH / 2, 'IN');
                setNumericCell(s, 'Width', w, 'IN', widthFormula);
                setNumericCell(s, 'LocPinX', hw, 'IN', 'Inh');
                setNumericCell(s, 'LocPinY', 0, 'IN', 'Inh');
                setNumericCell(s, 'Relationships', 0, undefined, relToGroup);
                itemIds.push(sepShapeId);
                const sUser = appendSection(s, 'User');
                const sMargin = appendNamedRow(sUser, 'ContainerMargin');
                appendCellNumber(sMargin, 'Value', 0.03937, 'MM',
                    'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)');
            }
        }
        const rowMasterId = (i === 0) ? pkId : attrId;
        const attrShapeId = page.nextShapeId++;
        const a = appendChild(pageShapes(page), makeElement('Shape'));
        setAttribute(a, 'ID', String(attrShapeId));
        setAttribute(a, 'Type', 'Group');
        if (rowMasterId !== 0) setAttribute(a, 'Master', String(rowMasterId));
        setNumericCell(a, 'PinX', shape.x, 'IN');
        setNumericCell(a, 'PinY', rowY, 'IN');
        setNumericCell(a, 'Width', w, 'IN', widthFormula);
        setNumericCell(a, 'Height', rowH, 'IN');
        setNumericCell(a, 'LocPinX', hw, 'IN', 'Width*0.5');
        setNumericCell(a, 'LocPinY', rowH / 2, 'IN', 'Inh');
        setNumericCell(a, 'Relationships', 0, undefined, relToGroup);
        itemIds.push(attrShapeId);
        const aShapes = appendChild(a, makeElement('Shapes'));
        for (const childId of [6, 7]) {
            const subId = page.nextShapeId++;
            const sub = appendChild(aShapes, makeElement('Shape'));
            setAttribute(sub, 'ID', String(subId));
            setAttribute(sub, 'Type', 'Shape');
            setAttribute(sub, 'MasterShape', String(childId));
        }
        const aUser = appendSection(a, 'User');
        const attrName = appendNamedRow(aUser, 'AttributeName');
        setStringCell(attrName, 'Value', attributes[i]!, 'STR');
        const pkRow = appendNamedRow(aUser, 'PrimaryKey');
        appendCellNumber(pkRow, 'Value', (i === 0) ? 1 : 0);
        const uw = appendNamedRow(aUser, 'UserWidth');
        appendCellNumber(uw, 'Value', w, 'DL');
        const awmin = appendNamedRow(aUser, 'WidthMin');
        appendCellNumber(awmin, 'Value', 0, 'DL',
            'IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN<TEXTWIDTH(TheText),' +
            'SETF(GetRef(LISTSHEETREF()!User.WIDTHMIN),TEXTWIDTH(TheText)),0),0)');
        replaceShapeText(a, attributes[i]!);
    }

    if (itemIds.length > 0) {
        let rel = 'SUM(DEPENDSON(2,';
        for (let i = 0; i < itemIds.length; i++) {
            rel += 'Sheet.' + itemIds[i] + '!SheetRef()';
            if (i + 1 < itemIds.length) rel += ',';
        }
        rel += '))';
        setNumericCell(node, 'Relationships', 0, undefined, rel);
    }
}

// ═══════════════════════════════════════════════════════
// 连接线渲染（共享，含 ER 分支）
// ═══════════════════════════════════════════════════════

/** mermaid 多重性 marker → Visio crow's foot LineEnd 索引（坑位 ⑦-7.9 实测表）。 */
function multiplicityArrow(m: string): number {
    if (m === 'ONLY_ONE') return 25;
    if (m === 'ZERO_OR_ONE') return 31;
    if (m === 'ONE_OR_MORE') return 28;
    if (m === 'ZERO_OR_MORE') return 29;
    return 0;
}

function renderConnectorImpl(page: PageModel, connector: ConnectorModel, node: XmlNode,
                             beginConnect: XmlNode, endConnect: XmlNode,
                             diagramType: DiagramType): void {
    const source = page.shapes.get(connector.source);
    const target = page.shapes.get(connector.target);
    if (!source || !target) {
        throw new TypeError('Connector endpoint shape does not exist');
    }
    const binding = bindConnector(source, target, connector.waypoints);
    const begin = binding.begin.point;
    const end = binding.end.point;
    const width = end.x - begin.x;
    const height = end.y - begin.y;

    clearNodeChildren(node);
    const isER = diagramType === 'er';
    if (isER) {
        // ER 关系线用官方 Relationship 母版（Type=Group，多实例显式骨架）
        setAttribute(node, 'Type', 'Group');
    }

    const beginArrow = multiplicityArrow(connector.fromMultiplicity);
    const endArrow = multiplicityArrow(connector.toMultiplicity);

    // 统一直角折线：视觉直线 = 竖段退化 0；零长轴按 0.2 厚度基线防 1-D 退化
    const horizLine = Math.abs(height) < 1e-6;
    const vertLine = Math.abs(width) < 1e-6;
    const shapeWidth = vertLine ? 0.2 : width;
    const shapeHeight = horizLine ? 0.2 : height;
    const locPinX = shapeWidth / 2;
    const locPinY = shapeHeight / 2;

    setNumericCell(node, 'PinX', (begin.x + end.x) / 2, undefined, 'GUARD((BeginX+EndX)/2)');
    setNumericCell(node, 'PinY', (begin.y + end.y) / 2, undefined, 'GUARD((BeginY+EndY)/2)');
    if (vertLine) setNumericCell(node, 'Width', shapeWidth, undefined, 'GUARD(0.2DL)');
    else setNumericCell(node, 'Width', shapeWidth, undefined, 'GUARD(EndX-BeginX)');
    if (horizLine) setNumericCell(node, 'Height', shapeHeight, undefined, 'GUARD(0.2DL)');
    else setNumericCell(node, 'Height', shapeHeight, undefined, 'GUARD(EndY-BeginY)');
    setNumericCell(node, 'LocPinX', locPinX, undefined, 'GUARD(Width*0.5)');
    setNumericCell(node, 'LocPinY', locPinY, undefined, 'GUARD(Height*0.5)');
    // 1-D 身份 cell（⑦-7.1 页内自包含）
    setNumericCell(node, 'Angle', 0, undefined, 'GUARD(0DA)');
    setNumericCell(node, 'FlipX', 0, undefined, 'GUARD(FALSE)');
    setNumericCell(node, 'FlipY', 0, undefined, 'GUARD(FALSE)');
    setNumericCell(node, 'ResizeMode', 0);

    const connRef = (sheetId: ShapeId, index: number) =>
        'PAR(PNT(Sheet.' + sheetId + '!Connections.X' + (index + 1) +
        ',Sheet.' + sheetId + '!Connections.Y' + (index + 1) + '))';
    const beginRef = connRef(connector.source, binding.begin.index);
    const endRef = connRef(connector.target, binding.end.index);
    setNumericCell(node, 'BeginX', begin.x, undefined, beginRef);
    setNumericCell(node, 'BeginY', begin.y, undefined, beginRef);
    setNumericCell(node, 'EndX', end.x, undefined, endRef);
    setNumericCell(node, 'EndY', end.y, undefined, endRef);

    setNumericCell(node, 'GlueType', 2);
    setNumericCell(node, 'DynFeedback', 2);
    setNumericCell(node, 'ObjType', 2);
    setNumericCell(node, 'NoLiveDynamics', 1);
    setNumericCell(node, 'ShapeSplittable', 1);
    setNumericCell(node, 'LockHeight', 1);
    setNumericCell(node, 'LockCalcWH', 1);
    setNumericCell(node, 'NoAlignBox', 1);
    const routeStyle = diagramType === 'mindmap' ? 2 : 1;
    setNumericCell(node, 'ShapeRouteStyle', routeStyle);
    setNumericCell(node, 'ConLineRouteExt', 1);
    setNumericCell(node, 'ConFixedCode', 6);
    setNumericCell(node, 'LayerMember', 0);
    // EventXFMod：_XFTRIGGER 引用依赖（b39ada3 教训，⑦-7.8）
    setNumericCell(node, 'EventXFMod', 0);

    let lineWeight = 0.5 / 72.0;
    let linePattern = 1;
    switch (connector.style) {
        case 'dotted':
            linePattern = 2;
            break;
        case 'thick':
            lineWeight = 2.0 / 72.0;
            break;
        case 'normal':
        default:
            break;
    }
    setNumericCell(node, 'LineWeight', lineWeight, 'PT');
    setStringCell(node, 'LineColor', '#000000');
    setNumericCell(node, 'LinePattern', linePattern);
    if (isER) {
        setNumericCell(node, 'BeginArrow', beginArrow);
        setNumericCell(node, 'EndArrow', endArrow);
    } else {
        setNumericCell(node, 'BeginArrow', arrowValue(connector.arrowTail));
        setNumericCell(node, 'EndArrow', arrowValue(connector.arrowHead));
    }
    setNumericCell(node, 'BeginArrowSize', 2, undefined, 'THEMEVAL("ConnectorBeginSize")');
    setNumericCell(node, 'EndArrowSize', 2, undefined, 'THEMEVAL("ConnectorEndSize")');

    // 页面直角折线顶点（相对 Begin 的页面差；waypoints 只用于方向判定）
    const pagePts: Point[] = [];
    if (!isER) {
        const beginHorizontal = Math.abs(width) < Math.abs(height);
        const endHorizontal = binding.end.index <= 1;
        if (beginHorizontal && endHorizontal) {
            pagePts.push({ x: 0, y: 0 }, { x: width / 2, y: 0 }, { x: width / 2, y: height }, { x: width, y: height });
        } else if (beginHorizontal) {
            pagePts.push({ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height });
        } else if (endHorizontal) {
            pagePts.push({ x: 0, y: 0 }, { x: 0, y: height }, { x: width, y: height });
        } else {
            pagePts.push({ x: 0, y: 0 }, { x: 0, y: height / 2 }, { x: width, y: height / 2 }, { x: width, y: height });
        }
    }

    const routePts: Point[] = [];
    if (!isER) {
        routePts.push(pagePts[0]!);
        for (let i = 1; i < pagePts.length; i++) {
            const last = routePts[routePts.length - 1]!;
            if (Math.abs(pagePts[i]!.x - last.x) >= 1e-9 ||
                Math.abs(pagePts[i]!.y - last.y) >= 1e-9) {
                routePts.push(pagePts[i]!);
            }
        }
    }

    // 文本位置（折线中段中点；ER=线中点）
    let targetPx = 0;
    let targetPy = 0;
    if (isER) {
        targetPx = width / 2;
        targetPy = height / 2;
    } else {
        targetPx = (pagePts[1]!.x + pagePts[2]!.x) / 2;
        targetPy = (pagePts[1]!.y + pagePts[2]!.y) / 2;
    }
    const localX = (pageDeltaX: number) => pageDeltaX - width / 2 + locPinX;
    const localY = (pageDeltaY: number) => pageDeltaY - height / 2 + locPinY;
    const targetLocalX = localX(targetPx);
    const targetLocalY = localY(targetPy);

    // 文本块：中段中点 + 可拖 TextPosition 手柄（⑦-7.6 文字位置公式链）
    let estW = 0.1;
    {
        // 中文按 UTF-8 字节 /3 折算：逐码点计字节（1/2/3/4），非 ASCII 部分
        // 总字节 /3 与 C++ "UTF-8 字节/3" 逐字节一致（勿退回码点计数）
        let wideBytes = 0;
        let ascii = 0;
        for (const ch of connector.text) {
            const cp = ch.codePointAt(0)!;
            if (cp < 0x80) {
                ascii++;
            } else if (cp < 0x800) {
                wideBytes += 2;
            } else if (cp < 0x10000) {
                wideBytes += 3;
            } else {
                wideBytes += 4;
            }
        }
        estW += 0.14 * (wideBytes / 3.0) + 0.08 * ascii;
    }
    estW = Math.min(4.0, Math.max(0.5, estW));
    setNumericCell(node, 'TxtPinX', targetLocalX, undefined, 'SETATREF(Controls.TextPosition)');
    setNumericCell(node, 'TxtPinY', targetLocalY, undefined, 'SETATREF(Controls.TextPosition.Y)');
    setNumericCell(node, 'TxtWidth', estW, undefined, 'GUARD(' + number(estW) + ')');
    setNumericCell(node, 'TxtHeight', 0.2000515258789062, undefined,
        'GUARD(0.2000515258789062)');
    setNumericCell(node, 'TxtLocPinX', estW / 2, undefined, 'TxtWidth*0.5');
    setNumericCell(node, 'TxtLocPinY', 0.1000257629394531, undefined, 'TxtHeight*0.5');
    setNumericCell(node, 'TxtAngle', 0, undefined);

    let ctlXF: string;
    let ctlYF: string;
    if (isER) {
        ctlXF = 'Width*0.5';
        ctlYF = 'Height*0.5';
    } else if (routePts.length >= 3) {
        ctlXF = '(Geometry1.X2+Geometry1.X3)/2';
        ctlYF = '(Geometry1.Y2+Geometry1.Y3)/2';
    } else {
        ctlXF = '(Geometry1.X1+Geometry1.X2)/2';
        ctlYF = '(Geometry1.Y1+Geometry1.Y2)/2';
    }
    const control = appendSection(node, 'Control');
    const position = appendNamedRow(control, 'TextPosition');
    appendCellNumber(position, 'X', targetLocalX, undefined, ctlXF);
    appendCellNumber(position, 'Y', targetLocalY, undefined, ctlYF);
    appendCellNumber(position, 'XDyn', targetLocalX - 0.25, undefined, 'Controls.TextPosition');
    appendCellNumber(position, 'YDyn', targetLocalY - 0.1000257629394531, undefined,
        'Controls.TextPosition.Y');
    appendCellNumber(position, 'XCon', 5, undefined,
        'IF(OR(STRSAME(SHAPETEXT(TheText),""),HideText),5,0)');
    appendCellNumber(position, 'YCon', 0);
    appendCellNumber(position, 'CanGlue', 0);
    appendCellString(position, 'Prompt', 'Reposition Text');

    const character = appendSection(node, 'Character');
    const characterRow = appendRow(character, null, 0);
    appendCellString(characterRow, 'Color', '#000000');

    const user = appendSection(node, 'User');
    if (isER) {
        const showMulti = appendNamedRow(user, 'ShowMulti');
        appendCellNumber(showMulti, 'Value', 0, undefined, 'FALSE');
        const relName = appendNamedRow(user, 'RelationshipName');
        setStringCell(relName, 'Value', connector.text, 'STR');
    } else {
        const idRow = appendNamedRow(user, 'MermaidId');
        setStringCell(idRow, 'Value', connector.logicalId, 'STR');
    }

    if (isER) {
        // Relationship 母版自带几何；补 6/7/8/9 骨架子形状（⑦-7.9）
        const shapesNode = appendChild(node, makeElement('Shapes'));
        for (const childId of [6, 7, 8, 9]) {
            const subId = page.nextShapeId++;
            const sub = appendChild(shapesNode, makeElement('Shape'));
            setAttribute(sub, 'ID', String(subId));
            setAttribute(sub, 'Type', 'Shape');
            setAttribute(sub, 'MasterShape', String(childId));
        }
        const conn = appendSection(node, 'Connection');
        const connBegin = appendRow(conn, 'Connection', 0);
        appendCellNumber(connBegin, 'X', 0);
        appendCellNumber(connBegin, 'Y', 0);
        const connEnd = appendRow(conn, 'Connection', 1);
        appendCellNumber(connEnd, 'X', width);
        appendCellNumber(connEnd, 'Y', height);
    } else {
        // 固化直角折线几何（⑦-7.5：零长顶点剔除 + Del 占位行）
        const geometry = appendSection(node, 'Geometry', 0);
        const moveRow = appendRow(geometry, 'MoveTo', 1);
        appendCellNumber(moveRow, 'X', localX(routePts[0]!.x));
        appendCellNumber(moveRow, 'Y', localY(routePts[0]!.y));
        let ix = 2;
        for (let i = 1; i < routePts.length; i++) {
            const row = appendRow(geometry, 'LineTo', ix++);
            appendCellNumber(row, 'X', localX(routePts[i]!.x));
            appendCellNumber(row, 'Y', localY(routePts[i]!.y));
        }
        const delRow = appendRow(geometry, 'LineTo', ix);
        setAttribute(delRow, 'Del', '1');
    }
    replaceShapeText(node, connector.text);

    if (isER) {
        setConnect(beginConnect, connector.id, 'BeginX', 9, connector.source);
        setConnect(endConnect, connector.id, 'EndX', 12, connector.target);
    } else {
        setConnect(beginConnect, connector.id, 'BeginX', 9, connector.source,
            binding.begin.cell, binding.begin.toPart);
        setConnect(endConnect, connector.id, 'EndX', 12, connector.target,
            binding.end.cell, binding.end.toPart);
    }
}

// ═══════════════════════════════════════════════════════
// 渲染编排（render_managed.cpp 平移）
// ═══════════════════════════════════════════════════════

/** 形状渲染分派：dividers→类、ER 实体（非 Diamond）→ER、其余→通用。 */
export function renderManagedShape(page: PageModel, shape: ShapeModel,
                                   masters: MasterClient): void {
    const diagramType = resolveFor(page, masters);
    if (!shape.nodeRef) return;
    if (shape.dividers.length > 0) {
        renderClassShape(page, shape, shape.nodeRef, masters);
    } else if (diagramType === 'er' && shape.kind !== 'diamond') {
        renderERShape(page, shape, shape.nodeRef, masters);
    } else {
        renderFlowchartShape(page, shape, shape.nodeRef, masters, diagramType);
    }
}

/** 连接线渲染入口（共享实现；node/Connect 引用取自已登记句柄）。 */
export function renderManagedConnector(page: PageModel, connector: ConnectorModel,
                                       masters: MasterClient): void {
    const diagramType = resolveFor(page, masters);
    if (!connector.nodeRef) return;
    renderConnectorImpl(page, connector, connector.nodeRef,
        connector.beginConnectRef ?? emptyConnect(), connector.endConnectRef ?? emptyConnect(),
        diagramType);
}

function emptyConnect(): XmlNode {
    return makeElement('Connect');
}

function resolveFor(page: PageModel, _masters: MasterClient): DiagramType {
    return page.document !== null
        ? resolveDiagramType(page.document.options.diagramType, [])
        : 'basic';
}
