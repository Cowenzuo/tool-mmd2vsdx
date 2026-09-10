// diag-gantt：契约 A → 契约 B（source/diag/gantt.ts；docs/redesign/04-转义层 对应篇）
//
// 母版实例化版（docs/redesign/07-母版形状库方案）：
//  - Gantt Chart frame / Column(ID) / Sec-Pri 标尺格 / Non working time / Row /
//    Task bar / Milestone / Text Entry / Link lines 全按官方母版实例结构（Master=N + 差异 cell）；
//  - 数据联动 GUID 行（GC*GUID）为官方保存态必需，UUID 生成属官方逻辑；
//  - 实例公式（Sheet.N 引用、User.Scalar/ScaleStart…）按官方原文，行序 ID 引用运行时替换；
//  - 未核项（Column 日期列集合语义、Link lines 几何行族）见 docs/redesign/07 比对清单/待核清单。
// 实例模式来源：docs/research/标准研究模板-手动创建vsdx并解压/gantt/ 素材包实测
//（temp/audit/gantt-instances.txt）。

import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kPageContentType, kPageUri } from '../common/xml/constants.js';
import { part, type XmlPart, type GanttModel, type GanttTask } from '../contracts/index.js';

const f6 = (v: number) => String(Math.round(v * 1e6) / 1e6);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});
const chartUuid = () => uuid().toUpperCase();

// ── 官方几何/缩放常量（素材包实测；IN） ──
const kDayW = 0.2491777135453005;         // 单日宽（Scalar）
const kHeaderH = 0.4921259842519685;      // 表头高
const kRowH = 0.2952755905511811;         // 行高
const kChartLeft = 1.2;                   // 图区左
const kChartTop = 0.25;                   // 表头顶
const kColW = 0.2460629921259843;         // ID 列宽
const kBarH = 0.2952755905511811;         // 任务条高

function serialToP(n: number): { d: number; y: number; m: number } {
    const date = new Date((n + 25569) * 86400000);
    return { d: date.getUTCDate(), y: date.getUTCFullYear(), m: date.getUTCMonth() };
}
function fmtMonth(n: number): string {
    const p = serialToP(n);
    return `${p.y}年 ${String(p.m + 1).padStart(2, '0')}月`;
}
function fmtYmd(n: number): string {
    const p = serialToP(n);
    return `${p.y}/${p.m + 1}/${p.d}`;
}
function serialFromYmd(y: number, mo: number, d: number): number {
    return Math.floor((Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function daysInMonth(y: number, mo: number): number {
    return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
function weekdayOf(n: number): number {
    return new Date((n + 25569) * 86400000).getUTCDay();
}

interface Ctx {
    nextId: number;
    shapes: XmlNode[];
    connects: XmlNode[];
    masterIds: Map<string, number>;
    chartUuid: string;
    rowIds: number[];
    barIds: Map<string, number>;
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

function newShape(): XmlNode {
    return makeElement('Shape');
}

function addShape(ctx: Ctx, el: XmlNode): number {
    const id = ctx.nextId++;
    // ID 恒为首属性（规范解析/审计以 `<Shape ID=` 开头定位）
    el.attrs = [{ name: 'ID', value: String(id) }, ...el.attrs.filter((a) => a.name !== 'ID')];
    ctx.shapes.push(el);
    return id;
}

/** 图表总宽（ID 列 + 日期轴；IN）。 */
function chartWidth(m: GanttModel): number {
    return kColW + (m.endSerial - m.startSerial + 1) * kDayW + 0.2;
}

function axisEnd(m: GanttModel): number {
    return kChartLeft + (m.endSerial - m.startSerial + 1) * kDayW;
}

export class GanttRenderer {
    render(a: { gantt?: GanttModel }, pageHpx: number, pxPerInch = 96, masterIds: Map<string, number> = new Map()): XmlPart {
        const m = a.gantt ?? { title: '', dateFormat: 'YYYY-MM-DD', startSerial: 0, endSerial: 0, sections: [], tasks: [] };
        const ctx: Ctx = { nextId: 1, shapes: [], connects: [], masterIds, chartUuid: chartUuid(), rowIds: [], barIds: new Map() };
        void pageHpx; void pxPerInch;
        const root = makeElement('PageContents');
        const shapes = makeElement('Shapes');
        const connects = makeElement('Connects');
        root.children.push(shapes, connects);
        writeChart(ctx, m);
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

export function ganttPageSize(a: { gantt?: GanttModel }): { w: number; h: number } {
    const m = a.gantt ?? { title: '', dateFormat: '', startSerial: 0, endSerial: 0, sections: [], tasks: [] };
    const rows = Math.max(1, m.tasks.length);
    return {
        w: kChartLeft + chartWidth(m) + 0.5,
        h: kChartTop + kHeaderH * 2 + rows * kRowH + 0.9,
    };
}

function writeChart(ctx: Ctx, m: GanttModel): void {
    const nDays = m.endSerial - m.startSerial + 1;
    addShape(ctx, writeFrame(ctx, m, nDays));     // 1 号（Sheet.1）恒为 frame
    addShape(ctx, writeColumn(ctx, m));           // 2 号（Sheet.2）恒为 ID 列
    // 标尺：Sec=自然月段；Pri=日格
    let cursor = m.startSerial;
    while (cursor <= m.endSerial) {
        const p = serialToP(cursor);
        const monthStart = serialFromYmd(p.y, p.m + 1, 1);
        const monthEnd = serialFromYmd(p.y, p.m + 1, daysInMonth(p.y, p.m + 1));
        const runStart = Math.max(cursor, monthStart);
        const runEnd = Math.min(m.endSerial, monthEnd);
        if (runStart <= runEnd) addShape(ctx, writeScaleCell(ctx, m, 'Sec', runStart, runEnd - runStart + 1));
        cursor = monthEnd + 1;
    }
    let day = 0;
    while (day < nDays) {
        addShape(ctx, writeScaleCell(ctx, m, 'Pri', m.startSerial + day, 1));
        day += 1;
    }
    // 非工作时段：连续周末段
    let runStart = -1;
    let runLen = 0;
    day = 0;
    while (day < nDays) {
        const wd = weekdayOf(m.startSerial + day);
        if (wd === 6 || wd === 0) {
            if (runStart < 0) runStart = day;
            runLen += 1;
        } else if (runLen > 0) {
            addShape(ctx, writeNonWorking(ctx, m, runStart, runLen));
            runStart = -1;
            runLen = 0;
        }
        day += 1;
    }
    if (runLen > 0) addShape(ctx, writeNonWorking(ctx, m, runStart, runLen));
    // 行 + 任务条 + 里程碑 + Text Entry；Link lines 最后
    m.tasks.forEach((t, i) => {
        const rowId = addShape(ctx, writeRow(ctx, m, t, i));
        ctx.rowIds.push(rowId);
        const barId = t.milestone ? addShape(ctx, writeMilestone(ctx, m, t, i)) : addShape(ctx, writeTaskBar(ctx, m, t, i));
        ctx.barIds.set(`${t.name}#${i}`, barId);
        addShape(ctx, writeTextEntry(ctx, m, t, i, 'duration'));
        addShape(ctx, writeTextEntry(ctx, m, t, i, 'end'));
    });
    m.tasks.forEach((t, i) => {
        for (const dep of t.dependsOn) {
            const fromIdx = m.tasks.findIndex((x) => x.name === dep);
            if (fromIdx < 0) continue;
            const fromBar = ctx.barIds.get(`${dep}#${fromIdx}`);
            const toBar = ctx.barIds.get(`${t.name}#${i}`);
            if (fromBar !== undefined && toBar !== undefined) addShape(ctx, writeLinkLine(ctx, m, fromBar, toBar));
        }
    });
}

function writeFrame(ctx: Ctx, m: GanttModel, nDays: number): XmlNode {
    const masterId = ctx.masterIds.get('Gantt Chart frame') ?? 0;
    const width = chartWidth(m);
    const el = newShape();
    setAttribute(el, 'NameU', 'Gantt Chart frame');
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    el.children.push(
        cell('PinX', f6(kChartLeft + width / 2)),
        cell('PinY', f6(kChartTop + kHeaderH)),
        cell('Width', f6(width), 'MM'),
        cell('Height', f6(kHeaderH), 'MM'),
        cell('LocPinY', f6(kHeaderH), 'MM', 'Inh'),
        cell('LayerMember', '1'),
    );
    el.children.push(section('User', [
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCModelGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('WorkingDays', '0;1;1;1;1;1;0;', 'STR'),
        userRow('DayStartTime', '8'),
        userRow('LastColGUID', uuid().toUpperCase(), 'STR'),
        userRow('LastRowGUID', uuid().toUpperCase(), 'STR'),
        userRow('DayEndTime', '16'),
        userRow('StartDate', String(m.startSerial)),
        userRow('EndDate', String(m.endSerial)),
        userRow('ScaleUnits', String(nDays - 1), undefined, 'User.EndDate-User.StartDate'),
        userRow('Scalar', f6(kDayW), 'DL', 'Sheet.1!Width/User.ScaleUnits'),
        userRow('PriScaleUnitsType', '3'),
        userRow('SecScaleUnitsType', '5'),
        userRow('WDLookup', '0;0;0;0;0;2;1;', 'STR'),
        userRow('WHLookup', '8;7;6;5;4;3;2;1;0;0;0;0;0;0;0;0;16;15;14;13;12;11;10;9;', 'STR'),
        userRow('WTScalar', '0.3333333333333333', undefined, 'Inh'),
        userRow('IDColumnGUID', uuid().toUpperCase(), 'STR'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', f6(width), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(width), 'MM', 'Inh'), cell('Y', f6(kHeaderH), 'MM', 'Inh')]),
        row('LineTo', 4, undefined, [cell('Y', f6(kHeaderH), 'MM', 'Inh')]),
    ]));
    return el;
}

function writeColumn(ctx: Ctx, m: GanttModel): XmlNode {
    const masterId = ctx.masterIds.get('Column') ?? 0;
    const el = newShape();
    setAttribute(el, 'NameU', 'Column');
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const height = kHeaderH + m.tasks.length * kRowH;
    el.children.push(
        cell('PinX', f6(kChartLeft - kColW / 2), undefined, 'Sheet.1!PinX-Sheet.1!Width/2-0.1230314960629921'),
        cell('PinY', f6(kChartTop + kHeaderH), undefined, 'Sheet.1!PinY'),
        cell('Width', f6(kColW)),
        cell('Height', f6(height), 'MM', `Sheet.1!Height+${f6(m.tasks.length * kRowH)}`),
        cell('LocPinY', f6(height), 'MM', 'Inh'),
        cell('LayerMember', '1'),
        cell('TxtPinY', f6(kHeaderH / 2), 'MM', 'Inh'),
        cell('TxtWidth', f6(kColW), undefined, 'Inh'),
    );
    el.children.push(section('User', [
        userRow('HeaderHeight', f6(kHeaderH), 'MM', 'Sheet.1!User.HeaderHeight'),
        userRow('GCPrevColGUID', ctx.chartUuid, 'STR'),
        userRow('GCFieldType', '55'),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('IsID', '1'),
    ]));
    el.children.push(section('Geometry', [
        row('MoveTo', 1, undefined, [cell('Y', f6(height), 'MM', 'Inh')]),
        row('LineTo', 2, undefined, [cell('X', f6(kColW), undefined, 'Inh'), cell('Y', f6(height), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(kColW), undefined, 'Inh')]),
        row('LineTo', 5, undefined, [cell('Y', f6(height), 'MM', 'Inh')]),
        row('MoveTo', 1, undefined, [cell('Y', f6(kHeaderH), 'MM', 'Inh')]),
        row('LineTo', 2, undefined, [cell('X', f6(kColW), undefined, 'Inh'), cell('Y', f6(kHeaderH), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(kColW), undefined, 'Inh'), cell('Y', f6(height), 'MM', 'Inh')]),
        row('LineTo', 4, undefined, [cell('Y', f6(height), 'MM', 'Inh')]),
        row('LineTo', 5, undefined, [cell('Y', f6(kHeaderH), 'MM', 'Inh')]),
    ]));
    return el;
}

function writeScaleCell(ctx: Ctx, m: GanttModel, kind: 'Sec' | 'Pri', startSerial: number, len: number): XmlNode {
    const masterName = kind === 'Sec' ? 'Sec scale cell' : 'Pri scale cell';
    const masterId = ctx.masterIds.get(masterName) ?? 0;
    const el = newShape();
    setAttribute(el, 'NameU', masterName);
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const offset = startSerial - m.startSerial;
    const pos = kChartLeft + offset * kDayW;
    const w = len * kDayW;
    const h = kHeaderH / 2;
    const y = kChartTop + (kind === 'Sec' ? kHeaderH * 1.5 : kHeaderH);
    const text = kind === 'Sec' ? fmtMonth(startSerial) : String(serialToP(startSerial).d);
    const typeRow = kind === 'Sec' ? 'SecScaleUnitsType' : 'PriScaleUnitsType';
    el.children.push(
        cell('PinX', f6(pos), 'MM', 'GUARD(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart))'),
        cell('PinY', f6(y), 'MM', kind === 'Sec' ? 'GUARD(Sheet.1!PinY)' : 'GUARD(Sheet.1!PinY-(Sheet.1!User.HeaderHeight/2))'),
        cell('Width', f6(w), undefined, 'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)'),
        cell('Height', f6(h), 'MM', 'Sheet.1!User.HeaderHeight/2'),
        cell('LocPinX', '0', 'MM', 'Inh'),
        cell('LocPinY', f6(h), 'MM', 'Inh'),
        cell('LayerMember', '1'),
        cell('Value', text, 'STR', `User.PreText&FORMAT(User.StartDate,INDEX(Sheet.1!User.${typeRow},Sheet.1!User.${typeRow}TextFormat))`),
        cell('Value', f6(0.08338587746484374), 'DL', 'Inh'),
        cell('Value', f6(pos), 'MM', '(User.Offset*Sheet.1!User.Scalar)+User.ScaleStart'),
        cell('Value', f6(w), 'DL', 'User.Duration*Sheet.1!User.Scalar'),
        cell('Value', String(startSerial), undefined, 'Sheet.1!User.StartDate+User.Offset'),
        cell('Value', String(len)),
        cell('Value', f6(kChartLeft), 'MM', 'Sheet.1!PinX-Sheet.1!LocPinX'),
        cell('Value', f6(axisEnd(m)), 'MM', 'User.ScaleStart+Sheet.1!Width'),
        cell('Value', ctx.chartUuid, 'STR'),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', '', 'STR', `IF(Sheet.1!User.${typeRow}=6,FORMAT(INT((MONTH(User.StartDate)+2)/3),`),
        cell('HorzAlign', kind === 'Sec' ? '1' : '2', undefined, `IF(Sheet.1!User.${typeRow}=4,0,1)`),
    );
    el.children.push(section('Field', [
        row(undefined, 0, undefined, [cell('Value', text, 'STR', 'Inh')]),
    ]));
    el.children.push(section('User', [
        userRow('TextWidth', f6(0.08338587746484374), 'DL', 'Inh'),
        userRow('ScaledStartPos', f6(pos), 'MM', '(User.Offset*Sheet.1!User.Scalar)+User.ScaleStart'),
        userRow('ScaledDuration', f6(w), 'DL', 'User.Duration*Sheet.1!User.Scalar'),
        userRow('StartDate', String(startSerial), undefined, 'Sheet.1!User.StartDate+User.Offset'),
        userRow('Duration', String(len)),
        userRow('ScaleStart', f6(kChartLeft), 'MM', 'Sheet.1!PinX-Sheet.1!LocPinX'),
        userRow('ScaleEnd', f6(axisEnd(m)), 'MM', 'User.ScaleStart+Sheet.1!Width'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCColGUID', uuid().toUpperCase(), 'STR'),
        userRow('PreText', '', 'STR', `IF(Sheet.1!User.${typeRow}=6,FORMAT(INT((MONTH(User.StartDate)+2)/3),`),
    ]));
    el.children.push(section('Paragraph', [
        row(undefined, 0, undefined, [cell('HorzAlign', kind === 'Sec' ? '1' : '2', undefined, `IF(Sheet.1!User.${typeRow}=4,0,1)`)]),
    ]));
    el.children.push(section('Geometry', [
        row('MoveTo', 1, undefined, [cell('Y', '0', 'MM', 'Inh')]),
        row('LineTo', 2, undefined, [cell('X', f6(w), undefined, 'Inh'), cell('Y', '0', 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(w), undefined, 'Inh'), cell('Y', f6(h), 'MM', 'Inh')]),
        row('LineTo', 4, undefined, [cell('Y', f6(h), 'MM', 'Inh')]),
        row('LineTo', 5, undefined, [cell('Y', '0', 'MM', 'Inh')]),
    ]));
    return el;
}

function writeNonWorking(ctx: Ctx, m: GanttModel, dayStart: number, len: number): XmlNode {
    const masterId = ctx.masterIds.get('Non working time') ?? 0;
    const el = newShape();
    setAttribute(el, 'NameU', 'Non working time');
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const startSerial = m.startSerial + dayStart;
    const pos = kChartLeft + dayStart * kDayW;
    const w = len * kDayW;
    el.children.push(
        cell('PinX', f6(pos), 'MM', 'GUARD(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart))'),
        cell('PinY', f6(kChartTop + kHeaderH * 2), 'MM', 'GUARD(Sheet.1!PinY-Sheet.1!User.HeaderHeight)'),
        cell('Width', f6(w), undefined, 'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)'),
        cell('Height', f6(kRowH), 'MM', 'Sheet.1!Height-Sheet.1!User.HeaderHeight'),
        cell('LocPinY', f6(kRowH), 'MM', 'Inh'),
        cell('LayerMember', '1'),
        cell('Value', f6(pos), 'MM', '(User.Offset*Sheet.1!User.Scalar)+User.ScaleStart'),
        cell('Value', f6(w), 'DL', 'User.Duration*Sheet.1!User.Scalar'),
        cell('Value', String(startSerial), undefined, 'Sheet.1!User.StartDate+User.Offset'),
        cell('Value', String(len)),
        cell('Value', f6(kChartLeft), 'MM', 'Sheet.1!PinX-Sheet.1!LocPinX'),
        cell('Value', f6(axisEnd(m)), 'MM', 'User.ScaleStart+Sheet.1!Width'),
        cell('Value', ctx.chartUuid, 'STR'),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', uuid().toUpperCase(), 'STR'),
    );
    el.children.push(section('User', [
        userRow('ScaledStartPos', f6(pos), 'MM', '(User.Offset*Sheet.1!User.Scalar)+User.ScaleStart'),
        userRow('ScaledDuration', f6(w), 'DL', 'User.Duration*Sheet.1!User.Scalar'),
        userRow('StartDate', String(startSerial), undefined, 'Sheet.1!User.StartDate+User.Offset'),
        userRow('Duration', String(len)),
        userRow('ScaleStart', f6(kChartLeft), 'MM', 'Sheet.1!PinX-Sheet.1!LocPinX'),
        userRow('ScaleEnd', f6(axisEnd(m)), 'MM', 'User.ScaleStart+Sheet.1!Width'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCColGUID', uuid().toUpperCase(), 'STR'),
    ]));
    el.children.push(section('Geometry', [
        row('MoveTo', 1, undefined, [cell('Y', '0', 'MM', 'Inh')]),
        row('LineTo', 2, undefined, [cell('X', f6(w), undefined, 'Inh'), cell('Y', '0', 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(w), undefined, 'Inh'), cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('LineTo', 4, undefined, [cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('LineTo', 5, undefined, [cell('Y', '0', 'MM', 'Inh')]),
    ]));
    return el;
}

function writeRow(ctx: Ctx, m: GanttModel, t: GanttTask, i: number): XmlNode {
    const masterId = ctx.masterIds.get('Row') ?? 0;
    const el = newShape();
    setAttribute(el, 'NameU', 'Row');
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const width = chartWidth(m);
    const y = kChartTop + kHeaderH * 2 - (i + 0.5) * kRowH;
    el.children.push(
        cell('PinX', f6(kChartLeft + width / 2), undefined, 'Sheet.1!PinX'),
        cell('PinY', f6(y), 'MM', `Sheet.1!PinY-Sheet.1!User.HeaderHeight-${f6((i + 1) * kRowH)}`),
        cell('Width', f6(width), 'MM', 'Sheet.1!Width'),
        cell('LayerMember', '1'),
        cell('TxtWidth', f6(kColW), undefined, 'Inh'),
    );
    el.children.push(section('User', [
        userRow('HeaderWidth', f6(kColW), 'DL', 'Sheet.2!Width'),
        userRow('GCPrevRowGUID', ctx.chartUuid, 'STR'),
        userRow('HeaderPinX', '0', 'DL', 'Sheet.2!PinX-Sheet.1!PinX'),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', f6(width), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(width), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(kColW), undefined, 'Inh')]),
        row('LineTo', 4, undefined, [cell('X', f6(kColW), undefined, 'Inh')]),
    ]));
    el.children.push(textEl(t.name));
    return el;
}

function writeTaskBar(ctx: Ctx, m: GanttModel, t: GanttTask, i: number): XmlNode {
    const masterId = ctx.masterIds.get('Task bar') ?? 0;
    const el = newShape();
    setAttribute(el, 'NameU', 'Task bar');
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const offset = t.startSerial - m.startSerial;
    const start = kChartLeft + offset * kDayW;
    const dur = Math.max(t.duration, 0.0001) * kDayW;
    const rowId = ctx.rowIds[i] ?? 1;
    el.children.push(
        cell('PinX', f6(start), 'MM', 'MIN(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart),User.ScaleEnd)'),
        cell('PinY', '0', 'MM', `Sheet.${rowId}!PinY`),
        cell('Width', f6(dur), undefined, 'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)'),
        cell('Height', f6(kBarH), 'MM', `Sheet.${rowId}!Height`),
        cell('LayerMember', '1'),
        cell('Comment', t.name, undefined, 'Inh'),
    );
    el.children.push(section('User', [
        userRow('LeftText', '0', 'STR', 'Inh'),
        userRow('RightText', '0', 'STR', 'Inh'),
        userRow('InnerText', '0', 'STR', 'Inh'),
        userRow('LeftTextID', '0', 'STR', 'Inh'),
        userRow('RightTextID', '0', 'STR', 'Inh'),
        userRow('InnerTextID', '0', 'STR', 'Inh'),
        userRow('ScaledEndPos', f6(start + dur), 'MM', 'Inh'),
        userRow('StartSymType', '9', undefined, 'Inh'),
        userRow('EndSymType', '9', undefined, 'Inh'),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCModelGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('ScaledStartPos', f6(start), 'MM', 'MAX((User.Offset*Sheet.1!User.Scalar)+User.ScaleStart,User.Dependency)'),
        userRow('ScaledDuration', f6(dur), 'DL', 'IF(User.IsSummary=1,User.DependencyDuration,User.Duration*Sheet.1!User.Scalar)'),
        userRow('StartDate', String(t.startSerial), undefined, 'MAX(Sheet.1!User.StartDate+(User.Dependency-User.ScaleStart)/Sheet.1!User.Scalar,User.WTNormalizedStart)'),
        userRow('Duration', String(t.duration)),
        userRow('ScaleStart', f6(kChartLeft), 'MM', 'Sheet.1!PinX-Sheet.1!LocPinX'),
        userRow('ScaleEnd', f6(axisEnd(m)), 'MM', 'User.ScaleStart+Sheet.1!Width'),
        userRow('Offset', String(offset), undefined, 'User.WDOffset+User.WHOffset+User.StartDate-Sheet.1!User.StartDate'),
        userRow('GCRowGUID', uuid().toUpperCase(), 'STR'),
        userRow('WDOffset', '0', 'STR', 'INDEX(WEEKDAY(User.StartDate+User.WHOffset)-1,Sheet.1!User.WDLookup,Sheet.1!User.WTLookupSep)'),
        userRow('WHOffset', '0', undefined, 'IF(Sheet.1!User.PriScaleUnitsType<3,INDEX(HOUR(User.StartDate),Sheet.1!User.WHLookup,Sheet.1!User.WTLookupSep),0)/24'),
        userRow('ParentModelGUID', uuid().toUpperCase(), 'STR'),
        userRow('DependencyDuration', '-1.5E300', 'MM', 'Inh'),
        userRow('LastStartFromMove', String(t.startSerial), undefined, `IF(User.IsSummary,-1.5E300,${t.startSerial})`),
        userRow('WTNormalizedStart', String(t.startSerial), undefined, `IF(Sheet.1!User.PriScaleUnitsType<3,INT(User.LastStartFromMove)+((Sheet.1!User.WTScalar*(User.LastStartFromMove-INT(User.LastStartFromMove)))+(Sheet.1!User.DayStartTime/24)),User.LastStartFromMove)`),
    ]));
    el.children.push(section('Control', [
        row(undefined, undefined, 'Row_2', [cell('X', f6(dur), undefined, 'Inh'), cell('XDyn', f6(dur), undefined, 'Inh')]),
    ]));
    el.children.push(section('Property', [
        row(undefined, undefined, 'Name', [cell('Value', t.name, 'STR'), cell('DataLinked', '0')]),
        row(undefined, undefined, 'Start', [cell('Value', String(t.startSerial))]),
        row(undefined, undefined, 'End', [cell('Value', String(t.startSerial + Math.max(t.duration - 1, 0)))]),
        row(undefined, undefined, 'Duration', [cell('Value', `${t.duration}天`, 'STR', `FORMAT(${t.duration},`), cell('DataLinked', '0')]),
        row(undefined, undefined, 'ActualStart', [cell('Value', String(t.startSerial), undefined, 'Inh')]),
        row(undefined, undefined, 'ActualEnd', [cell('Value', String(t.startSerial + Math.max(t.duration - 1, 0)), undefined, 'Inh')]),
        row(undefined, undefined, 'UserDefTime', [cell('Value', f6(t.startSerial + 0.33333333333334))]),
        row(undefined, undefined, 'TaskID', [cell('Value', String(i + 1))]),
    ]));
    el.children.push(section('Connection', [
        row('Connection', 0, 'RightSide', [cell('X', f6(dur), undefined, 'Inh')]),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', f6(dur), undefined, 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(dur), undefined, 'Inh')]),
    ]));
    const kids = makeElement('Shapes');
    for (const ms of ['10', '5', '9', '6', '7', '11', '12', '13']) {
        const k = newShape();
        setAttribute(k, 'MasterShape', ms);
        setAttribute(k, 'Type', 'Shape');
        k.children.push(cell('LayerMember', '1'));
        kids.children.push(k);
    }
    el.children.push(kids);
    return el;
}

function writeMilestone(ctx: Ctx, m: GanttModel, t: GanttTask, i: number): XmlNode {
    const masterId = ctx.masterIds.get('Milestone') ?? 0;
    const el = newShape();
    setAttribute(el, 'NameU', 'Milestone');
    setAttribute(el, 'Type', 'Group');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const offset = t.startSerial - m.startSerial;
    const start = kChartLeft + offset * kDayW;
    const rowId = ctx.rowIds[i] ?? 1;
    el.children.push(
        cell('PinX', f6(start), 'MM', 'MIN(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart),User.ScaleEnd)'),
        cell('PinY', '0', 'MM', `Sheet.${rowId}!PinY`),
        cell('Width', '0', undefined, 'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)'),
        cell('Height', f6(kBarH), 'MM', `Sheet.${rowId}!Height`),
        cell('LayerMember', '1'),
        cell('Comment', t.name, undefined, 'Inh'),
    );
    el.children.push(section('User', [
        userRow('LeftText', '0', 'STR', 'Inh'),
        userRow('RightText', '0', 'STR', 'Inh'),
        userRow('InnerText', '0', 'STR', 'Inh'),
        userRow('LeftTextID', '0', 'STR', 'Inh'),
        userRow('RightTextID', '0', 'STR', 'Inh'),
        userRow('InnerTextID', '0', 'STR', 'Inh'),
        userRow('ScaledEndPos', f6(start), 'MM', 'Inh'),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCModelGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('ScaledStartPos', f6(start), 'MM', 'MAX((User.Offset*Sheet.1!User.Scalar)+User.ScaleStart,User.Dependency)'),
        userRow('ScaledDuration', '0', 'DL', 'IF(User.IsSummary=1,User.DependencyDuration,User.Duration*Sheet.1!User.Scalar)'),
        userRow('StartDate', f6(t.startSerial + 0.5), undefined, 'MAX(Sheet.1!User.StartDate+(User.Dependency-User.ScaleStart)/Sheet.1!User.Scalar,User.WTNormalizedStart)'),
        userRow('ScaleStart', f6(kChartLeft), 'MM', 'Sheet.1!PinX-Sheet.1!LocPinX'),
        userRow('ScaleEnd', f6(axisEnd(m)), 'MM', 'User.ScaleStart+Sheet.1!Width'),
        userRow('Offset', f6(offset + 0.5), undefined, 'User.WDOffset+User.WHOffset+User.StartDate-Sheet.1!User.StartDate'),
        userRow('GCRowGUID', uuid().toUpperCase(), 'STR'),
        userRow('WDOffset', '0', 'STR', 'INDEX(WEEKDAY(User.StartDate+User.WHOffset)-1,Sheet.1!User.WDLookup,Sheet.1!User.WTLookupSep)'),
        userRow('WHOffset', '0', undefined, 'IF(Sheet.1!User.PriScaleUnitsType<3,INDEX(HOUR(User.StartDate),Sheet.1!User.WHLookup,Sheet.1!User.WTLookupSep),0)/24'),
        userRow('ParentModelGUID', uuid().toUpperCase(), 'STR'),
        userRow('DependencyDuration', '-1.5E300', 'MM', 'Inh'),
        userRow('LastStartFromMove', f6(t.startSerial + 0.5), undefined, `IF(User.IsSummary,-1.5E300,${f6(t.startSerial + 0.5)})`),
        userRow('WTNormalizedStart', f6(t.startSerial + 0.5), undefined, `IF(Sheet.1!User.PriScaleUnitsType<3,INT(User.LastStartFromMove)+((Sheet.1!User.WTScalar*(User.LastStartFromMove-INT(User.LastStartFromMove)))+(Sheet.1!User.DayStartTime/24)),User.LastStartFromMove)`),
    ]));
    el.children.push(section('Property', [
        row(undefined, undefined, 'Name', [cell('Value', t.name, 'STR'), cell('DataLinked', '0')]),
        row(undefined, undefined, 'Start', [cell('Value', f6(t.startSerial + 0.5))]),
        row(undefined, undefined, 'End', [cell('Value', f6(t.startSerial + 0.5))]),
        row(undefined, undefined, 'Duration', [cell('Value', '0天', 'STR', 'FORMAT(0,'), cell('DataLinked', '0')]),
        row(undefined, undefined, 'ActualStart', [cell('Value', f6(t.startSerial + 0.5), undefined, 'Inh')]),
        row(undefined, undefined, 'ActualEnd', [cell('Value', f6(t.startSerial + 0.5), undefined, 'Inh')]),
        row(undefined, undefined, 'UserDefTime', [cell('Value', f6(t.startSerial + 0.33333333333334))]),
        row(undefined, undefined, 'TaskID', [cell('Value', String(i + 1))]),
    ]));
    return el;
}

function writeTextEntry(ctx: Ctx, m: GanttModel, t: GanttTask, i: number, kind: 'duration' | 'end'): XmlNode {
    const masterId = ctx.masterIds.get('Text Entry') ?? 0;
    const el = newShape();
    setAttribute(el, 'NameU', 'Text Entry');
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const text = kind === 'duration' ? `${t.duration}天` : fmtYmd(t.startSerial + Math.max(t.duration - 1, 0));
    const x = kChartLeft + (t.startSerial - m.startSerial + t.duration) * kDayW + kColW + 0.2;
    const w = 0.984251968503937;
    const rowId = ctx.rowIds[i] ?? 1;
    const prop = kind === 'duration' ? 'Duration' : 'End';
    el.children.push(
        cell('PinX', f6(x), 'MM', 'Sheet.1!PinX'),
        cell('PinY', '0', 'MM', `Sheet.${rowId}!PinY`),
        cell('Width', f6(w), 'MM', `Sheet.${2}!Width*4`),
        cell('Height', f6(kBarH), 'MM', `Sheet.${rowId}!Height`),
        cell('LocPinX', '0', 'MM', 'Inh'),
        cell('LocPinY', f6(kBarH), 'MM', 'Inh'),
        cell('LayerMember', '1'),
        cell('LockTextEdit', '0', undefined, `IF(Sheet.${rowId}!User.IsSummary=1,1,0)`),
        cell('Value', text, 'STR', 'Inh'),
        cell('Value', ctx.chartUuid, 'STR'),
        cell('Value', text, 'STR', `Sheet.${rowId}!Prop.${prop}`),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', '@', 'STR', `Sheet.${rowId}!Prop.${prop}.Format`),
        cell('Value', '0', undefined, `Sheet.${rowId}!Prop.${prop}.Type`),
        cell('Style', '0', undefined, `Sheet.${rowId}!User.TextStyle`),
        cell('LangID', 'zh-CN', undefined, `Sheet.${rowId}!Prop.${prop}.LangID`),
    );
    el.children.push(section('Field', [
        row(undefined, 0, undefined, [
            cell('Value', text, 'STR', 'Inh'),
            cell('Format', '@', 'STR', `Sheet.${rowId}!Prop.${prop}.Format`),
            cell('Type', '0', undefined, `Sheet.${rowId}!Prop.${prop}.Type`),
        ]),
    ]));
    el.children.push(section('User', [
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('Field', text, 'STR', `Sheet.${rowId}!Prop.${prop}`),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCRowGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCColGUID', uuid().toUpperCase(), 'STR'),
        userRow('TextFormat', '@', 'STR', `Sheet.${rowId}!Prop.${prop}.Format`),
        userRow('TextType', '0', undefined, `Sheet.${rowId}!Prop.${prop}.Type`),
    ]));
    el.children.push(section('Character', [
        row(undefined, 0, undefined, [cell('Style', '0', undefined, `Sheet.${rowId}!User.TextStyle`), cell('LangID', 'zh-CN', undefined, `Sheet.${rowId}!Prop.${prop}.LangID`)]),
    ]));
    el.children.push(section('Geometry', [
        row('LineTo', 2, undefined, [cell('X', f6(w), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(w), 'MM', 'Inh'), cell('Y', f6(0.2652755905511811), 'MM', 'Inh')]),
        row('LineTo', 4, undefined, [cell('Y', f6(0.2652755905511811), 'MM', 'Inh')]),
    ]));
    return el;
}

function writeLinkLine(ctx: Ctx, m: GanttModel, fromBar: number, toBar: number): XmlNode {
    const masterId = ctx.masterIds.get('Link lines') ?? 0;
    void m;
    const el = newShape();
    setAttribute(el, 'NameU', 'Link lines');
    setAttribute(el, 'Type', 'Shape');
    if (masterId > 0) setAttribute(el, 'Master', String(masterId));
    const w = f6(kDayW * 2);
    const h = f6(kRowH * 2);
    el.children.push(
        cell('PinX', f6(kDayW), undefined, 'Inh'),
        cell('PinY', f6(kRowH), 'MM', 'Inh'),
        cell('Width', w, undefined, 'Inh'),
        cell('Height', h, 'MM', 'Inh'),
        cell('LocPinX', f6(kDayW), undefined, 'Inh'),
        cell('LocPinY', f6(kRowH), 'MM', 'Inh'),
        cell('BeginX', f6(kDayW * 2), undefined, `PAR(PNT(Sheet.${fromBar}!Connections.RightSide.X,Sheet.${fromBar}!Connections.RightSide.Y))`),
        cell('BeginY', f6(kRowH), 'MM', `PAR(PNT(Sheet.${fromBar}!Connections.RightSide.X,Sheet.${fromBar}!Connections.RightSide.Y))`),
        cell('EndX', '0', undefined, `PAR(PNT(Sheet.${toBar}!Connections.LeftSide.X,Sheet.${toBar}!Connections.LeftSide.Y))`),
        cell('EndY', f6(kRowH), 'MM', `PAR(PNT(Sheet.${toBar}!Connections.LeftSide.X,Sheet.${toBar}!Connections.LeftSide.Y))`),
        cell('LayerMember', '1'),
        cell('TxtPinX', f6(kDayW), undefined, 'Inh'),
        cell('TxtPinY', f6(kRowH), 'MM', 'Inh'),
        cell('Value', w, 'DL', 'EndX-BeginX'),
        cell('Value', f6(kDayW * 1.26), 'DL', 'User.EndPointDiff-User.TotalOffset'),
        cell('Value', '0', 'BOOL', 'OR(AND(BeginX<=Sheet.1!PinX,EndX<=Sheet.1!PinX),AND(BeginX>=Sheet.1!PinX+Sheet.1!Width,EndX>=Sheet.1!PinX+Sheet.1!Width))'),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', uuid().toUpperCase(), 'STR'),
        cell('Value', ctx.chartUuid, 'STR'),
        cell('Value', '0', 'DL', 'User.LagTime*Sheet.1!User.Scalar'),
        cell('Value', '0'),
        cell('Prompt', ''),
        cell('Value', '0', 'D'),
        cell('DataLinked', '0'),
        cell('NoShow', '1', undefined, 'Inh'),
    );
    el.children.push(section('User', [
        userRow('EndPointDiff', w, 'DL', 'EndX-BeginX'),
        userRow('CrossWidth', f6(kDayW * 1.26), 'DL', 'User.EndPointDiff-User.TotalOffset'),
        userRow('HideLine', '0', 'BOOL', 'OR(AND(BeginX<=Sheet.1!PinX,EndX<=Sheet.1!PinX),AND(BeginX>=Sheet.1!PinX+Sheet.1!Width,EndX>=Sheet.1!PinX+Sheet.1!Width))'),
        userRow('GCVisioGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCModelGUID', uuid().toUpperCase(), 'STR'),
        userRow('GCChartGUID', ctx.chartUuid, 'STR'),
        userRow('ScaledDuration', '0', 'DL', 'User.LagTime*Sheet.1!User.Scalar'),
        userRow('LagTime', '0'),
    ]));
    el.children.push(section('Property', [
        row(undefined, undefined, 'LagTime', [cell('Value', '0', 'D'), cell('DataLinked', '0')]),
    ]));
    el.children.push(section('Geometry', [
        row('MoveTo', 1, undefined, [cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('LineTo', 2, undefined, [cell('X', f6(kDayW * 2), undefined, 'Inh'), cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(kDayW * 2), undefined, 'Inh')]),
        row('MoveTo', 1, undefined, [cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('LineTo', 2, undefined, [cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('LineTo', 3, undefined, [cell('X', f6(kDayW * 1.5), undefined, 'Inh'), cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('LineTo', 4, undefined, [cell('X', f6(kDayW * 1.5), undefined, 'Inh'), cell('Y', f6(kRowH - kDayW), 'MM', 'Inh')]),
        row('LineTo', 5, undefined, [cell('X', f6(kDayW * 1.5), undefined, 'Inh')]),
        row('LineTo', 6, undefined, [cell('X', f6(kDayW), undefined, 'Inh')]),
    ]));
    el.children.push(section('Connection', [
        row('Connection', 0, undefined, [cell('X', f6(kDayW * 2), undefined, 'Inh'), cell('Y', f6(kRowH), 'MM', 'Inh')]),
        row('Connection', 1, undefined, [cell('X', '0', undefined, 'Inh'), cell('Y', f6(kRowH), 'MM', 'Inh')]),
    ]));
    return el;
}
