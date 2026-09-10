// diag-sequence：契约 A → 契约 B（source/diag/sequence.ts；docs/redesign/04-转义层 对应篇）
//
// 母版实例化版（docs/redesign/07-母版形状库方案），对齐官方 sequence 模板包
// （docs/research/标准研究模板-手动创建vsdx并解压/sequence/）：
//  - Object/Actor lifeline = 官方母版实例。**4 个嵌套子形状 MS6..9 必须显式写出**（官方实例如此）：
//    不写时 Visio 打开会按母版子形状 ID 现场实例化，与页面其它顶层形状 ID 冲突
//    → 形状被误并入组/丢失（实测：7 个顶层形状只剩 1 个）。
//    时间格 = 0.25IN 网格（母版 Connection 公式 Y=-(k+1)*0.25IN，长度由 Controls.Row_1.Y 钳制）。
//  - Message/Return/Self/Asynchronous = 四类消息母版实例；几何双段：
//    IX=0 主线（MoveTo Y=±2.5MM + LineTo X=W）、IX=1 箭头（X=W+0.25IN 折返）。
//    单位语义：V=英寸、U='MM' 仅为标签（官方逐值：PinX=3.5236IN 等）。
//  - Activation = 母版实例（Width=时间跨度、沿本地 X；连接行沿跨度每 0.25IN 一对）。
//  - Loop/Optional fragment = 母版实例（根 Geometry IX=0 + 子形状 MS6 关键词带 / MS7 参数带，见 writeFragment）。
// 实例代数逐值来源：官方页面 #1/#6/#11（生命线）、#19/#20/#21/#25/#26（激活）、
// #27/#28/#30/#32（消息）、#16/#22（片段）；布局常量与 parser/ext/sequence.mjs 一致
// （rowY(i)=65+24i，即 0.25IN 时间格）。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type SequenceModel, type SeqActor, type SeqMessage, type SeqActivation, type SeqFragment, type SeqOperand } from '../contracts/index.js';

// ── 官方常数（单位 IN；来源：母版公式与官方实例逐值） ──
const kRowStep = 0.25;                      // 时间格步进（母版 6.35MM）
const kHdrH = 0.3543307086614173;           // 生命线页眉高（母版 Sheet.6!Height）
const kHdrHalf = 0.1771653543307087;        // = kHdrH/2
const kArrowHalf = 0.09842519685039353;     // 消息几何半高（2.5MM）
const kMsgH = 0.1968503937007874;           // 消息高（5MM）
const kSelfH = -0.5;                        // 自消息高（官方 -0.5）
const kArrowExt = 0.25;                     // 箭头外伸（官方 Geometry1.X2+0.25IN）
const kTextH = 0.2444939358181424;          // 消息文本高缓存
const kTextLocY = 0.1222469679090712;
const kAsyncTxtW = 0.6111611121111111;      // 异步消息文本宽缓存（官方 #32）
const kAsyncTxtLocX = 0.3055805560555556;

const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6);
const round = (v: number) => Math.round(v * 1e6) / 1e6;

// 布局常量（须与 parser/ext/sequence.mjs 一致）
const ROW_Y0 = 65;
const ROW_GAP = 24;                          // 24px = 0.25IN @96dpi
function rowY(i: number): number {
    return ROW_Y0 + i * ROW_GAP;
}

interface Ctx {
    nextId: number;
    shapes: XmlNode[];
    connects: XmlNode[];
    ids: Map<string, number>;
    nameCount: Map<string, number>;
    masterIds: Map<string, number>;
    warnings: string[];
    pageHpx: number;
    pc: number; // pxPerInch
    /** 内容盒左边界（px）：页面严格贴合内容时用于 x 平移。 */
    x0: number;
    actorX: Map<string, number>;
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
    // 母版段覆写必须显式 IX='0'（见 docs/开发经验日志 02-坑位清单 2.1）
    if (ix !== undefined) setAttribute(s, 'IX', ix);
    for (const r of rows) s.children.push(r);
    return s;
}

function textEl(s: string): XmlNode {
    const t = makeElement('Text');
    t.children.push(s);
    return t;
}

function newShape(): XmlNode {
    return makeElement('Shape');
}

function pushShape(ctx: Ctx, el: XmlNode, id: number): void {
    el.attrs = [{ name: 'ID', value: String(id) }, ...el.attrs.filter((a) => a.name !== 'ID')];
    ctx.shapes.push(el);
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

/** 端点钉接记录（官方：BeginX FromPart=9 / EndX FromPart=12；ToPart=100+存储行号、
 *  ToCell 用 1-based 公式行号 X{行+1}）。 */
function pushConnects(ctx: Ctx, lineId: number, srcId: number, srcRow: number, dstId: number, dstRow: number): void {
    ctx.connects.push(
        connectRec(lineId, 'EndX', 12, dstId, `Connections.X${dstRow + 1}`, 100 + dstRow),
        connectRec(lineId, 'BeginX', 9, srcId, `Connections.X${srcRow + 1}`, 100 + srcRow),
    );
}

/** 页面 px → 英寸（顶部原点在页面顶端，y 轴向下；Visio 页坐标 y 向上）。
 *  x0/y0 = 内容外包围框的左边界/下边界（页面严格贴合内容，见 P-4 画布策略）。 */
function yin(ctx: Ctx, yPx: number): number {
    return round((ctx.pageHpx - yPx) / ctx.pc);
}
function xin(ctx: Ctx, xPx: number): number {
    return round((xPx - ctx.x0) / ctx.pc);
}
/** 时间格行 k 的页面 Y（与生命线本地行 k 对齐：本地原点 = rowY(0) + 0.25）。 */
function rowYin(ctx: Ctx, k: number): number {
    return yin(ctx, rowY(k));
}
/** px 位置 → 时间格行号（提取器与渲染器同一常量，可逆）。 */
function rowOf(yPx: number): number {
    return Math.round((yPx - ROW_Y0) / ROW_GAP);
}

export class SeqRenderer {
    render(a: { sequence?: SequenceModel }, pageHpx: number, pxPerInch = 96, masterIds: Map<string, number> = new Map(), x0 = 0): XmlPart {
        const m = a.sequence ?? { actors: [], messages: [], activations: [], fragments: [] };
        const ctx: Ctx = {
            nextId: 1, shapes: [], connects: [], ids: new Map(), nameCount: new Map(),
            masterIds, warnings: [], pageHpx, pc: pxPerInch, x0,
            actorX: new Map(m.actors.map((x) => [x.id, x.x])),
        };
        const root = makeElement('PageContents');
        const shapes = makeElement('Shapes');
        const connects = makeElement('Connects');
        root.children.push(shapes, connects);
        writeSeq(ctx, m);
        for (const s of ctx.shapes) shapes.children.push(s);
        for (const c of ctx.connects) connects.children.push(c);
        for (const w of ctx.warnings) console.warn(w);
        setAttribute(root, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
        const xml = serializeDocument(root, {
            declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            indent: 0,
        });
        return part(kPageUri, kPageContentType, xml);
    }
}

/** 时间格行模型（提取器 parser/ext/sequence.mjs 用同一规则）：普通消息占 1 格、
 *  自消息占 2 格（官方 Self Message 高 0.5IN = 2×0.25IN）、备注占 2 格（Note 高约 0.315IN）。
 *  行号**累计**——直接用消息下标会让跨行构件与相邻消息压在同一行。
 *  注意：Visio 公式的 `Connections.Xk` 是 **1-based**——存储行 IX=k-1，故钉接号 = 行号+1
 *  （X0 无效，实测钉接失败会回退母版默认值）。 */
export function sequenceRows(messages: Array<{ kind: string }>): { start: number[]; end: number[]; total: number } {
    const start: number[] = [];
    const end: number[] = [];
    let cursor = 0;
    messages.forEach((msg, i) => {
        start[i] = cursor;
        if (msg.kind === 'self') cursor += 2;
        else if (msg.kind === 'note') cursor += 1;
        end[i] = cursor;
        cursor += 1;
    });
    return { start, end, total: cursor };
}

function writeSeq(ctx: Ctx, m: SequenceModel): void {
    // 时间格行模型：累计行号（自消息跨 2 格）
    const rows = sequenceRows(m.messages);
    let maxRow = Math.max(0, rows.total - 1);
    const length = Math.max(0.5, (maxRow + 2) * kRowStep);
    const originY = rowYin(ctx, 0) + kRowStep;   // 生命线本地原点（页眉底）页面 Y
    // 生命线
    for (const actor of m.actors) writeLifeline(ctx, actor, originY, length, maxRow + 1);
    // 激活条
    for (const act of m.activations) writeActivation(ctx, act);
    // 消息
    m.messages.forEach((msg, i) => {
        const kind = msg.kind;
        if (kind === 'note') { writeNote(ctx, msg, rows.start[i]!, rows.end[i]!); return; }
        if (kMarkerKinds.has(kind)) return;
        writeMessage(ctx, msg, rows.start[i]!, rows.end[i]!);
    });
    // 片段
    // 顶边上提量：默认 1.5 格（两段带 0.489IN 落在循环体首行之上）。但若上方紧邻一行
    // 就是已绘制消息（含自消息末行），1.5 格会把顶边抬到该消息线之上、横穿它
    // （实测：opt 顶边穿过上方自消息的 C 形）。此时降到 1 格——顶边与该消息线重合，
    // 标签带底边距首条内部消息线仍有 0.011IN。
    for (const frag of m.fragments) {
        const startRow = rowOf(frag.y);
        const raise = fragmentRaise(m, rows, startRow);
        if (frag.kind === 'loop') writeFragment(ctx, 'Loop fragment', frag, raise);
        else if (frag.kind === 'opt') writeFragment(ctx, 'Optional fragment', frag, raise);
        else if (frag.kind === 'alt') writeAlternativeFragment(ctx, frag, raise);
        // par/critical/break = 通用「Other fragment」（两段带：标题 + 首分支标签）；
        // 后续分支（and/option）用 Interaction operand 画分隔虚线（见 writeOperands）。
        else if (frag.kind === 'par' || frag.kind === 'critical' || frag.kind === 'break') {
            writeFragment(ctx, 'Other fragment', frag, raise);
            writeOperands(ctx, frag, raise, true);
        } else if (frag.kind === 'rect') { /* mermaid rect 仅为背景框，Visio 侧无母版——跳过 */ }
        else ctx.warnings.push(`[sequence] 片段 ${frag.kind} 官方母版素材缺失——跳过，记待核清单`);
    }
}

/** 片段/分支标记行：不绘制为消息（但仍占时间格行）。注意 note 不在此列——
 *  它有自己的母版且会绘制，片段顶边避让计算必须把它算作"上方已绘制内容"。 */
const kMarkerKinds = new Set<string>([
    'activate', 'deactivate',
    'loop', 'loopend', 'alt', 'altelse', 'altend', 'opt', 'optend',
    'par', 'parelse', 'parend', 'critical', 'criticalelse', 'criticalend',
    'break', 'breakend', 'rect', 'rectend',
]);

/** 生命线页眉盒宽：母版是文本驱动公式（Sheet.6!Width），我们写显式值使产物自描述、
 *  内容盒可精确计算；估算偏宽（宁可多不可裁字）。 */
function headerWidth(label: string): number {
    return round(Math.max(0.7086614173228346, noteWidth(label) + 0.1));
}

/** 生命线实例（官方代数）：PinX/PinY + [Actor: Height/LocPinY] + Control.Row_1.Y=-长度
 *  + Connection 行（时间格 Y=-(k+1)*0.25IN）+ 根 Geometry IX=0 + Text + 嵌套 MS6..9。 */
function writeLifeline(ctx: Ctx, actor: SeqActor, originY: number, length: number, lastRow: number): void {
    const masterName = actor.kind === 'actor' ? 'Actor lifeline' : 'Object lifeline';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId++;
    ctx.ids.set(actor.id, id);
    const hdrW = headerWidth(actor.label);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(xin(ctx, actor.x))),
        cell('PinY', f6(originY + kHdrHalf)),
        // 页眉盒宽显式写死（母版公式文本驱动；写死才可审计、页面才贴合）
        cell('Width', f6(hdrW)),
        cell('LocPinX', f6(hdrW / 2)),
    );
    // 页眉高度/锚点显式写死（object 母版是 Sheet.6!Height 公式；写死使产物自描述、可审计）
    el.children.push(cell('Height', f6(kHdrH)), cell('LocPinY', f6(kHdrHalf), undefined, 'Height*0.5'));
    el.children.push(section('Control', [
        row(undefined, undefined, 'Row_1', [cell('Y', f6(-length))]),
    ]));
    const rowsC: XmlNode[] = [];
    for (let k = 0; k <= lastRow; k++) {
        rowsC.push(row('Connection', k, undefined, [cell('Y', f6(-(k + 1) * kRowStep), 'MM', 'Inh')]));
    }
    el.children.push(section('Connection', rowsC));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', f6(length), 'MM', 'Inh')]),
    ], '0'));
    el.children.push(textEl(actor.label));
    // 嵌套子形状 MS6..9（官方：#2/#3 空引用、#4 单 PinY、#5 虚线主体）
    const kids = makeElement('Shapes');
    const k6 = newShape();
    setAttribute(k6, 'ID', String(ctx.nextId++));
    setAttribute(k6, 'MasterShape', '6');
    setAttribute(k6, 'Type', 'Shape');
    const k7 = newShape();
    setAttribute(k7, 'ID', String(ctx.nextId++));
    setAttribute(k7, 'MasterShape', '7');
    setAttribute(k7, 'Type', 'Shape');
    const k8 = newShape();
    setAttribute(k8, 'ID', String(ctx.nextId++));
    setAttribute(k8, 'MasterShape', '8');
    setAttribute(k8, 'Type', 'Shape');
    k8.children.push(cell('PinY', f6(-(length + 0.1181102362204724)), 'MM', 'Inh'));
    const k9 = newShape();
    setAttribute(k9, 'ID', String(ctx.nextId++));
    setAttribute(k9, 'MasterShape', '9');
    setAttribute(k9, 'Type', 'Shape');
    k9.children.push(
        cell('PinX', f6(hdrW / 2), 'MM', 'Inh'),
        cell('PinY', f6(-length / 2), 'MM', 'Inh'),
        cell('Width', f6(length), 'MM', 'Inh'),
        cell('Height', f6(length), 'MM', 'Inh'),
        cell('LocPinX', f6(length / 2), 'MM', 'Inh'),
        cell('LocPinY', f6(length / 2), 'MM', 'Inh'),
        // 显式端点（1-D 形状）：审计/Visio 都按端点求真实 AABB，不依赖母版角度公式
        cell('BeginX', f6(hdrW / 2), 'MM', 'Inh'),
        cell('BeginY', '0', 'MM', 'Inh'),
        cell('EndX', f6(hdrW / 2), 'MM', 'Inh'),
        cell('EndY', f6(-length), 'MM', 'Inh'),
    );
    k9.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', f6(length), 'MM', 'Inh')]),
    ], '0'));
    for (const k of [k6, k7, k8, k9]) kids.children.push(k);
    el.children.push(kids);
    pushShape(ctx, el, id);
}

/** 激活条实例（官方代数）：Width=时间跨度（沿本地 X）、Connection 行沿跨度每 0.25IN 一对。 */
function writeActivation(ctx: Ctx, act: SeqActivation): void {
    const lifelineId = ctx.ids.get(act.actorId);
    if (lifelineId === undefined) return;
    const masterId = ctx.masterIds.get('Activation') ?? 0;
    const id = ctx.nextId++;
    const x = xin(ctx, act.x);
    const kTop = rowOf(act.yTop);
    const kBottom = rowOf(act.yBottom);
    const yEnd = rowYin(ctx, kTop);        // 上端（End）
    const yBegin = rowYin(ctx, kBottom);   // 下端（Begin）
    const span = round(yEnd - yBegin);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, 'Activation', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(x), 'MM', 'Inh'),
        cell('PinY', f6((yBegin + yEnd) / 2), 'MM', 'Inh'),
        cell('Width', f6(span), 'MM', 'Inh'),
        cell('LocPinX', f6(span / 2), 'MM', 'Inh'),
        cell('BeginX', f6(x), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kBottom + 1},Sheet.${lifelineId}!Connections.Y${kBottom + 1}))`),
        cell('BeginY', f6(yBegin), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kBottom + 1},Sheet.${lifelineId}!Connections.Y${kBottom + 1}))`),
        cell('EndX', f6(x), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kTop + 1},Sheet.${lifelineId}!Connections.Y${kTop + 1}))`),
        cell('EndY', f6(yEnd), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kTop + 1},Sheet.${lifelineId}!Connections.Y${kTop + 1}))`),
    );
    // 连接行：母版模式（每 0.25IN 一对：X 自 Width 递减、Y 交替 0/Height）——跨度内的行数
    const steps = Math.max(0, Math.ceil(span / kRowStep) - 1);
    const crows: XmlNode[] = [];
    for (let j = 0; j <= steps; j++) {
        const xv = round(Math.max(span - j * kRowStep, 0));
        crows.push(row('Connection', 2 * j, undefined, [cell('X', f6(xv), 'MM', 'Inh')]));
        crows.push(row('Connection', 2 * j + 1, undefined, [cell('X', f6(xv), 'MM', 'Inh')]));
    }
    el.children.push(section('Connection', crows));
    pushShape(ctx, el, id);
    pushConnects(ctx, id, lifelineId, kBottom, lifelineId, kTop);
}

/** 消息实例（官方四类逐值）：双 Geometry 段（主线 + 箭头）、Control.TextPosition 按类型、
 *  Return 负 W/H、Self 固定宽/跨两格。beginRow/endRow 由 sequenceRows 的累计行模型给出。 */
function writeMessage(ctx: Ctx, msg: SeqMessage, beginRow: number, endRow: number): void {
    const isSelf = msg.kind === 'self';
    const isReturn = msg.kind === 'return';
    const masterName = isReturn ? 'Return Message' : isSelf ? 'Self Message' : msg.kind === 'async' ? 'Asynchronous Message' : 'Message';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const srcId = ctx.ids.get(msg.from);
    const dstId = ctx.ids.get(msg.to);
    if (srcId === undefined || dstId === undefined) return;
    const srcX = xin(ctx, ctx.actorX.get(msg.from) ?? 0);
    const dstX = xin(ctx, ctx.actorX.get(msg.to) ?? 0);
    const beginY = rowYin(ctx, beginRow);
    const endY = rowYin(ctx, endRow);
    const id = ctx.nextId++;
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));

    const w = round(dstX - srcX);
    // Visio 规范态（COM 实测）：水平消息 Y 轴符号 = sign(W)——W>0 全正、W<0 全负
    // （Height/几何/文字同号）；否则 Visio 打开会翻转本地 Y 轴，线浮在行上方、文字落到线下。
    const ys = w >= 0 ? 1 : -1;
    const h = isSelf ? kSelfH : ys * kMsgH;
    const pinX = isSelf ? srcX : round((srcX + dstX) / 2);
    const pinY = isSelf ? round((beginY + endY) / 2) : beginY;
    el.children.push(
        cell('PinX', f6(pinX), 'MM', 'Inh'),
        cell('PinY', f6(pinY), 'MM', 'Inh'),
    );
    if (isSelf) {
        el.children.push(
            cell('Width', f6(kMsgH), undefined, 'GUARD(0.19685039370079DL)'),
            cell('Height', f6(kSelfH), 'MM', 'GUARD(EndY-BeginY)'),
            cell('LocPinY', f6(kSelfH / 2), 'MM', 'Inh'),
        );
    } else {
        el.children.push(
            cell('Width', f6(w), 'MM', 'GUARD(EndX-BeginX)'),
            cell('Height', f6(h), undefined, `GUARD(${ys < 0 ? '-' : ''}0.19685039370079DL)`),
            cell('LocPinX', f6(w / 2), 'MM', 'Inh'),
        );
        if (isReturn) el.children.push(cell('LocPinY', f6(h / 2), undefined, 'Inh'));
    }
    el.children.push(
        cell('BeginX', f6(srcX), 'MM', `PAR(PNT(Sheet.${srcId}!Connections.X${beginRow + 1},Sheet.${srcId}!Connections.Y${beginRow + 1}))`),
        cell('BeginY', f6(beginY), 'MM', `PAR(PNT(Sheet.${srcId}!Connections.X${beginRow + 1},Sheet.${srcId}!Connections.Y${beginRow + 1}))`),
        cell('EndX', f6(dstX), 'MM', `PAR(PNT(Sheet.${dstId}!Connections.X${endRow + 1},Sheet.${dstId}!Connections.Y${endRow + 1}))`),
        cell('EndY', f6(endY), 'MM', `PAR(PNT(Sheet.${dstId}!Connections.X${endRow + 1},Sheet.${dstId}!Connections.Y${endRow + 1}))`),
        cell('LayerMember', '0'),
        cell('BegTrigger', '2', undefined, `_XFTRIGGER(Sheet.${srcId}!EventXFMod)`),
        cell('EndTrigger', '2', undefined, `_XFTRIGGER(Sheet.${dstId}!EventXFMod)`),
    );
    // 文本位（官方：Message/Async 仅 TxtPinX；Return 另加 TxtPinY；Self 仅 TxtPinY）
    if (isSelf) {
        el.children.push(cell('TxtPinY', f6(kSelfH / 2), undefined, 'Inh'));
    } else {
        el.children.push(cell('TxtPinX', f6(w / 2), undefined, 'Inh'));
        if (isReturn) el.children.push(cell('TxtPinY', f6(h / 2), undefined, 'Inh'));
    }
    if (msg.kind === 'async') {
        el.children.push(
            cell('TxtWidth', f6(kAsyncTxtW), undefined, 'Inh'),
            cell('TxtLocPinX', f6(kAsyncTxtLocX), undefined, 'Inh'),
        );
    }
    el.children.push(
        cell('TxtHeight', f6(kTextH), undefined, 'Inh'),
        cell('TxtLocPinY', f6(kTextLocY), undefined, 'Inh'),
    );
    // Control.TextPosition（官方逐值）
    if (isSelf) {
        el.children.push(section('Control', [
            row(undefined, undefined, 'TextPosition', [
                cell('Y', f6(kSelfH / 2)), cell('YDyn', f6(kSelfH / 2), undefined, 'Inh'),
                cell('XCon', '0', undefined, 'Inh'),
            ]),
        ]));
    } else if (isReturn) {
        el.children.push(section('Control', [
            row(undefined, undefined, 'TextPosition', [
                cell('X', f6(w / 2)), cell('Y', f6(h / 2)),
                cell('XDyn', f6(w / 2), undefined, 'Inh'), cell('YDyn', f6(h / 2), undefined, 'Inh'),
                cell('XCon', '0', undefined, 'Inh'),
            ]),
        ]));
    } else {
        el.children.push(section('Control', [
            row(undefined, undefined, 'TextPosition', [
                cell('X', f6(w / 2)), cell('Y', f6(h / 2)),
                cell('XDyn', f6(w / 2), undefined, 'Inh'), cell('YDyn', f6(h / 2), undefined, 'Inh'),
                cell('XCon', '0', undefined, 'Inh'),
            ]),
        ]));
    }
    // 几何：IX=0 主线 + IX=1 箭头（官方双段；Self 与 Return 的箭头段带 MoveTo）
    if (isSelf) {
        el.children.push(section('Geometry', [
            row('MoveTo', 1, undefined, [cell('X', f6(kArrowHalf))]),
            row('LineTo', 2, undefined, [cell('X', f6(kArrowHalf)), cell('Y', f6(kSelfH))]),
        ], '0'));
        el.children.push(section('Geometry', [
            row('LineTo', 3, undefined, [cell('Y', f6(kSelfH), undefined, 'Geometry1.Y2')]),
            row('LineTo', 4, undefined, [cell('Y', f6(kSelfH), undefined, 'Geometry1.Y2')]),
        ], '1'));
    } else {
        el.children.push(section('Geometry', [
            row('MoveTo', 1, undefined, [cell('Y', f6(h / 2))]),
            row('LineTo', 2, undefined, [cell('X', f6(w)), cell('Y', f6(h / 2))]),
        ], '0'));
        if (isReturn) {
            el.children.push(section('Geometry', [
                row('MoveTo', 1, undefined, [cell('Y', f6(h / 2), undefined, 'Geometry1.Y1')]),
                row('LineTo', 2, undefined, [
                    cell('X', f6(round(w + kArrowExt)), 'IN', 'Geometry1.X2+0.25IN'),
                    cell('Y', f6(h / 2), undefined, 'Geometry1.Y1'),
                ]),
                row('LineTo', 3, undefined, [
                    cell('X', f6(round(w + kArrowExt)), 'IN', 'Geometry1.X2+0.25IN'),
                    cell('Y', f6(h / 2), undefined, 'Geometry1.Y2'),
                ]),
                row('LineTo', 4, undefined, [
                    cell('X', f6(w), undefined, 'Geometry1.X2'),
                    cell('Y', f6(h / 2), undefined, 'Geometry1.Y2'),
                ]),
            ], '1'));
        } else {
            el.children.push(section('Geometry', [
                row('LineTo', 2, undefined, [cell('X', f6(round(w + kArrowExt)), 'IN', 'Geometry1.X2+0.25IN')]),
                row('LineTo', 3, undefined, [cell('X', f6(round(w + kArrowExt)), 'IN', 'Geometry1.X2+0.25IN')]),
                row('LineTo', 4, undefined, [cell('X', f6(w), undefined, 'Geometry1.X2')]),
            ], '1'));
        }
    }
    if (msg.label) el.children.push(textEl(msg.label));
    pushShape(ctx, el, id);
    pushConnects(ctx, id, srcId, beginRow, dstId, endRow);
}

/** 备注（mermaid note）：复用官方 `Note` 母版（class 包同名母版，母版目录跨记录可见；
 *  seq-all-in-one 本身不含 Note）。mermaid 的 db 不区分 left/right of（两者 from===to），
 *  故统一居中于涉及的参与者之间。TxtWidth 显式写死 = Width：母版默认按 0.98IN 折行，
 *  文本一折行高度就超出 2 格槽位；写死宽度后恒为单行（高约 0.315IN）。 */
function writeNote(ctx: Ctx, msg: SeqMessage, beginRow: number, endRow: number): void {
    const masterId = ctx.masterIds.get('Note') ?? 0;
    const id = ctx.nextId++;
    const srcX = ctx.actorX.get(msg.from) ?? 0;
    const dstX = ctx.actorX.get(msg.to) ?? srcX;
    const wIn = noteWidth(msg.label);
    const centerY = round((rowYin(ctx, beginRow) + rowYin(ctx, endRow)) / 2);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, 'Note', id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(xin(ctx, (srcX + dstX) / 2))),
        cell('PinY', f6(centerY)),
        cell('Width', f6(wIn)),
        cell('TxtWidth', f6(wIn)),
    );
    // Height/LocPin/TxtPin 均继承母版公式（GUARD(MAX(CEILING(TxtHeight,1.5MM),8MM))）。
    el.children.push(textEl(msg.label));
    // 折角子形状（母版 MS6）必须显式写出：不写时 Visio 会按母版子 ID 现场实例化，
    // 多个 Note 的子形状 ID 冲突 → 形状被吞（实测 3 个 Note 只剩 1 个）。单元格全是
    // 引用父级的公式（PinX=GUARD(Sheet.5!Width*1) 等），留空继承即可。
    const kids = makeElement('Shapes');
    const k6 = newShape();
    setAttribute(k6, 'ID', String(ctx.nextId++));
    setAttribute(k6, 'MasterShape', '6');
    setAttribute(k6, 'Type', 'Shape');
    kids.children.push(k6);
    el.children.push(kids);
    pushShape(ctx, el, id);
}

/** 备注宽度估算：CJK ≈0.17IN/字、其余 ≈0.095IN/字 + 内边距，钳制在 [0.98, 4]IN。
 *  实测文档默认字号 12pt（0.1667IN）——按 9pt 估会偏窄，TEXTHEIGHT 折行后 Note 撑到 2 行。 */
function noteWidth(label: string): number {
    let cjk = 0;
    let other = 0;
    for (const ch of label) (ch.codePointAt(0)! > 0x2e80 ? cjk++ : other++);
    return round(Math.min(4, Math.max(0.98, 0.17 * cjk + 0.095 * other + 0.3)));
}

/** 片段实例（官方 #16）：PinX/PinY/Width/Height/LocPinX/LocPinY + 根 Geometry IX=0
 *  + 子形状 MS6（关键词带，继承母版「循环」/「选择」）与 MS7（参数带，写 mermaid 标签）。 */
function writeFragment(ctx: Ctx, masterName: 'Loop fragment' | 'Optional fragment' | 'Other fragment', frag: SeqFragment, topRaise: number): void {
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId++;
    const w = round(frag.width / ctx.pc);
    const startRow = rowOf(frag.y);
    const endRow = rowOf(frag.y + frag.height - 60);
    // 顶边上提 topRaise 格（默认 1.5）：标签带（关键词 0.2445IN + 参数 0.2445IN）须落在
    // 循环体首行之上，否则 0.25IN 网格下参数行会被第一条消息线穿过。
    const topY = round(rowYin(ctx, startRow) + kRowStep * topRaise);
    const bottomY = round(rowYin(ctx, Math.max(endRow, startRow)) - kRowStep / 2);
    const h = round(topY - bottomY);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(xin(ctx, frag.x))),
        cell('PinY', f6((topY + bottomY) / 2)),
        cell('Width', f6(w)),
        cell('Height', f6(h)),
        cell('LocPinX', f6(w / 2), undefined, 'Inh'),
        cell('LocPinY', f6(h / 2), undefined, 'Inh'),
    );
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', f6(w), undefined, 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(w), undefined, 'Inh')]),
    ], '0'));
    const kids = makeElement('Shapes');
    const k6 = newShape();
    setAttribute(k6, 'ID', String(ctx.nextId++));
    setAttribute(k6, 'MasterShape', '6');
    setAttribute(k6, 'Type', 'Shape');
    k6.children.push(
        cell('PinX', f6(w / 2), undefined, 'Inh'),
        cell('Width', f6(w), undefined, 'Inh'),
        cell('LocPinX', f6(w / 2), undefined, 'Inh'),
    );
    // MS6 = 类型关键词带（母版默认「循环」/「选择」）：不写文本，继承母版 → 顶部对齐、
    // 双击可编辑（该子形状 EventDblClick=OPENTEXTWIN()，组根 IsTextEditTarget='0'）。
    const k7 = newShape();
    setAttribute(k7, 'ID', String(ctx.nextId++));
    setAttribute(k7, 'MasterShape', '7');
    setAttribute(k7, 'Type', 'Shape');
    // MS7 = 参数带（母版占位「[参数]」，位于关键词下方）：写 mermaid 片段标签；
    // 无标签时显式空文本，避免残留占位文字。
    k7.children.push(textEl(frag.label || ''));
    if (frag.label) {
        // 母版文字色 = User.DarkerColor（THEMEVAL 链）在官方 sequence 基座里解析为索引 28，
        // 而基座 Colors 只定义 24/25 → 未定义色索引渲染成白底白字（实测文字"消失"）。
        // 实例显式覆盖为 0（auto/黑），与生命线文字一致。
        k7.children.push(section('Character', [
            row(undefined, 0, undefined, [cell('Color', '0')]),
        ]));
    }
    kids.children.push(k6, k7);
    el.children.push(kids);
    pushShape(ctx, el, id);
}

/** Alternative fragment（官方 #18）：**容器**，只有一个折角标题带子形状 MS6（继承母版
 *  「替换」）——母版没有 MS7；分支条件由顶层 Interaction operand 承载（见 writeOperands）。 */
function writeAlternativeFragment(ctx: Ctx, frag: SeqFragment, topRaise: number): void {
    const masterId = ctx.masterIds.get('Alternative fragment') ?? 0;
    const id = ctx.nextId++;
    const w = round(frag.width / ctx.pc);
    const startRow = rowOf(frag.y);
    const endRow = rowOf(frag.y + frag.height - 60);
    const topY = round(rowYin(ctx, startRow) + kRowStep * topRaise);
    const bottomY = round(rowYin(ctx, Math.max(endRow, startRow)) - kRowStep / 2);
    const h = round(topY - bottomY);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, 'Alternative fragment', id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(xin(ctx, frag.x))),
        cell('PinY', f6((topY + bottomY) / 2)),
        cell('Width', f6(w)),
        cell('Height', f6(h)),
        cell('LocPinX', f6(w / 2), undefined, 'Inh'),
        cell('LocPinY', f6(h / 2), undefined, 'Inh'),
    );
    // Control.Row_1 = 列表宽度控制（官方实例写 Y=Height/2 Inh）
    el.children.push(section('Control', [
        row(undefined, undefined, 'Row_1', [
            cell('X', f6(w)),
            cell('Y', f6(h / 2), undefined, 'Inh'),
            cell('XDyn', f6(w), undefined, 'Inh'),
            cell('YDyn', f6(h / 2), undefined, 'Inh'),
        ]),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 3, undefined, [cell('Y', f6(h), undefined, 'Inh')]),
        row('LineTo', 4, undefined, [cell('Y', f6(h), undefined, 'Inh')]),
    ], '0'));
    const kids = makeElement('Shapes');
    const k6 = newShape();
    setAttribute(k6, 'ID', String(ctx.nextId++));
    setAttribute(k6, 'MasterShape', '6');
    setAttribute(k6, 'Type', 'Shape');
    // 官方实例只写 PinY=Height（标题带贴顶边）；其余单元格继承母版公式。
    k6.children.push(cell('PinY', f6(h), undefined, 'Inh'));
    kids.children.push(k6);
    el.children.push(kids);
    pushShape(ctx, el, id);
    writeOperands(ctx, frag, topRaise, false);
}

/** 分支操作数（官方 #20/#21）：**顶层独立形状**，顶边画虚线分隔（首条 NoShow=1），
 *  文本 = 分支条件；高度按分支实际跨度覆写（官方母版默认 0.9842IN 是列表项固定高）。 */
function writeOperand(ctx: Ctx, op: SeqOperand, xIn: number, wIn: number, topY: number, bottomY: number, first: boolean): void {
    const masterId = ctx.masterIds.get('Interaction operand') ?? 0;
    const id = ctx.nextId++;
    const h = round(topY - bottomY);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, 'Interaction operand', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    // 注意：PinX/PinY/Width/Height 必须是**字面值**（不能写 F='Inh'）——母版 Width 公式是
    // IFERROR(LISTSHEETREF()!Controls.ROW_1,User.UserWidth)，实例写 Inh 会继承该公式，
    // 而我们的形状不在 Visio 列表里 → LISTSHEETREF() 失败 → 回退母版默认 1.8898IN
    // （实测四个操作数全被摆回母版默认位置）。LocPin* 写 Inh 是安全的（母版公式引用自身 Width）。
    el.children.push(
        cell('PinX', f6(xIn)),
        cell('PinY', f6((topY + bottomY) / 2)),
        cell('Width', f6(wIn)),
        cell('Height', f6(h)),
        cell('LocPinX', f6(wIn / 2), 'MM', 'Inh'),
        cell('LocPinY', f6(h / 2), 'MM', 'Inh'),
        cell('ShapeFixedCode', '1'),
    );
    // Geometry IX=0 段级单元格覆盖：首条分支不画分隔虚线（母版公式靠 LISTORDER()，
    // 我们不是真正的 Visio 列表，故显式写死）。
    const geom = makeElement('Section');
    setAttribute(geom, 'N', 'Geometry');
    setAttribute(geom, 'IX', '0');
    geom.children.push(cell('NoShow', first ? '1' : '0'));
    el.children.push(geom);
    el.children.push(textEl(op.label || ''));
    if (op.label) {
        // 与 MS7 同因（母版文字色公式在官方基座解析成未定义色索引）——显式黑字。
        el.children.push(section('Character', [row(undefined, 0, undefined, [cell('Color', '0')])]));
    }
    pushShape(ctx, el, id);
}

/** 按分支跨度写操作数：alt = 全部分支；par/critical/break = 跳过首分支（标签已在 MS7）。 */
function writeOperands(ctx: Ctx, frag: SeqFragment, topRaise: number, skipFirst: boolean): void {
    const ops = frag.operands ?? [];
    if (ops.length === 0) return;
    const xIn = xin(ctx, frag.x);
    const wIn = round(frag.width / ctx.pc);
    const startRow = rowOf(frag.y);
    const endRow = rowOf(frag.y + frag.height - 60);
    const topY = round(rowYin(ctx, startRow) + kRowStep * topRaise);
    const bottomY = round(rowYin(ctx, Math.max(endRow, startRow)) - kRowStep / 2);
    // 容器顶部标签带：alt 只有标题带（0.2445IN）；Other fragment 是两段带（0.489IN）。
    const bandH = skipFirst ? kTextH * 2 : kTextH;
    const divider = (op: SeqOperand) => round(rowYin(ctx, rowOf(op.yTop)) + kRowStep / 2);
    for (let i = 0; i < ops.length; i++) {
        if (skipFirst && i === 0) continue;
        const opTop = i === 0 ? round(topY - bandH) : divider(ops[i]!);
        const opBottom = i === ops.length - 1 ? bottomY : divider(ops[i + 1]!);
        if (opTop - opBottom <= 0) continue;
        writeOperand(ctx, ops[i]!, xIn, wIn, opTop, opBottom, i === 0);
    }
}

/** 片段顶边上提量（格）：默认 1.5；若上方紧邻行就是已绘制消息（含自消息末行）则降为 1。
 *  渲染器与内容盒共用——两处必须同源，否则页面会与实际绘制不一致。 */
function fragmentRaise(m: SequenceModel, rows: { start: number[]; end: number[] }, startRow: number): number {
    let prevEnd = -1;
    m.messages.forEach((msg, i) => {
        if (!kMarkerKinds.has(msg.kind) && rows.start[i]! < startRow) prevEnd = Math.max(prevEnd, rows.end[i]!);
    });
    return prevEnd === startRow - 1 ? 1 : 1.5;
}

/** 内容外包围框（px，y 向下）：参与者页眉/生命线 + 消息/自消息文字 + 片段 + 备注。
 *  页面严格等于该盒（0 边距）；渲染器以 (x0=minX, pageHpx=maxY) 做坐标映射。 */
export function sequenceContentBox(m: SequenceModel): { minX: number; minY: number; maxX: number; maxY: number } {
    const rows = sequenceRows(m.messages);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const acc = (x0: number, y0: number, x1: number, y1: number) => {
        minX = Math.min(minX, x0); minY = Math.min(minY, y0);
        maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
    };
    const actorX = new Map(m.actors.map((a) => [a.id, a.x]));
    // 页眉盒：宽≈文字宽（母版 Sheet.6!Width 由文本驱动），高 kHdrH，中心在 rowY(0)-24-半高
    const hdrCy = rowY(0) - kRowStep * 96 - (kHdrH / 2) * 96;
    const hdrHalf = (kHdrH / 2) * 96;
    for (const a of m.actors) {
        const half = (headerWidth(a.label) / 2) * 96;
        acc(a.x - half, hdrCy - hdrHalf, a.x + half, hdrCy + hdrHalf);
    }
    // 生命线：长度 = (maxRow+2)×0.25IN，从页眉底向下
    const maxRow = Math.max(0, rows.total - 1);
    const length = Math.max(0.5, (maxRow + 2) * kRowStep);
    const lineBottom = hdrCy + hdrHalf + length * 96;
    for (const a of m.actors) acc(a.x - 2, hdrCy + hdrHalf, a.x + 2, lineBottom);
    // 消息 / 自消息 / 备注
    m.messages.forEach((msg, i) => {
        if (kMarkerKinds.has(msg.kind)) return;
        const x1 = actorX.get(msg.from) ?? 0;
        const x2 = actorX.get(msg.to) ?? x1;
        const y = rowY(rows.start[i]!);
        if (msg.kind === 'note') {
            const w = noteWidth(msg.label) * 96;
            const cx = (x1 + x2) / 2;
            const half = (0.3543307086614173 / 2) * 96;   // 官方 Note 高 8MM 下限
            acc(cx - w / 2, y + 12 - half, cx + w / 2, y + 12 + half);
            return;
        }
        if (msg.kind === 'self') {
            const tw = noteWidth(msg.label) * 96;
            acc(x1 - 4, y, x1 + kMsgH * 96 + tw + 8, y + 48);   // 自消息跨 2 格
            return;
        }
        const lo = Math.min(x1, x2);
        const hi = Math.max(x1, x2);
        const halfH = msg.label ? 24 : (kMsgH / 2) * 96 + 4;    // 有文字时按文本高（0.2445IN）留边
        acc(lo - 4, y - halfH, hi + 4, y + halfH);
        if (msg.label) {
            const tw = noteWidth(msg.label) * 96;
            const cx = (lo + hi) / 2;
            acc(cx - tw / 2, y - halfH, cx + tw / 2, y + halfH);
        }
    });
    // 片段（rect 无视觉，跳过）
    for (const frag of m.fragments) {
        if (frag.kind === 'rect') continue;
        const startRow = rowOf(frag.y);
        const endRow = rowOf(frag.y + frag.height - 60);
        const topY = rowY(startRow) - fragmentRaise(m, rows, startRow) * 24;
        const bottomY = rowY(Math.max(endRow, startRow)) + 12;
        acc(frag.x - frag.width / 2, topY, frag.x + frag.width / 2, bottomY);
    }
    if (minX > maxX) return { minX: 0, minY: 0, maxX: 96, maxY: 96 };
    return { minX, minY, maxX, maxY };
}
