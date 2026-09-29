// diag-class：契约 A → 契约 B（source/diag/class.ts；docs/开发过程/01-结构设计.md 对应篇）
//
// 母版实例化版（代数逐值见文件内注释与 docs/VSDX处理经验/02-坑位与解法.md 2.3）：
//  - 类盒 = 官方 Class/Interface 母版实例（Master=N + 最小差异 cell + 嵌套 MasterShape 覆写），
//    行为公式（User/Control/Connection/Geometry）由母版承载，实例只写覆盖；
//  - 成员行 = Member 母版实例（LISTSHEETREF 容器家族），分隔线 = Separator 母版实例；
//  - 关系 = 官方 Inheritance 关系载体母版实例（Actions 菜单语义）：双端 PAR 钉接
//    （连接行 X3=下/X4=上，官方样本语义）、_XFTRIGGER、Connects ToPart=100+IX；
//    6 类 mmd 关系（继承/实现/依赖/定向关联/聚合/复合）由母版 Actions 的
//    BeginArrow/EndArrow/LinePattern GUARD 组合承载（官方母版菜单 1:1，无自定义形状）；
// 实例模式来源：docs/VSDX解压结构研究/标准研究模板-手动创建vsdx并解压/class/ 素材包实测。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kCanvasBleed, kCanvasMargin } from '../common/geometry/transform.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type ClassBox, type ClassModel, type ClassRelationKind } from '../contracts/index.js';

// ── 母版常量（实测自官方母版 User 段/实例缓存；单位 IN） ──
const kHdrHalf = 0.2180813184950087;      // Class: HdrHgt*0.5（TxtPinY=Height-此值）
const kHdrHgt = 0.4361626369900174;       // Class 母版 User.HdrHgt（几何行 Y=Height-User.HdrHgt 缓存依据）
const kHdrIface = 0.5403798122829861;     // Interface 实例 User.HdrHgt（用户Visio实测：件行TxtHeight+立体条高）
const kStereoHgtIf = 0.1667171752929687;  // Interface 实例 StereoTypeHgt/TextOffset 实测值（TxtPinY=Height-此值）
const kMargin = 0.03937007874015748;      // MSVSDCONTAINERMARGIN = 1MM（IN 数值）
const kMemberW = 2.480314960629921;       // 成员/分隔线宽 = 盒宽 2.559055118110236-2*Margin
                                          //（官方实例缓存 V 为 IN，U='MM' 仅为母版标签——数值才是空间值）
const kMemberHW = 1.240157480314961;      // kMemberW*0.5（官方 LocPinX 缓存，IN）
const kLineHalfW = 0.09842519685039369;   // 关系线宽一半（Width 0.1968503937007874*0.5）
const kTxtH = 0.2444939358181424;         // 关系文本高缓存（默认字号 TEXTHEIGHT 结果）
const kTxtLocY = 0.1222469679090712;      // TxtHeight*0.5
const kInsetDep = 0.02257173244843713;    // 垂直箭杆内缩缓存（Dependency 样本）
const kInsetInh = 0.0176201328797827;     // 垂直箭杆内缩缓存（Inheritance 样本）
const kHalfPi = 1.570796326794897;

const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6);

/** 文本宽带估算（近似；官方 TEXTWIDTH 由字体度量决定，打开后公式重算——见比对清单）。 */
function estW(text: string, chars = 0.176): number {
    let n = 0;
    for (const ch of text) n += /[\u4e00-\u9fff]/.test(ch) ? 2 : 1;
    return Math.max(0.2, n * chars);
}

/** 布局：优先 mmd 布局比例（行/列聚簇 + 间距比例；行高/盒宽用官方公式——行高不一致不重叠）；
 *  无 mmd 布局时回退双列网格（旧行为）。单位 IN（mmd px/96）。 */
interface BoxGeom { x: number; y: number; w: number; h: number; top: number; }

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

function layout(a: ClassModel): { boxes: Map<string, BoxGeom>; pageW: number; pageH: number } {
    const w = 2.559055118110236;           // 官方 65MM 盒宽
    const hdr = 0.6;
    const rowH = 0.25;
    const pad = 0.08;
    const gapX = 1.2;
    const gapY = 0.9;
    const margin = kCanvasMargin + kCanvasBleed; // 页面 = 内容盒 + 半线宽 + 出血（Visio 会重算走线，须留余量）
    const cols = 2;
    // 官方内容公式盒高（成员槽 0.25IN/分隔线 1MM）
    const boxH = (c: ClassBox) => {
        const n = c.attributes.length + c.operations.length + (c.attributes.length > 0 && c.operations.length > 0 ? 1 : 0);
        return hdr + n * rowH + pad * 2;
    };
    const boxes = new Map<string, BoxGeom>();
    const mmd = a.layout ?? undefined;
    const hasMmd = !!mmd && a.classes.every((c) => mmd[c.name] !== undefined && mmd[c.name]!.x !== undefined);

    if (!hasMmd) {
        // ── 旧行为：双列网格（fallback）──
        const rowHs: number[] = [];
        const rowOf = new Map<number, number>();
        a.classes.forEach((c, i) => {
            const h = boxH(c);
            const row = Math.floor(i / cols);
            rowHs[row] = Math.max(rowHs[row] ?? 0, h);
            rowOf.set(i, row);
        });
        let rowBottom = margin;
        const rowY = new Map<number, number>();
        for (let r = 0; r < rowHs.length; r++) {
            rowY.set(r, rowBottom);
            rowBottom += (rowHs[r] ?? 0) + gapY;
        }
        a.classes.forEach((c, i) => {
            const h = boxH(c);
            const row = rowOf.get(i)!;
            const col = i % cols;
            boxes.set(c.id, {
                x: margin + w / 2 + col * (w + gapX),
                y: (rowY.get(row) ?? 0) + h / 2,
                w,
                h,
                top: (rowY.get(row) ?? 0) + h,
            });
        });
        return { boxes, ...boxExtent(boxes, margin) };
    }

    // ── mmd 比例布局 ──
    // 1) 行聚簇（按 y，容差=最小盒尺寸的一半≈48px）→ 行序（y 升序）
    type Item = { c: ClassBox; g: { x: number; y: number; width: number; height: number } };
    const items: Item[] = a.classes.map((c) => ({ c, g: mmd![c.name]! }));
    const ys = items.map((i) => i.g.y);
    const yClusters = clusterAxis(ys, 48);
    const rowIndex = new Map<number, number>(); // item idx → row（mmd y 向下：小 y=顶部；反序使 Visio 页坐标 y 向上=顶部）
    const nRows = yClusters.length;
    items.forEach((i, idx) => {
        // 找最近的簇
        let best = 0, bestD = Infinity;
        yClusters.forEach((cl, ri) => {
            const d = Math.abs(i.g.y - cl[0]!);
            if (d < bestD) { bestD = d; best = ri; }
        });
        // mmd 坐标 y 向下（svg）；Visio 页坐标 y 向上——行序反转
        rowIndex.set(idx, nRows - 1 - best);
    });
    // 2) 行内按 x 排序；列数=最大行宽
    const rows: Array<Item[]> = Array.from({ length: nRows }, () => []);
    items.forEach((i, idx) => {
        const bucket = rows[rowIndex.get(idx) ?? 0];
        bucket!.push(i);
    });
    for (const r of rows) r.sort((p, q) => p.g.x - q.g.x);
    // 3) 行高 = 官方内容公式（行内最大）；行距 = mmd 中心距比例（转英寸），且 ≥ 官方 gapY 基数防重叠
    const rowCenters = yClusters.map((cl) => cl[0]!);
    let mmdRowGap = gapY;
    if (rowCenters.length > 1) {
        const gaps: number[] = [];
        for (let i = 1; i < rowCenters.length; i++) gaps.push(rowCenters[i]! - rowCenters[i - 1]!);
        mmdRowGap = (gaps.reduce((s, v) => s + v, 0) / gaps.length) / 96; // px→in
    }
    // 行底向上堆叠（行高=行内最大盒高；行距=mmd 比例，不重叠）
    const rowHeights = rows.map((r) => Math.max(...r.map((i) => boxH(i.c))));
    let bottom = margin;
    const rowBottoms: number[] = [];
    for (let ri = 0; ri < nRows; ri++) {
        rowBottoms.push(bottom!);
        bottom += rowHeights[ri]! + (ri < nRows - 1 ? Math.max(mmdRowGap, gapY * 0.5) : 0);
    }
    // 4) 行内 x：mmd 相邻中心差比例（转英寸）→ 间距 ≥ 官方 gapX 基数
    for (const r of rows) {
        const mmdXs = r.map((i) => i.g.x);
        const mmdGaps: number[] = [];
        for (let i = 1; i < mmdXs.length; i++) mmdGaps.push((mmdXs[i]! - mmdXs[i - 1]!) / 96);
        const mmdGap = mmdGaps.length ? mmdGaps.reduce((s, v) => s + v, 0) / mmdGaps.length : gapX;
        let cx = margin + w / 2;
        for (const { c } of r) {
            const h = boxH(c);
            boxes.set(c.id, { x: cx, y: 0, w, h, top: 0 });
            cx += w + Math.max(mmdGap - w, gapX * 0.5);
        }
    }
    // 5) 每行的 y：行内最大盒高居中（中心 = 行底 + 行高/2）
    for (const r of rows) {
        const ri = rowIndex.get(items.findIndex((i) => i.c === r[0]!.c))!;
        const hRow = rowHeights[ri]!;
        const yBase = rowBottoms[ri]! + hRow / 2;
        for (const { c } of r) {
            // 行内对齐：中心行 y 相同（mmd 行内同 y）
            const bb = boxes.get(c.id)!;
            bb.y = yBase;
            bb.top = rowBottoms[ri]! + hRow;
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
    warnings: string[];
    masterIds: Map<string, number>;
    /** 每类盒最终几何（内容收缩后）：pinX=左下角X（6位）、bottom=左下角Y、top、w、h。 */
    classGeom: Map<string, { pinX: number; bottom: number; top: number; w: number; h: number }>;
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
    // 关键：母版 Geometry/Connection 段带 IX='0'；实例不写 IX 会被 Visio 视为新增段（自动编号为 1），
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

/** 唯一可见的警告收集槽（spec/CLI 可读；每次 render 前清空）。 */
const kClassWarnings: string[] = [];

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
            classGeom: new Map(),
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

        // 列表内容（属性行 → 分隔线 → 方法行）：成员槽 0.25IN，分隔线槽 1MM
        const attrIds: number[] = [];   // 保留：成员+分隔线统一在下方写入
        const items: Array<{ kind: 'member' | 'sep'; text?: string }> = [];
        for (const at of c.attributes) items.push({ kind: 'member', text: `${at.visibility ?? ''}${at.name}` });
        if (c.attributes.length > 0 && c.operations.length > 0) items.push({ kind: 'sep' });
        for (const op of c.operations) items.push({ kind: 'member', text: `${op.visibility ?? ''}${op.name}` });
        const slotH = (k: 'member' | 'sep') => (k === 'member' ? 0.25 : kMargin);
        // 官方实例盒高 = HdrHgt + 2*ContainerMargin + Σ槽高（用户 Hand-edit 实测逐盒精确吻合；
        // 母版容器自适应，V 值=英寸数值，U='MM' 仅为母版单位标签）
        const hdrH = isIf ? kHdrIface : kHdrHgt;
        const h = hdrH + 2 * kMargin + items.reduce((s, it) => s + slotH(it.kind), 0);

        const box = makeElement('Shape');
        setAttribute(box, 'ID', String(boxId));
        setAttribute(box, 'NameU', sel(ctx, role, boxId));
        setAttribute(box, 'Type', 'Group');
        if (masterId > 0) setAttribute(box, 'Master', String(masterId));
        // 官方 Class/Interface 母版容器 LocPin=(0,0)（左下角，F=Width*0/Height*0）——
        // 实例 PinX/PinY = 左下角坐标；渲染盒 = [PinX, PinY]→[PinX+Width, PinY+Height]。
        // 实测语义：盒顶保持不变，底随内容收缩（PinY = top - H）；
        // 成员中心 X = 盒 PinX + W/2（Visio 从盒 PinX 重推，不是网格理论值）。
        // 精度：PinX 保留 6 位（用户 Hand-edit 文件即如此——Visio 仅重写被拖动的维度），
        //       PinY/Width/Height 全精度（Visio 重算后写全精度）。
        const boxPinX = f6(g.x - g.w / 2);
        const memberCX = Number(boxPinX) + g.w / 2;
        const boxBottom = g.top - h;
        ctx.classGeom.set(c.id, { pinX: Number(boxPinX), bottom: boxBottom, top: g.top, w: g.w, h });
        box.children.push(
            cell('PinX', boxPinX),
            cell('PinY', String(boxBottom)),
            cell('Width', String(g.w)),
            cell('Height', String(h)),
            cell('Relationships', '0', undefined, 'SUM(DEPENDSON(0,))'),   // 回填
            cell('TxtPinY', String(h - (isIf ? kStereoHgtIf : kHdrHalf)), undefined, 'Inh'),
        );
        box.children.push(section('User', [
            userRow('WidthMin', f6(estW(c.name)), 'DL'),
            userRow('EntityName', c.name, 'STR', 'Inh'),
        ]));
        box.children.push(section('Control', [
            row(undefined, undefined, 'Row_1', [cell('Y', String(h / 2), undefined, 'Inh'), cell('YDyn', String(h / 2), undefined, 'Inh')]),
        ]));
        box.children.push(section('Connection', [
            row('Connection', 0, undefined, [cell('Y', String(h / 2), undefined, 'Inh')]),
            row('Connection', 1, undefined, [cell('Y', String(h / 2), undefined, 'Inh')]),
            row('Connection', 3, undefined, [cell('Y', String(h), undefined, 'Inh')]),
        ]));
        const geomY = h - hdrH;  // 官方实例缓存 = Height-User.HdrHgt（母版行公式 F=Inh 同式）
        const geom = [
            row('LineTo', 3, undefined, [cell('Y', geomY, undefined, 'Inh')]),
            row('LineTo', 4, undefined, [cell('Y', geomY, undefined, 'Inh')]),
            row('EllipticalArcTo', 5, undefined, [cell('Y', geomY, undefined, 'Inh'), cell('B', geomY, 'DL', 'Inh')]),
            row('EllipticalArcTo', 6, undefined, [cell('Y', geomY, undefined, 'Inh'), cell('B', geomY, 'DL', 'Inh')]),
        ];
        box.children.push(section('Geometry', geom, '0'));
        box.children.push(textEl(c.name));
        const kids = makeElement('Shapes');
        const k6 = newShapeNode();
        setAttribute(k6, 'ID', String(n6));
        setAttribute(k6, 'MasterShape', '6');
        setAttribute(k6, 'Type', 'Shape');
        k6.children.push(cell('PinY', f6(h / 2), undefined, 'Inh'), cell('Height', f6(h), undefined, 'Inh'), cell('LocPinY', f6(h / 2), undefined, 'Inh'));
        k6.children.push(section('Geometry', geom, '0'));
        const k7 = newShapeNode();
        setAttribute(k7, 'ID', String(n7));
        setAttribute(k7, 'MasterShape', '7');
        setAttribute(k7, 'Type', 'Shape');
        k7.children.push(cell('PinY', f6(h), undefined, 'Inh'));
        k7.children.push(section('User', [userRow('UmlRole', c.name, 'STR', 'Inh')]));
        const k8 = newShapeNode();
        setAttribute(k8, 'ID', String(n8));
        setAttribute(k8, 'MasterShape', '8');
        setAttribute(k8, 'Type', 'Shape');
        k8.children.push(cell('PinY', f6(h), undefined, 'Inh'));
        const k9 = newShapeNode();
        setAttribute(k9, 'ID', String(n9));
        setAttribute(k9, 'MasterShape', '9');
        setAttribute(k9, 'Type', 'Shape');
        k9.children.push(cell('PinY', f6(h), undefined, 'Inh'));
        for (const k of [k6, k7, k8, k9]) kids.children.push(k);
        box.children.push(kids);
        // 官方序列：盒在前、其成员行在后（成员画在盒之上，形成整体；盒盖前=成员被压住不可见）
        ctx.shapes.push(box);

        // 成员行与分隔线：列表从盒顶 HdrHgt+1MM 处起排，槽高首尾相接
        //（成员 0.25IN，分隔线 1MM；相邻槽心距 = (h1+h2)/2——与官方样本逐值一致）
        const itemIds: number[] = [];
        let cursor = g.top - hdrH - kMargin;
        items.forEach((it, idx) => {
            const itH = slotH(it.kind);
            const centerY = cursor - itH / 2;
            if (it.kind === 'member') {
                itemIds.push(writeMember(ctx, boxId, memberCX, centerY, it.text!));
            } else {
                itemIds.push(writeSeparator(ctx, boxId, memberCX, centerY, idx + 1));
            }
            cursor -= itH;
        });
        void attrIds;
        // 回填 Relationships（官方/Visio SDK：DEPENDSON(关系类型, SheetRef…)
        // ——2=列表成员清单（容器侧）、5=列表项所属列表（成员侧）；首参是类型常量，非形状 ID。
        // 注意：清单必须包含分隔线（用户 Hand-edit 实测：分隔线缺席=不随盒拖动/不关联）。）
        const relCell = cell('Relationships', '0', undefined,
            `SUM(DEPENDSON(2,${itemIds.map((id) => `Sheet.${id}!SheetRef()`).join(',')}))`);
        box.children[4] = relCell;
    }
    // 第二遍：关系线（官方序列在最后；Connects 顺序 EndX 先、BeginX 后）
    for (const r of m.relations) {
        const src = ctx.ids.get(r.from);
        const dst = ctx.ids.get(r.to);
        if (src === undefined || dst === undefined) continue;
        if (r.kind === 'unsupported') {
            warn(ctx, `[class] 关系 ${r.from}->${r.to} 无法对应官方母版样式——不绘制，记待核清单`);
            continue;
        }
        const a = ctx.classGeom.get(r.from);
        const b = ctx.classGeom.get(r.to);
        if (!a || !b) continue;
        // 面向连接（官方样本语义：IR 水平 X2→X1；Inheritance/Dependency 垂直按几何）：
        // 主轴取 |dx|/|dy| 较大者；Begin=源面向边缘、End=目标面向边缘（不穿盒）。
        // 盒中心 = pinX + w/2；端口位于盒子边缘中点（官方实例 Connection Y=Height/2 行）。
        const ax = a.pinX + a.w / 2;
        const ay = a.bottom + a.h / 2;
        const bx2 = b.pinX + b.w / 2;
        const by2 = b.bottom + b.h / 2;
        const dx = bx2 - ax;
        const dy = by2 - ay;
        let dir: 'h+' | 'h-' | 'v+' | 'v-';
        let bx: number, by: number, ex: number, ey: number;
        let beginPort: string, endPort: string;
        let beginPart: number, endPart: number;
        // mmd 边选择优先（fromEdge/toEdge ∈ left/right/top/bottom）；缺失按轴判定回退。
        // 官方端口命名：X1=左缘、X2=右缘、X3=底缘、X4=顶缘；边中点=端口（官方 Class 母版 Connection：
        // X1=(0,H/2)、X2=(W,H/2)、X3=(W/2,0)、X4=(W/2,H)——即各边中点）。
        const edgePort = (edge: string | undefined, fallback: [string, number]): [string, number] => {
            switch (edge) {
                case 'left': return ['X1', 100];
                case 'right': return ['X2', 101];
                case 'bottom': return ['X3', 102];
                case 'top': return ['X4', 103];
                default: return fallback;
            }
        };
        const mmdFrom = edgePort(r.fromEdge, ['X2', 101]);
        const mmdTo = edgePort(r.toEdge, ['X1', 100]);
        if (r.fromEdge !== undefined && r.toEdge !== undefined) {
            // mmd 边已知：端点=对应边中点（不猜边；方向=端点实际差定 dir）
            const edgePoint = (geom: { pinX: number; bottom: number; top: number; w: number; h: number }, edge: string): [number, number] => {
                const centerX = geom.pinX + geom.w / 2;
                const centerY = geom.bottom + geom.h / 2;
                switch (edge) {
                    case 'left': return [geom.pinX, centerY];
                    case 'right': return [geom.pinX + geom.w, centerY];
                    case 'bottom': return [centerX, geom.bottom];
                    case 'top': return [centerX, geom.top];
                    default: return [centerX, centerY];
                }
            };
            const p1 = edgePoint(a, r.fromEdge!);
            const p2 = edgePoint(b, r.toEdge!);
            bx = p1[0]; by = p1[1]; ex = p2[0]; ey = p2[1];
            beginPort = mmdFrom[0]; endPort = mmdTo[0];
            beginPart = mmdFrom[1]; endPart = mmdTo[1];
            // dir：按端点差定（水平/垂直 + 方向）
            const ddx = ex - bx, ddy = ey - by;
            if (Math.abs(ddx) >= Math.abs(ddy)) dir = ddx >= 0 ? 'h+' : 'h-';
            else dir = ddy >= 0 ? 'v+' : 'v-';
        } else if (Math.abs(dx) >= Math.abs(dy)) {
            const s = dx >= 0 ? 1 : -1;                 // 源右侧 (X2) → 目标左侧 (X1)
            dir = s > 0 ? 'h+' : 'h-';
            bx = ax + s * a.w / 2;
            ex = bx2 - s * b.w / 2;
            by = ay;                                    // 端口 Y = 各自盒中点（不同盒高度可能不同，端口位置各异）
            ey = by2;
            beginPort = s > 0 ? 'X2' : 'X1';
            endPort = s > 0 ? 'X1' : 'X2';
            beginPart = s > 0 ? 101 : 100;
            endPart = s > 0 ? 100 : 101;
        } else if (dy >= 0) {                            // 目标在上：源顶 (X4) → 目标底 (X3)
            dir = 'v+';
            bx = ex = ax;
            by = a.top;
            ey = b.bottom;
            beginPort = 'X4';
            endPort = 'X3';
            beginPart = 103;
            endPart = 102;
        } else {                                         // 目标在下：源底 (X3) → 目标顶 (X4)
            dir = 'v-';
            bx = ex = ax;
            by = a.bottom;
            ey = b.top;
            beginPort = 'X3';
            endPort = 'X4';
            beginPart = 102;
            endPart = 103;
        }
        const lineId = writeRelation(ctx, r.kind, src, dst, bx, by, ex, ey, dir, beginPort, endPort);
        ctx.connects.push(
            connectRec(lineId, 'EndX', 12, dst, `Connections.${endPort}`, endPart),
            connectRec(lineId, 'BeginX', 9, src, `Connections.${beginPort}`, beginPart),
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

/** Member 母版实例（官方模式：LISTSHEETREF 家族 + User 行族 + NoLine + 几何 X 行）。
 *  注意单位语义（用户 Hand-edit 实测）：单元格 V 数值 = 页内英寸值（如 2.480314960629921），
 *  U='MM' 仅是母版单位标签，不参与换算——之前写 V=62.46 被 Visio 按 62.46 IN 渲染（25 倍宽）。 */
function writeMember(ctx: Ctx, boxId: number, cx: number, y: number, text: string): number {
    const masterId = ctx.masterIds.get('Member') ?? 0;
    const id = ctx.nextId++;
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Member', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', String(cx)),
        cell('PinY', String(y)),
        cell('Width', String(kMemberW), 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,User.UserWidth)'),
        cell('LocPinX', String(kMemberHW), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(5,Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
        cell('TxtWidth', String(kMemberW), 'MM', 'Inh'),
        cell('NoLine', '1', undefined, 'Inh'),
    );
    el.children.push(section('User', [
        userRow('MemberName', text, 'STR', 'Inh'),
        userRow('ContainerMargin', String(kMargin), 'MM', 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
        userRow('WidthMin', '0', undefined, 'IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN<TEXTWIDTH(TheText),SETF(GetRef(LISTSHEETREF()!User.WIDTHMIN),TEXTWIDTH(TheText)),0),0)'),
        userRow('BackFillColor', '#f2f2f2', 'COLOR', 'IFERROR(LISTSHEETREF()!User.BACKGRND,FillForegnd)'),
        userRow('BackLineColor', '0', 'COLOR', 'IFERROR(LISTSHEETREF()!User.BACKGRNDLINE,LineColor)'),
        userRow('IsInstance', '1', 'BOOL', 'Inh'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', String(kMemberW), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', String(kMemberW), 'MM', 'Inh')]),
    ], '0'));
    el.children.push(textEl(text));
    ctx.shapes.push(el);
    return id;
}

/** Separator 母版实例（官方模式：ItemIndex=分隔线在列表中的 1 基序号；几何仅 LineTo#2）。 */
function writeSeparator(ctx: Ctx, boxId: number, cx: number, y: number, itemIndex: number): number {
    const masterId = ctx.masterIds.get('Separator') ?? 0;
    const id = ctx.nextId++;
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, 'Separator', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', String(cx)),
        cell('PinY', String(y)),
        cell('Width', String(kMemberW), 'MM', 'IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,48MM)'),
        cell('LocPinX', String(kMemberHW), 'MM', 'Inh'),
        cell('Relationships', '0', undefined, `SUM(DEPENDSON(5,Sheet.${boxId}!SheetRef()))`),
        cell('ShapeFixedCode', '1'),
    );
    el.children.push(section('User', [
        userRow('ContainerMargin', String(kMargin), 'MM', 'IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'),
        userRow('ItemIndex', String(itemIndex), undefined, 'Inh'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', String(kMemberW), 'MM', 'Inh')]),
    ], '0'));
    ctx.shapes.push(el);
    return id;
}

/** 关系线母版实例（方向感知：Begin/End 按面向端口 PAR 钉接；水平/垂直差异 cell 按官方样本）。
 *  官方母版（Inheritance 关系载体，HelpTopic 60852）Actions 菜单以 BeginArrow/EndArrow/LinePattern
 *  区分 聚合/关联/复合/依赖/定向关联/继承/实现——全部 mmd 关系均由此官方母版承载（不自定义形状）。
 *  箭角子形状 6..9 缓存位 = Con + R(角度±45°/135°)*0.09842519685039369（官方母版公式 User.Con1X+COS(...)*2.5MM
 *  的英寸级等价；本地坐标系，非页坐标——旧实现误用页坐标导致"起点多出线"）。 */
function writeRelation(
    ctx: Ctx,
    kind: Exclude<ClassRelationKind, 'unsupported'>,
    srcId: number,
    dstId: number,
    bx: number,
    by: number,
    ex: number,
    ey: number,
    dir: 'h+' | 'h-' | 'v+' | 'v-',
    beginPort: string,
    endPort: string,
): number {
    // 官方模板库（class-all-in-one）每类 mmd 关系线型一个独立母版（MasterType=541）：
    // 继承→Inheritance、实现→Interface Realization、直接关联→Directed Association、
    // 聚合→Aggregation、依赖→Dependency、复合→Composition、关联→Association。
    // 实例直接 Master= 对应母版，线型/箭头由该母版自带（不再覆写 BeginArrow/EndArrow/LinePattern）。
    const masterName = relationMaster(kind);
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId++;
    // ── 官方实例代数（class-all-in-one page1.xml 原文，无自创）──
    // 官方 ID=56(Association): W=GUARD(EndX-BeginX)=+1.1811, H=GUARD(EndY-BeginY)=+0.7940,
    //   LocPinX=W/2, LocPinY=H/2；几何 MoveTo(0,0)→LineTo#2(+0.24525,0)→LineTo#3(+0.24525,H)→LineTo#4(W,H)。
    //   Begin 端口=X2(左缘,向左出→转折 +X)；BeginX=4.921 EndX=6.102（Begin 在左、End 在右）。
    // 官方 ID=71(Dependency): W=+4.7244, H=+1.4461；转折 X=-0.24525（Begin 端口=X1=右缘→转折 -X）；
    //   BeginX=4.724 EndX=9.449（同为"Begin 在左"，但端口为右缘故转折负——转折符号=端口出线侧，非线方向）。
    // 官方 ID=66(Aggregation, 垂直): W=+kCross{GUARD(0.19685DL)}, H=-1.7798{GUARD(EndY-BeginY)},
    //   LocPinX=+0.0984, LocPinY=-0.8899；几何 MoveTo(0.0984,0)→LineTo(0.0984,H)；Begin=上(X3) End=下(X4)。
    // 官方 ID=76(Composition, 斜线): W=-0.2953, H=-1.4431（均带符号）；几何 MoveTo(0,0)→LineTo#2(0,-0.24525)
    //   →LineTo#3(W,-0.24525)→LineTo#4(W,H)（垂直主轴，转折 Y=-0.24525=上端出线侧；Begin 在上）。
    const w = ex - bx;
    const h = ey - by;
    const horizontal = dir === 'h+' || dir === 'h-';
    const kCross = 0.1968503937007874;
    const kZT = 0.2452500075101858;
    // 官方主轴带符号（ID=71 W=+4.72, ID=76 W=-0.2953 均 =EndX-BeginX；ID=66 H=-1.78 =EndY-BeginY）
    const main = horizontal ? w : h;
    const crossSign = horizontal ? Math.sign(h) : Math.sign(w);
    // 官方钳制：垂直副轴 W=+kCross{GUARD(0.19685DL)}（ID=66）；水平副轴官方斜线实例 H 带符号，
    // 但官方继承垂直样本（ID=55）H=+1.1747 主轴带符号、W=+kCross；水平 ID=42(H=-0.19685, 负钳)。
    // 官方各线型母版默认 H=-0.984 GUARD(EndY-BeginY)——副轴仅在"绝对差≤kCross"时钳为±kCross。
    const clampCross = (v: number, sign: number) => (Math.abs(v) <= kCross + 1e-12 ? sign * kCross : v);
    // 主轴 = 有符号轴差（不钳）；副轴 = 钳制（|差|≤5mm 时 ±kCross，符号随差；垂直固定 W=+kCross 为官方 ID=66 单侧语义）
    const W2 = horizontal ? main : clampCross(w, crossSign || 1);
    const H2 = horizontal ? (Math.abs(h) <= kCross + 1e-12 ? -kCross : h) : main;
    const locX2 = W2 / 2;
    const locY2 = H2 / 2;
    const pinX2 = (bx + ex) / 2;
    const pinY2 = (by + ey) / 2;
    // 局部坐标（几何/Con/文本）：局部 = 页坐标 - (Pin - LocPin)
    const z0 = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
    const lxB2 = z0(bx - pinX2 + locX2);
    const lyB2 = z0(by - pinY2 + locY2);
    const lxE2 = z0(ex - pinX2 + locX2);
    const lyE2 = z0(ey - pinY2 + locY2);
    // 端口出线侧（官方端口语义：X1=右缘、X2=左缘、X3=下缘、X4=上缘；出线方向=远离盒内）
    const outX = beginPort === 'X2' ? 1 : beginPort === 'X1' ? -1 : 0;
    const outY = beginPort === 'X3' ? 1 : beginPort === 'X4' ? -1 : 0;
    // 官方引脚角（Begin/End 方向）；Begin 与 End 的线方向
    const beginAngle = horizontal
        ? (outX > 0 ? 0 : Math.PI)
        : (outY > 0 ? kHalfPi : -kHalfPi);
    const endAngle = horizontal
        ? (Math.sign(lxE2 - lxB2) >= 0 ? 0 : Math.PI)
        : (Math.sign(lyE2 - lyB2) >= 0 ? kHalfPi : -kHalfPi);
    const el = newShapeNode();
    setAttribute(el, 'ID', String(id));
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const kLabel = relationLabel(kind);
    el.children.push(
        cell('PinX', String(pinX2), undefined, 'Inh'),
        cell('PinY', String(pinY2), undefined, 'Inh'),
        cell('Width', String(W2), undefined, horizontal ? 'GUARD(EndX-BeginX)' : (Math.abs(w) <= kCross + 1e-12 ? 'GUARD(0.19685039370079DL)' : 'GUARD(EndX-BeginX)')),
        cell('Height', String(H2), undefined, horizontal ? (Math.abs(h) <= kCross + 1e-12 ? 'GUARD(-0.19685039370079DL)' : 'GUARD(EndY-BeginY)') : 'GUARD(EndY-BeginY)'),
        cell('LocPinX', String(locX2), undefined, 'Inh'),
        cell('LocPinY', String(locY2), undefined, 'Inh'),
        cell('BeginX', String(bx), undefined, `PAR(PNT(Sheet.${srcId}!Connections.${beginPort},Sheet.${srcId}!Connections.Y${beginPort.slice(1)}))`),
        cell('BeginY', String(by), undefined, `PAR(PNT(Sheet.${srcId}!Connections.${beginPort},Sheet.${srcId}!Connections.Y${beginPort.slice(1)}))`),
        cell('EndX', String(ex), undefined, `PAR(PNT(Sheet.${dstId}!Connections.${endPort},Sheet.${dstId}!Connections.Y${endPort.slice(1)}))`),
        cell('EndY', String(ey), undefined, `PAR(PNT(Sheet.${dstId}!Connections.${endPort},Sheet.${dstId}!Connections.Y${endPort.slice(1)}))`),
        cell('LayerMember', '0'),
        cell('BegTrigger', '2', undefined, `_XFTRIGGER(Sheet.${srcId}!EventXFMod)`),
        cell('EndTrigger', '2', undefined, `_XFTRIGGER(Sheet.${dstId}!EventXFMod)`),
        // ConFixedCode 不写——class-all-in-one 官方实例（ID=46/56/61/66/71/76）全部继承（=自动路由/避让）；
        // 仅在 class 包 ID=55 见 5（行走固定），以 class-all-in-one 为准：继承默认自动路由。
        // 每类线型母版自带 BeginArrow/EndArrow/LinePattern（官方型默认，如 Inheritance=GUARD(0)/GUARD(14)/GUARD(IF(...))），
        // 实例不覆写——与官方页面对应实例（ID=55 等）一致。
        cell('TxtPinX', String(Math.abs(lxE2 - lxB2) / 2), undefined, 'Inh'),
        cell('TxtPinY', String((lyB2 + lyE2) / 2), undefined, 'Inh'),
        cell('TxtHeight', String(kTxtH), undefined, 'Inh'),
        cell('TxtLocPinY', String(kTxtLocY), undefined, 'Inh'),
    );
    el.children.push(section('Control', [
        row(undefined, undefined, 'TextPosition', [
            cell('X', String(Math.abs(lxE2 - lxB2) / 2)), cell('Y', String((lyB2 + lyE2) / 2)),
            cell('XDyn', String(Math.abs(lxE2 - lxB2) / 2), undefined, 'Inh'), cell('YDyn', String((lyB2 + lyE2) / 2), undefined, 'Inh'),
            cell('XCon', '0', undefined, 'Inh'),
        ]),
    ]));
    // 官方 User 行族（ID=56 水平: DXBegin=+0.0296/DYBegin=0/DXEnd=+0.0296/BeginAngle=0(DXBegin为0时继承)；
    //          ID=66 垂直: DYBegin=-0.0267/DXEnd=0/DYEnd=-0.0267/EndAngle=-1.5708；
    //          ID=71 水平: DXBegin=-0.0999/DYBegin≈0/DXEnd=+0.0999/BeginAngle=π；ID=76 垂直: DYBegin=-0.0261/DYEnd=-0.0261/EndAngle=-1.5708）
    // DXBegin/DXEnd/DYBegin/DYEnd = 端内缩（沿主轴，有符号）；角度=该端方向角（官方逐值）。
    const inset = kind === 'dependency' ? kInsetDep : kInsetInh;
    const dxb = horizontal ? (outX > 0 ? inset : -inset) : 0;
    const dyb = horizontal ? 0 : (outY > 0 ? inset : -inset);
    const dxe = horizontal ? (Math.sign(lxE2 - lxB2) > 0 ? inset : -inset) : 0;
    const dye = horizontal ? 0 : (Math.sign(lyE2 - lyB2) > 0 ? inset : -inset);
    el.children.push(section('User', [
        userRow('RelationshipName', kLabel, 'STR', 'Inh'),
        userRow('DXBegin', String(dxb), 'DL', 'Inh'),
        userRow('DYBegin', String(dyb), 'DL', 'Inh'),
        userRow('DXEnd', String(dxe), 'DL', 'Inh'),
        userRow('DYEnd', String(dye), 'DL', 'Inh'),
        userRow('BeginAngle', String(beginAngle), 'DA', 'Inh'),
        userRow('EndAngle', String(endAngle), 'DA', 'Inh'),
    ]));
    // 官方 Connection 点（ID=56: #0(inset,0) #1(W-inset,H)；ID=66: #0(0.0984,-inset) #1(0.0984,H+inset)）
    el.children.push(section('Connection', [
        row('Connection', 0, undefined, [
            cell('X', String(horizontal ? Math.abs(dxb) + (outX > 0 ? 0 : 0) : lxB2)),
            cell('Y', String(horizontal ? lyB2 : lyB2 + dyb)),
        ]),
        row('Connection', 1, undefined, [
            cell('X', String(horizontal ? lxE2 - Math.abs(dxe) : lxE2)),
            cell('Y', String(horizontal ? lyE2 : lyE2 - dye)),
        ]),
    ]));
    // 官方 Geometry（ID=56 水平 Z 行 4 行；ID=66 垂直直行 2 行+Del；ID=76 垂直斜线 Z 行 4 行）：
    //   Z 转折 = 距 Begin 端口出线侧 0.24525（BeginX/outY 方向），再沿另一轴到 End，最后沿主轴到 End。
    const ztx = outX * kZT;   // 垂直时不使用
    const zty = outY * kZT;
    el.children.push(section('Geometry', horizontal ? ((Math.abs(lyE2 - lyB2) > 1e-9) ? [
        row('MoveTo', 1, undefined, [cell('X', String(lxB2)), cell('Y', String(lyB2))]),
        row('LineTo', 2, undefined, [cell('X', String(lxB2 + ztx)), cell('Y', String(lyB2))]),
        row('LineTo', 3, undefined, [cell('X', String(lxB2 + ztx)), cell('Y', String(lyE2))]),
        row('LineTo', 4, undefined, [cell('X', String(lxE2)), cell('Y', String(lyE2))]),
    ] : [
        row('MoveTo', 1, undefined, [cell('X', String(lxB2)), cell('Y', String(lyB2))]),
        row('LineTo', 2, undefined, [cell('X', String(lxE2)), cell('Y', String(lyE2))]),
        row('LineTo', 3, undefined, [], true),
    ]) : ((Math.abs(lxE2 - lxB2) > 1e-9) ? [
        row('MoveTo', 1, undefined, [cell('X', String(lxB2)), cell('Y', String(lyB2))]),
        row('LineTo', 2, undefined, [cell('X', String(lxB2)), cell('Y', String(lyB2 + zty))]),
        row('LineTo', 3, undefined, [cell('X', String(lxE2)), cell('Y', String(lyB2 + zty))]),
        row('LineTo', 4, undefined, [cell('X', String(lxE2)), cell('Y', String(lyE2))]),
    ] : [
        row('MoveTo', 1, undefined, [cell('X', String(lxB2)), cell('Y', String(lyB2))]),
        row('LineTo', 2, undefined, [cell('X', String(lxE2)), cell('Y', String(lyE2))]),
        row('LineTo', 3, undefined, [], true),
    ]), '0'));
    // 嵌套箭角子形状（官方 MasterShape 6..9）：本地坐标缓存 = Con + R(角度±45°/±135°)*0.09842519685039369
    // ——与官方样本（0.0288/0.0872/1.0875 等，官方 ID=56..59）逐值一致；U='MM' 仅为标签，V 为英寸值。
    // 官方子形状补充字段（官方原文）：MS6 LocPinX=0.1667217539296875+LocPinY=0；MS7 LocPin=0/0；
    //   MS8 LocPinY=0.1333828247070313（无LocPinX）；MS9 LocPinX=0（无LocPinY）；
    //   MS6/7 带 User.BeginAngle、MS8/9 带 User.EndAngle，值=方向角；User.Con1X/Con1Y(或 Con2X/Con2Y)=Con 坐标缓存。
    const kids = makeElement('Shapes');
    const off = 0.09842519685039369;
    const c1: [number, number] = [horizontal ? Math.abs(dxb) : lxB2, horizontal ? lyB2 : lyB2 + dyb];
    const c2: [number, number] = [horizontal ? lxE2 - Math.abs(dxe) : lxE2, horizontal ? lyE2 : lyE2 - dye];
    const rot = (cx: number, cy: number, ang: number) => [cx + Math.cos(ang) * off, cy + Math.sin(ang) * off] as const;
    // [ms, con, PinX, PinY, LocPinX(若写), LocPinY(若写), endSide]
    for (const [ms, con, px, py, locX, locY, endSide] of [
        ['6', 'Con1', ...rot(c1[0], c1[1], beginAngle + Math.PI / 4), '0.1667217539296875', '0', false],
        ['7', 'Con1', ...rot(c1[0], c1[1], beginAngle - Math.PI / 4), '0', '0', false],
        ['8', 'Con2', ...rot(c2[0], c2[1], endAngle + (3 * Math.PI) / 4), null, '0.1333828247070313', true],
        ['9', 'Con2', ...rot(c2[0], c2[1], endAngle - (3 * Math.PI) / 4), '0', null, true],
    ] as Array<[string, string, number, number, string | null, string | null, boolean]>) {
        const k = newShapeNode();
        setAttribute(k, 'ID', String(ctx.nextId++));
        setAttribute(k, 'MasterShape', ms);
        setAttribute(k, 'Type', 'Shape');
        k.children.push(cell('PinX', String(px), 'MM', 'Inh'));
        k.children.push(cell('PinY', String(py), 'MM', 'Inh'));
        if (locX !== null) k.children.push(cell('LocPinX', locX, undefined, 'Inh'));
        if (locY !== null) k.children.push(cell('LocPinY', locY, undefined, 'Inh'));
        k.children.push(section('User', [
            userRow(endSide ? 'EndAngle' : 'BeginAngle', String(endSide ? endAngle : beginAngle), 'DA', 'Inh'),
            userRow(`${con}X`, String(c1[0] === c2[0] && !horizontal ? lxB2 : kLineHalfW), 'DL', 'Inh'),
            userRow(`${con}Y`, String(horizontal ? lyB2 : lyB2 + dyb), 'DL', 'Inh'),
        ]));
        kids.children.push(k);
    }
    el.children.push(kids);
    ctx.shapes.push(el);
    return id;
}

/** mmd 关系 → 官方模板库线型母版名（class-all-in-one 每类一个独立母版，MasterType=541；
 *  与 Class/Member/Separator/Interface 等同级——实例 Master= 直接引用）。 */
function relationMaster(kind: Exclude<ClassRelationKind, 'unsupported'>): string {
    switch (kind) {
        case 'inheritance': return 'Inheritance';
        case 'realization': return 'Interface Realization';
        case 'dependency': return 'Dependency';
        case 'association': return 'Directed Association';
        case 'aggregation': return 'Aggregation';
        case 'composition': return 'Composition';
    }
}

/** mmd 关系 → 官方母版 Actions 菜单中文名。 */
function relationLabel(kind: Exclude<ClassRelationKind, 'unsupported'>): string {
    switch (kind) {
        case 'inheritance': return '继承';
        case 'realization': return '实现';
        case 'dependency': return '依赖';
        case 'association': return '定向关联';
        case 'aggregation': return '聚合';
        case 'composition': return '复合';
    }
}

export function classPageSize(a: { classModel?: ClassModel }): { w: number; h: number } {
    const { pageW, pageH } = layout(a.classModel ?? { classes: [], relations: [] });
    return { w: pageW, h: pageH };
}
