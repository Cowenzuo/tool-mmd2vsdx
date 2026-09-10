// diag-sequence：契约 A → 契约 B（source/diag/sequence.ts；docs/redesign/04-转义层 对应篇）
//
// 母版实例化版（docs/redesign/07-母版形状库方案）：
//  - Object/Actor lifeline = 官方母版实例（Control.Row_1 + Connection 行 Y 缓存{F=Inh}——
//    母版承载 100 行定义与 IF/MODULUS 公式，实例只写用到的行，未用段 V=-6.35 封顶）；
//  - Message/Return/Self/Asynchronous = 四类消息母版实例（双端 PAR 钉接到生命线连接行 Xk、
//    _XFTRIGGER、Control.TextPosition、几何箭头行族）；
//  - Activation = 母版实例（1-D PAR 钉接到生命线时间格行 + Connection 行族）；
//  - Loop/Optional fragment = 母版实例（PinX/PinY/Width/LocPinX + 嵌套 MasterShape 覆写）；
//  - 未覆盖语义（note/alt 等官方素材缺失）→ console.warn + 待核清单（准则 3）。
// 布局常量与 parser/ext/sequence.mjs 一致（rowY(i)=85+52i、actor.x 来自提取器）。
// 实例模式来源：docs/research/标准研究模板-手动创建vsdx并解压/sequence/ 素材包实测。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type SequenceModel, type SeqActor, type SeqMessage, type SeqActivation, type SeqFragment } from '../contracts/index.js';

// ── 母版常量（素材包实测；MM/IN 混用按官方） ──
const kRowStartIX = 14;                   // 生命线时间格行起始 IX
const kRowCap = -6.35;                    // 未用段封顶（MM）
const kTextH = 0.2444939358181424;        // 消息文本高缓存
const kTextLocY = 0.1222469679090712;
const kArrowH = 0.09842519685039353;      // 消息线半高（几何 Y 缓存）

const MM = 25.4;
const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6);
const round = (v: number) => Math.round(v * 1e6) / 1e6;

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

function section(n: string, rows: XmlNode[]): XmlNode {
    const s = makeElement('Section');
    setAttribute(s, 'N', n);
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

function addShape(ctx: Ctx, el: XmlNode): number {
    const id = ctx.nextId++;
    el.attrs = [{ name: 'ID', value: String(id) }, ...el.attrs.filter((a) => a.name !== 'ID')];
    ctx.shapes.push(el);
    return id;
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

const ROW_Y0 = 85;
const ROW_GAP = 52;
function rowY(i: number): number {
    return ROW_Y0 + i * ROW_GAP;
}
function yin(ctx: Ctx, yPx: number): number {
    return round((ctx.pageHpx - yPx) / ctx.pc);
}
function xin(ctx: Ctx, xPx: number): number {
    return round(xPx / ctx.pc);
}

export class SeqRenderer {
    render(a: { sequence?: SequenceModel }, pageHpx: number, pxPerInch = 96, masterIds: Map<string, number> = new Map()): XmlPart {
        const m = a.sequence ?? { actors: [], messages: [], activations: [], fragments: [] };
        const ctx: Ctx = {
            nextId: 1, shapes: [], connects: [], ids: new Map(), nameCount: new Map(),
            masterIds, warnings: [], pageHpx, pc: pxPerInch,
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

function writeSeq(ctx: Ctx, m: SequenceModel): void {
    // 时间格：消息行序（含标记行，与提取器同序）→ 行 IX
    const msgRow = new Map<SeqMessage, number>();
    m.messages.forEach((msg, i) => msgRow.set(msg, i));
    // 每 actor 用到的行（消息 + 激活端点）→ 本地 Y 缓存
    const actorY = new Map<string, number[]>();
    for (const msg of m.messages) {
        if (msg.kind === 'note' || msg.kind === 'activate' || msg.kind === 'deactivate') continue;
        for (const id of [msg.from, msg.to]) {
            if (!id) continue;
            const list = actorY.get(id) ?? [];
            list.push(rowY(msgRow.get(msg)!));
            actorY.set(id, list);
        }
    }
    for (const act of m.activations) {
        const list = actorY.get(act.actorId) ?? [];
        list.push(act.yTop, act.yBottom);
        actorY.set(act.actorId, list);
    }
    // 生命线
    const lifeExt = new Map<string, { top: number; bottom: number }>();
    for (const actor of m.actors) {
        const ys = (actorY.get(actor.id) ?? [rowY(0), rowY(Math.max(m.messages.length - 1, 0))]);
        const top = Math.min(...ys) - 40;
        const bottom = Math.max(...ys) + 40;
        lifeExt.set(actor.id, { top, bottom });
        writeLifeLine(ctx, actor, top, bottom, [...new Set(ys)].sort((a, b) => a - b));
    }
    // 激活条
    for (const act of m.activations) {
        const lifelineId = ctx.ids.get(act.actorId);
        if (lifelineId === undefined) continue;
        const ys = [...new Set(actorY.get(act.actorId) ?? [])].sort((a, b) => a - b);
        const kBottom = kRowStartIX + ys.indexOf(act.yBottom);
        const kTop = kRowStartIX + ys.indexOf(act.yTop);
        if (kBottom < 0 || kTop < 0) continue;
        const actId = writeActivation(ctx, act, lifelineId, kBottom, kTop);
        ctx.connects.push(
            connectRec(actId, 'EndX', 12, lifelineId, `Connections.X${kTop}`, 100 + kTop - 1),
            connectRec(actId, 'BeginX', 9, lifelineId, `Connections.X${kBottom}`, 100 + kBottom - 1),
        );
    }
    // 消息
    for (const msg of m.messages) {
        const kind = msg.kind;
        if (kind === 'note') { ctx.warnings.push(`[sequence] note 无官方母版素材——跳过，记待核清单`); continue; }
        if (kind === 'activate' || kind === 'deactivate' || kind === 'loop' || kind === 'loopend' || kind === 'alt' || kind === 'altelse' || kind === 'altend' || kind === 'opt' || kind === 'optend') continue;
        const srcId = ctx.ids.get(msg.from);
        const dstId = ctx.ids.get(msg.to);
        if (srcId === undefined || dstId === undefined) continue;
        const i = msgRow.get(msg)!;
        const k1 = kRowStartIX + [...new Set(actorY.get(msg.from) ?? [])].sort((a, b) => a - b).indexOf(rowY(i));
        const k2 = kRowStartIX + [...new Set(actorY.get(msg.to) ?? [])].sort((a, b) => a - b).indexOf(rowY(i));
        if (k1 < kRowStartIX || k2 < kRowStartIX) continue;
        const lineId = writeMessage(ctx, msg, srcId, dstId, k1, k2, rowY(i));
        ctx.connects.push(
            connectRec(lineId, 'EndX', 12, dstId, `Connections.X${k2}`, 100 + k2 - 1),
            connectRec(lineId, 'BeginX', 9, srcId, `Connections.X${k1}`, 100 + k1 - 1),
        );
    }
    // 片段
    for (const frag of m.fragments) {
        if (frag.kind === 'loop') writeFragment(ctx, 'Loop fragment', frag);
        else if (frag.kind === 'opt') writeFragment(ctx, 'Optional fragment', frag);
        else ctx.warnings.push(`[sequence] 片段 ${frag.kind} 官方母版素材缺失——跳过，记待核清单`);
    }
}

function writeLifeLine(ctx: Ctx, actor: SeqActor, top: number, bottom: number, ys: number[]): void {
    const masterName = actor.kind === 'actor' ? 'Actor lifeline' : 'Object lifeline';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId;
    ctx.ids.set(actor.id, id);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const hIn = round((bottom - top) / ctx.pc);
    el.children.push(
        cell('PinX', f6(xin(ctx, actor.x))),
        cell('PinY', f6(yin(ctx, top))),
    );
    if (actor.kind === 'actor') {
        el.children.push(cell('Height', f6(hIn)), cell('LocPinY', f6(hIn / 2), undefined, 'Height*0.5'));
    }
    el.children.push(section('Control', [
        row(undefined, undefined, 'Row_1', [cell('Y', f6(-(bottom - top) / 2 / ctx.pc * MM))]),
    ]));
    const rowsC: XmlNode[] = [];
    ys.forEach((y, i) => {
        const local = round(((y - top) / ctx.pc) * MM);
        rowsC.push(row('Connection', kRowStartIX + i, undefined, [cell('Y', f6(-local), 'MM', 'Inh')]));
    });
    for (let i = ys.length; i < ys.length + 8; i++) {
        rowsC.push(row('Connection', kRowStartIX + i, undefined, [cell('Y', f6(kRowCap), 'MM', 'Inh')]));
    }
    el.children.push(section('Connection', rowsC));
    el.children.push(textEl(actor.label));
    addShape(ctx, el);
}

function writeActivation(ctx: Ctx, act: SeqActivation, lifelineId: number, kBottom: number, kTop: number): number {
    const masterId = ctx.masterIds.get('Activation') ?? 0;
    const id = ctx.nextId;
    const xIn = xin(ctx, act.x);
    const yBIn = yin(ctx, act.yBottom);
    const yTIn = yin(ctx, act.yTop);
    const wmm = Number(f6(act.width / ctx.pc * MM));
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, 'Activation', id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(xIn), 'MM', 'Inh'),
        cell('PinY', f6((yBIn + yTIn) / 2), 'MM', 'Inh'),
        cell('Width', f6(wmm), 'MM', 'Inh'),
        cell('LocPinX', f6(wmm / 2), 'MM', 'Inh'),
        cell('BeginX', f6(xIn), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kBottom},Sheet.${lifelineId}!Connections.Y${kBottom}))`),
        cell('BeginY', f6(yBIn), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kBottom},Sheet.${lifelineId}!Connections.Y${kBottom}))`),
        cell('EndX', f6(xIn), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kTop},Sheet.${lifelineId}!Connections.Y${kTop}))`),
        cell('EndY', f6(yTIn), 'MM', `PAR(PNT(Sheet.${lifelineId}!Connections.X${kTop},Sheet.${lifelineId}!Connections.Y${kTop}))`),
    );
    const crows: XmlNode[] = [];
    for (let i = 0; i < 5; i++) {
        crows.push(row('Connection', i, undefined, [cell('X', f6(wmm * (1 - 0.25 * i)), 'MM', 'Inh')]));
    }
    el.children.push(section('Connection', crows));
    addShape(ctx, el);
    return id;
}

function writeMessage(ctx: Ctx, msg: SeqMessage, srcId: number, dstId: number, k1: number, k2: number, yPx: number): number {
    const masterName = msg.kind === 'return' ? 'Return Message' : msg.kind === 'self' ? 'Self Message' : msg.kind === 'async' ? 'Asynchronous Message' : 'Message';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId;
    const srcX = xin(ctx, actorXpx(ctx, msg.from));
    const dstX = xin(ctx, actorXpx(ctx, msg.to));
    const dx = dstX - srcX;
    const dir = dx < 0 ? -1 : 1;
    const yIn = yin(ctx, yPx);
    const isReturn = msg.kind === 'return';
    const isSelf = msg.kind === 'self';
    const w = isSelf ? 0.1968503937007874 : Math.abs(dx);
    const h = isSelf ? -0.5 : 0.1968503937007874;
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6((srcX + dstX) / 2), 'MM', 'Inh'),
        cell('PinY', f6(yIn), 'MM', 'Inh'),
        cell('Width', f6(dir < 0 ? -w : w), 'MM', isSelf ? 'GUARD(0.19685039370079DL)' : 'GUARD(EndX-BeginX)'),
        cell('Height', f6(h), 'MM', isSelf ? 'GUARD(EndY-BeginY)' : 'GUARD(0.19685039370079DL)'),
        cell('LocPinX', f6(w / 2), 'MM', 'Inh'),
        cell('LocPinY', f6(h / 2), 'MM', 'Inh'),
        cell('BeginX', f6(srcX), 'MM', `PAR(PNT(Sheet.${srcId}!Connections.X${k1},Sheet.${srcId}!Connections.Y${k1}))`),
        cell('BeginY', f6(yIn), 'MM', `PAR(PNT(Sheet.${srcId}!Connections.X${k1},Sheet.${srcId}!Connections.Y${k1}))`),
        cell('EndX', f6(dstX), 'MM', `PAR(PNT(Sheet.${dstId}!Connections.X${k2},Sheet.${dstId}!Connections.Y${k2}))`),
        cell('EndY', f6(yIn), 'MM', `PAR(PNT(Sheet.${dstId}!Connections.X${k2},Sheet.${dstId}!Connections.Y${k2}))`),
        cell('LayerMember', '0'),
        cell('BegTrigger', '2', undefined, `_XFTRIGGER(Sheet.${srcId}!EventXFMod)`),
        cell('EndTrigger', '2', undefined, `_XFTRIGGER(Sheet.${dstId}!EventXFMod)`),
        cell('TxtPinX', f6(w / 2), undefined, 'Inh'),
        cell('TxtPinY', f6(h / 2), undefined, 'Inh'),
        cell('TxtHeight', f6(kTextH), undefined, 'Inh'),
        cell('TxtLocPinY', f6(kTextLocY), undefined, 'Inh'),
    );
    if (msg.kind === 'async') {
        el.children.push(
            cell('TxtWidth', f6(0.6111611121111111), undefined, 'Inh'),
            cell('TxtLocPinX', f6(0.3055805560555556), undefined, 'Inh'),
        );
    }
    el.children.push(section('Control', [
        row(undefined, undefined, 'TextPosition', [
            cell('X', f6(w / 2)), cell('Y', f6(h / 2)),
            cell('XDyn', f6(w / 2), undefined, 'Inh'), cell('YDyn', f6(h / 2), undefined, 'Inh'),
            cell('XCon', '0', undefined, 'Inh'),
        ]),
    ]));
    el.children.push(section('Geometry', isSelf ? [
        row('MoveTo', 1, undefined, [cell('Y', f6(kArrowH))]),
        row('LineTo', 2, undefined, [cell('X', f6(w)), cell('Y', f6(kArrowH))]),
        row('LineTo', 3, undefined, [cell('Y', f6(-kArrowH))]),
        row('LineTo', 4, undefined, [cell('X', '0'), cell('Y', f6(-kArrowH))]),
    ] : [
        row('MoveTo', 1, undefined, [cell('Y', f6(kArrowH))]),
        row('LineTo', 2, undefined, [cell('X', f6(w)), cell('Y', f6(kArrowH))]),
        row('LineTo', 3, undefined, [cell('X', f6(w + 0.25), 'IN', 'Geometry1.X2+0.25IN'), cell('Y', f6(kArrowH), undefined, 'Inh')]),
        row('LineTo', 4, undefined, [cell('X', f6(w), undefined, 'Geometry1.X2'), cell('Y', f6(kArrowH), undefined, 'Inh')]),
    ]));
    if (msg.label) el.children.push(textEl(msg.label));
    void isReturn;
    addShape(ctx, el);
    return id;
}

function actorXpx(ctx: Ctx, actorId: string): number {
    return ctx.actorX.get(actorId) ?? 75;
}

function writeFragment(ctx: Ctx, masterName: 'Loop fragment' | 'Optional fragment', frag: SeqFragment): void {
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const id = ctx.nextId;
    const w = round(frag.width / ctx.pc);
    const el = newShape();
    setAttribute(el, 'NameU', sel(ctx, masterName, id));
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(xin(ctx, frag.x))),
        cell('PinY', f6(yin(ctx, frag.y))),
        cell('Width', f6(w)),
        cell('LocPinX', f6(w / 2), undefined, 'Inh'),
    );
    const kids = makeElement('Shapes');
    for (const ms of ['6', '7']) {
        const k = newShape();
        setAttribute(k, 'ID', String(ctx.nextId++));
        setAttribute(k, 'MasterShape', ms);
        setAttribute(k, 'Type', 'Shape');
        k.children.push(
            cell('PinX', f6(w / 2), undefined, 'Inh'),
            cell('Width', f6(w), undefined, 'Inh'),
            cell('LocPinX', f6(w / 2), undefined, 'Inh'),
        );
        kids.children.push(k);
    }
    el.children.push(kids);
    if (frag.label) el.children.push(textEl(frag.label));
    addShape(ctx, el);
}

export function sequencePageSize(a: { sequence?: SequenceModel }): { w: number; h: number } {
    const m = a.sequence ?? { actors: [], messages: [], activations: [], fragments: [] };
    const actors = Math.max(1, m.actors.length);
    return {
        w: (150 + 200 * (actors - 1) + 150) / 96,
        h: (rowY(Math.max(m.messages.length, 1)) + 80) / 96,
    };
}
