// diag-class：契约 A → 契约 B（source/diag/class.ts；docs/redesign/04-转义层 对应篇）
//
// 母版实例化版（docs/redesign/07-母版形状库方案）：
//  - 类盒 = 官方 Class/Interface 母版实例（Master=N + 最小差异 cell + 嵌套 MasterShape 覆写），
//    行为公式（User/Control/Connection/Geometry）由母版承载，实例只写覆盖；
//  - 成员行 = Member 母版实例（LISTSHEETREF 容器家族），分隔线 = Separator 母版实例；
//  - 关系 = Dependency/Interface Realization/Inheritance 母版实例：双端 PAR 钉接
//    （连接行 X3=下/X4=上，官方样本语义）、_XFTRIGGER、Connects ToPart=100+IX；
//  - 不支持（聚合/组合/无箭头关联，官方母版缺失）kind='unsupported'：不绘制并以
//    console.warn 显式暴露（准则 3：不映射、不自定义、记待核清单）。
// 实例模式来源：docs/research/标准研究模板-手动创建vsdx并解压/class/ 素材包实测
//（temp/audit/class-instances.txt）；缓存值说明见 docs/redesign/07 第 8 节/比对清单。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type ClassModel, type ClassRelationKind } from '../contracts/index.js';

// ── 母版常量（实测自官方母版 User 段/实例缓存；单位 IN） ──
const kHdrHalf = 0.2180813184950087;      // Class: HdrHgt*0.5（TxtPinY=Height-此值）
const kTextOff = 0.2222727308485243;      // Interface/Enumeration: StereoTypeHgt TextOffset
const kCorner = 0.6181102362204725;       // 圆角 B/Y 缓存（样本恒定）
const kLineHalfW = 0.09842519685039369;   // 关系线宽一半（Width 0.1968503937007874*0.5）
const kTxtH = 0.2444939358181424;         // 关系文本高缓存（默认字号 TEXTHEIGHT 结果）
const kTxtLocY = 0.1222469679090712;      // TxtHeight*0.5
const kInsetDep = 0.02257173244843713;    // 垂直箭杆内缩缓存（Dependency 样本）
const kInsetInh = 0.0176201328797827;     // 垂直箭杆内缩缓存（Inheritance 样本）
const kHalfPi = 1.570796326794897;
const kTipInner = 0.02882807271785921;    // 箭角内针 PinX 缓存（垂直样本，MM）
const kTipOuter = 0.1680223209829279;     // 箭角外针 PinX 缓存（垂直样本，MM）
const kTipDy = 0.08721725701231678;       // 箭角针 PinY 缓存（垂直样本，向端内，MM）

const MM = 25.4;
const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6);

/** 文本宽带估算（近似；官方 TEXTWIDTH 由字体度量决定，打开后公式重算——见比对清单）。 */
function estW(text: string, chars = 0.176): number {
    let n = 0;
    for (const ch of text) n += /[\u4e00-\u9fff]/.test(ch) ? 2 : 1;
    return Math.max(0.2, n * chars);
}

/** 布局（单列纵向链，官方语义：关系=下→上；单位 IN）。 */
interface BoxGeom { x: number; y: number; w: number; h: number; }

function layout(a: ClassModel): { boxes: Map<string, BoxGeom>; pageW: number; pageH: number } {
    const w = 2.559055118110236;           // 65MM 母版默认
    const hdr = 0.6;
    const rowH = 0.25;
    const pad = 0.08;
    const gap = 0.9;
    const margin = 0.5;
    let y = hdr / 2 + margin;
    const boxes = new Map<string, BoxGeom>();
    for (const c of a.classes) {
        const rows = c.attributes.length + c.operations.length + (c.attributes.length > 0 && c.operations.length > 0 ? 1 : 0);
        const h = hdr + rows * rowH + pad * 2;
        boxes.set(c.id, { x: margin + w / 2, y, w, h });
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
    warnings: string[];
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

/** 唯一可见的警告收集槽（spec/CLI 可读；每次 render 前清空）。 */
export const kClassWarnings: string[] = [];

function warn(ctx: Ctx, msg: string): void {
    ctx.warnings.push(msg);
    kClassWarnings.push(msg);
    console.warn(msg);
}

export class ClassRenderer {
    render(a: { classModel?: ClassModel }, pageHpx: number, pxPerInch = 96, masterIds: Map<string, number> = new Map()): XmlPart {
        const m = a.classModel ?? { classes: [], relations: [] };
        const ctx: Ctx = {
            nextId: 1,
            shapes: [],
            connects: [],
            ids: new Map(),
            nameCount: new Map(),
            warnings: [],
            masterIds,
        };
        void pageHpx; void pxPerInch;
        const root = makeElement('PageContents');
        const shapes = makeElement('Shapes');
        const connects = makeElement('Connects');
        root.children.push(shapes, connects);
        // 复位警告槽（每次渲染一份契约）
        kClassWarnings.length = 0;
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

function writeModel(ctx: Ctx, m: ClassModel): void {
    const { boxes } = layout(m);
    // 第一遍：类盒 + 嵌套子形状 + 成员行（ID 序：盒、子形状×4、成员…）
    for (const c of m.classes) {
        const g = boxes.get(c.id)!;
        const isIf = c.stereotypes.includes('interface');
        const role = isIf ? 'Interface' : 'Class';
        const warnStereo = c.stereotypes.filter((s) => s !== 'interface');
        if (warnStereo.length > 0) {
            warn(ctx, `[class] 构造型标记 ${warnStereo.join('/')} 无官方母版对应（仅 interface）——按普通类盒渲染，记待核清单`);
        }
        const masterId = ctx.masterIds.get(role) ?? 0;
        const boxId = ctx.nextId;
        ctx.ids.set(c.id, boxId);
        const n6 = boxId + 1;
        const n7 = boxId + 2;
        const n8 = boxId + 3;
        const n9 = boxId + 4;
        ctx.nextId = n9 + 1;

        const box = makeElement('Shape');
        setAttribute(box, 'ID', String(boxId));
        setAttribute(box, 'NameU', sel(ctx, role, boxId));
        setAttribute(box, 'Type', 'Group');
        if (masterId > 0) setAttribute(box, 'Master', String(masterId));
        box.children.push(
            cell('PinX', f6(g.x)),
            cell('PinY', f6(g.y)),
            cell('Width', f6(g.w)),
            cell('Height', f6(g.h)),
            cell('Relationships', '0', undefined, 'SUM(DEPENDSON(0,))'),   // 回填
            cell('TxtPinY', f6(g.h - (isIf ? kTextOff : kHdrHalf)), undefined, 'Inh'),
        );
        box.children.push(section('User', [
            userRow('WidthMin', f6(estW(c.name)), 'DL'),
            userRow('EntityName', c.name, 'STR', 'Inh'),
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
            row('LineTo', 3, undefined, [cell('Y', f6(kCorner), undefined, 'Inh')]),
            row('LineTo', 4, undefined, [cell('Y', f6(kCorner), undefined, 'Inh')]),
            row('EllipticalArcTo', 5, undefined, [cell('Y', f6(kCorner), undefined, 'Inh'), cell('B', f6(kCorner), 'DL', 'Inh')]),
            row('EllipticalArcTo', 6, undefined, [cell('Y', f6(kCorner), undefined, 'Inh'), cell('B', f6(kCorner), 'DL', 'Inh')]),
        ];
        box.children.push(section('Geometry', geom));
        box.children.push(textEl(c.name));
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
        k7.children.push(section('User', [userRow('UmlRole', c.name, 'STR', 'Inh')]));
        const k8 = newShapeNode();
        setAttribute(k8, 'ID', String(n8));
        setAttribute(k8, 'MasterShape', '8');
        setAttribute(k8, 'Type', 'Shape');
        k8.children.push(cell('PinY', f6(g.h), undefined, 'Inh'));
        const k9 = newShapeNode();
        setAttribute(k9, 'ID', String(n9));
        setAttribute(k9, 'MasterShape', '9');
        setAttribute(k9, 'Type', 'Shape');
        k9.children.push(cell('PinY', f6(g.h), undefined, 'Inh'));
        for (const k of [k6, k7, k8, k9]) kids.children.push(k);
        box.children.push(kids);

        // 成员行（官方：属性行 → 分隔线 → 方法行；位于盒内，页坐标 y 向下排）
        const memberIds: number[] = [];
        let y = g.y + g.h / 2 - 0.6 - 0.125;
        for (const at of c.attributes) {
            memberIds.push(writeMember(ctx, boxId, n9, g.x, y, g.w - 0.1, `${at.visibility ?? ''}${at.name}`));
            y -= 0.25;
        }
        if (c.attributes.length > 0 && c.operations.length > 0) {
            writeSeparator(ctx, boxId, n9, g.x, y, g.w - 0.1);
            y -= 0.25;
        }
        for (const op of c.operations) {
            memberIds.push(writeMember(ctx, boxId, n9, g.x, y, g.w - 0.1, `${op.visibility ?? ''}${op.name}`));
            y -= 0.25;
        }
        // 回填 Relationships（官方：SUM(DEPENDSON(首个嵌套子形状,成员行 SheetRef…))）
        const relCell = cell('Relationships', '0', undefined,
            `SUM(DEPENDSON(${n6},${memberIds.map((id) => `Sheet.${id}!SheetRef()`).join(',')}))`);
        box.children[4] = relCell;
        ctx.shapes.push(box);
    }
    // 第二遍：关系线（官方序列在最后；Connects 顺序 EndX 先、BeginX 后）
    for (const r of m.relations) {
        const src = ctx.ids.get(r.from);
        const dst = ctx.ids.get(r.to);
        if (src === undefined || dst === undefined) continue;
        if (r.kind === 'unsupported') {
            warn(ctx, `[class] 关系 ${r.from}->${r.to} 为聚合/组合/无箭头关联，官方母版缺失——不绘制，记待核清单`);
            continue;
        }
        const a = boxes.get(r.from)!;
        const b = boxes.get(r.to)!;
        // 单列布局：源在下、目标在上（垂直：X3=下、X4=上）
        const lineId = writeRelation(ctx, r.kind, src, dst, a.x, a.y - a.h / 2, b.y + b.h / 2);
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

/** Member 母版实例（官方模式：LISTSHEETREF 家族 + User 行族 + NoLine + 几何 X 行）。 */
function writeMember(ctx: Ctx, boxId: number, ms9Id: number, cx: number, y: number, w: number, text: string): number {
    const masterId = ctx.masterIds.get('Member') ?? 0;
    const id = ctx.nextId++;
    const wmm = f6(w * MM);
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Member', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(cx)),
        cell('PinY', f6(y)),
        cell('Width', wmm, 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,User.UserWidth)'),
        cell('LocPinX', f6(w * MM / 2), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(${ms9Id},Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
        cell('TxtWidth', wmm, 'MM', 'Inh'),
        cell('NoLine', '1', undefined, 'Inh'),
    );
    el.children.push(section('User', [
        userRow('MemberName', text, 'STR', 'Inh'),
        userRow('ContainerMargin', f6(0.03937007874015748), 'MM', 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
        userRow('WidthMin', '0', undefined, 'IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN<TEXTWIDTH(TheText),SETF(GetRef(LISTSHEETREF()!User.WIDTHMIN),TEXTWIDTH(TheText)),0),0)'),
        userRow('BackFillColor', '#f2f2f2', 'COLOR', 'IFERROR(LISTSHEETREF()!User.BACKGRND,FillForegnd)'),
        userRow('BackLineColor', '0', 'COLOR', 'IFERROR(LISTSHEETREF()!User.BACKGRNDLINE,LineColor)'),
        userRow('IsInstance', '1', 'BOOL', 'Inh'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', wmm, 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', wmm, 'MM', 'Inh')]),
    ]));
    el.children.push(textEl(text));
    ctx.shapes.push(el);
    return id;
}

/** Separator 母版实例（官方模式：ItemIndex=2 分隔线，几何仅 IX2）。 */
function writeSeparator(ctx: Ctx, boxId: number, ms9Id: number, cx: number, y: number, w: number): void {
    const masterId = ctx.masterIds.get('Separator') ?? 0;
    const id = ctx.nextId++;
    const wmm = f6(w * MM);
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Separator', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(cx)),
        cell('PinY', f6(y)),
        cell('Width', wmm, 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,48MM)'),
        cell('LocPinX', f6(w * MM / 2), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(${ms9Id},Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
    );
    el.children.push(section('User', [
        userRow('ContainerMargin', f6(0.03937007874015748), 'MM', 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
        userRow('ItemIndex', '2', undefined, 'Inh'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', wmm, 'MM', 'Inh')]),
    ]));
    ctx.shapes.push(el);
}

/** 关系线母版实例（垂直：Begin=下盒 X3、End=上盒 X4；双端 PAR 钉接 + _XFTRIGGER）。 */
function writeRelation(ctx: Ctx, kind: Exclude<ClassRelationKind, 'unsupported'>, srcId: number, dstId: number, x: number, by: number, ey: number): number {
    const masterName = kind === 'dependency' ? 'Dependency' : kind === 'realization' ? 'Interface Realization' : 'Inheritance';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId++;
    const h = ey - by;
    const dir = h < 0 ? -1 : 1;
    const angle = dir * kHalfPi;
    const inset = kind === 'dependency' ? kInsetDep : kInsetInh;
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const kLabel = kind === 'dependency' ? '依赖' : kind === 'realization' ? '接口实现' : '继承';
    el.children.push(
        cell('PinX', f6(x), undefined, 'Inh'),
        cell('PinY', f6((by + ey) / 2), undefined, 'Inh'),
        cell('Width', f6(0.1968503937007874), undefined, 'GUARD(0.19685039370079DL)'),
        cell('Height', f6(h), undefined, 'GUARD(EndY-BeginY)'),
        cell('LocPinX', f6(kLineHalfW), undefined, 'Inh'),
        cell('LocPinY', f6(h / 2), undefined, 'Inh'),
        cell('BeginX', f6(x), undefined, `PAR(PNT(Sheet.${srcId}!Connections.X3,Sheet.${srcId}!Connections.Y3))`),
        cell('BeginY', f6(by), undefined, `PAR(PNT(Sheet.${srcId}!Connections.X3,Sheet.${srcId}!Connections.Y3))`),
        cell('EndX', f6(x), undefined, `PAR(PNT(Sheet.${dstId}!Connections.X4,Sheet.${dstId}!Connections.Y4))`),
        cell('EndY', f6(ey), undefined, `PAR(PNT(Sheet.${dstId}!Connections.X4,Sheet.${dstId}!Connections.Y4))`),
        cell('LayerMember', '0'),
        cell('BegTrigger', '2', undefined, `_XFTRIGGER(Sheet.${srcId}!EventXFMod)`),
        cell('EndTrigger', '2', undefined, `_XFTRIGGER(Sheet.${dstId}!EventXFMod)`),
        cell('TxtPinX', f6(kLineHalfW), undefined, 'Inh'),
        cell('TxtPinY', f6(h / 2), undefined, 'Inh'),
        cell('TxtHeight', f6(kTxtH), undefined, 'Inh'),
        cell('TxtLocPinY', f6(kTxtLocY), undefined, 'Inh'),
    );
    el.children.push(section('Control', [
        row(undefined, undefined, 'TextPosition', [
            cell('X', f6(kLineHalfW)), cell('Y', f6(h / 2)),
            cell('XDyn', f6(kLineHalfW), undefined, 'Inh'), cell('YDyn', f6(h / 2), undefined, 'Inh'),
            cell('XCon', '0', undefined, 'Inh'),
        ]),
    ]));
    el.children.push(section('User', [
        userRow('RelationshipName', kLabel, 'STR', 'Inh'),
        userRow('DYBegin', f6(inset), 'DL', 'Inh'),
        userRow('DXEnd', '0', 'DL', 'Inh'),
        userRow('DYEnd', f6(inset), 'DL', 'Inh'),
        userRow('BeginAngle', f6(angle), 'DA', 'Inh'),
        userRow('EndAngle', f6(angle), 'DA', 'Inh'),
    ]));
    el.children.push(section('Connection', [
        row('Connection', 0, undefined, [cell('X', f6(kLineHalfW)), cell('Y', f6(inset))]),
        row('Connection', 1, undefined, [cell('X', f6(kLineHalfW)), cell('Y', f6(h - inset))]),
    ]));
    el.children.push(section('Geometry', [
        row('MoveTo', 1, undefined, [cell('X', f6(kLineHalfW))]),
        row('LineTo', 2, undefined, [cell('X', f6(kLineHalfW)), cell('Y', f6(h))]),
        row('LineTo', 3, undefined, [], true),
    ]));
    // 嵌套箭角子形状（官方 MasterShape 6..9：Con1X/Con1Y=Begin 角，Con2X/Con2Y=End 角）
    const kids = makeElement('Shapes');
    const tipPx = kTipInner * 25.4;
    const tipP2 = kTipOuter * 25.4;
    const dy = kTipDy * 25.4;
    for (const [ms, px, py, conn] of [
        ['6', tipP2, by * 25.4 + dir * dy, 'Con1'],
        ['7', tipPx, by * 25.4 + dir * dy, 'Con1'],
        ['8', tipP2, ey * 25.4 - dir * dy, 'Con2'],
        ['9', tipPx, ey * 25.4 - dir * dy, 'Con2'],
    ] as Array<[string, number, number, string]>) {
        const k = newShapeNode();
        setAttribute(k, 'ID', String(ctx.nextId++));
        setAttribute(k, 'MasterShape', ms);
        setAttribute(k, 'Type', 'Shape');
        k.children.push(cell('PinX', f6(px), 'MM', 'Inh'));
        k.children.push(cell('PinY', f6(py), 'MM', 'Inh'));
        k.children.push(section('User', [
            userRow(`${conn}X`, f6(kLineHalfW), 'DL', 'Inh'),
            userRow(`${conn}Y`, f6(inset), 'DL', 'Inh'),
        ]));
        kids.children.push(k);
    }
    el.children.push(kids);
    ctx.shapes.push(el);
    return id;
}

export function classPageSize(a: { classModel?: ClassModel }): { w: number; h: number } {
    const { pageW, pageH } = layout(a.classModel ?? { classes: [], relations: [] });
    return { w: pageW, h: pageH };
}
