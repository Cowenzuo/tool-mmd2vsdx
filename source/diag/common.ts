// diag-common（通用包）：契约 A → 契约 B（source/diag/common.ts；docs/redesign/04-转义层 对应篇）
//
// 样板实现：扁平图（flowchart 等）。节点走"自足式"写法（全几何/全连接点/
// 全样式覆盖，不依赖母版资产）；连接线走双端自动（WALKGLUE 走线吸附，
// basic-5 基准）+ Connects 记录（本体粘附）。
// 坐标换算：像素（SVG y 向下）→ 英寸（y 向上）。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri, kPagesContentType, kPagesUri } from '../common/xml/constants.js';
import { part, type ContractA, type ContractB, type XmlPart } from '../contracts/index.js';
import { fmtInch, pxToInch, pxSizeToInch } from '../common/geometry/transform.js';
import { defaultSwitches, rectRows } from '../common/geometry/box.js';
import { midPoint, setAtRef, spanX, spanY, trigger, walkGlue } from '../common/formula/writer.js';
import { splitRuns } from '../common/text/runs.js';
import { buildDocumentPart } from '../common/styles/writer.js';
import { StyleRegistry } from '../common/styles/model.js';
import { MasterPacker } from '../common/masters/packer.js';
import { shapeKindToMasterName } from '../common/masters/client.js';
import type { MasterCatalog } from '../common/masters/assets.js';
import type { CellIntent, RowIntent } from '../common/intents.js';
import { kVisioNamespace } from '../common/xml/constants.js';

export interface RenderOptions {
    pageName?: string;
    /** 像素到英寸比例（默认 96dpi）。 */
    pxPerInch?: number;
    /** 官方模具目录（多记录：如节点=basic_shape、连接线=flowchart）；提供时走母版实例化。 */
    stencil?: MasterCatalog;
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
        // 端点粘附（basic-5 实证：双端全部走线吸附 WALKGLUE，落点=形状本体）
        // ToCell='PinY' ToPart='3'（本体粘附角色码；PinX/PinY 选取规律见研究 W-15，
        // 基准样本两端均为 PinY，随基准实现）。
        // 记录顺序随素材：每根线 EndX 在前、BeginX 在后（basic-2/3/4/5、ER、gantt 一致）。
        connects.children.push(connectRec(id, 'EndX', 12, dst, 'PinY', 3));
        connects.children.push(connectRec(id, 'BeginX', 9, src, 'PinY', 3));
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
    if (masterId > 0) {
        // 实例尺寸覆盖（6.2.3.2 c4-1 形态：Master 引用 + 全尺寸覆盖——母版占位 40×30mm
        // 远大于 mermaid 布局间距，不覆盖会整页重叠）
        el.children.push(
            cellNode('Width', kIn(w), 'IN'),
            cellNode('Height', kIn(h), 'IN'),
            cellNode('LocPinX', kIn(w / 2), 'IN', 'Width*0.5'),
            cellNode('LocPinY', kIn(h / 2), 'IN', 'Height*0.5'),
            cellNode('Angle', '0', 'DEG'),
            cellNode('FlipX', '0'),
            cellNode('FlipY', '0'),
        );
    }
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

/** 连接线实例（basic-5 基准）：Master= 引用动态连接线母版（flowchart 官方模具），
 *  实例只写与母版不同的 cell——端点公式（双端 WALKGLUE 镜像）、触发器（_XFTRIGGER V=2）、
 *  WalkPreference=3、ConFixedCode=6、EndArrow、TxtPinX/Y 缓存、Control 段缓存。
 *  母版承载：几何/1-D 行为组/文本四件套公式/NoFill 段开关；V 缓存=走线位置（保存态）。 */
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
    // V 缓存：WAYPOINTS 首末点（mermaid 真实贴附，打开后由 WALKGLUE 重算）；缺省用形状中心
    const wp0 = e.waypoints[0];
    const wpN = e.waypoints[e.waypoints.length - 1];
    const bx = pxToInch(wp0?.x ?? srcShape?.x ?? 0, { pxPerInch: k });
    const by = (pageHpx - (wp0?.y ?? srcShape?.y ?? 0)) / k;
    const ex = pxToInch(wpN?.x ?? dstShape?.x ?? 0, { pxPerInch: k });
    const ey = (pageHpx - (wpN?.y ?? dstShape?.y ?? 0)) / k;
    const dx = ex - bx;
    const dy = ey - by;

    const el = makeElement('Shape');
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'Type', 'Shape');
    setAttribute(el, 'NameU', 'Dynamic connector');
    setAttribute(el, 'Name', '动态连接线');
    // 母版引用（basic-5：Master='4'，几何/行为组/文本公式走母版；无母版时保持自足式兜底）
    const connectorMaster = opts.masterIds?.get('Dynamic connector') ?? 0;
    if (connectorMaster > 0) {
        setAttribute(el, 'Master', String(connectorMaster));
        // 连接线独立样式（basic-5 实例不带三件套——母版 Shape 带 LineStyle='7'；
        // 我们注入 5 号 Connector 样式，实例补三件套=5 保证无母版兜底也生效）
        setAttribute(el, 'LineStyle', '5');
        setAttribute(el, 'FillStyle', '5');
        setAttribute(el, 'TextStyle', '5');
        el.children.push(
            cellNode('PinX', kIn((bx + ex) / 2), 'IN', 'Inh'),
            cellNode('PinY', kIn((by + ey) / 2), 'IN', 'Inh'),
            // 尺寸随端点（basic-5/6 实例实证：Width/Height 实例写 GUARD 公式，非仅母版承载）
            cellNode('Width', kIn(dx), 'IN', spanX()),
            cellNode('Height', kIn(dy), 'IN', spanY()),
            cellNode('LocPinX', kIn(dx / 2), 'IN', 'Inh'),
            cellNode('LocPinY', kIn(dy / 2), 'IN', 'Inh'),
        );
        // 几何实例化（basic-5/6 实证：Geometry 两行 LineTo L 型——母版几何是占位，
        // 实例必须写实际走线；缺失会显示母版占位形状致文本定位错乱/漂移）
        const geo = makeElement('Section');
        setAttribute(geo, 'N', 'Geometry');
        setAttribute(geo, 'IX', '0');
        if (Math.abs(dx) < 1e-6) {
            // 纯竖直：单段（LocPinX=0 时从原点直达）
            const m2 = makeElement('Row');
            setAttribute(m2, 'T', 'MoveTo');
            setAttribute(m2, 'IX', '1');
            m2.children.push(cellNode('X', '0'), cellNode('Y', '0'));
            const l2 = makeElement('Row');
            setAttribute(l2, 'T', 'LineTo');
            setAttribute(l2, 'IX', '2');
            l2.children.push(cellNode('X', '0'), cellNode('Y', kIn(dy)));
            geo.children.push(m2, l2);
        } else {
            const m2 = makeElement('Row');
            setAttribute(m2, 'T', 'MoveTo');
            setAttribute(m2, 'IX', '1');
            m2.children.push(cellNode('X', '0'), cellNode('Y', '0'));
            const l2 = makeElement('Row');
            setAttribute(l2, 'T', 'LineTo');
            setAttribute(l2, 'IX', '2');
            l2.children.push(cellNode('X', kIn(dx)), cellNode('Y', '0'));
            const l3 = makeElement('Row');
            setAttribute(l3, 'T', 'LineTo');
            setAttribute(l3, 'IX', '3');
            l3.children.push(cellNode('X', kIn(dx)), cellNode('Y', kIn(dy)));
            geo.children.push(m2, l2, l3);
        }
        el.children.push(geo);
    } else {
        // 无母版兜底（自足式，research 6.2.4 合法）：母版全部 cell 落实例
        setAttribute(el, 'LineStyle', '5');
        setAttribute(el, 'FillStyle', '5');
        setAttribute(el, 'TextStyle', '5');
        el.children.push(
            cellNode('PinX', kIn((bx + ex) / 2), 'IN', midPoint()),
            cellNode('PinY', kIn((by + ey) / 2), 'IN', 'GUARD((BeginY+EndY)/2)'),
            cellNode('Width', kIn(dx), 'IN', spanX()),
            cellNode('Height', kIn(dy), 'IN', spanY()),
            cellNode('LocPinX', kIn(dx / 2), 'IN', 'GUARD(Width*0.5)'),
            cellNode('LocPinY', kIn(dy / 2), 'IN', 'GUARD(Height*0.5)'),
            cellNode('Angle', '0', 'DEG', 'GUARD(0DA)'),
        );
    }
    // 双端自动（basic-5：Begin 与 End 的 WALKGLUE 参数顺序镜像）
    el.children.push(
        cellNode('BeginX', kIn(bx), 'IN', walkGlue(true)),
        cellNode('BeginY', kIn(by), 'IN', walkGlue(true)),
        cellNode('EndX', kIn(ex), 'IN', walkGlue()),
        cellNode('EndY', kIn(ey), 'IN', walkGlue()),
    );
    // 触发器（basic-5：V=2，_XFTRIGGER 订阅目标 EventXFMod——双击/移动重算）
    el.children.push(cellNode('BegTrigger', '2', undefined, trigger(srcId)));
    el.children.push(cellNode('EndTrigger', '2', undefined, trigger(dstId)));
    // 走线偏好（basic-5：V=3 显式写出 3；单端 PAR 实例未写——双端自动必写）
    el.children.push(cellNode('WalkPreference', '3'));
    if (connectorMaster > 0) {
        el.children.push(cellNode('LayerMember', '0'));
        // 连接固定方式（basic-5 双端自动取 6；basic-3 单端 PAR+走线取 5——W-14）
        el.children.push(cellNode('ConFixedCode', '6'));
        el.children.push(cellNode('EndArrow', '13'));
        // 路由样式（basic-3/4 实证 ShapeRouteStyle=5=Flowchart 上→下绕行避让；
        // basic-5/6 无障碍物样本省略 ≠ 不写——官方语义：0=页面默认，不写即不避让）
        el.children.push(cellNode('ShapeRouteStyle', '5'));
        // 文本闭环（basic-5/6 实证）：TxtPinX/Y = SETATREF 回写 Control.TextPosition（缓存=文本柄位置，
        // 未拖动默认=走线 L 型路径按弧长的中点——从 (0,0) 沿 dx 方向走 |dx|，再沿 dy 方向走 |dy|，
        // 半长落在水平段 → 位置 (sgn(dx)*halfLen, 0)；落在竖直段 → (dx, sgn(dy)*(halfLen-|dx|))。
        // basic-6 实证：dx=+1.006/dy=-0.312，半长 0.659 < 1.006 → (0.659, 0) ✓。
        // 带符号（dx/dy 可为负：方向沿向量走，不能 abs 后丢符号——曾致文字偏右）。
        const hasLabel = !!e.label;
        const horiz = Math.abs(dx);
        const vert = Math.abs(dy);
        const halfLen = (horiz + vert) / 2;
        const sgnX = dx >= 0 ? 1 : -1;
        const sgnY = dy >= 0 ? 1 : -1;
        const midOnHoriz = halfLen <= horiz;
        const tx = midOnHoriz ? sgnX * halfLen : dx;
        const ty = midOnHoriz ? 0 : sgnY * (halfLen - horiz);
        el.children.push(cellNode('TxtPinX', kIn(tx), 'IN', 'Inh'));
        el.children.push(cellNode('TxtPinY', kIn(ty), 'IN', 'Inh'));
        // 文本高缓存（basic-6 V=0.2444939358181424 系 TEXTHEIGHT 结果；TxtLocPinY=高/2）
        const textH = 0.2444939358181424; // 素材实测默认高（TEXTHEIGHT(TheText, TxtWidth) 结果）
        if (hasLabel) {
            el.children.push(cellNode('TxtHeight', String(textH), undefined, 'Inh'));
            el.children.push(cellNode('TxtLocPinY', String(textH / 2), undefined, 'Inh'));
        }
        const ctrl = makeElement('Section');
        setAttribute(ctrl, 'N', 'Control');
        const cRow = makeElement('Row');
        setAttribute(cRow, 'N', 'TextPosition');
        cRow.children.push(
            cellNode('X', kIn(tx), 'IN'),
            cellNode('Y', kIn(ty), 'IN'),
            cellNode('XDyn', kIn(tx), 'IN', 'Inh'),
            cellNode('YDyn', kIn(ty), 'IN', 'Inh'),
        );
        // 有文字（basic-4/6 实证）：XCon=0 F='Inh'（柄锁定不再自动居中；有文字即写，
        // 与是否拖动无关）；无文字（basic-2）：不写 XCon（母版继承 XCon=5 公式）。
        if (hasLabel) cRow.children.push(cellNode('XCon', '0', undefined, 'Inh'));
        ctrl.children.push(cRow);
        el.children.push(ctrl);
    } else {
        el.children.push(cellNode('GlueType', '2'), cellNode('ObjType', '2'), cellNode('LayerMember', '0'));
        el.children.push(cellNode('DynFeedback', '2'), cellNode('NoLiveDynamics', '1'), cellNode('NoAlignBox', '1'));
        el.children.push(cellNode('LockHeight', '1'), cellNode('LockCalcWH', '1'), cellNode('ShapeSplittable', '1'));
        el.children.push(cellNode('ConFixedCode', '6'));
        el.children.push(cellNode('ShapeRouteStyle', '5'));
        el.children.push(cellNode('LineColor', '#000000'), cellNode('LinePattern', '1'), cellNode('EndArrow', '13'));
        // 文本闭环（与母版分支同规则：L 型路径弧长中点，带符号）
        const horiz2 = Math.abs(dx);
        const vert2 = Math.abs(dy);
        const half2 = (horiz2 + vert2) / 2;
        const sgnX2 = dx >= 0 ? 1 : -1;
        const sgnY2 = dy >= 0 ? 1 : -1;
        const midOnH2 = half2 <= horiz2;
        const tx2 = midOnH2 ? sgnX2 * half2 : dx;
        const ty2 = midOnH2 ? 0 : sgnY2 * (half2 - horiz2);
        el.children.push(cellNode('TxtPinX', kIn(tx2), 'IN', setAtRef()));
        el.children.push(cellNode('TxtPinY', kIn(ty2), 'IN', setAtRef('TextPosition', 'y')));
        el.children.push(cellNode('TxtWidth', kIn(Math.max(Math.abs(dx), 0.2)), 'IN', 'MAX(TEXTWIDTH(TheText),5*Char.Size)'));
        el.children.push(cellNode('TxtHeight', kIn(Math.max(Math.abs(dy), 0.2)), 'IN', 'TEXTHEIGHT(TheText,TxtWidth)'));
        el.children.push(cellNode('TxtLocPinX', kIn(Math.max(Math.abs(dx), 0.2) / 2), 'IN', 'TxtWidth*0.5'));
        el.children.push(cellNode('TxtLocPinY', kIn(Math.max(Math.abs(dy), 0.2) / 2), 'IN', 'TxtHeight*0.5'));
        el.children.push(cellNode('TxtAngle', '0', 'DEG'));
        const ctrl = makeElement('Section');
        setAttribute(ctrl, 'N', 'Control');
        const cRow = makeElement('Row');
        setAttribute(cRow, 'N', 'TextPosition');
        cRow.children.push(
            cellNode('X', kIn(tx2), 'IN', '(Geometry1.X2+Geometry1.X3)/2'),
            cellNode('Y', kIn(ty2), 'IN', '(Geometry1.Y2+Geometry1.Y3)/2'),
            cellNode('XDyn', kIn(tx2), 'IN', 'Controls.TextPosition'),
            cellNode('YDyn', kIn(ty2), 'IN', 'Controls.TextPosition.Y'),
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
        for (const [n, v] of [
            ['NoFill', '1'],
            ['NoLine', '0'],
            ['NoShow', '0'],
            ['NoSnap', '0'],
            ['NoQuickDrag', '0'],
        ] as Array<[string, string]>) {
            geo.children.push(cellNode(n, v));
        }
        const skipHoriz = Math.abs(dx) < 1e-6;
        if (!skipHoriz) {
            const m = makeElement('Row');
            setAttribute(m, 'T', 'MoveTo');
            setAttribute(m, 'IX', '1');
            m.children.push(cellNode('X', '0'), cellNode('Y', '0'));
            const l1 = makeElement('Row');
            setAttribute(l1, 'T', 'LineTo');
            setAttribute(l1, 'IX', '2');
            l1.children.push(cellNode('X', kIn(dx)), cellNode('Y', '0'));
            const l2 = makeElement('Row');
            setAttribute(l2, 'T', 'LineTo');
            setAttribute(l2, 'IX', '3');
            l2.children.push(cellNode('X', kIn(dx)), cellNode('Y', kIn(dy)));
            geo.children.push(m, l1, l2);
        } else {
            const m = makeElement('Row');
            setAttribute(m, 'T', 'MoveTo');
            setAttribute(m, 'IX', '1');
            m.children.push(cellNode('X', '0'), cellNode('Y', '0'));
            const l = makeElement('Row');
            setAttribute(l, 'T', 'LineTo');
            setAttribute(l, 'IX', '2');
            l.children.push(cellNode('X', '0'), cellNode('Y', kIn(dy)));
            const d = makeElement('Row');
            setAttribute(d, 'T', 'LineTo');
            setAttribute(d, 'IX', '3');
            setAttribute(d, 'Del', '1');
            geo.children.push(m, l, d);
        }
        el.children.push(geo);
    }
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
