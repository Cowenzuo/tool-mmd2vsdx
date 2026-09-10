// mmd2vsdx - vsdxdoc/render：ganttRenderer（甘特专用渲染，GanttRenderer 平移）
//
// C++ render/ganttrenderer.cpp（1,490 行，全工程最深模块）平移（坑位 ⑧-8.1 的
// 全部要点 + 文档 ⑬-13.4 锚定：任务条顶定位）。纪律：
//   - 常量字面量照抄（U=MM 仅显示单位、V 恒英寸）；顺序即协议（z 序）；
//   - 公式后补前向引用（setUserRowFormula 只改 User 段行内 Value 的 F，
//     绝不用 setNumericCell 找 User 段行——会建死单元格）；
//   - 字符串 cell 恒 U='STR'；刻度列表头写空 <Text/>；固定列不写本地 Width；
//   - 周末块只从周六生成（wdIndex==5，Duration=2）；主刻度首例无 Offset 行；
//   - 顶层形状才写 UniqueID（子形状 MasterShape 不写）；GUID 由 guidFor(seed)
//     确定性生成（FNV-1a 64 变体哈希，逐字节复刻 C++ 012-232 行）；
//   - 日期全 UTC（gmtime 语义，勿用本地时区）；里程碑 Width=0 且判据用 IR
//     milestone 字段（勿用 duration=0 兜底）；
//   - addPageEngineConfig：按 NameU 匹配本页 <Page>（多页不能取第一个）。
//
// 文件分两段拼装：本文件写完 render() 前半（框架/列/刻度/周末/行）后接占位
// 标记，由 ganttRenderer.ts 同一文件后续部分替换标记完成（保持单文件）。

import type { PageModel } from '../docmodel/model.js';
import type { GanttChart } from '../../core/types.js';
import type { MasterClient } from '../masters/masterClient.js';
import type { XmlNode } from '../../xml/xmlNode.js';
import { appendChild, makeElement, setAttribute } from '../../xml/xmlNode.js';
import {
    appendCellNumber,
    appendCellString,
    appendNamedRow,
    appendRow,
    appendSection,
    replaceShapeText,
    setNumericCell,
    cppFixed6,
} from '../../xml/xmlBuilder.js';
import { pageShapes } from './renderer.js';

// ── 布局常量（官方 Gantt 组件模板，照抄） ──
export const kScalar = 0.2491777135453005; // 每天宽度
export const kIdColW = 0.2460629921259843; // ID 列宽
export const kNameColW = 1.968503937007874; // 任务名列宽
export const kFieldColW = 0.984251968503937; // 字段列宽
export const kHeaderH = 0.4921259842519685; // 表头高
export const kRowH = 0.2952755905511811; // 行高
export const kMargin = 1.072094587860061; // 框架左缘 PinX
export const kFrameTopY = 5.543503937007875; // 框架顶边 PinY

// ── 日期工具（UTC） ──

/** Excel 序列日 → Date（UTC 起算 1899-12-30 = 25569 Unix 偏移）。 */
function serialToDate(serial: number): Date {
    const secs = Math.round((serial - 25569.0) * 86400.0);
    return new Date(secs * 1000);
}

export function formatDate(serial: number, fmt: string): string {
    const d = serialToDate(serial);
    const out = fmt
        .replaceAll('YYYY', String(d.getUTCFullYear()).padStart(4, '0'))
        .replaceAll('MM', String(d.getUTCMonth() + 1).padStart(2, '0'))
        .replaceAll('DD', String(d.getUTCDate()).padStart(2, '0'))
        .replaceAll('HH', String(d.getUTCHours()).padStart(2, '0'))
        .replaceAll('mm', String(d.getUTCMinutes()).padStart(2, '0'))
        .replaceAll('ss', String(d.getUTCSeconds()).padStart(2, '0'));
    return out;
}

export function daysInMonth(year: number, month: number): number {
    const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let n = dim[month - 1]!;
    if (month === 2 && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) {
        n = 29;
    }
    return n;
}

/** C++ gmtime 语义的星期索引（0=周日），供 WorkingDays/wdIndex 计算。 */
export function weekdayUtc(serial: number): number {
    return serialToDate(serial).getUTCDay();
}

// ── GUID（确定性 UUIDv4 风格；C++ 212-232 行算法逐字节复刻） ──
export function guidFor(seed: string): string {
    // FNV-1a 64 种子 + 混合
    let h0 = 1469598103934665603n;
    let h1 = 1469598103934665603n;
    for (const ch of seed) {
        const c = BigInt(ch.codePointAt(0)!);
        h0 ^= c;
        h0 = (h0 * 1099511628211n) & 0xffffffffffffffffn;
        h1 = (h1 * 1315423911n + c) & 0xffffffffffffffffn;
    }
    h1 ^= h0;
    const b: number[] = [];
    for (let i = 0; i < 16; i++) {
        const h = (i % 2 === 0 ? h0 : h1) & 0xffffffffffffffffn;
        const shift = BigInt(((i / 2) % 8) * 8);
        b.push(Number((h >> shift) & 0xffn));
    }
    b[6] = (b[6]! & 0x0f) | 0x40; // version 4
    b[8] = (b[8]! & 0x3f) | 0x80; // variant
    const hex = b.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join('');
    return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

// ── 形状工具 ──

interface NewShape {
    id: number;
    node: XmlNode;
}

/** 页面顶层追加形状（Master/MasterShape/UniqueID 可选；子形状不写 UniqueID）。 */
function newShape(page: PageModel, type: string, masterId: number,
                  masterShape: string | null = null,
                  uniqueId = ''): NewShape {
    const id = page.nextShapeId++;
    const node = appendChild(pageShapes(page), makeElement('Shape'));
    setAttribute(node, 'ID', String(id));
    setAttribute(node, 'Type', type);
    if (masterId > 0) setAttribute(node, 'Master', String(masterId));
    if (masterShape !== null) setAttribute(node, 'MasterShape', masterShape);
    if (uniqueId.length > 0) setAttribute(node, 'UniqueID', uniqueId);
    return { id, node };
}

/** 向 User/Property section 追加数值 Value 行。 */
function addVal(section: XmlNode, name: string, value: number,
                unit?: string, formula = ''): void {
    const row = appendNamedRow(section, name);
    appendCellNumber(row, 'Value', value, unit, formula.length === 0 ? undefined : formula);
}

/** 追加字符串 Value 行（恒 U='STR'，否则中文显示 0.00）。 */
function addStr(section: XmlNode, name: string, value: string): void {
    const row = appendNamedRow(section, name);
    appendCellString(row, 'Value', value, 'STR');
}

/** 追加带公式字符串 Value 行。 */
function addStrF(section: XmlNode, name: string, value: string, formula: string): void {
    const row = appendNamedRow(section, name);
    appendCellString(row, 'Value', value, 'STR', formula);
}

/** 追加 GUID 字符串行。 */
function addGuid(section: XmlNode, name: string, guid: string): void {
    const row = appendNamedRow(section, name);
    appendCellString(row, 'Value', guid, 'STR');
}

/**
 * 更新既有 User 行 Value 的公式（前向引用后补）。
 * 绝不 setNumericCell 找 User 段行（只搜顶层 Cell，会建死单元格）。
 */
function setUserRowFormula(userSection: XmlNode | null, rowName: string,
                           formula: string): void {
    if (!userSection) return;
    for (const child of userSection.children) {
        if (typeof child === 'string') continue;
        if (child.attrs.find((a) => a.name === 'N')?.value !== rowName) continue;
        for (const cell of child.children) {
            if (typeof cell === 'string' || cell.name !== 'Cell') continue;
            if (cell.attrs.find((a) => a.name === 'N')?.value === 'Value') {
                const existing = cell.attrs.find((a) => a.name === 'F');
                if (existing) existing.value = formula;
                else cell.attrs.push({ name: 'F', value: formula });
                return;
            }
        }
        return;
    }
}

/** 列实例 Geometry：IX=0 边框 + IX=1 表头分隔（GC 识别列依据）。 */
function addColumnGeometry(colNode: XmlNode, w: number, h: number): void {
    const hdrY = h - kHeaderH;
    const g0 = appendSection(colNode, 'Geometry', 0);
    const r1 = appendRow(g0, 'MoveTo', 1);
    appendCellNumber(r1, 'X', 0.0, 'IN', 'Inh');
    appendCellNumber(r1, 'Y', h, 'IN', 'Inh');
    const r2 = appendRow(g0, 'LineTo', 2);
    appendCellNumber(r2, 'X', w, 'IN', 'Inh');
    appendCellNumber(r2, 'Y', h, 'IN', 'Inh');
    const r3 = appendRow(g0, 'LineTo', 3);
    appendCellNumber(r3, 'X', w, 'IN', 'Inh');
    const r4 = appendRow(g0, 'LineTo', 4);
    appendCellNumber(r4, 'X', 0.0, 'IN', 'Inh');
    const r5 = appendRow(g0, 'LineTo', 5);
    appendCellNumber(r5, 'X', 0.0, 'IN', 'Inh');
    appendCellNumber(r5, 'Y', h, 'IN', 'Inh');
    const g1 = appendSection(colNode, 'Geometry', 1);
    const s1 = appendRow(g1, 'MoveTo', 1);
    appendCellNumber(s1, 'X', 0.0, 'IN', 'Inh');
    appendCellNumber(s1, 'Y', hdrY, 'IN', 'Inh');
    const s2 = appendRow(g1, 'LineTo', 2);
    appendCellNumber(s2, 'X', w, 'IN', 'Inh');
    appendCellNumber(s2, 'Y', hdrY, 'IN', 'Inh');
    const s3 = appendRow(g1, 'LineTo', 3);
    appendCellNumber(s3, 'X', w, 'IN', 'Inh');
    appendCellNumber(s3, 'Y', h, 'IN', 'Inh');
    const s4 = appendRow(g1, 'LineTo', 4);
    appendCellNumber(s4, 'X', 0.0, 'IN', 'Inh');
    appendCellNumber(s4, 'Y', h, 'IN', 'Inh');
    const s5 = appendRow(g1, 'LineTo', 5);
    appendCellNumber(s5, 'X', 0.0, 'IN', 'Inh');
    appendCellNumber(s5, 'Y', hdrY, 'IN', 'Inh');
}

// ═══════════════════════════════════════════════════════
// render：主入口（顺序=z 序：框架→列→次刻度→主刻度→周末→行→条→链接→TE）
// ═══════════════════════════════════════════════════════

export function renderGantt(page: PageModel, gantt: GanttChart,
                            masters: MasterClient): void {
    if (gantt.tasks.length === 0) return;

    const totalDays = Math.max(1.0, gantt.endSerial - gantt.startSerial);
    const nDays = Math.ceil(totalDays);
    const nTasks = gantt.tasks.length;

    const chartW = totalDays * kScalar;
    const frameW = kIdColW + kNameColW + 3 * kFieldColW + chartW;
    const chartH = kHeaderH + nTasks * kRowH;
    const xLeft = kMargin;
    const yTop = kFrameTopY;
    const scaleStartX = xLeft + kIdColW + kNameColW + 3 * kFieldColW;

    const mFrame = masters.masterIdFor('Gantt Chart frame');
    const mColumn = masters.masterIdFor('Column');
    const mRow = masters.masterIdFor('Row');
    const mTask = masters.masterIdFor('Task bar');
    const mPri = masters.masterIdFor('Pri scale cell');
    const mSec = masters.masterIdFor('Sec scale cell');
    const mNWT = masters.masterIdFor('Non working time');
    const mTextEntry = masters.masterIdFor('Text Entry');
    const mMilestone = masters.masterIdFor('Milestone');
    const mLinkLine = masters.masterIdFor('Link lines');

    // GUID 注册体系（同图共享 GCChartGUID；列链式 GCPrevColGUID）
    const chartGUID = guidFor('gantt-chart');
    const frameModelGUID = guidFor('gantt-frame-model');
    const colIdGUID = guidFor('gantt-col-id');
    const colNameGUID = guidFor('gantt-col-name');
    const colStartGUID = guidFor('gantt-col-start');
    const colEndGUID = guidFor('gantt-col-end');
    const colDurGUID = guidFor('gantt-col-dur');
    const colScaleGUID = guidFor('gantt-col-scale');

    // ── 1. 框架 ──
    const frame = newShape(page, 'Shape', mFrame, null, chartGUID);
    setAttribute(frame.node, 'NameU', 'Gantt Chart frame');
    setNumericCell(frame.node, 'PinX', xLeft, 'IN');
    setNumericCell(frame.node, 'PinY', yTop, 'IN');
    setNumericCell(frame.node, 'Width', frameW, 'IN');
    setNumericCell(frame.node, 'Height', chartH, 'IN');
    setNumericCell(frame.node, 'LocPinY', chartH, 'IN', 'Inh');
    setNumericCell(frame.node, 'LayerMember', 0, 'IN');
    const frameUser = appendSection(frame.node, 'User');
    {
        const user = frameUser;
        addVal(user, 'StartDate', gantt.startSerial);
        addVal(user, 'EndDate', gantt.endSerial);
        addVal(user, 'ScaleUnits', totalDays, 'DL', 'User.EndDate-User.StartDate');
        addVal(user, 'Scalar', kScalar, 'DL', 'User.ScaleUnits');
        addStr(user, 'WorkingDays', '0;1;1;1;1;1;0;');
        addVal(user, 'DayStartTime', 8);
        addVal(user, 'DayEndTime', 16);
        addVal(user, 'PriScaleUnitsType', 3);
        addVal(user, 'SecScaleUnitsType', 5);
        addStr(user, 'WDLookup', '0;0;0;0;0;2;1');
        addStr(user, 'WHLookup', '8;7;6;5;4;3;2;1;0;0;0;0;0;0;0;0;16;15;14;13;12;11;10;9');
        addVal(user, 'WTScalar', 0.3333333333333333, 'DL', 'Inh');
        addGuid(user, 'GCVisioGUID', chartGUID);
        addGuid(user, 'GCModelGUID', frameModelGUID);
        addGuid(user, 'GCChartGUID', chartGUID);
        addGuid(user, 'IDColumnGUID', colIdGUID);
        addGuid(user, 'LastColGUID', colScaleGUID);
    }

    // ── 2. 列（ID→名称→开始→完成→工期→刻度，链式） ──
    const idCol = newShape(page, 'Shape', mColumn, null, colIdGUID);
    setNumericCell(idCol.node, 'PinX', xLeft, 'IN', 'Sheet.' + frame.id + '!PinX');
    setNumericCell(idCol.node, 'PinY', yTop, 'IN', 'Sheet.' + frame.id + '!PinY');
    setNumericCell(idCol.node, 'Width', kIdColW, 'IN');
    setNumericCell(idCol.node, 'Height', chartH, 'IN', 'Sheet.' + frame.id + '!Height');
    setNumericCell(idCol.node, 'LocPinX', 0, 'IN', 'Inh');
    setNumericCell(idCol.node, 'LocPinY', chartH, 'IN', 'Inh');
    setNumericCell(idCol.node, 'LayerMember', 0, 'IN');
    setNumericCell(idCol.node, 'TxtPinX', 0, 'IN', 'Inh');
    setNumericCell(idCol.node, 'TxtPinY', chartH - kHeaderH, 'IN', 'Inh');
    setNumericCell(idCol.node, 'TxtWidth', kIdColW, 'IN', 'Inh');
    setNumericCell(idCol.node, 'TxtLocPinX', 0, 'IN', 'Inh');
    {
        const user = appendSection(idCol.node, 'User');
        addVal(user, 'HeaderHeight', kHeaderH, 'IN', 'Sheet.' + frame.id + '!User.HeaderHeight');
        addVal(user, 'IsID', 1);
        addVal(user, 'GCFieldType', 55);
        addGuid(user, 'GCPrevColGUID', chartGUID);
        addGuid(user, 'GCVisioGUID', colIdGUID);
        addGuid(user, 'GCChartGUID', chartGUID);
    }
    addColumnGeometry(idCol.node, kIdColW, chartH);
    replaceShapeText(idCol.node, 'ID');

    const nameCol = newShape(page, 'Shape', mColumn, null, colNameGUID);
    setNumericCell(nameCol.node, 'PinX', xLeft + kIdColW, 'IN',
        'Sheet.' + idCol.id + '!PinX-Sheet.' + idCol.id + '!LocPinX+Sheet.' + idCol.id + '!Width');
    setNumericCell(nameCol.node, 'PinY', yTop, 'IN', 'Sheet.' + frame.id + '!PinY');
    setNumericCell(nameCol.node, 'Width', kNameColW, 'IN');
    setNumericCell(nameCol.node, 'Height', chartH, 'IN', 'Sheet.' + frame.id + '!Height');
    setNumericCell(nameCol.node, 'LocPinX', 0, 'IN', 'Inh');
    setNumericCell(nameCol.node, 'LocPinY', chartH, 'IN', 'Inh');
    setNumericCell(nameCol.node, 'LayerMember', 0, 'IN');
    setNumericCell(nameCol.node, 'TxtPinX', 0, 'IN', 'Inh');
    setNumericCell(nameCol.node, 'TxtPinY', chartH - kHeaderH, 'IN', 'Inh');
    setNumericCell(nameCol.node, 'TxtWidth', kNameColW, 'IN', 'Inh');
    setNumericCell(nameCol.node, 'TxtLocPinX', 0, 'IN', 'Inh');
    {
        const user = appendSection(nameCol.node, 'User');
        addVal(user, 'HeaderHeight', kHeaderH, 'IN', 'Sheet.' + frame.id + '!User.HeaderHeight');
        addVal(user, 'GCFieldType', 61);
        addGuid(user, 'GCPrevColGUID', colIdGUID);
        addGuid(user, 'GCVisioGUID', colNameGUID);
        addGuid(user, 'GCChartGUID', chartGUID);
    }
    addColumnGeometry(nameCol.node, kNameColW, chartH);
    replaceShapeText(nameCol.node, '任务名称');

    const startCol = newShape(page, 'Shape', mColumn, null, colStartGUID);
    setNumericCell(startCol.node, 'PinX', xLeft + kIdColW + kNameColW, 'IN',
        'Sheet.' + nameCol.id + '!PinX-Sheet.' + nameCol.id + '!LocPinX+Sheet.' + nameCol.id + '!Width');
    setNumericCell(startCol.node, 'PinY', yTop, 'IN', 'Sheet.' + frame.id + '!PinY');
    setNumericCell(startCol.node, 'Height', chartH, 'IN', 'Sheet.' + frame.id + '!Height');
    setNumericCell(startCol.node, 'LocPinY', chartH, 'IN', 'Inh');
    setNumericCell(startCol.node, 'LayerMember', 0, 'IN');
    setNumericCell(startCol.node, 'TxtPinX', 0, 'IN', 'Inh');
    setNumericCell(startCol.node, 'TxtPinY', chartH - kHeaderH, 'IN', 'Inh');
    setNumericCell(startCol.node, 'TxtWidth', kFieldColW, 'IN', 'Inh');
    setNumericCell(startCol.node, 'TxtLocPinX', 0, 'IN', 'Inh');
    {
        const user = appendSection(startCol.node, 'User');
        addVal(user, 'HeaderHeight', kHeaderH, 'IN', 'Sheet.' + frame.id + '!User.HeaderHeight');
        addVal(user, 'GCFieldType', 83);
        addGuid(user, 'GCPrevColGUID', colNameGUID);
        addGuid(user, 'GCVisioGUID', colStartGUID);
        addGuid(user, 'GCChartGUID', chartGUID);
    }
    addColumnGeometry(startCol.node, kFieldColW, chartH);
    replaceShapeText(startCol.node, '开始时间');

    const endCol = newShape(page, 'Shape', mColumn, null, colEndGUID);
    setNumericCell(endCol.node, 'PinX', xLeft + kIdColW + kNameColW + kFieldColW, 'IN',
        'Sheet.' + startCol.id + '!PinX-Sheet.' + startCol.id + '!LocPinX+Sheet.' + startCol.id + '!Width');
    setNumericCell(endCol.node, 'PinY', yTop, 'IN', 'Sheet.' + frame.id + '!PinY');
    setNumericCell(endCol.node, 'Height', chartH, 'IN', 'Sheet.' + frame.id + '!Height');
    setNumericCell(endCol.node, 'LocPinY', chartH, 'IN', 'Inh');
    setNumericCell(endCol.node, 'LayerMember', 0, 'IN');
    setNumericCell(endCol.node, 'TxtPinX', 0, 'IN', 'Inh');
    setNumericCell(endCol.node, 'TxtPinY', chartH - kHeaderH, 'IN', 'Inh');
    setNumericCell(endCol.node, 'TxtWidth', kFieldColW, 'IN', 'Inh');
    setNumericCell(endCol.node, 'TxtLocPinX', 0, 'IN', 'Inh');
    {
        const user = appendSection(endCol.node, 'User');
        addVal(user, 'HeaderHeight', kHeaderH, 'IN', 'Sheet.' + frame.id + '!User.HeaderHeight');
        addVal(user, 'GCFieldType', 34);
        addGuid(user, 'GCPrevColGUID', colStartGUID);
        addGuid(user, 'GCVisioGUID', colEndGUID);
        addGuid(user, 'GCChartGUID', chartGUID);
    }
    addColumnGeometry(endCol.node, kFieldColW, chartH);
    replaceShapeText(endCol.node, '完成');

    const durCol = newShape(page, 'Shape', mColumn, null, colDurGUID);
    setNumericCell(durCol.node, 'PinX', xLeft + kIdColW + kNameColW + 2 * kFieldColW, 'IN',
        'Sheet.' + endCol.id + '!PinX-Sheet.' + endCol.id + '!LocPinX+Sheet.' + endCol.id + '!Width');
    setNumericCell(durCol.node, 'PinY', yTop, 'IN', 'Sheet.' + frame.id + '!PinY');
    setNumericCell(durCol.node, 'Height', chartH, 'IN', 'Sheet.' + frame.id + '!Height');
    setNumericCell(durCol.node, 'LocPinY', chartH, 'IN', 'Inh');
    setNumericCell(durCol.node, 'LayerMember', 0, 'IN');
    setNumericCell(durCol.node, 'TxtPinX', 0, 'IN', 'Inh');
    setNumericCell(durCol.node, 'TxtPinY', chartH - kHeaderH, 'IN', 'Inh');
    setNumericCell(durCol.node, 'TxtWidth', kFieldColW, 'IN', 'Inh');
    setNumericCell(durCol.node, 'TxtLocPinX', 0, 'IN', 'Inh');
    {
        const user = appendSection(durCol.node, 'User');
        addVal(user, 'HeaderHeight', kHeaderH, 'IN', 'Sheet.' + frame.id + '!User.HeaderHeight');
        addVal(user, 'GCFieldType', 27);
        addGuid(user, 'GCPrevColGUID', colEndGUID);
        addGuid(user, 'GCVisioGUID', colDurGUID);
        addGuid(user, 'GCChartGUID', chartGUID);
    }
    addColumnGeometry(durCol.node, kFieldColW, chartH);
    replaceShapeText(durCol.node, '持续时间');

    const scaleCol = newShape(page, 'Shape', mColumn, null, colScaleGUID);
    setNumericCell(scaleCol.node, 'PinX', scaleStartX, 'IN',
        'Sheet.' + durCol.id + '!PinX-Sheet.' + durCol.id + '!LocPinX+Sheet.' + durCol.id + '!Width');
    setNumericCell(scaleCol.node, 'PinY', yTop, 'IN', 'Sheet.' + frame.id + '!PinY');
    setNumericCell(scaleCol.node, 'Width', chartW, 'IN');
    setNumericCell(scaleCol.node, 'Height', chartH, 'IN', 'Sheet.' + frame.id + '!Height');
    setNumericCell(scaleCol.node, 'LocPinX', 0, 'IN', 'Inh');
    setNumericCell(scaleCol.node, 'LocPinY', chartH, 'IN', 'Inh');
    setNumericCell(scaleCol.node, 'LayerMember', 0, 'IN');
    {
        const user = appendSection(scaleCol.node, 'User');
        addVal(user, 'HeaderHeight', kHeaderH, 'IN', 'Sheet.' + frame.id + '!User.HeaderHeight');
        addVal(user, 'GCFieldType', 10001);
        addVal(user, 'GCShapeType', 40);
        addGuid(user, 'GCPrevColGUID', colDurGUID);
        addGuid(user, 'GCVisioGUID', colScaleGUID);
        addGuid(user, 'GCChartGUID', chartGUID);
    }
    addColumnGeometry(scaleCol.node, chartW, chartH);
    // 空 <Text/> 覆盖 Column 母版"任务"占位文本
    appendChild(scaleCol.node, makeElement('Text'));

    const scaleStartF = 'Sheet.' + scaleCol.id + '!PinX-Sheet.' + scaleCol.id + '!LocPinX';
    const scaleEndF = 'User.ScaleStart+Sheet.' + scaleCol.id + '!Width';
    const frameScalar = 'Sheet.' + frame.id + '!User.Scalar';

    // 列创建后补框架前向引用公式
    setNumericCell(frame.node, 'Width', frameW, 'IN',
        'Sheet.' + scaleCol.id + '!PinX+Sheet.' + scaleCol.id + '!Width-Sheet.' + idCol.id + '!PinX');
    setUserRowFormula(frameUser, 'Scalar',
        'Sheet.' + scaleCol.id + '!Width/User.ScaleUnits');

    // ── 3a. 次刻度：自开始月首逐月一块 ──
    if (mSec > 0) {
        let y = serialToDate(gantt.startSerial).getUTCFullYear();
        let m = serialToDate(gantt.startSerial).getUTCMonth() + 1;
        let monthStart = gantt.startSerial - (serialToDate(gantt.startSerial).getUTCDate() - 1);
        let monthIndex = 0;
        while (monthStart <= gantt.endSerial) {
            const dim = daysInMonth(y, m);
            const secWidth = dim * kScalar;
            const offset = Math.round(monthStart - gantt.startSerial);
            const secGUID = guidFor('gantt-secscale-' + monthIndex);
            const sec = newShape(page, 'Shape', mSec, null, secGUID);
            setNumericCell(sec.node, 'PinX', scaleStartX + offset * kScalar, 'IN',
                'GUARD(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart))');
            setNumericCell(sec.node, 'PinY', yTop, 'IN',
                'GUARD(Sheet.' + scaleCol.id + '!PinY)');
            setNumericCell(sec.node, 'Width', secWidth, 'IN',
                'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)');
            setNumericCell(sec.node, 'Height', kHeaderH / 2, 'IN',
                'Sheet.' + scaleCol.id + '!User.HeaderHeight/2');
            setNumericCell(sec.node, 'LocPinX', 0, 'IN', 'Inh');
            setNumericCell(sec.node, 'LocPinY', kHeaderH / 2, 'IN', 'Inh');
            setNumericCell(sec.node, 'LayerMember', 0, 'IN');
            {
                const user = appendSection(sec.node, 'User');
                addVal(user, 'ScaledStartPos', scaleStartX + offset * kScalar, 'IN',
                    '(User.Offset*' + frameScalar + ')+User.ScaleStart');
                addVal(user, 'ScaledDuration', secWidth, 'DL',
                    'User.Duration*' + frameScalar);
                addVal(user, 'StartDate', monthStart, undefined,
                    'Sheet.' + frame.id + '!User.StartDate+User.Offset');
                addVal(user, 'Duration', dim);
                addVal(user, 'ScaleStart', scaleStartX, 'IN', scaleStartF);
                addVal(user, 'ScaleEnd', scaleStartX + chartW, 'IN', scaleEndF);
                addVal(user, 'Offset', offset);
                addVal(user, 'TextWidth', 0.5000576303945312, 'DL', 'Inh');
                addVal(user, 'LeftWidthReduction', 1.245888567726502, 'MM', 'Inh');
                addVal(user, 'RightWidthReduction', 2.990132562543606, 'MM', 'Inh');
                addStrF(user, 'PreText', '',
                    'IF(Sheet.' + frame.id +
                    '!User.SecScaleUnitsType=6,FORMAT(INT((MONTH(User.StartDate)+2)/3),' +
                    '"\'Q\'#"),"")');                addGuid(user, 'GCVisioGUID', secGUID);
                addGuid(user, 'GCColGUID', colScaleGUID);
                addGuid(user, 'GCChartGUID', chartGUID);
            }
            {
                const fieldSec = appendSection(sec.node, 'Field');
                const fieldRow = appendRow(fieldSec, null, 0);
                appendCellString(fieldRow, 'Value', '', 'STR',
                    'User.PreText&FORMAT(User.StartDate,INDEX(Sheet.' + frame.id +
                    '!User.SecScaleUnitsType,Sheet.' + frame.id +
                    '!User.SecScaleCellTextFormat))');
            }
            ++monthIndex;
            monthStart += dim;
            if (m === 12) {
                m = 1;
                ++y;
            } else {
                ++m;
            }
        }
    }

    // ── 3. 主刻度：每天一块（首例无 Offset 行；实例无 Text） ──
    for (let i = 0; i < nDays; ++i) {
        const serial = gantt.startSerial + i;
        const tickGUID = guidFor('gantt-tick-' + i);
        const tick = newShape(page, 'Shape', mPri, null, tickGUID);
        setNumericCell(tick.node, 'PinX', scaleStartX + i * kScalar, 'IN',
            'GUARD(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart))');
        setNumericCell(tick.node, 'PinY', yTop - kHeaderH / 2, 'IN',
            'GUARD(Sheet.' + scaleCol.id + '!PinY-(Sheet.' + scaleCol.id +
            '!User.HeaderHeight/2))');
        setNumericCell(tick.node, 'Width', kScalar, 'IN',
            'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)');
        setNumericCell(tick.node, 'Height', kHeaderH / 2, 'IN',
            'Sheet.' + scaleCol.id + '!User.HeaderHeight/2');
        setNumericCell(tick.node, 'LocPinY', kHeaderH / 2, 'IN', 'Inh');
        setNumericCell(tick.node, 'LayerMember', 0, 'IN');
        {
            const user = appendSection(tick.node, 'User');
            addVal(user, 'ScaledStartPos', scaleStartX + i * kScalar, 'IN',
                '(User.Offset*' + frameScalar + ')+User.ScaleStart');
            addVal(user, 'ScaledDuration', kScalar, 'DL', 'User.Duration*' + frameScalar);
            addVal(user, 'StartDate', serial, undefined,
                'Sheet.' + frame.id + '!User.StartDate+User.Offset');
            addVal(user, 'Duration', 1);
            addVal(user, 'ScaleStart', scaleStartX, 'IN', scaleStartF);
            addVal(user, 'ScaleEnd', scaleStartX + chartW, 'IN', scaleEndF);
            if (i > 0) addVal(user, 'Offset', i);
            addVal(user, 'TextWidth', 0.08338587746484374, 'DL', 'Inh');
            addStrF(user, 'PreText', '',
                'IF(Sheet.' + frame.id +
                '!User.PriScaleUnitsType=6,FORMAT(INT((MONTH(User.StartDate)+2)/3),' +
                '"\'Q\'#"),"")');
            addGuid(user, 'GCVisioGUID', tickGUID);
            addGuid(user, 'GCColGUID', colScaleGUID);
            addGuid(user, 'GCChartGUID', chartGUID);
        }
        {
            const fieldSec = appendSection(tick.node, 'Field');
            const fieldRow = appendRow(fieldSec, null, 0);
            appendCellString(fieldRow, 'Value', '', 'STR',
                'User.PreText&FORMAT(User.StartDate,INDEX(Sheet.' + frame.id +
                '!User.PriScaleUnitsType,Sheet.' + frame.id +
                '!User.PriScaleCellTextFormat))');
        }
    }

    // ── 3b. 非工作时间（周末块，只从周六生成 Duration=2） ──
    if (mNWT > 0) {
        const nwtHeight = chartH - kHeaderH;
        let nwtIndex = 0;
        for (let i = 0; i < nDays; ++i) {
            const serial = gantt.startSerial + i;
            const wdIndex = (weekdayUtc(serial) + 6) % 7; // 0=周一..6=周日
            const isSaturday = wdIndex === 5;
            if (!isSaturday) continue;
            const nwtGUID = guidFor('gantt-nwt-' + nwtIndex);
            const nwt = newShape(page, 'Shape', mNWT, null, nwtGUID);
            setNumericCell(nwt.node, 'PinX', scaleStartX + i * kScalar, 'IN',
                'GUARD(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart))');
            setNumericCell(nwt.node, 'PinY', yTop - kHeaderH, 'IN',
                'GUARD(Sheet.' + scaleCol.id + '!PinY-Sheet.' + scaleCol.id +
                '!User.HeaderHeight)');
            setNumericCell(nwt.node, 'Width', 2 * kScalar, 'IN',
                'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)');
            setNumericCell(nwt.node, 'Height', nwtHeight, 'IN',
                'Sheet.' + scaleCol.id + '!Height-Sheet.' + scaleCol.id +
                '!User.HeaderHeight');
            setNumericCell(nwt.node, 'LocPinY', nwtHeight, 'IN', 'Inh');
            setNumericCell(nwt.node, 'LayerMember', 0, 'IN');
            {
                const user = appendSection(nwt.node, 'User');
                addVal(user, 'ScaledStartPos', scaleStartX + i * kScalar, 'IN',
                    '(User.Offset*' + frameScalar + ')+User.ScaleStart');
                addVal(user, 'ScaledDuration', 2 * kScalar, 'DL',
                    'User.Duration*' + frameScalar);
                addVal(user, 'StartDate', serial, undefined,
                    'Sheet.' + frame.id + '!User.StartDate+User.Offset');
                addVal(user, 'Duration', 2);
                addVal(user, 'ScaleStart', scaleStartX, 'IN', scaleStartF);
                addVal(user, 'ScaleEnd', scaleStartX + chartW, 'IN', scaleEndF);
                addVal(user, 'Offset', i);
                addGuid(user, 'GCVisioGUID', nwtGUID);
                addGuid(user, 'GCColGUID', colScaleGUID);
                addGuid(user, 'GCChartGUID', chartGUID);
            }
            ++nwtIndex;
        }
    }

    // ── 4. 行：每任务一行，逐行下移 ──
    const rowIds: number[] = [];
    const rowGUIDs: string[] = [];
    for (let i = 0; i < nTasks; ++i) {
        rowGUIDs.push(guidFor('gantt-row-' + i));
    }
    for (let i = 0; i < nTasks; ++i) {
        const row = newShape(page, 'Shape', mRow, null, rowGUIDs[i]!);
        let pinYFormula: string;
        if (i === 0) {
            pinYFormula = 'Sheet.' + frame.id + '!PinY-Sheet.' + frame.id + '!User.HeaderHeight';
        } else {
            pinYFormula = 'Sheet.' + rowIds[i - 1]! + '!PinY-Sheet.' + rowIds[i - 1]! + '!Height';
        }
        setNumericCell(row.node, 'PinX', xLeft, 'IN', 'Sheet.' + frame.id + '!PinX');
        const rowPinY = yTop - kHeaderH - i * kRowH;
        setNumericCell(row.node, 'PinY', rowPinY, 'IN', pinYFormula);
        setNumericCell(row.node, 'Width', frameW, 'IN', 'Sheet.' + frame.id + '!Width');
        setNumericCell(row.node, 'LayerMember', 0, 'IN');
        setNumericCell(row.node, 'TxtWidth', kIdColW, 'IN');
        setNumericCell(row.node, 'TxtLocPinX', 0, 'IN');
        {
            const user = appendSection(row.node, 'User');
            addVal(user, 'HeaderWidth', kIdColW, 'DL', 'Sheet.' + idCol.id + '!Width');
            addVal(user, 'HeaderPinX', 0, 'DL',
                'Sheet.' + idCol.id + '!PinX-Sheet.' + frame.id + '!PinX');
            addGuid(user, 'GCPrevRowGUID', i === 0 ? chartGUID : rowGUIDs[i - 1]!);
            addGuid(user, 'GCVisioGUID', rowGUIDs[i]!);
            addGuid(user, 'GCChartGUID', chartGUID);
        }
        replaceShapeText(row.node, String(i + 1));
        rowIds.push(row.id);
    }
    // 行后补框架：LastRowGUID + Height 前向引用
    {
        const fuser = appendNamedRow(frameUser, 'LastRowGUID');
        appendCellString(fuser, 'Value', rowGUIDs[rowGUIDs.length - 1]!, 'STR');
    }
    setNumericCell(frame.node, 'Height', chartH, 'IN',
        'Sheet.' + rowIds[0]! + '!PinY+User.HeaderHeight-Sheet.' +
        rowIds[rowIds.length - 1]! + '!PinY+Sheet.' + rowIds[rowIds.length - 1]! + '!Height');
    // ── 5. 任务条 / 5m. 里程碑（after 依赖先推算真实开始） ──
    const barIds: number[] = [];
    const barUserNodes: Array<XmlNode | null> = new Array(nTasks).fill(null);
    const startSerials: number[] = [];
    for (let i = 0; i < nTasks; ++i) startSerials.push(gantt.tasks[i]!.startSerial);
    for (let i = 0; i < nTasks; ++i) {
        if (startSerials[i]! <= 0 && gantt.tasks[i]!.dependsOn.length > 0) {
            let s = 0;
            for (const dep of gantt.tasks[i]!.dependsOn) {
                for (let j = 0; j < nTasks; ++j) {
                    if (gantt.tasks[j]!.name === dep && startSerials[j]! > 0) {
                        s = Math.max(s, startSerials[j]! + Math.max(0.0, gantt.tasks[j]!.duration));
                    }
                }
            }
            if (s > 0) startSerials[i] = s;
        }
    }
    for (let i = 0; i < nTasks; ++i) {
        const t = gantt.tasks[i]!;
        const startSerial = startSerials[i]!;
        const duration = Math.max(0.0, t.duration);
        const offset = startSerial - gantt.startSerial;
        const rowPinY = yTop - kHeaderH - i * kRowH;
        const rowRef = 'Sheet.' + rowIds[i]!;

        if (t.milestone) {
            // ── 里程碑（M=104；Width=0；判据用 IR milestone 字段） ──
            const ms = newShape(page, 'Group', mMilestone, null,
                guidFor('gantt-milestone-' + i));
            const msPinX = scaleStartX + offset * kScalar;
            setNumericCell(ms.node, 'PinX', msPinX, 'IN',
                'MIN(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart),User.ScaleEnd)');
            setNumericCell(ms.node, 'PinY', rowPinY, 'IN', rowRef + '!PinY');
            setNumericCell(ms.node, 'Width', 0, 'IN',
                'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)');
            setNumericCell(ms.node, 'Height', kRowH, 'IN', rowRef + '!Height');
            setNumericCell(ms.node, 'LayerMember', 0, 'IN');
            addCommentCell(ms.node, t.name);
            {
                const user = appendSection(ms.node, 'User');
                barUserNodes[i] = user;
                addVal(user, 'ScaledStartPos', msPinX, 'IN',
                    'MAX((User.Offset*' + frameScalar + ')+User.ScaleStart,User.Dependency)');
                addVal(user, 'ScaledDuration', 0, 'DL',
                    'IF(User.IsSummary=1,User.DependencyDuration,User.Duration*' + frameScalar + ')');
                addVal(user, 'StartDate', startSerial, undefined,
                    'MAX(Sheet.' + frame.id +
                    '!User.StartDate+(User.Dependency-User.ScaleStart)/Sheet.' +
                    frame.id + '!User.Scalar,User.WTNormalizedStart)');
                addVal(user, 'ScaleStart', scaleStartX, 'IN', scaleStartF);
                addVal(user, 'ScaleEnd', scaleStartX + chartW, 'IN', scaleEndF);
                addVal(user, 'Offset', offset, undefined,
                    'User.WDOffset+User.WHOffset+User.StartDate-Sheet.' +
                    frame.id + '!User.StartDate');
                addVal(user, 'DependencyDuration', -1.5E300, 'MM', 'Inh');
                addVal(user, 'ScaledEndPos', msPinX, 'IN', 'Inh');
                addVal(user, 'WDOffset', 0, 'STR',
                    'INDEX(WEEKDAY(User.StartDate+User.WHOffset)-1,Sheet.' +
                    frame.id + '!User.WDLookup,Sheet.' + frame.id + '!User.WTLookupSep)');
                addVal(user, 'WHOffset', 0, undefined,
                    'IF(Sheet.' + frame.id +
                    '!User.PriScaleUnitsType<3,INDEX(HOUR(User.StartDate),Sheet.' +
                    frame.id + '!User.WHLookup,Sheet.' + frame.id +
                    '!User.WTLookupSep),0)/24');
                addVal(user, 'LastStartFromMove', startSerial, undefined,
                    'IF(User.IsSummary,-1.5E300,' + cppFixed6(startSerial) + ')');
                addVal(user, 'WTNormalizedStart', startSerial, undefined,
                    'IF(Sheet.' + frame.id + '!User.PriScaleUnitsType<3,' +
                    'INT(User.LastStartFromMove)+((Sheet.' + frame.id +
                    '!User.WTScalar*(User.LastStartFromMove-INT(User.LastStartFromMove)))+(Sheet.' +
                    frame.id + '!User.DayStartTime/24)),User.LastStartFromMove)');
                addGuid(user, 'GCVisioGUID', guidFor('gantt-milestone-' + i));
                addGuid(user, 'GCModelGUID', guidFor('gantt-model-' + i));
                addGuid(user, 'GCChartGUID', chartGUID);
                addGuid(user, 'GCRowGUID', rowGUIDs[i]!);
                addGuid(user, 'ParentModelGUID', frameModelGUID);
            }
            {
                const prop = appendSection(ms.node, 'Property');
                addStr(prop, 'Name', t.name);
                addVal(prop, 'Start', startSerial);
                addVal(prop, 'End', startSerial);
                const durRow = appendNamedRow(prop, 'Duration');
                appendCellString(durRow, 'Value', '0', 'STR', 'FORMAT(0,"0.####")&"天"');
                addVal(prop, 'ActualStart', startSerial);
                addVal(prop, 'ActualEnd', startSerial);
                addVal(prop, 'UserDefTime', gantt.startSerial + 8.0 / 24.0);
                addVal(prop, 'TaskID', i + 1);
            }
            addMasterShapeSkeleton(ms.node, page, 'milestone');
            barIds.push(ms.id);
            continue;
        }

        // ── 任务条（M=103；顶定位 LocPinY=Height*1 由母版提供） ──
        const bar = newShape(page, 'Group', mTask, null, guidFor('gantt-bar-' + i));
        const barPinX = scaleStartX + offset * kScalar;
        setNumericCell(bar.node, 'PinX', barPinX, 'IN',
            'MIN(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart),User.ScaleEnd)');
        setNumericCell(bar.node, 'PinY', rowPinY, 'IN', rowRef + '!PinY');
        setNumericCell(bar.node, 'Width', duration * kScalar, 'IN',
            'User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)');
        setNumericCell(bar.node, 'Height', kRowH, 'IN', rowRef + '!Height');
        setNumericCell(bar.node, 'LocPinX', 0, 'IN', 'Inh');
        setNumericCell(bar.node, 'LayerMember', 0, 'IN');
        addCommentCell(bar.node, t.name);
        {
            const user = appendSection(bar.node, 'User');
            barUserNodes[i] = user;
            addVal(user, 'ScaledStartPos', barPinX, 'IN',
                'MAX((User.Offset*' + frameScalar + ')+User.ScaleStart,User.Dependency)');
            addVal(user, 'ScaledDuration', duration * kScalar, 'DL',
                'IF(User.IsSummary=1,User.DependencyDuration,User.Duration*' + frameScalar + ')');
            addVal(user, 'StartDate', startSerial, undefined,
                'MAX(Sheet.' + frame.id +
                '!User.StartDate+(User.Dependency-User.ScaleStart)/Sheet.' +
                frame.id + '!User.Scalar,User.WTNormalizedStart)');
            addVal(user, 'Duration', duration);
            addVal(user, 'ScaleStart', scaleStartX, 'IN', scaleStartF);
            addVal(user, 'ScaleEnd', scaleStartX + chartW, 'IN', scaleEndF);
            addVal(user, 'Offset', offset, undefined,
                'User.WDOffset+User.WHOffset+User.StartDate-Sheet.' +
                frame.id + '!User.StartDate');
            addVal(user, 'DependencyDuration', -1.5E300, 'MM', 'Inh');
            addVal(user, 'ScaledEndPos', scaleStartX + (offset + duration) * kScalar, 'IN', 'Inh');
            addVal(user, 'StartSymType', 9, undefined, 'Inh');
            addVal(user, 'WDOffset', 0, 'STR',
                'INDEX(WEEKDAY(User.StartDate+User.WHOffset)-1,Sheet.' +
                frame.id + '!User.WDLookup,Sheet.' + frame.id + '!User.WTLookupSep)');
            addVal(user, 'WHOffset', 0, undefined,
                'IF(Sheet.' + frame.id +
                '!User.PriScaleUnitsType<3,INDEX(HOUR(User.StartDate),Sheet.' +
                frame.id + '!User.WHLookup,Sheet.' + frame.id +
                '!User.WTLookupSep),0)/24');
            addVal(user, 'LastStartFromMove', startSerial, undefined,
                'IF(User.IsSummary,-1.5E300,' + cppFixed6(startSerial) + ')');
            addVal(user, 'WTNormalizedStart', startSerial, undefined,
                'IF(Sheet.' + frame.id + '!User.PriScaleUnitsType<3,' +
                'INT(User.LastStartFromMove)+((Sheet.' + frame.id +
                '!User.WTScalar*(User.LastStartFromMove-INT(User.LastStartFromMove)))+(Sheet.' +
                frame.id + '!User.DayStartTime/24)),User.LastStartFromMove)');
            addGuid(user, 'GCVisioGUID', guidFor('gantt-bar-' + i));
            addGuid(user, 'GCModelGUID', guidFor('gantt-model-' + i));
            addGuid(user, 'GCChartGUID', chartGUID);
            addGuid(user, 'GCRowGUID', rowGUIDs[i]!);
            addGuid(user, 'ParentModelGUID', frameModelGUID);
        }
        {
            const prop = appendSection(bar.node, 'Property');
            addStr(prop, 'Name', t.name);
            addVal(prop, 'Start', startSerial);
            const endSerial = duration <= 1.0 ? startSerial : startSerial + duration;
            addVal(prop, 'End', endSerial);
            const durRow = appendNamedRow(prop, 'Duration');
            const durInt = String(Math.trunc(duration));
            appendCellString(durRow, 'Value', durInt, 'STR',
                'FORMAT(' + durInt + ',"#.####")&"天"');
            addVal(prop, 'ActualStart', startSerial);
            addVal(prop, 'ActualEnd', endSerial);
            addVal(prop, 'UserDefTime', gantt.startSerial + 8.0 / 24.0);
            addVal(prop, 'TaskID', i + 1);
        }
        {
            const ctl = appendSection(bar.node, 'Control');
            const row = appendNamedRow(ctl, 'Row_2');
            appendCellNumber(row, 'X', duration * kScalar, 'DL', 'Inh');
            appendCellNumber(row, 'XDyn', duration * kScalar, 'DL', 'Inh');
        }
        {
            const conn = appendSection(bar.node, 'Connection');
            const lr = appendRow(conn, 'Connection', 0, 'LeftSide');
            appendCellNumber(lr, 'X', 0, 'IN', 'Inh');
            const rr = appendRow(conn, 'Connection', 1, 'RightSide');
            appendCellNumber(rr, 'X', duration * kScalar, 'IN', 'Inh');
        }
        addMasterShapeSkeleton(bar.node, page, 'bar', duration);
        barIds.push(bar.id);
    }

    // ── 5L. 链接线（依赖连线，Begin=依赖条右端、End=本条左端） ──
    if (mLinkLine > 0) {
        for (let i = 0; i < nTasks; ++i) {
            const t = gantt.tasks[i]!;
            if (t.milestone || t.dependsOn.length === 0) continue;
            for (const depName of t.dependsOn) {
                let j = nTasks;
                for (let k = 0; k < nTasks; ++k) {
                    if (gantt.tasks[k]!.name === depName) {
                        j = k;
                        break;
                    }
                }
                if (j >= nTasks || gantt.tasks[j]!.milestone) continue;
                const depRef = 'Sheet.' + barIds[j]!;
                const selfRef = 'Sheet.' + barIds[i]!;
                const linkGUID = guidFor('gantt-link-' + i + '-' + j);
                const link = newShape(page, 'Shape', mLinkLine, null, linkGUID);
                const depEndX = scaleStartX +
                    (gantt.tasks[j]!.startSerial + Math.max(0.0, gantt.tasks[j]!.duration) -
                        gantt.startSerial) * kScalar;
                const selfStartX = scaleStartX + (startSerials[i]! - gantt.startSerial) * kScalar;
                const beginY = yTop - kHeaderH - j * kRowH;
                const endY = yTop - kHeaderH - i * kRowH;
                const px = (depEndX + selfStartX) / 2.0;
                const py = (beginY + endY) / 2.0;
                const w = Math.abs(depEndX - selfStartX);
                const h = Math.abs(beginY - endY);
                setNumericCell(link.node, 'PinX', px, 'IN', 'Inh');
                setNumericCell(link.node, 'PinY', py, 'IN', 'Inh');
                setNumericCell(link.node, 'Width', w, 'IN', 'Inh');
                setNumericCell(link.node, 'Height', h, 'IN', 'Inh');
                setNumericCell(link.node, 'LocPinX', w / 2.0, 'IN', 'Inh');
                setNumericCell(link.node, 'LocPinY', h / 2.0, 'IN', 'Inh');
                const depConn = 'PAR(PNT(' + depRef + '!Connections.RightSide.X,' +
                    depRef + '!Connections.RightSide.Y))';
                const selfConn = 'PAR(PNT(' + selfRef + '!Connections.LeftSide.X,' +
                    selfRef + '!Connections.LeftSide.Y))';
                setNumericCell(link.node, 'BeginX', depEndX, 'IN', depConn);
                setNumericCell(link.node, 'BeginY', beginY, 'IN', depConn);
                setNumericCell(link.node, 'EndX', selfStartX, 'IN', selfConn);
                setNumericCell(link.node, 'EndY', endY, 'IN', selfConn);
                setNumericCell(link.node, 'LayerMember', 0, 'IN');
                setNumericCell(link.node, 'TxtPinX', w / 2.0, 'IN', 'Inh');
                setNumericCell(link.node, 'TxtPinY', h / 2.0, 'IN', 'Inh');
                {
                    const user = appendSection(link.node, 'User');
                    const epd = appendNamedRow(user, 'EndPointDiff');
                    appendCellNumber(epd, 'Value', w, 'IN', 'EndX-BeginX');
                    const cw = appendNamedRow(user, 'CrossWidth');
                    appendCellNumber(cw, 'Value', w - 0.18253, 'IN',
                        'User.EndPointDiff-User.TotalOffset');
                    const hl = appendNamedRow(user, 'HideLine');
                    appendCellString(hl, 'Value', '0', 'STR',
                        'OR(AND(BeginX<=Sheet.' + scaleCol.id +
                        '!PinX,EndX<=Sheet.' + scaleCol.id +
                        '!PinX),AND(BeginX>=Sheet.' + scaleCol.id +
                        '!PinX+Sheet.' + scaleCol.id +
                        '!Width,EndX>=Sheet.' + scaleCol.id +
                        '!PinX+Sheet.' + scaleCol.id + '!Width))');
                    addGuid(user, 'GCVisioGUID', linkGUID);
                    addGuid(user, 'GCModelGUID', guidFor('gantt-link-model-' + i));
                    addGuid(user, 'GCChartGUID', chartGUID);
                    const sd = appendNamedRow(user, 'ScaledDuration');
                    appendCellNumber(sd, 'Value', 0.0, 'DL',
                        'User.LagTime*Sheet.' + frame.id + '!User.Scalar');
                    addVal(user, 'LagTime', 0);
                }
                {
                    const prop = appendSection(link.node, 'Property');
                    addVal(prop, 'LagTime', 0);
                }
                // 后补依赖任务条 User.Dependency 行
                const depRow = appendNamedRow(barUserNodes[i]!, 'Dependency');
                appendCellNumber(depRow, 'Value', depEndX, 'IN',
                    'MAX(' + depRef + '!User.ScaledEndPos+Sheet.' +
                    link.id + '!User.ScaledDuration)');
            }
        }
    }

    // ── 6. 每行字段文本（Text Entry：Field/User.Field 引用任务条 Property） ──
    for (let i = 0; i < nTasks; ++i) {
        const t = gantt.tasks[i]!;
        const dur = Math.max(0.0, t.duration);
        const barRef = 'Sheet.' + barIds[i]!;
        const teStart = startSerials[i]!;
        const addField = (col: { id: number; node: XmlNode }, text: string,
                          colW: number, propName: string, fmt: string,
                          type: number, serial: number, colGUID: string,
                          colPinX: number) => {
            const f = newShape(page, 'Shape', mTextEntry, null,
                guidFor('gantt-te-' + i + '-' + propName));
            setNumericCell(f.node, 'PinX', colPinX, 'IN', 'Sheet.' + col.id + '!PinX');
            setNumericCell(f.node, 'PinY', yTop - kHeaderH - i * kRowH, 'IN',
                'Sheet.' + rowIds[i]! + '!PinY');
            setNumericCell(f.node, 'Width', colW, 'IN', 'Sheet.' + col.id + '!Width');
            setNumericCell(f.node, 'Height', kRowH, 'IN', 'Sheet.' + rowIds[i]! + '!Height');
            setNumericCell(f.node, 'LocPinY', kRowH, 'IN', 'Inh');
            setNumericCell(f.node, 'LayerMember', 0, 'IN');
            if (propName !== 'Name') {
                setNumericCell(f.node, 'LockTextEdit', 0, 'IN',
                    'IF(' + barRef + '!User.IsSummary=1,1,0)');
            }
            const fieldSec = appendSection(f.node, 'Field');
            const fieldRow = appendRow(fieldSec, null, 0);
            appendCellString(fieldRow, 'Value', text, 'STR', 'Inh');
            const user = appendSection(f.node, 'User');
            const uf = appendNamedRow(user, 'Field');
            if (type === 5) {
                appendCellNumber(uf, 'Value', serial, undefined,
                    barRef + '!Prop.' + propName);
            } else {
                appendCellString(uf, 'Value', text, 'STR',
                    barRef + '!Prop.' + propName);
            }
            const tf = appendNamedRow(user, 'TextFormat');
            appendCellString(tf, 'Value', fmt, 'STR',
                barRef + '!Prop.' + propName + '.Format');
            const tt = appendNamedRow(user, 'TextType');
            appendCellNumber(tt, 'Value', type, undefined,
                barRef + '!Prop.' + propName + '.Type');
            addGuid(user, 'GCVisioGUID', guidFor('gantt-te-' + i + '-' + propName));
            addGuid(user, 'GCRowGUID', rowGUIDs[i]!);
            addGuid(user, 'GCColGUID', colGUID);
            addGuid(user, 'GCChartGUID', chartGUID);
            {
                const charSec = appendSection(f.node, 'Character');
                const charRow = appendRow(charSec, null, 0);
                appendCellNumber(charRow, 'Style', 0, 'IN', 'Inh');
                appendCellString(charRow, 'LangID', 'zh-CN', 'STR',
                    barRef + '!Prop.' + propName + '.LangID');
            }
            {
                const paraSec = appendSection(f.node, 'Paragraph');
                const paraRow = appendRow(paraSec, null, 0);
                appendCellNumber(paraRow, 'IndLeft', 0.05, 'IN', 'Inh');
                appendCellNumber(paraRow, 'HorzAlign', 0, 'IN', 'Inh');
            }
        };
        const columns = [
            { col: nameCol, text: t.name, colW: kNameColW, prop: 'Name', fmt: '@', type: 0, serial: teStart, guid: colNameGUID, pinX: xLeft + kIdColW },
            { col: startCol, text: formatDate(teStart, gantt.dateFormat), colW: kFieldColW, prop: 'Start', fmt: 'ddddd', type: 5, serial: teStart, guid: colStartGUID, pinX: xLeft + kIdColW + kNameColW },
            { col: endCol, text: formatDate(teStart + dur, gantt.dateFormat), colW: kFieldColW, prop: 'End', fmt: 'ddddd', type: 5, serial: teStart + dur, guid: colEndGUID, pinX: xLeft + kIdColW + kNameColW + kFieldColW },
            { col: durCol, text: String(Math.trunc(dur)) + '天', colW: kFieldColW, prop: 'Duration', fmt: '@', type: 0, serial: dur, guid: colDurGUID, pinX: xLeft + kIdColW + kNameColW + 2 * kFieldColW },
        ] as const;
        for (const c of columns) {
            addField(c.col, c.text, c.colW, c.prop, c.fmt, c.type, c.serial, c.guid, c.pinX);
        }
    }
}

/** Comment cell（N=Comment，V=任务名，F=Inh；无 U）。 */
function addCommentCell(node: XmlNode, text: string): void {
    const cell = appendChild(node, makeElement('Cell'));
    setAttribute(cell, 'N', 'Comment');
    setAttribute(cell, 'V', text);
    setAttribute(cell, 'F', 'Inh');
}

/** 任务条/里程碑的页面级 MasterShape 骨架（10/5/9/6/7/11/12/13 全建）。 */
function addMasterShapeSkeleton(bar: XmlNode, page: PageModel, kind: 'bar' | 'milestone',
                                duration = 0): void {
    const shapes = appendChild(bar, makeElement('Shapes'));
    for (const childId of [10, 5, 9, 6, 7, 11, 12, 13]) {
        const subId = page.nextShapeId++;
        const sub = appendChild(shapes, makeElement('Shape'));
        setAttribute(sub, 'ID', String(subId));
        setAttribute(sub, 'Type', 'Shape');
        setAttribute(sub, 'MasterShape', String(childId));
        setNumericCell(sub, 'LayerMember', 0, 'IN');
        if (kind === 'milestone') {
            // 里程碑骨架：仅 LayerMember + 11/12/13 文本边距（C++ 910-926 行）
            if (childId === 11 || childId === 12 || childId === 13) {
                addTextLeftRight(sub);
            }
            continue;
        }
        switch (childId) {
            case 5: // 起条（条本体水平一半）
                setNumericCell(sub, 'PinX', kScalar * 0.5, 'IN', 'Inh');
                setNumericCell(sub, 'Width', kScalar, 'IN', 'Inh');
                setNumericCell(sub, 'LocPinX', kScalar * 0.5, 'IN', 'Inh');
                break;
            case 6: // 条本体：GeometryID（Normal/Summary）
                {
                    const user = appendSection(sub, 'User');
                    addVal(user, 'GeometryID', 9, 'IN', 'Inh');
                    addVal(user, 'NormalGeometryID', 9, 'IN', 'Inh');
                    addVal(user, 'SummaryGeometryID', 9, 'IN', 'Inh');
                }
                break;
            case 7: // 时间偏移符号（条尾）
                {
                    const user = appendSection(sub, 'User');
                    addVal(user, 'TimeOffset', kScalar * 0.5, 'DL', 'Inh');
                }
                setNumericCell(sub, 'PinX', kScalar * 0.5, 'IN', 'Inh');
                break;
            case 11: // 右侧文本区
                addTextLeftRight(sub);
                setNumericCell(sub, 'PinX', 0.367287949765773, 'MM', 'Inh');
                break;
            case 12: // 左侧文本区
                addTextLeftRight(sub);
                break;
            case 13: // 内侧文本区
                addTextLeftRight(sub);
                setNumericCell(sub, 'PinX', 0.1245888567726503, 'MM', 'Inh');
                break;
            default: // 10/9：仅 LayerMember
                break;
        }
    }
    void kind;
    void duration;
}

function addTextLeftRight(sub: XmlNode): void {
    const user = appendSection(sub, 'User');
    addVal(user, 'TextLeft', 0.25, 'MM', 'Inh');
    addVal(user, 'TextRight', 0.25, 'MM', 'Inh');
}
/**
 * 页面级甘特引擎配置：找本页（按 NameU 匹配，多页不能取第一个）PageSheet，
 * 追加 User/Property/Layer/Actions 段 + RecalcNowAndRand Trigger（打开强制重算）。
 */
export function addPageEngineConfig(page: PageModel, gantt: GanttChart): void {
    void gantt;
    const pagesRoot = page.document?.pagesRoot;
    if (!pagesRoot) return;
    let pageNode: XmlNode | null = null;
    for (const child of pagesRoot.children) {
        if (typeof child === 'string') continue;
        const hasPageSheet = child.children.some(
            (c) => typeof c !== 'string' && c.name === 'PageSheet');
        if (hasPageSheet &&
            child.attrs.find((a) => a.name === 'NameU')?.value === page.name) {
            pageNode = child;
            break;
        }
    }
    if (!pageNode) return;
    let pageSheet: XmlNode | null = null;
    for (const child of pageNode.children) {
        if (typeof child !== 'string' && child.name === 'PageSheet') {
            pageSheet = child;
            break;
        }
    }
    if (!pageSheet) return;

    // ── User 段：甘特图全局显示选项 ──
    const user = appendSection(pageSheet, 'User');
    {
        const addPromptRow = (name: string, value: string | number,
                              prompt: string, unit?: string, formula?: string) => {
            const r = appendNamedRow(user, name);
            if (typeof value === 'string') {
                appendCellString(r, 'Value', value, unit ?? 'STR', formula);
            } else {
                appendCellNumber(r, 'Value', value, unit, formula);
            }
            appendCellString(r, 'Prompt', prompt, 'STR');
        };
        addPromptRow('TaskTextLeft', '0', 'Determines the default text to the left of the task bar', 'STR', 'LOOKUP(Prop.TaskLeftText,Prop.TaskLeftText.Format)');
        addPromptRow('TaskTextRight', '0', 'Determines the default text to the right of the task bar', 'STR', 'LOOKUP(Prop.TaskRightText,Prop.TaskRightText.Format)');
        addPromptRow('TaskTextInner', '0', 'Determines the default text inside of the task bar', 'STR', 'LOOKUP(Prop.TaskInnerText,Prop.TaskInnerText.Format)');
        addPromptRow('MilestoneShape', 0.0, 'Determines the default Milestone shape');
        addPromptRow('NormalTaskStartSym', 8.0, 'Determines the Normal task start symbol shape');
        addPromptRow('NormalTaskEndSym', '7', 'Determines the Normal task end symbol shape', 'STR', 'LOOKUP(Prop.NormalTaskEndSym,Prop.NormalTaskEndSym.Format)');
        addPromptRow('SummaryTaskStartSym', 1.0, 'Determines the Summary task start symbol shape');
        addPromptRow('SummaryTaskEndSym', 1.0, 'Determines the Summary task end symbol shape');
        addPromptRow('PropertyFilter', 1.0, 'Indicates which properties to show: 0 = All, 1 = Configure Timeline Symbols, 2 = Configure Task Bar Text, 3 = Configure Task Bar Sizes');
        {
            const r = appendNamedRow(user, 'ConnectorType');
            appendCellNumber(r, 'Value', 0.0, 'BOOL');
        }
        {
            const r = appendNamedRow(user, 'SchemeName');
            appendCellString(r, 'Value', 'Gantt', 'STR');
        }
    }

    // ── Property 段：符号/条高、任务栏文本选项 ──
    const prop = appendSection(pageSheet, 'Property');
    {
        const addPropRow = (name: string, value: number | string, unit: string,
                            label: string, type: number, format?: string) => {
            const r = appendNamedRow(prop, name);
            if (typeof value === 'string') appendCellString(r, 'Value', value, unit);
            else appendCellNumber(r, 'Value', value, unit);
            appendCellString(r, 'Label', label, 'STR');
            if (format !== undefined) appendCellString(r, 'Format', format, 'STR');
            appendCellNumber(r, 'Type', type);
        };
        addPropRow('SymbolHeight', 0.1181102362204724, 'MM', '时间符号高度', 2);
        addPropRow('NormalHeight', 0.1181102362204724, 'MM', '标准任务栏高度', 2);
        addPropRow('SummaryHeight', 0.07874015748031496, 'MM', '摘要任务栏高度', 2);
        addPropRow('NormalPercentHeight', 0.07874015748031496, 'MM', '标准任务栏完成百分比高度', 2);
        addPropRow('SummaryPercentHeight', 0.07874015748031496, 'MM', '摘要任务栏完成百分比高度', 2);
        const textFormats = '无;开始日期;结束日期;持续时间;资源;完成百分比';
        const symFormats = '菱形;倒三角形;正三角形;向下箭头;向上箭头;星形;圆形;无';
        addPropRow('TaskLeftText', '无', 'STR', '任务左侧文本', 1, textFormats);
        addPropRow('TaskRightText', '无', 'STR', '任务右侧文本', 1, textFormats);
        addPropRow('TaskInnerText', '无', 'STR', '任务内侧文本', 1, textFormats);
        addPropRow('MilestoneShape', '菱形', 'STR', '里程碑符号', 1, '菱形;倒三角形;正三角形;向下箭头;向上箭头;星形;圆形');
        addPropRow('NormalTaskStartSym', '无', 'STR', '标准任务开始符号', 1, symFormats);
        addPropRow('NormalTaskEndSym', '无', 'STR', '标准任务完成符号', 1, symFormats);
        addPropRow('SummaryTaskStartSym', '倒三角形', 'STR', '摘要任务开始符号', 1, symFormats);
        addPropRow('SummaryTaskEndSym', '倒三角形', 'STR', '摘要任务完成符号', 1, symFormats);
    }

    // ── Layer 段：甘特图层 ──
    const layer = appendSection(pageSheet, 'Layer');
    {
        const r = appendNamedRow(layer, 'None');
        appendCellString(r, 'Name', '甘特图', 'STR');
        appendCellNumber(r, 'Color', 255.0);
        appendCellNumber(r, 'Status', 0.0);
        appendCellNumber(r, 'Visible', 1.0);
        appendCellNumber(r, 'Print', 1.0);
        appendCellNumber(r, 'Active', 0.0);
        appendCellNumber(r, 'Lock', 0.0);
        appendCellNumber(r, 'Snap', 1.0);
        appendCellNumber(r, 'Glue', 1.0);
        appendCellString(r, 'NameUniv', 'Gantt', 'STR');
        appendCellNumber(r, 'ColorTrans', 0.0);
    }

    // ── Actions 段：连接线切换 ──
    const actions = appendSection(pageSheet, 'Actions');
    {
        const r1 = appendRow(actions, null, 1, 'Row_1');
        appendCellString(r1, 'Menu', 'S 型连接线(&N)', 'STR');
        appendCellString(r1, 'Action', '0', 'STR',
            'SETF("User.ConnectorType",NOT(User.ConnectorType))');
        appendCellString(r1, 'Checked', '1', 'STR', 'NOT(User.ConnectorType)');
        const r2 = appendRow(actions, null, 2, 'Row_2');
        appendCellString(r2, 'Menu', '_', 'STR');
    }

    // ── RecalcNowAndRand Trigger：打开强制重算公式链 ──
    const trigger = appendChild(pageSheet, makeElement('Trigger'));
    setAttribute(trigger, 'N', 'RecalcNowAndRand');
}

