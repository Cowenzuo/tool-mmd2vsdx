// diag-er：契约 A → 契约 B（source/diag/er.ts；docs/开发过程/01-结构设计.md 对应篇）
//
// 母版实例化版（代数逐值见 docs/VSDX处理经验/02-坑位与解法.md），对齐官方 er-all-in-one 模板包（5 枚：
// Entity/Primary Key Attribute/Primary Key Separator/Attribute/Relationship）：
//  - 实体 = 官方 Entity 母版实例（Group + Master= + 最小差异 + 嵌套 MasterShape 6..8 覆写）；
//    盒高 = 官方内容公式 HdrHgt + n*rowH（n=属性行数+分隔线；HdrHgt=0.436163IN、rowH=0.388939IN）。
//  - 属性行 = PK/普通母版实例（LISTSHEETREF 容器家族、ItemIndex 行序、User 行族、
//    嵌套 MasterShape 6/7 文字覆写）；主键分隔线 = Primary Key Separator 母版实例。
//  - 关系 = Relationship 母版实例（MasterType=541）：规则见下。
// 实例代数来源：docs/VSDX解压结构研究/标准研究模板-手动创建vsdx并解压/er-all-in-one/（官方包）
// 页面实例逐值比对：实体 1/21/35、属性行 5/9/25/29/43、分隔线 8/28/42、关系 15/49。
//
// 关系实例代数（官方原文，无自创）：
//   W=GUARD(EndX-BeginX)、H=GUARD(EndY-BeginY)（均带符号）；PinX/PinY=端点中点；
//   LocPin=W/2,H/2；Begin/EndX/Y=PAR 钉接；L 形几何 (0,0)→(0,H)→(W,H)（母线 MoveTo 继承，
//   实例覆写 LineTo2 Y=H、LineTo3 X=W)；Connection 双行=本地端点吸着位（Begin=inset*出线向、
//   End=(W-DXEnd,H)）；User.DYBegin/DXEnd=端点内缩缓存；端标记子形状 6/7（Begin 对）与 8/9（End 对）
//   = 旋转 ∓45°/±135° 的 2.5MM 标记（PinY=Con±...；End 侧写 PinX/PinY 缓存，π 翻向时补 LocPin+EndAngle）。
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kCanvasMargin } from '../common/geometry/transform.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type ErModel, type ErEntity } from '../contracts/index.js';

// ── 官方常数（单位 IN）──
const kHdrHgt = 0.4361626369900174;       // Entity 表头高（HdrHgt，=Sheet.7!User.UsableHgt）
const kHdrHalf = kHdrHgt / 2;             // TxtPinY=Height-此值
const kRowH = 0.388939397515191;          // 属性行高（官方 GUARD(MAX(9MM,...)) 基准）
const kMemberW = 2.559055118110236;       // 盒宽/属性行宽（官方 65MM 的英寸值）
const kInset = 0.0576472297913817;        // 关系端点内缩缓存（官方样本 15 值）

const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6);

/** 文本宽带估算（近似；官方 TEXTWIDTH 由字体度量决定——官方样本 12 字符 ≈ 1.2086IN）。 */
function estW(text: string, chars = 0.1007): number {
    let n = 0;
    for (const ch of text) n += /[\u4e00-\u9fff]/.test(ch) ? 2 : 1;
    return Math.max(0.3, n * chars);
}

/** 布局：优先 mmd 布局比例（行/列聚簇 + 间距比例；行高用官方内容公式——行高不一致不重叠）；
 *  无 mmd 布局时回退单列纵向链（旧行为）。单位 IN（mmd px/96）。 */
interface BoxGeom { x: number; y: number; w: number; h: number; top: number; bottom: number; }

function clusterAxis(vals: number[], tol: number): number[][] {
    // 按值聚簇（1D）：排序后相邻差≤tol 归一组，返回每簇中心
    const sorted = [...vals].sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const v of sorted) {
        const last = clusters[clusters.length - 1];
        if (last !== undefined && Math.abs(v - last[last.length - 1]!) <= tol) last.push(v);
        else clusters.push([v]);
    }
    return clusters;
}

function boxH(e: ErEntity): number {
    // 官方实例口径（er-all-in-one page1 逐值）：实体高 = HdrHgt + max(属性行数, 3)×rowH；
    // 主键分隔线为 0 高行（不占槽位）；容器有 3 行槽位下限——官方 2 属性实体 #21（PK+分隔线+属性）
    // H=0.43616+3×0.38894=1.60298（行顶部对齐、底部留 1 行），3 属性实体 #1 同值恰好贴合。
    return kHdrHgt + e.attributes.length * kRowH;
}

function layout(m: ErModel): { boxes: Map<string, BoxGeom>; pageW: number; pageH: number } {
    const w = kMemberW;
    const margin = kCanvasMargin;           // 页面 = 内容盒 + 半线宽（P-4 画布策略）
    const boxes = new Map<string, BoxGeom>();
    const mmd = m.layout ?? undefined;
    const hasMmd = !!mmd && m.entities.every((e) => mmd[e.name] !== undefined && mmd[e.name]!.x !== undefined);

    if (!hasMmd) {
        // ── 旧行为：单列纵向链（fallback）──
        const gap = 0.9;
        let y = kHdrHgt / 2 + margin;
        for (const e of m.entities) {
            const h = boxH(e);
            boxes.set(e.id, { x: margin + w / 2, y, w, h, top: y + h / 2, bottom: y - h / 2 });
            y += h + gap;
        }
        return { boxes, ...boxExtent(boxes, margin) };
    }

    // ── mmd 比例布局（同 class：行聚簇 + 行高官方公式 + 反转 y 轴）──
    const gapY = 0.9;
    const gapX = 1.2;
    type Item = { e: ErEntity; g: { x: number; y: number; width: number; height: number } };
    const items: Item[] = m.entities.map((e) => ({ e, g: mmd![e.name]! }));
    const ys = items.map((i) => i.g.y);
    const yClusters = clusterAxis(ys, 48);
    const nRows = yClusters.length;
    const rowIndex = new Map<number, number>();
    items.forEach((i, idx) => {
        let best = 0, bestD = Infinity;
        yClusters.forEach((cl, ri) => {
            const d = Math.abs(i.g.y - cl[0]!);
            if (d < bestD) { bestD = d; best = ri; }
        });
        // mmd 坐标 y 向下（svg）；Visio 页坐标 y 向上——行序反转
        rowIndex.set(idx, nRows - 1 - best);
    });
    const rows: Array<Item[]> = Array.from({ length: nRows }, () => []);
    items.forEach((i, idx) => {
        rows[rowIndex.get(idx) ?? 0]!.push(i);
    });
    for (const r of rows) r.sort((p, q) => p.g.x - q.g.x);
    const rowCenters = yClusters.map((cl) => cl[0]!);
    let mmdRowGap = gapY;
    if (rowCenters.length > 1) {
        const gaps: number[] = [];
        for (let i = 1; i < rowCenters.length; i++) gaps.push(rowCenters[i]! - rowCenters[i - 1]!);
        mmdRowGap = (gaps.reduce((s, v) => s + v, 0) / gaps.length) / 96;
    }
    const rowHeights = rows.map((r) => Math.max(...r.map((i) => boxH(i.e))));
    let bottom = margin;
    const rowBottoms: number[] = [];
    for (let ri = 0; ri < nRows; ri++) {
        rowBottoms.push(bottom!);
        bottom += rowHeights[ri]! + (ri < nRows - 1 ? Math.max(mmdRowGap, gapY * 0.5) : 0);
    }
    for (const r of rows) {
        const mmdXs = r.map((i) => i.g.x);
        const mmdGaps: number[] = [];
        for (let i = 1; i < mmdXs.length; i++) mmdGaps.push((mmdXs[i]! - mmdXs[i - 1]!) / 96);
        const mmdGap = mmdGaps.length ? mmdGaps.reduce((s, v) => s + v, 0) / mmdGaps.length : gapX;
        let cx = margin + w / 2;
        for (const { e } of r) {
            const h = boxH(e);
            boxes.set(e.id, { x: cx, y: 0, w, h, top: 0, bottom: 0 });
            cx += w + Math.max(mmdGap - w, gapX * 0.5);
        }
    }
    for (const r of rows) {
        const ri = rowIndex.get(items.findIndex((i) => i.e === r[0]!.e))!;
        const hRow = rowHeights[ri]!;
        const yBase = rowBottoms[ri]! + hRow / 2;
        for (const { e } of r) {
            const bb = boxes.get(e.id)!;
            // 行内居中；top/bottom 必须取「该实体自己的盒顶/盒底」——同行实体高度不同
            // （2 属性 vs 3 属性）时若用行顶会把行组整体抬高半行、首行压住表名。
            bb.y = yBase;
            bb.top = yBase + bb.h / 2;
            bb.bottom = yBase - bb.h / 2;
        }
    }
    return { boxes, ...boxExtent(boxes, margin) };
}

/** 内容盒 = 实际放置的盒并集；同时把盒整体平移到 (margin, margin) 起点（页面严格贴合）。
 *  返回内容尺寸；页面尺寸由 buildPagesXml 统一加 2×pageMargin（P-4 画布策略）。 */
function boxExtent(boxes: Map<string, BoxGeom>, margin: number): { pageW: number; pageH: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes.values()) {
        minX = Math.min(minX, b.x - b.w / 2);
        minY = Math.min(minY, b.y - b.h / 2);
        maxX = Math.max(maxX, b.x + b.w / 2);
        maxY = Math.max(maxY, b.y + b.h / 2);
    }
    if (!Number.isFinite(minX)) return { pageW: 0, pageH: 0 };
    const dx = margin - minX;
    const dy = margin - minY;
    if (dx !== 0 || dy !== 0) {
        for (const b of boxes.values()) {
            b.x += dx;
            b.y += dy;
            b.top += dy;
            if (b.bottom !== undefined) b.bottom += dy;
        }
    }
    return { pageW: maxX - minX, pageH: maxY - minY };
}

interface Ctx {
    nextId: number;
    shapes: XmlNode[];
    connects: XmlNode[];
    ids: Map<string, number>;
    nameCount: Map<string, number>;
    masterIds: Map<string, number>;
}

function sel(ctx: Ctx, base: string, id: number): string {
    const n = (ctx.nameCount.get(base) ?? 0) + 1;
    ctx.nameCount.set(base, n);
    return n === 1 ? base : `${base}.${id}`;
}

function cell(n: string, v: string | number, u?: string, f?: string): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', n);
    setAttribute(el, 'V', String(v));
    if (u) setAttribute(el, 'U', u);
    if (f) setAttribute(el, 'F', f);
    return el;
}

function row(t: string | undefined, ix: number | undefined, n: string | undefined, cells: XmlNode[], del?: boolean): XmlNode {
    const r = makeElement('Row');
    if (t) setAttribute(r, 'T', t);
    if (ix !== undefined) setAttribute(r, 'IX', String(ix));
    if (n) setAttribute(r, 'N', n);
    if (del) setAttribute(r, 'Del', '1');
    for (const c of cells) r.children.push(c);
    return r;
}

function section(n: string, rows: XmlNode[], ix?: string): XmlNode {
    const s = makeElement('Section');
    setAttribute(s, 'N', n);
    // 关键（同 class 坑）：母版 Geometry 段带 IX='0'；实例不写 IX 会被 Visio 视为新增段（自动编号为 1），
    // 母版段仍保留 → 双几何段 → "多余一段线"。必须显式 IX='0' 与母版同段（覆写而非新增）。
    if (ix !== undefined) setAttribute(s, 'IX', ix);
    for (const r of rows) s.children.push(r);
    return s;
}

function userRow(n: string, v: string, u?: string, f?: string): XmlNode {
    return row(undefined, undefined, n, [cell('Value', v, u, f)]);
}

function textEl(s: string): XmlNode {
    const t = makeElement('Text');
    t.children.push(s);
    return t;
}

function newShapeNode(): XmlNode {
    return makeElement('Shape');
}

export class ErRenderer {
    render(a: { erModel?: ErModel }, pageHpx: number, pxPerInch = 96, masterIds: Map<string, number> = new Map()): XmlPart {
        const m = a.erModel ?? { entities: [], relations: [] };
        const ctx: Ctx = {
            nextId: 1,
            shapes: [],
            connects: [],
            ids: new Map(),
            nameCount: new Map(),
            masterIds,
        };
        void pageHpx; void pxPerInch;
        const root = makeElement('PageContents');
        const shapes = makeElement('Shapes');
        const connects = makeElement('Connects');
        root.children.push(shapes, connects);
        writeModel(ctx, m);
        for (const s of ctx.shapes) shapes.children.push(s);
        for (const c of ctx.connects) connects.children.push(c);
        setAttribute(root, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
        const xml = serializeDocument(root, {
            declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            indent: 0,
        });
        return part(kPageUri, kPageContentType, xml);
    }
}

function edgePoint(g: BoxGeom, edge: string | undefined, fallbackX: 'left' | 'right' | 'bottom' | 'top'): { x: number; y: number; port: string; part: number } {
    const e = edge !== undefined && ['left', 'right', 'bottom', 'top'].includes(edge) ? edge : fallbackX;
    const centerX = g.x + g.w / 2;
    const centerY = (g.top + g.bottom) / 2;
    switch (e) {
        case 'left': return { x: g.x, y: centerY, port: 'X1', part: 100 };
        case 'right': return { x: g.x + g.w, y: centerY, port: 'X2', part: 101 };
        case 'bottom': return { x: centerX, y: g.bottom, port: 'X3', part: 102 };
        case 'top': return { x: centerX, y: g.top, port: 'X4', part: 103 };
        default: return { x: centerX, y: centerY, port: 'X1', part: 100 };
    }
}

/** 轴优选取边（无 mmd 边提示时）：水平 → 右→左；垂直 → 下→上（页坐标 dst 在上时）。 */
function fallbackEdges(a: BoxGeom, b: BoxGeom): ['left' | 'right' | 'bottom' | 'top', 'left' | 'right' | 'bottom' | 'top'] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function writeModel(ctx: Ctx, m: ErModel): void {
    const { boxes } = layout(m);
    for (const e of m.entities) {
        const g = boxes.get(e.id)!;
        const masterId = ctx.masterIds.get('Entity') ?? 0;
        const boxId = ctx.nextId;
        ctx.ids.set(e.id, boxId);
        const n6 = boxId + 1;
        const n7 = boxId + 2;
        const n8 = boxId + 3;
        ctx.nextId = n8 + 1;
        const box = makeElement('Shape');
        setAttribute(box, 'ID', String(boxId));
        setAttribute(box, 'NameU', sel(ctx, 'Entity', boxId));
        setAttribute(box, 'Type', 'Group');
        if (masterId > 0) setAttribute(box, 'Master', String(masterId));
        box.children.push(
            cell('PinX', f6(g.x)),
            cell('PinY', f6(g.y)),
            cell('Height', f6(g.h)),
            cell('LocPinY', f6(g.h / 2), undefined, 'Inh'),
            cell('Relationships', '0', undefined, 'SUM(DEPENDSON(0,))'),   // 回填
            cell('TxtPinY', f6(g.h - kHdrHalf), undefined, 'Inh'),
        );
        // User：仅 WidthMin（成员文本宽缓存；EntityName 由母版公式从 TheText 派生，实例不写）
        const wmin = Math.max(
            estW(e.name),
            ...e.attributes.map((at) => estW(`${at.type} ${at.name}`.trim())),
        );
        box.children.push(section('User', [
            userRow('WidthMin', f6(wmin), 'DL'),
        ]));
        box.children.push(section('Control', [
            row(undefined, undefined, 'Row_1', [cell('Y', f6(g.h / 2), undefined, 'Inh'), cell('YDyn', f6(g.h / 2), undefined, 'Inh')]),
        ]));
        box.children.push(section('Connection', [
            row('Connection', 0, undefined, [cell('Y', f6(g.h / 2), undefined, 'Inh')]),
            row('Connection', 1, undefined, [cell('Y', f6(g.h / 2), undefined, 'Inh')]),
            row('Connection', 3, undefined, [cell('Y', f6(g.h), undefined, 'Inh')]),
        ]));
        const geom = [
            row('LineTo', 3, undefined, [cell('Y', f6(g.h), undefined, 'Inh')]),
            row('LineTo', 4, undefined, [cell('Y', f6(g.h), undefined, 'Inh')]),
        ];
        // 官方实体实例无根 Geometry 段（边框由子形状 #6 承载——自写根段会多画一圈矩形）
        box.children.push(textEl(e.name));
        const kids = makeElement('Shapes');
        const k6 = newShapeNode();
        setAttribute(k6, 'ID', String(n6));
        setAttribute(k6, 'MasterShape', '6');
        setAttribute(k6, 'Type', 'Shape');
        k6.children.push(cell('PinY', f6(g.h / 2), undefined, 'Inh'), cell('Height', f6(g.h), undefined, 'Inh'), cell('LocPinY', f6(g.h / 2), undefined, 'Inh'));
        k6.children.push(section('Geometry', geom, '0'));
        const k7 = newShapeNode();
        setAttribute(k7, 'ID', String(n7));
        setAttribute(k7, 'MasterShape', '7');
        setAttribute(k7, 'Type', 'Shape');
        k7.children.push(cell('PinY', f6(g.h), undefined, 'Inh'));
        const k8 = newShapeNode();
        setAttribute(k8, 'ID', String(n8));
        setAttribute(k8, 'MasterShape', '8');
        setAttribute(k8, 'Type', 'Shape');
        k8.children.push(cell('PinY', f6(g.h), undefined, 'Inh'));
        for (const k of [k6, k7, k8]) kids.children.push(k);
        box.children.push(kids);

        // 官方序列：盒在前、其属性行在后（属性行画在盒之上，形成整体）
        ctx.shapes.push(box);

        // 属性行：主键 → 分隔线（0 高，不占槽位）→ 普通属性（官方逐值：行与行紧贴堆叠）
        const memberIds: number[] = [];
        let cursor = g.top - kHdrHgt;               // 内容区顶
        let itemIndex = 1;
        for (const at of e.attributes.filter((x) => x.primaryKey)) {
            memberIds.push(writeAttrRow(ctx, true, boxId, g.x, cursor - kRowH / 2, at, itemIndex));
            cursor -= kRowH;
            itemIndex += 1;
        }
        if (e.attributes.some((x) => x.primaryKey) && e.attributes.some((x) => !x.primaryKey)) {
            memberIds.push(writePkSeparator(ctx, boxId, g.x, cursor));   // 分隔线=0 高行，光标不前移
            itemIndex += 1;
        }
        for (const at of e.attributes.filter((x) => !x.primaryKey)) {
            memberIds.push(writeAttrRow(ctx, false, boxId, g.x, cursor - kRowH / 2, at, itemIndex));
            cursor -= kRowH;
            itemIndex += 1;
        }
        const relCell2 = cell('Relationships', '0', undefined,
            `SUM(DEPENDSON(2,${memberIds.map((id) => `Sheet.${id}!SheetRef()`).join(',')}))`);
        box.children[4] = relCell2;
    }
    for (const r of m.relations) {
        const src = ctx.ids.get(r.from);
        const dst = ctx.ids.get(r.to);
        if (src === undefined || dst === undefined) continue;
        const a = boxes.get(r.from)!;
        const b = boxes.get(r.to)!;
        const [fe, te] = fallbackEdges(a, b);
        const p1 = edgePoint(a, r.fromEdge, fe);
        const p2 = edgePoint(b, r.toEdge, te);
        const lineId = writeRelation(ctx, src, dst, a, b, r, fe, te);
        ctx.connects.push(
            connectRec(lineId, 'EndX', 12, dst, `Connections.${p2.port}`, p2.part),
            connectRec(lineId, 'BeginX', 9, src, `Connections.${p1.port}`, p1.part),
        );
    }
}

function connectRec(fromSheet: number, fromCell: string, fromPart: number, toSheet: number, toCell: string, toPart: number): XmlNode {
    const el = makeElement('Connect');
    setAttribute(el, 'FromSheet', String(fromSheet));
    setAttribute(el, 'FromCell', fromCell);
    setAttribute(el, 'FromPart', String(fromPart));
    setAttribute(el, 'ToSheet', String(toSheet));
    setAttribute(el, 'ToCell', toCell);
    setAttribute(el, 'ToPart', String(toPart));
    return el;
}

/** 属性行实例（PK/普通；官方模式：LISTSHEETREF + ItemIndex + 几何 X 行；嵌套 MasterShape 6/7 文字覆写）。
 *  单位语义（同 class 实测）：单元格 V 数值 = 页内英寸值，U='MM' 仅为母版单位标签——
 *  ER 官方样本 属性行 Width V=2.559055118110236（=盒宽 65MM 的英寸值）。
 *  官方 PK 行实例不写 ObjType（主键语义由母版 User.PrimaryKey=1 承载；旧包 ObjType=1 已弃）。 */
function writeAttrRow(ctx: Ctx, isPk: boolean, boxId: number, cx: number, y: number, at: ErEntity['attributes'][number], itemIndex: number): number {
    const masterName = isPk ? 'Primary Key Attribute' : 'Attribute';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId++;
    const text = `${at.type} ${at.name}${at.primaryKey ? ' PK' : ''}`.trim();
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(cx)),
        cell('PinY', f6(y)),
        cell('Width', String(kMemberW), 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,User.UserWidth)'),
        cell('LocPinX', String(kMemberW / 2), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(5,Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
        cell('TxtWidth', String(kMemberW), 'MM', 'Inh'),
    );
    // User 行族（官方单段：ContainerMargin/WidthMin/[普通行颜色行]/ItemIndex）
    const userRows: XmlNode[] = [
        userRow('ContainerMargin', '0', undefined, 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
        userRow('WidthMin', '0', undefined, 'IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN<TEXTWIDTH(TheText),SETF(GetRef(LISTSHEETREF()!User.WIDTHMIN),TEXTWIDTH(TheText)),0),0)'),
    ];
    if (!isPk) {
        userRows.push(
            userRow('DarkerColor', '0', 'COLOR', 'Inh'),
            userRow('DarkColor', '0', 'COLOR', 'Inh'),
            userRow('BackFillColor', '#f2f2f2', 'COLOR', 'IFERROR(IF(OR(THEMEPROP("Embellishment")=1,NOT(User.PrimaryKey)),LISTSHEETREF()!User.BACKGRND,FillForegnd),FillForegnd)'),
            userRow('BackLineColor', '0', 'COLOR', 'IFERROR(IF(OR(THEMEPROP("Embellishment")=1,NOT(User.PrimaryKey)),LISTSHEETREF()!User.BACKGRNDLINE,LineColor),LineColor)'),
        );
    }
    userRows.push(userRow('ItemIndex', String(itemIndex), undefined, 'Inh'));
    el.children.push(section('User', userRows));
    if (!isPk) {
        // 官方普通行：Character（文字色）在 Connection 前，仅此一枚
        el.children.push(section('Character', [row(undefined, 0, undefined, [cell('Color', '0', undefined, 'Inh')])]));
    }
    el.children.push(section('Connection', [
        row('Connection', 1, undefined, [cell('X', String(kMemberW), 'MM', 'Inh')]),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', String(kMemberW), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', String(kMemberW), 'MM', 'Inh')]),
    ], '0'));
    // 嵌套 MasterShape 6/7：官方 PK 行为空引用（无 Cell/段）；普通行带 Character.Color=0 Inh（文字色覆写）
    const kids = makeElement('Shapes');
    for (const ms of ['6', '7']) {
        const k = newShapeNode();
        setAttribute(k, 'ID', String(ctx.nextId++));
        setAttribute(k, 'MasterShape', ms);
        setAttribute(k, 'Type', 'Shape');
        if (!isPk) {
            k.children.push(section('Character', [row(undefined, 0, undefined, [cell('Color', '0', undefined, 'Inh')])]));
        }
        kids.children.push(k);
    }
    el.children.push(kids);
    el.children.push(textEl(text));
    ctx.shapes.push(el);
    return id;
}

/** 主键分隔线实例（官方模式：ContainerMargin + 几何 IX2 覆写；Geometry 段 IX='0'）。 */
function writePkSeparator(ctx: Ctx, boxId: number, cx: number, y: number): number {
    const masterId = ctx.masterIds.get('Primary Key Separator') ?? 0;
    const id = ctx.nextId++;
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Primary Key Separator', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(cx)),
        cell('PinY', f6(y)),
        cell('Width', String(kMemberW), 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,48MM)'),
        cell('LocPinX', String(kMemberW / 2), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(5,Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
    );
    el.children.push(section('User', [
        userRow('ContainerMargin', '0', undefined, 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', String(kMemberW), 'MM', 'Inh')]),
    ], '0'));
    ctx.shapes.push(el);
    return id;
}

/** 关系线实例（官方 er-all-in-one 代数）：
 *  Begin/End = 各自盒边中点（mmd fromEdge/toEdge 优先；缺则轴优选取边）；
 *  W/H = 带符号轴差（GUARD(EndX-BeginX)/(EndY-BeginY)）；Pin=中点；L 形几何 (0,0)→(0,H)→(W,H)；
 *  Connection 双行 = 本地端点吸着位（Begin=出线向*inset、End=(W-DXEnd,H)——驱动母版 DXBegin/DYBegin/
 *  DXEnd/DYEnd/BeginAngle/EndAngle 公式；端标记子形状 6/7（Begin 对）与 8/9（End 对）随方向旋转；
 *  End 侧 π 翻向（从右向左入）补 LocPin 缓存与 EndAngle（官方 49 模式）。 */
function writeRelation(ctx: Ctx, srcId: number, dstId: number, a: BoxGeom, b: BoxGeom, r: ErModel['relations'][number], fe: 'left' | 'right' | 'bottom' | 'top', te: 'left' | 'right' | 'bottom' | 'top'): number {
    const p1 = edgePoint(a, r.fromEdge, fe);
    const p2 = edgePoint(b, r.toEdge, te);
    const masterId = ctx.masterIds.get('Relationship') ?? 0;
    const id = ctx.nextId++;

    const bx = p1.x, by = p1.y, ex = p2.x, ey = p2.y;
    const w = ex - bx;
    const h = ey - by;
    const pinX = (bx + ex) / 2;
    const pinY = (by + ey) / 2;
    // 出线向（本地：Begin=(0,0)，首段垂直、末段水平——官方 L 形；取最后非退化段定方向）
    const dirX = Math.abs(h) > 1e-9 ? 0 : Math.sign(w);
    const dirY = Math.abs(h) > 1e-9 ? Math.sign(h) : 0;
    const endDirX = Math.abs(w) > 1e-9 ? Math.sign(w) : 0;
    const endDirY = Math.abs(w) > 1e-9 ? 0 : Math.sign(h);
    const beginAngle = Math.atan2(dirY, dirX);
    const endAngle = Math.atan2(endDirY, endDirX);
    const endFlipped = Math.abs(Math.abs(endAngle) - Math.PI) < 1e-9;
    // 端点内缩缓存（官方：Connection 双行与 User.DYBegin/DXEnd 同值）
    const con1x = dirX * kInset;
    const con1y = dirY * kInset;
    const con2x = w - endDirX * kInset;
    const con2y = h - endDirY * kInset;
    // 标签位（官方逐值：(|W|-|H|)/2×符号——L 形折线中点投影）
    const midX = Math.abs(w) > Math.abs(h) ? Math.sign(w) * (Math.abs(w) - Math.abs(h)) / 2 : 0;
    const midY = Math.abs(w) > Math.abs(h) ? h : Math.sign(h) * (Math.abs(h) - Math.abs(w)) / 2;

    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Relationship', id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(pinX), undefined, 'Inh'),
        cell('PinY', f6(pinY), undefined, 'Inh'),
        cell('Width', f6(w), undefined, 'GUARD(EndX-BeginX)'),
        cell('Height', f6(h), undefined, 'GUARD(EndY-BeginY)'),
        cell('LocPinX', f6(w / 2), undefined, 'Inh'),
        cell('LocPinY', f6(h / 2), undefined, 'Inh'),
        cell('BeginX', f6(bx), undefined, `PAR(PNT(Sheet.${srcId}!Connections.${p1.port},Sheet.${srcId}!Connections.${p1.port.replace('X', 'Y')}))`),
        cell('BeginY', f6(by), undefined, `PAR(PNT(Sheet.${srcId}!Connections.${p1.port},Sheet.${srcId}!Connections.${p1.port.replace('X', 'Y')}))`),
        cell('EndX', f6(ex), undefined, `PAR(PNT(Sheet.${dstId}!Connections.${p2.port},Sheet.${dstId}!Connections.${p2.port.replace('X', 'Y')}))`),
        cell('EndY', f6(ey), undefined, `PAR(PNT(Sheet.${dstId}!Connections.${p2.port},Sheet.${dstId}!Connections.${p2.port.replace('X', 'Y')}))`),
        cell('LayerMember', '0'),
        cell('BegTrigger', '2', undefined, `_XFTRIGGER(Sheet.${srcId}!EventXFMod)`),
        cell('EndTrigger', '2', undefined, `_XFTRIGGER(Sheet.${dstId}!EventXFMod)`),
        cell('TxtPinX', f6(midX), undefined, 'Inh'),
        cell('TxtPinY', f6(midY), undefined, 'Inh'),
    );
    el.children.push(section('Control', [
        row(undefined, undefined, 'TextPosition', [
            cell('X', f6(midX)), cell('Y', f6(midY)),
            cell('XDyn', f6(midX), undefined, 'Inh'), cell('YDyn', f6(midY), undefined, 'Inh'),
        ]),
    ]));
    const userRows: XmlNode[] = [
        userRow('DYBegin', f6(con1y), 'DL', 'Inh'),
        userRow('DXEnd', f6(w - con2x), 'DL', 'Inh'),
    ];
    if (!r.identifying) {
        // mmd 非识别关系（..）→ 官方 User.Identifying=0 → 母版 LinePattern=GUARD(IF(Identifying,1,2)) 虚线
        userRows.push(userRow('Identifying', '0'));
    }
    if (endFlipped) userRows.push(userRow('EndAngle', f6(endAngle), 'DA', 'Inh'));
    el.children.push(section('User', userRows));
    el.children.push(section('Connection', [
        row('Connection', 0, undefined, [cell('X', f6(con1x)), cell('Y', f6(con1y))]),
        row('Connection', 1, undefined, [cell('X', f6(con2x)), cell('Y', f6(con2y))]),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('Y', f6(h))]),
        row('LineTo', 3, undefined, [cell('X', f6(w)), cell('Y', f6(h))]),
    ], '0'));
    const kids = makeElement('Shapes');
    // 端标记：Begin 对 6/7（PinY 缓存 = Con1+sin(beginAngle±45°)*2.5MM；PinX 由母版公式实时算）
    //          End 对 8/9（PinX/PinY 缓存 = Con2+cos/sin(endAngle±135°)*2.5MM）
    const mk25 = (deg: number) => deg * Math.PI / 180;
    for (const [ms, conX, conY, ang, side] of [
        ['6', con1x, con1y, beginAngle + mk25(45), 'begin'],
        ['7', con1x, con1y, beginAngle - mk25(45), 'begin'],
        ['8', con2x, con2y, endAngle + mk25(135), 'end'],
        ['9', con2x, con2y, endAngle - mk25(135), 'end'],
    ] as Array<[string, number, number, number, 'begin' | 'end']>) {
        const k = newShapeNode();
        setAttribute(k, 'ID', String(ctx.nextId++));
        setAttribute(k, 'MasterShape', ms);
        setAttribute(k, 'Type', 'Shape');
        const px = conX + Math.cos(ang) * (2.5 * 0.03937007874015748);
        const py = conY + Math.sin(ang) * (2.5 * 0.03937007874015748);
        if (side === 'end') {
            k.children.push(cell('PinX', f6(px), 'MM', 'Inh'));
        } else {
            void px; // begin 侧 PinX 不由实例覆写（母版公式实时）
        }
        k.children.push(cell('PinY', f6(py), 'MM', 'Inh'));
        if (side === 'end' && endFlipped) {
            // 官方 49 模式：π 翻向补 LocPin 缓存（右翼=0/0.13338、左翼=0/0）
            if (ms === '8') {
                k.children.push(cell('LocPinX', '0', undefined, 'Inh'));
                k.children.push(cell('LocPinY', '0.1333828247070313', undefined, 'Inh'));
            } else {
                k.children.push(cell('LocPinX', '0', undefined, 'Inh'));
                k.children.push(cell('LocPinY', '0', undefined, 'Inh'));
            }
        }
        const rows: XmlNode[] = [];
        if (side === 'end') {
            if (endFlipped) rows.push(userRow('EndAngle', f6(endAngle), 'DA', 'Inh'));
            rows.push(userRow('Con2X', f6(con2x), 'DL', 'Inh'));
            rows.push(userRow('Con2Y', f6(con2y), 'DL', 'Inh'));
        } else {
            rows.push(userRow('Con1Y', f6(con1y), 'DL', 'Inh'));
        }
        k.children.push(section('User', rows));
        kids.children.push(k);
    }
    el.children.push(kids);
    if (r.label) el.children.push(textEl(r.label));
    ctx.shapes.push(el);
    return id;
}

export function erPageSize(a: { erModel?: ErModel }): { w: number; h: number } {
    const { pageW, pageH } = layout(a.erModel ?? { entities: [], relations: [] });
    return { w: pageW, h: pageH };
}
