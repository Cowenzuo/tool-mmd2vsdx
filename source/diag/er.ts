// diag-er：契约 A → 契约 B（source/diag/er.ts；docs/redesign/04-转义层 对应篇）
//
// 母版实例化版（docs/redesign/07-母版形状库方案）：
//  - 实体 = 官方 Entity 母版实例（Group + Master=N + 最小差异 + 嵌套 MasterShape 6..8 覆写）；
//  - 属性行 = Primary Key Attribute / Attribute 母版实例（LISTSHEETREF 容器家族、
//    ItemIndex 行序、PK 行 ObjType=1）；主键分隔线 = Primary Key Separator 母版实例；
//  - 关系 = Relationship 母版实例：双端 PAR 钉接 + _XFTRIGGER + Connects ToPart=100+IX；
//    箭头/鸦爪由母版承载；关系名走 <Text>（官方样本实例无 RelationshipName 行——记比对清单）。
// 实例模式来源：docs/research/标准研究模板-手动创建vsdx并解压/ER/ 素材包实测
//（temp/audit/instance-patterns.json；实体/属性行/关系实例结构见 ER 专篇与素材包）。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type ErModel, type ErEntity } from '../contracts/index.js';

// ── 母版常量（实测自官方母版 User 段/实例缓存；单位 IN/MM） ──
const kHdrHalf = 0.2180813184950087;      // Entity：HdrHgt*0.5（TxtPinY=Height-此值）
const kInsetRel = 0.07687385795284207;    // 关系线内缩缓存（ER 样本）
const kTipRel = 0.1464709820853771;       // 关系 Begin 角子形状 PinY 缓存（MM，向点内）
const kTipX2 = 2.658318747582445;         // 关系 End 角子形状 PinX 缓存（MM）
const kTipY2 = 2.389731257987676;         // 关系 End 角子形状 PinY 缓存（MM）

const MM = 25.4;
const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6);

/** 布局（单列纵向链；单位 IN）。 */
interface BoxGeom { x: number; y: number; w: number; h: number; }

function layout(m: ErModel): { boxes: Map<string, BoxGeom>; pageW: number; pageH: number } {
    const w = 2.559055118110236;
    const hdr = 0.6;
    const rowH = 0.25;
    const pad = 0.08;
    const gap = 0.9;
    const margin = 0.5;
    let y = hdr / 2 + margin;
    const boxes = new Map<string, BoxGeom>();
    for (const e of m.entities) {
        const rows = e.attributes.length;
        const h = hdr + rows * rowH + pad * 2;
        boxes.set(e.id, { x: margin + w / 2, y, w, h });
        y += h + gap;
    }
    return { boxes, pageW: margin * 2 + w, pageH: y + margin };
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

function section(n: string, rows: XmlNode[]): XmlNode {
    const s = makeElement('Section');
    setAttribute(s, 'N', n);
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
        box.children.push(section('User', [
            userRow('WidthMin', f6(g.w * 0.3447), 'DL'),   // 文本宽近似（重算修正，见比对清单）
            userRow('EntityName', e.name, 'STR', 'Inh'),
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
        box.children.push(section('Geometry', geom));
        box.children.push(textEl(e.name));
        const kids = makeElement('Shapes');
        const k6 = newShapeNode();
        setAttribute(k6, 'ID', String(n6));
        setAttribute(k6, 'MasterShape', '6');
        setAttribute(k6, 'Type', 'Shape');
        k6.children.push(cell('PinY', f6(g.h / 2), undefined, 'Inh'), cell('Height', f6(g.h), undefined, 'Inh'), cell('LocPinY', f6(g.h / 2), undefined, 'Inh'));
        k6.children.push(section('Geometry', geom));
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

        // 属性行：主键 → 分隔线 → 普通属性（ItemIndex 1/2/3+…，官方样本序）
        const memberIds: number[] = [];
        let y = g.y + g.h / 2 - 0.6 - 0.125;
        let itemIndex = 1;
        for (const at of e.attributes.filter((x) => x.primaryKey)) {
            memberIds.push(writeAttrRow(ctx, true, boxId, n8, g.x, y, g.w - 0.1, at, itemIndex));
            y -= 0.25;
            itemIndex += 1;
        }
        if (e.attributes.some((x) => x.primaryKey) && e.attributes.some((x) => !x.primaryKey)) {
            writePkSeparator(ctx, boxId, n8, g.x, y, g.w - 0.1);
            y -= 0.25;
            itemIndex += 1;
        }
        for (const at of e.attributes.filter((x) => !x.primaryKey)) {
            memberIds.push(writeAttrRow(ctx, false, boxId, n8, g.x, y, g.w - 0.1, at, itemIndex));
            y -= 0.25;
            itemIndex += 1;
        }
        const relCell = cell('Relationships', '0', undefined,
            `SUM(DEPENDSON(${n6},${memberIds.map((id) => `Sheet.${id}!SheetRef()`).join(',')}))`);
        box.children[4] = relCell;
        ctx.shapes.push(box);
    }
    for (const r of m.relations) {
        const src = ctx.ids.get(r.from);
        const dst = ctx.ids.get(r.to);
        if (src === undefined || dst === undefined) continue;
        const a = boxes.get(r.from)!;
        const b = boxes.get(r.to)!;
        const lineId = writeRelation(ctx, src, dst, a.x, a.y - a.h / 2, b.y + b.h / 2, r.label);
        ctx.connects.push(
            connectRec(lineId, 'EndX', 12, dst, 'Connections.X4', 103),
            connectRec(lineId, 'BeginX', 9, src, 'Connections.X3', 102),
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

/** 属性行实例（PK/普通；官方模式：LISTSHEETREF + ItemIndex + 几何 X 行；PK 行 ObjType=1；
 *  普通行带 DarkerColor/DarkColor/BackFillColor/BackLineColor + Character/Paragraph 行）。 */
function writeAttrRow(ctx: Ctx, isPk: boolean, boxId: number, n8Id: number, cx: number, y: number, w: number, at: ErEntity['attributes'][number], itemIndex: number): number {
    const masterName = isPk ? 'Primary Key Attribute' : 'Attribute';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId++;
    const wmm = f6(w * MM);
    const text = `${at.type} ${at.name}${at.primaryKey ? ' PK' : ''}`.trim();
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(cx)),
        cell('PinY', f6(y)),
        cell('Width', wmm, 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,User.UserWidth)'),
        cell('LocPinX', f6(w * MM / 2), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(${n8Id},Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
        cell('TxtWidth', wmm, 'MM', 'Inh'),
    );
    if (isPk) el.children.push(cell('ObjType', '1'));
    el.children.push(section('User', [
        userRow('ContainerMargin', '0', undefined, 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
        userRow('WidthMin', '0', undefined, 'IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN<TEXTWIDTH(TheText),SETF(GetRef(LISTSHEETREF()!User.WIDTHMIN),TEXTWIDTH(TheText)),0),0)'),
    ]));
    if (!isPk) {
        el.children.push(section('User', [
            userRow('DarkerColor', '0', undefined, 'Inh'),
            userRow('DarkColor', '0', undefined, 'Inh'),
            userRow('BackFillColor', '#f2f2f2', undefined, 'Inh'),
            userRow('BackLineColor', '0', undefined, 'Inh'),
        ]));
    }
    el.children.push(section('User', [userRow('ItemIndex', String(itemIndex), undefined, 'Inh')]));
    if (!isPk) {
        el.children.push(section('Character', [row(undefined, 0, undefined, [cell('Color', '0', undefined, 'Inh')])]));
        el.children.push(section('Paragraph', [row(undefined, 0, undefined, [cell('Color', '0', undefined, 'Inh')])]));
        el.children.push(section('Character', [row(undefined, 0, undefined, [cell('Color', '0', undefined, 'Inh')])]));
    }
    el.children.push(section('Connection', [
        row('Connection', 1, undefined, [cell('X', wmm, 'MM', 'Inh')]),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', wmm, 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', wmm, 'MM', 'Inh')]),
    ]));
    el.children.push(textEl(text));
    ctx.shapes.push(el);
    return id;
}

/** 主键分隔线实例（官方模式：ContainerMargin + 几何 IX2）。 */
function writePkSeparator(ctx: Ctx, boxId: number, n8Id: number, cx: number, y: number, w: number): void {
    const masterId = ctx.masterIds.get('Primary Key Separator') ?? 0;
    const id = ctx.nextId++;
    const wmm = f6(w * MM);
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Primary Key Separator', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(cx)),
        cell('PinY', f6(y)),
        cell('Width', wmm, 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,48MM)'),
        cell('LocPinX', f6(w * MM / 2), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(${n8Id},Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
    );
    el.children.push(section('User', [
        userRow('ContainerMargin', '0', undefined, 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', wmm, 'MM', 'Inh')]),
    ]));
    ctx.shapes.push(el);
}

/** 关系线实例（垂直：Begin=下实体 X3、End=上实体 X4；双端 PAR + _XFTRIGGER；名称走 <Text>）。 */
function writeRelation(ctx: Ctx, srcId: number, dstId: number, x: number, by: number, ey: number, label: string): number {
    const masterId = ctx.masterIds.get('Relationship') ?? 0;
    const id = ctx.nextId++;
    const h = ey - by;
    const dir = h < 0 ? -1 : 1;
    const inset = dir * kInsetRel;
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Relationship', id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(x), undefined, 'Inh'),
        cell('PinY', f6((by + ey) / 2), undefined, 'Inh'),
        cell('Width', f6(0.1968503937007874), undefined, 'GUARD(0.19685039370079DL)'),
        cell('Height', f6(h), undefined, 'GUARD(EndY-BeginY)'),
        cell('LocPinX', f6(0.09842519685039369), undefined, 'Inh'),
        cell('LocPinY', f6(h / 2), undefined, 'Inh'),
        cell('BeginX', f6(x), undefined, `PAR(PNT(Sheet.${srcId}!Connections.X3,Sheet.${srcId}!Connections.Y3))`),
        cell('BeginY', f6(by), undefined, `PAR(PNT(Sheet.${srcId}!Connections.X3,Sheet.${srcId}!Connections.Y3))`),
        cell('EndX', f6(x), undefined, `PAR(PNT(Sheet.${dstId}!Connections.X4,Sheet.${dstId}!Connections.Y4))`),
        cell('EndY', f6(ey), undefined, `PAR(PNT(Sheet.${dstId}!Connections.X4,Sheet.${dstId}!Connections.Y4))`),
        cell('LayerMember', '0'),
        cell('BegTrigger', '2', undefined, `_XFTRIGGER(Sheet.${srcId}!EventXFMod)`),
        cell('EndTrigger', '2', undefined, `_XFTRIGGER(Sheet.${dstId}!EventXFMod)`),
        cell('TxtPinX', f6(0.2423277979063417), undefined, 'Inh'),
        cell('TxtPinY', f6(h / 2), undefined, 'Inh'),
    );
    el.children.push(section('Control', [
        row(undefined, undefined, 'TextPosition', [
            cell('X', f6(0.2423277979063417)), cell('Y', f6(h / 2)),
            cell('XDyn', f6(0.2423277979063417), undefined, 'Inh'), cell('YDyn', f6(h / 2), undefined, 'Inh'),
        ]),
    ]));
    el.children.push(section('User', [
        userRow('DYBegin', f6(inset), 'DL', 'Inh'),
        userRow('DXEnd', '0', 'DL', 'Inh'),
    ]));
    el.children.push(section('Connection', [
        row('Connection', 0, undefined, [cell('X', '0'), cell('Y', f6(inset))]),
        row('Connection', 1, undefined, [cell('X', f6(0.1968503937007874)), cell('Y', f6(h - inset))]),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('Y', f6(h))]),
        row('LineTo', 3, undefined, [cell('X', f6(0.1968503937007874)), cell('Y', f6(h))]),
    ]));
    const kids = makeElement('Shapes');
    const tips: Array<[string, string, string, string, string]> = [
        ['6', '0', f6(kTipRel * 25.4), 'Con1Y', f6(inset)],
        ['7', '0', f6(-kTipRel * 25.4), 'Con1Y', f6(inset)],
        ['8', f6(kTipX2), f6(-kTipY2 * 25.4), 'Con2Y', f6(h - inset)],
        ['9', f6(kTipX2), f6(-kTipY2 * 25.4), 'Con2Y', f6(h - inset)],
    ];
    for (const [ms, px, py, rowName, vv] of tips) {
        const k = newShapeNode();
        setAttribute(k, 'ID', String(ctx.nextId++));
        setAttribute(k, 'MasterShape', ms);
        setAttribute(k, 'Type', 'Shape');
        k.children.push(cell('PinX', px, 'MM', 'Inh'));
        k.children.push(cell('PinY', py, 'MM', 'Inh'));
        k.children.push(section('User', [userRow(rowName, vv, 'DL', 'Inh')]));
        kids.children.push(k);
    }
    el.children.push(kids);
    if (label) el.children.push(textEl(label));
    ctx.shapes.push(el);
    return id;
}

export function erPageSize(a: { erModel?: ErModel }): { w: number; h: number } {
    const { pageW, pageH } = layout(a.erModel ?? { entities: [], relations: [] });
    return { w: pageW, h: pageH };
}
