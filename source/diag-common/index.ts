// diag-common（② 通用包）：契约 A → 契约 B（docs/redesign/04-转义层/01-通用包）
//
// 样板实现：扁平图（flowchart 等）。节点走"自足式"写法（全几何/全连接点/
// 全样式覆盖，不依赖母版资产）；连接线走 PAR 粘附 + Connects 记录。
// 坐标换算：像素（SVG y 向下）→ 英寸（y 向上）。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../xml/index.js';
import { kPageContentType, kPageUri, kPagesContentType, kPagesUri } from '../xml/constants.js';
import { part, type ContractA, type ContractB, type XmlPart } from '../contracts/index.js';
import { fmtInch, pxToInch, pxSizeToInch } from '../common/geometry/transform.js';
import { defaultSwitches, rectRows } from '../common/geometry/box.js';
import { gluePar, midPoint, setAtRef, spanX, spanY } from '../common/formula/writer.js';
import { splitRuns } from '../common/text/runs.js';
import { kStandardRows, toPart } from '../common/ports/rows.js';
import { buildDocumentPart } from '../common/styles/writer.js';
import { StyleRegistry } from '../common/styles/model.js';
import { MasterPacker } from '../common/masters/packer.js';
import { shapeKindToMasterName } from '../common/masters/client.js';
import type { StencilRecord } from '../common/masters/assets.js';
import type { CellIntent, RowIntent } from '../common/intents.js';
import { kVisioNamespace } from '../xml/constants.js';

export interface RenderOptions {
    pageName?: string;
    /** 像素到英寸比例（默认 96dpi）。 */
    pxPerInch?: number;
    /** 官方模具资产：提供时走母版实例化（Master= 引用 + 最小实例）。 */
    stencil?: StencilRecord;
    /** 内部：母版 ID 映射（render 填充后下传）。 */
    masterIds?: Map<string, number>;
}

const kIn = (v: number) => fmtInch(v);

/** 通用渲染器门面。 */
export class CommonRenderer {
    render(a: ContractA, opts: RenderOptions = {}): ContractB {
        const parts: XmlPart[] = [buildDocumentPart(new StyleRegistry())];
        let masterIds = new Map<string, number>();
        if (opts.stencil) {
            const packed = new MasterPacker(opts.stencil).pack(wantedNames(a));
            parts.push(...packed.parts);
            masterIds = packed.masterIds;
        }
        parts.push(...buildPageParts(a, { ...opts, masterIds }));
        return { parts };
    }
}

/** 本图用到的母版名（按出现序去重；有边则加连接线母版）。 */
export function wantedNames(a: ContractA): string[] {
    const names: string[] = [];
    const push = (n: string) => {
        if (!names.includes(n)) names.push(n);
    };
    for (const s of a.shapes) push(shapeKindToMasterName(s.shapeKind));
    if (a.edges.length > 0) push('Dynamic connector');
    return names;
}

/** 页面部件：pages.xml + page1.xml。 */
function buildPageParts(a: ContractA, opts: RenderOptions): XmlPart[] {
    return [buildPagesXml(a, opts), buildPage1Xml(a, opts)];
}

function decl(root: XmlNode): string {
    setAttribute(root, 'xmlns', kVisioNamespace);
    return serializeDocument(root, {
        declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        indent: 0,
    });
}

function cellNode(name: string, value: string, unit?: string, formula?: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', name);
    setAttribute(el, 'V', value);
    if (unit) setAttribute(el, 'U', unit);
    if (formula) setAttribute(el, 'F', formula);
    return el;
}

function writeCellIntentNode(c: CellIntent): XmlNode {
    return cellNode(c.name, c.value ?? '', c.unit, c.formula);
}

function writeRowIntentNode(r: RowIntent): XmlNode {
    const el = makeElement('Row');
    if (r.kind) setAttribute(el, 'T', r.kind);
    if (r.ix !== undefined) setAttribute(el, 'IX', String(r.ix));
    if (r.name !== undefined) setAttribute(el, 'N', r.name);
    if (r.del) setAttribute(el, 'Del', '1');
    for (const c of r.cells) el.children.push(writeCellIntentNode(c));
    return el;
}

/** 页面像素边界 → 英寸页面尺寸（外扩 0.25 英寸边际） */
function pageInchSize(a: ContractA, opts: RenderOptions): { w: number; h: number } {
    const k = opts.pxPerInch ?? 96;
    const margin = 0.25;
    return {
        w: pxSizeToInch(a.meta.bounds.maxX - a.meta.bounds.minX, { pxPerInch: k }) + margin * 2,
        h: pxSizeToInch(a.meta.bounds.maxY - a.meta.bounds.minY, { pxPerInch: k }) + margin * 2,
    };
}

/** pages.xml：单页，PageSheet 最小集。根需声明 r 命名空间（5.5.2 素材一致）。 */
export function buildPagesXml(a: ContractA, opts: RenderOptions): XmlPart {
    const { w, h } = pageInchSize(a, opts);
    const page = makeElement('Pages');
    setAttribute(page, 'xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
    const p = makeElement('Page');
    setAttribute(p, 'ID', '0');
    setAttribute(p, 'NameU', opts.pageName ?? 'Page-1');
    setAttribute(p, 'Name', '页-1');
    setAttribute(p, 'ViewScale', '1');
    setAttribute(p, 'ViewCenterX', kIn(w / 2));
    setAttribute(p, 'ViewCenterY', kIn(h / 2));
    const sheet = makeElement('PageSheet');
    setAttribute(sheet, 'LineStyle', '0');
    setAttribute(sheet, 'FillStyle', '0');
    setAttribute(sheet, 'TextStyle', '0');
    sheet.children.push(
        cellNode('PageWidth', kIn(w), 'IN'),
        cellNode('PageHeight', kIn(h), 'IN'),
        cellNode('PageScale', '1', 'IN'),
        cellNode('DrawingScale', '1', 'IN'),
        cellNode('DrawingSizeType', '0'),
        cellNode('DrawingScaleType', '0'),
        cellNode('InhibitSnap', '0'),
        cellNode('UIVisibility', '0'),
        cellNode('DrawingResizeType', '1'),
        cellNode('PageShapeSplit', '1'),
    );
    p.children.push(sheet);
    const rel = makeElement('Rel');
    setAttribute(rel, 'r:id', 'rId1');
    p.children.push(rel);
    page.children.push(p);
    return part(kPagesUri, kPagesContentType, decl(page));
}

/** page1.xml：Shapes（自足式节点 + 连接线）+ Connects。 */
export function buildPage1Xml(a: ContractA, opts: RenderOptions): XmlPart {
    const root = makeElement('PageContents');
    const shapes = makeElement('Shapes');
    const connects = makeElement('Connects');
    root.children.push(shapes, connects);

    const pageH = a.meta.bounds.maxY;
    const idOf = new Map<string, number>();
    const posOf = new Map<string, ContractA['shapes'][number]>();
    let nextId = 1;
    for (const s of a.shapes) {
        const id = nextId++;
        idOf.set(s.id, id);
        posOf.set(s.id, s);
        shapes.children.push(writeShapeNode(s, id, pageH, opts));
    }
    for (const e of a.edges) {
        const id = nextId++;
        const src = idOf.get(e.from);
        const dst = idOf.get(e.to);
        if (src === undefined || dst === undefined) continue;
        shapes.children.push(writeConnectorNode(e, id, src, dst, posOf.get(e.from), posOf.get(e.to), pageH, opts));
        // 端点粘附：起=右边中点（行 IX1 → X2），终=左边中点（行 IX3 → X4）
        connects.children.push(connectRec(id, 'BeginX', 9, src, 'Connections.X2', toPart(kStandardRows.right)));
        connects.children.push(connectRec(id, 'EndX', 12, dst, 'Connections.X4', toPart(kStandardRows.left)));
    }
    return part(kPageUri, kPageContentType, decl(root));
}

function connectRec(
    fromSheet: number,
    fromCell: string,
    fromPart: number,
    toSheet: number,
    toCell: string,
    toPartVal: number,
): XmlNode {
    const el = makeElement('Connect');
    setAttribute(el, 'FromSheet', String(fromSheet));
    setAttribute(el, 'FromCell', fromCell);
    setAttribute(el, 'FromPart', String(fromPart));
    setAttribute(el, 'ToSheet', String(toSheet));
    setAttribute(el, 'ToCell', toCell);
    setAttribute(el, 'ToPart', String(toPartVal));
    return el;
}

/** 标准五行连接行（下/右/上/左/中，research 5.4.3.3 修正版，方向列=粘附指向）。 */
function connectionSection(w: number, h: number): XmlNode {
    const sec = makeElement('Section');
    setAttribute(sec, 'N', 'Connection');
    const xRatios = ['0.5', '1', '0.5', '0', '0.5'] as const;
    const yRatios = ['0', '0.5', '1', '0.5', '0.5'] as const;
    const xFormulas = ['Width*0.5', 'Width*1', 'Width*0.5', 'Width*0', 'Width*0.5'] as const;
    const yFormulas = ['Height*0', 'Height*0.5', 'Height*1', 'Height*0.5', 'Height*0.5'] as const;
    const dx = [0, -1, 0, 1, 0];
    const dy = [1, 0, -1, 0, 1];
    for (let ix = 0; ix <= 4; ix++) {
        const row = makeElement('Row');
        setAttribute(row, 'T', 'Connection');
        setAttribute(row, 'IX', String(ix));
        row.children.push(
            cellNode('X', kIn(w * Number(xRatios[ix]!)), 'IN', xFormulas[ix]!),
            cellNode('Y', kIn(h * Number(yRatios[ix]!)), 'IN', yFormulas[ix]!),
            cellNode('DirX', String(dx[ix]!)),
            cellNode('DirY', String(dy[ix]!)),
            cellNode('Type', '0', undefined, 'No Formula'),
            cellNode('AutoGen', '0', undefined, 'No Formula'),
            cellNode('Prompt', '', undefined, 'No Formula'),
        );
        sec.children.push(row);
    }
    return sec;
}

/** 节点形状：有母版时最小实例（Master+Pin+文本），无母版时自足式。 */
function writeShapeNode(s: ContractA['shapes'][number], id: number, pageHpx: number, opts: RenderOptions): XmlNode {
    const k = opts.pxPerInch ?? 96;
    const w = pxSizeToInch(s.width, { pxPerInch: k });
    const h = pxSizeToInch(s.height, { pxPerInch: k });
    const x = pxToInch(s.x, { pxPerInch: k });
    const y = (pageHpx - s.y) / k;
    const masterId = opts.masterIds?.get(shapeKindToMasterName(s.shapeKind)) ?? 0;

    const el = makeElement('Shape');
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'Type', 'Shape');
    if (s.label) {
        setAttribute(el, 'NameU', 'Mermaid Shape');
        setAttribute(el, 'Name', 'Mermaid Shape');
    }
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    setAttribute(el, 'LineStyle', '3');
    setAttribute(el, 'FillStyle', '3');
    setAttribute(el, 'TextStyle', '3');
    el.children.push(
        cellNode('PinX', kIn(x), 'IN'),
        cellNode('PinY', kIn(y), 'IN'),
    );
    if (masterId === 0) {
        // 自足式：尺寸/锚/覆盖/连接点/几何全写
        el.children.push(
            cellNode('Width', kIn(w), 'IN'),
            cellNode('Height', kIn(h), 'IN'),
            cellNode('LocPinX', kIn(w / 2), 'IN', 'Width*0.5'),
            cellNode('LocPinY', kIn(h / 2), 'IN', 'Height*0.5'),
            cellNode('Angle', '0', 'DEG'),
            cellNode('FlipX', '0'),
            cellNode('FlipY', '0'),
        );
        el.children.push(
            cellNode('LineColor', '#000000'),
            cellNode('LinePattern', '1'),
            cellNode('FillForegnd', s.fillColor || '#FFFFFF'),
            cellNode('FillPattern', '1'),
        );
        el.children.push(connectionSection(w, h));
        const geo = makeElement('Section');
        setAttribute(geo, 'N', 'Geometry');
        setAttribute(geo, 'IX', '0');
        for (const c of defaultSwitches(true)) geo.children.push(writeCellIntentNode(c));
        for (const r of rectRows(w, h)) geo.children.push(writeRowIntentNode(r));
        el.children.push(geo);
    }
    if (s.label) el.children.push(textNode(s.label));
    return el;
}

/** 连接线：1-D 端点公式 + 几何两行+Del + 文本句柄闭环；缓存=PAR 公式落点。 */
function writeConnectorNode(
    e: ContractA['edges'][number],
    id: number,
    srcId: number,
    dstId: number,
    srcShape: ContractA['shapes'][number] | undefined,
    dstShape: ContractA['shapes'][number] | undefined,
    pageHpx: number,
    opts: RenderOptions,
): XmlNode {
    const k = opts.pxPerInch ?? 96;
    // 公式落点：起点=源右中点（X2=IX1），终点=目标左中点（X4=IX3）
    const sxc = srcShape ? srcShape.x + srcShape.width / 2 : (e.waypoints[0]?.x ?? 0);
    const syc = srcShape ? srcShape.y : (e.waypoints[0]?.y ?? 0);
    const exc = dstShape ? dstShape.x - dstShape.width / 2 : (e.waypoints[e.waypoints.length - 1]?.x ?? 0);
    const eyc = dstShape ? dstShape.y : (e.waypoints[e.waypoints.length - 1]?.y ?? 0);
    const bx = pxToInch(sxc, { pxPerInch: k });
    const by = (pageHpx - syc) / k;
    const ex = pxToInch(exc, { pxPerInch: k });
    const ey = (pageHpx - eyc) / k;
    const dx = ex - bx;
    const dy = ey - by;

    const el = makeElement('Shape');
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'Type', 'Shape');
    setAttribute(el, 'NameU', 'Dynamic connector');
    setAttribute(el, 'Name', '动态连接线');
    const connectorMaster = opts.masterIds?.get('Dynamic connector') ?? 0;
    if (connectorMaster > 0) setAttribute(el, 'Master', String(connectorMaster));
    setAttribute(el, 'LineStyle', '3');
    setAttribute(el, 'FillStyle', '3');
    setAttribute(el, 'TextStyle', '3');
    el.children.push(
        cellNode('PinX', kIn((bx + ex) / 2), 'IN', midPoint()),
        cellNode('PinY', kIn((by + ey) / 2), 'IN', 'GUARD((BeginY+EndY)/2)'),
        cellNode('Width', kIn(dx), 'IN', spanX()),
        cellNode('Height', kIn(dy), 'IN', spanY()),
        cellNode('LocPinX', kIn(dx / 2), 'IN', 'GUARD(Width*0.5)'),
        cellNode('LocPinY', kIn(dy / 2), 'IN', 'GUARD(Height*0.5)'),
        cellNode('Angle', '0', 'DEG', 'GUARD(0DA)'),
    );
    el.children.push(
        cellNode('BeginX', kIn(bx), 'IN', gluePar(srcId, 2)),
        cellNode('BeginY', kIn(by), 'IN', gluePar(srcId, 2)),
        cellNode('EndX', kIn(ex), 'IN', gluePar(dstId, 4)),
        cellNode('EndY', kIn(ey), 'IN', gluePar(dstId, 4)),
    );
    el.children.push(cellNode('GlueType', '2'), cellNode('ObjType', '2'), cellNode('LayerMember', '0'));
    el.children.push(cellNode('ShapeRouteStyle', '5'));
    el.children.push(cellNode('LineColor', '#000000'), cellNode('LinePattern', '1'), cellNode('EndArrow', '13'));
    el.children.push(cellNode('TxtPinX', kIn(dx / 2), 'IN', setAtRef()));
    el.children.push(cellNode('TxtPinY', kIn(dy / 2), 'IN', setAtRef('TextPosition', 'y')));
    // 文本句柄闭环（5.4.3.4/6.2.3.3：SETATREF 写回 Control 行 + 文本块四件套缓存）
    el.children.push(cellNode('TxtWidth', '0.5', 'IN', 'GUARD(0.5)'));
    el.children.push(cellNode('TxtHeight', kIn(Math.max(Math.abs(dy), 0.2)), 'IN', 'GUARD(0.2)'));
    el.children.push(cellNode('TxtLocPinX', kIn(dx / 2), 'IN', 'TxtWidth*0.5'));
    el.children.push(cellNode('TxtLocPinY', kIn(Math.max(Math.abs(dy), 0.2) / 2), 'IN', 'TxtHeight*0.5'));
    el.children.push(cellNode('TxtAngle', '0', 'DEG'));
    const ctrl = makeElement('Section');
    setAttribute(ctrl, 'N', 'Control');
    const cRow = makeElement('Row');
    setAttribute(cRow, 'N', 'TextPosition');
    cRow.children.push(
        cellNode('X', kIn(dx / 2), 'IN', '(Geometry1.X2+Geometry1.X3)/2'),
        cellNode('Y', kIn(dy / 2), 'IN', '(Geometry1.Y2+Geometry1.Y3)/2'),
        cellNode('XDyn', kIn(dx / 2), 'IN', 'Controls.TextPosition'),
        cellNode('YDyn', kIn(dy / 2), 'IN', 'Controls.TextPosition.Y'),
        cellNode('XCon', '5', undefined, 'IF(OR(STRSAME(SHAPETEXT(TheText),"") ,HideText),5,0)'),
        cellNode('YCon', '0'),
        cellNode('CanGlue', '0'),
        cellNode('Prompt', 'Reposition Text'),
    );
    ctrl.children.push(cRow);
    el.children.push(ctrl);

    const geo = makeElement('Section');
    setAttribute(geo, 'N', 'Geometry');
    setAttribute(geo, 'IX', '0');
    const m = makeElement('Row');
    setAttribute(m, 'T', 'MoveTo');
    setAttribute(m, 'IX', '1');
    m.children.push(cellNode('X', '0'), cellNode('Y', '0'));
    const l = makeElement('Row');
    setAttribute(l, 'T', 'LineTo');
    setAttribute(l, 'IX', '2');
    l.children.push(cellNode('X', kIn(dx)), cellNode('Y', kIn(dy)));
    // Del 占位行（5.5.3.3：行号稳定）
    const d = makeElement('Row');
    setAttribute(d, 'T', 'LineTo');
    setAttribute(d, 'IX', '3');
    setAttribute(d, 'Del', '1');
    geo.children.push(m, l, d);
    el.children.push(geo);
    if (e.label) el.children.push(textNode(e.label));
    return el;
}

function textNode(label: string): XmlNode {
    const t = makeElement('Text');
    const cp = makeElement('cp');
    setAttribute(cp, 'IX', '0');
    t.children.push(cp);
    const runs = splitRuns(label);
    let text = '';
    runs.forEach((r, i) => {
        if (i > 0) text += '\n';
        text += r.text;
    });
    t.children.push(text);
    return t;
}
