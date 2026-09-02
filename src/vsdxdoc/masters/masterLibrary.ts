// mmd2vsdx - vsdxdoc/masters：masterLibrary（母版库：加载/选择/打包/固化）
//
// C++ masters/masterlibrary.cpp（1,487 行）平移 + stencil 资产管线（M5）。
// 结构：
//   - STENCIL_DATA（scripts/gen-stencils.mjs 生成）：stencil 名 → gzip(base64 JSON)
//     {mastersXml, relsXml?, contents:{fileName:xml}, stylesXml?}；
//   - load(name) 懒解压缓存；selectForType 按 TypeMapping（含 gantt ID 空洞）；
//   - pack：Master ID 100 起重写（gantt 109–111 空洞 +3）、masters.xml 按
//     wanted 声明序重排、relId 绝不重编、跨模具补充连接线（冲突换 rIdN 并改
//     r:id 命名空间属性）、stripConnectorControl+normalizeConnectorMaster（13
//     个 1-D 身份 cell 固化母版根）、normalizeLifelineMaster（30×12MM 头/6" 线/
//     跟随公式 V 缓存）、写包 + rels；
//   - mergeStyles：documentRoot 的 StyleSheets/Colors/FaceNames 分别整体替换；
//   - applyInstanceOverrides：TxtPin 六件套 + User/Control/Scratch/Connection/
//     Geometry Sections 克隆为页内覆盖（公式求值器 16 位 V、F 保留；求值失败
//     软失败保留原件；Connection X/Y 强制 U=IN、行补 T）；ensureEventXFMod。
//
// TS 差异：无 ns 指针（stripNs 为 no-op）；evalFormula 失败 → null 保留原值；
// 格式化用 String(v)（数值语义等价，16 位/17 位精度差异不参与产物对比）。

import { gunzipSync } from 'node:zlib';
import type { XmlNode } from '../../xml/xmlNode.js';
import { parseDocument, serializeDocument } from '../../xml/xmlNode.js';
import type { Package } from '../../opcpkg/package.js';
import { PartUri } from '../../opcpkg/partUri.js';

const kVisioNamespace = 'http://schemas.microsoft.com/office/visio/2012/main';
const kOfficeRelsNs =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
import { Relationships } from '../../opcpkg/relationships.js';
import type { DiagramType } from '../../core/types.js';
import type { CreateOptions } from '../../core/vsdx.js';
import { shapeMasterName } from './masterClient.js';
import type { MasterClient } from './masterClient.js';
import { STENCIL_DATA } from './stencilData.js';

const kMasterRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/master';
const kMastersContentType = 'application/vnd.ms-visio.masters+xml';
const kMasterContentType = 'application/vnd.ms-visio.master+xml';

// ── 模型 ──

export interface StencilMaster {
    nameU: string;
    name: string;
    masterType: number;
    originalId: number;
    relId: string;
    fileName: string; // masterN.xml
}

export interface LoadedStencil {
    name: string;
    masters: StencilMaster[];
    mastersXml: string;
    contents: Map<string, string>; // fileName -> xml
    stylesXml: string | null;
}

export interface StencilSelection {
    stencil: string;
    nameUs: string[];
}

interface StencilRecord {
    mastersXml: string;
    relsXml?: string;
    contents: Record<string, string>;
    stylesXml?: string;
}

// ── XML 工具（母版专用，简化局部名匹配） ──

function elementChildren(node: XmlNode): XmlNode[] {
    return node.children.filter((c): c is XmlNode => typeof c !== 'string');
}

function attr(node: XmlNode, name: string): string {
    return node.attrs.find((a) => a.name === name)?.value ?? '';
}

function setAttr(node: XmlNode, name: string, value: string): void {
    const found = node.attrs.find((a) => a.name === name);
    if (found) found.value = value;
    else node.attrs.push({ name, value });
}

/** 直接子 Cell（N=name 匹配）。 */
function findDirectCell(node: XmlNode, name: string): XmlNode | null {
    for (const child of elementChildren(node)) {
        if (child.name === 'Cell' && attr(child, 'N') === name) return child;
    }
    return null;
}

/** 找到/新建 Cell 并写 V（可选 F 仅在显式给出时改写——保留母版公式链）。 */
function setDirectCell(node: XmlNode, name: string, value: string,
                       formula?: string): void {
    let cell = findDirectCell(node, name);
    if (!cell) {
        cell = { name: 'Cell', attrs: [{ name: 'N', value: name }], children: [] };
        node.children.push(cell);
    }
    setAttr(cell, 'V', value);
    if (formula !== undefined) setAttr(cell, 'F', formula);
}

// ── 资产加载 ──

function parseMasters(xml: string): StencilMaster[] {
    const root = parseDocument(xml, 'masters.xml');
    const result: StencilMaster[] = [];
    for (const master of elementChildren(root)) {
        if (master.name !== 'Master') continue;
        let relId = '';
        for (const child of elementChildren(master)) {
            if (child.name === 'Rel') {
                relId = attr(child, 'id') || attr(child, 'r:id');
                break;
            }
        }
        result.push({
            nameU: attr(master, 'NameU'),
            name: attr(master, 'Name'),
            masterType: Number(attr(master, 'MasterType') || '0'),
            originalId: Number(attr(master, 'ID') || '0'),
            relId,
            fileName: '',
        });
    }
    return result;
}

function parseRels(xml: string): Map<string, string> {
    const root = parseDocument(xml, 'masters.xml.rels');
    const result = new Map<string, string>();
    for (const rel of elementChildren(root)) {
        if (rel.name !== 'Relationship') continue;
        const id = attr(rel, 'Id');
        const target = attr(rel, 'Target');
        if (id.length > 0 && target.length > 0) result.set(id, target);
    }
    return result;
}

class MasterLibraryCore {
    private cache_ = new Map<string, LoadedStencil>();

    load(stencilName: string): LoadedStencil {
        const cached = this.cache_.get(stencilName);
        if (cached) return cached;
        const encoded = STENCIL_DATA[stencilName];
        if (!encoded) {
            throw new Error('stencil: missing data for ' + stencilName);
        }
        const record: StencilRecord = JSON.parse(
            gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
        const stencil: LoadedStencil = {
            name: stencilName,
            masters: parseMasters(record.mastersXml),
            mastersXml: record.mastersXml,
            contents: new Map(Object.entries(record.contents ?? {})),
            stylesXml: record.stylesXml ?? null,
        };
        // relId → fileName 接线
        const rels = record.relsXml ? parseRels(record.relsXml) : new Map<string, string>();
        for (const master of stencil.masters) {
            const target = rels.get(master.relId);
            if (target !== undefined) master.fileName = target;
        }
        this.cache_.set(stencilName, stencil);
        return stencil;
    }
}

// ── 母版子集表（C++ masterlibrary.cpp:467-529 照抄） ──

const kBasicMasters = ['Rectangle', 'Rounded Rectangle', 'Circle', 'Ellipse', 'Diamond',
    'Parallelogram', 'Trapezoid', 'Hexagon', 'Cylinder'];
const kFlowchartMasters = ['Process', 'Decision', 'Subprocess', 'Start/End', 'Document', 'Data',
    'Database', 'External Data', 'On-page reference', 'Off-page reference',
    'Dynamic connector'];
const kClassMasters = ['Class', 'Member', 'Separator', 'Composite', 'Inheritance',
    'Directed Association', 'Dynamic connector'];
const kSequenceMasters = ['Actor lifeline', 'Object lifeline', 'Activation',
    'Rounded Rectangle', 'Message.21', 'Return Message.22', 'Self Message.23'];
const kERMasters = ['Entity', 'Primary Key Attribute', 'Primary Key Separator', 'Attribute',
    'Relationship'];
const kGanttMasters = ['Gantt Chart frame', 'Column', 'Row', 'Task bar', 'Milestone',
    'Link lines', 'Title', 'Legend', 'Dynamic connector',
    'Sec scale cell', 'Pri scale cell', 'Non working time', 'Text Entry'];
const kTimelineMasters = ['Block timeline', 'Line timeline', 'Line milestone', 'Diamond milestone',
    'Today marker', 'Elapsed time', 'Dynamic Connector'];
const kCalendarMasters = ['Month', 'Week', 'Day', 'Appointment', 'Multi-day event', 'Note',
    'Milestone', 'To do'];
const kGitMasters = ['Circle', 'Rounded Rectangle'];

interface TypeMapping {
    type: DiagramType;
    stencil: string;
    nameUs: string[];
    /** gantt 模板历史空洞 [109,112)（ID 偏移 +3，勿硬映射）。 */
    idHoleStart: number;
    idHoleEnd: number;
}

const kMappings: TypeMapping[] = [
    { type: 'basic', stencil: 'basic_shape', nameUs: kBasicMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'flowchart', stencil: 'flowchart', nameUs: kFlowchartMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'class', stencil: 'uml_class', nameUs: kClassMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'sequence', stencil: 'uml_sequence', nameUs: kSequenceMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'er', stencil: 'er_database', nameUs: kERMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'gantt', stencil: 'gantt', nameUs: kGanttMasters, idHoleStart: 109, idHoleEnd: 112 },
    { type: 'timeline', stencil: 'timeline', nameUs: kTimelineMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'calendar', stencil: 'calendar', nameUs: kCalendarMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'git', stencil: 'basic_shape', nameUs: kGitMasters, idHoleStart: 0, idHoleEnd: 0 },
    { type: 'mindmap', stencil: 'basic_shape', nameUs: kBasicMasters, idHoleStart: 0, idHoleEnd: 0 },
];

function findMapping(type: DiagramType): TypeMapping | null {
    return kMappings.find((m) => m.type === type) ?? null;
}

export function selectForType(type: DiagramType): StencilSelection {
    const mapping = findMapping(type);
    if (!mapping) throw new TypeError('Unsupported diagram type');
    return { stencil: mapping.stencil, nameUs: [...mapping.nameUs] };
}


// ═══════════════════════════════════════════════════════
// 公式求值器（坑位 ⑨-9.4：有限引用集；求值失败 → null 软失败）
// ═══════════════════════════════════════════════════════

interface EvalCtx {
    w: number;
    h: number;
    scratchX: number;
    geo1X: number;
    geo1Y: number;
    txtWidth: number;
    txtHeight: number;
    user: Map<string, number>;
    control: Map<string, number>;
}

function evalFormula(formula: string, ctx: EvalCtx): number | null {
    let pos = 0;
    let ok = true;
    const s = formula;
    const skipWs = () => {
        while (pos < s.length && /\s/.test(s[pos]!)) pos++;
    };
    const expr = (): number => {
        let v = term();
        for (;;) {
            skipWs();
            if (s[pos] === '+') {
                pos++;
                v += term();
            } else if (s[pos] === '-') {
                pos++;
                v -= term();
            } else break;
        }
        return v;
    };
    const term = (): number => {
        let v = factor();
        for (;;) {
            skipWs();
            if (s[pos] === '*') {
                pos++;
                v *= factor();
            } else if (s[pos] === '/') {
                pos++;
                const d = factor();
                v = d !== 0 ? v / d : 0;
            } else break;
        }
        return v;
    };
    const factor = (): number => {
        skipWs();
        if (pos >= s.length) {
            ok = false;
            return 0;
        }
        if (s[pos] === '(') {
            pos++;
            const v = expr();
            skipWs();
            if (s[pos] === ')') pos++;
            else ok = false;
            return v;
        }
        const start = pos;
        while (pos < s.length && /[A-Za-z0-9._]/.test(s[pos]!)) pos++;
        const tok = s.slice(start, pos);
        skipWs();
        if (s[pos] === '(') return call(tok);
        return resolve(tok);
    };
    const call = (name: string): number => {
        pos++; // '('
        const args: number[] = [expr()];
        skipWs();
        while (s[pos] === ',') {
            pos++;
            args.push(expr());
            skipWs();
        }
        if (s[pos] === ')') pos++;
        else ok = false;
        if (name === 'MIN') {
            let m = args.length === 0 ? 0 : args[0]!;
            for (const a of args) m = Math.min(m, a);
            return m;
        }
        if (name === 'MAX') {
            let m = args.length === 0 ? 0 : args[0]!;
            for (const a of args) m = Math.max(m, a);
            return m;
        }
        if (name === 'IF') {
            return args.length >= 3 ? (args[0] !== 0 ? args[1]! : args[2]!) : 0;
        }
        if (name === 'AND') {
            for (const a of args) if (a === 0) return 0;
            return 1;
        }
        if (name === 'OR') {
            for (const a of args) if (a !== 0) return 1;
            return 0;
        }
        if (name === 'BOUND') {
            let v = args.length > 0 ? args[0]! : 0;
            if (args.length > 2 && args[2] !== 0) v = Math.max(v, args[1]!);
            if (args.length > 4 && args[4] !== 0) v = Math.min(v, args[3]!);
            return v;
        }
        ok = false;
        return 0;
    };
    const resolve = (tok: string): number => {
        if (tok === 'Width') return ctx.w;
        if (tok === 'Height') return ctx.h;
        if (tok === 'Scratch.X1') return ctx.scratchX;
        if (tok === 'Geometry1.X1') return ctx.geo1X;
        if (tok === 'Geometry1.Y1') return ctx.geo1Y;
        if (tok === 'TxtWidth') return ctx.txtWidth;
        if (tok === 'TxtHeight') return ctx.txtHeight;
        if (tok === 'TRUE') return 1;
        if (tok === 'FALSE') return 0;
        if (tok.startsWith('User.')) {
            const v = ctx.user.get(tok.slice(5));
            if (v !== undefined) return v;
            ok = false;
            return 0;
        }
        if (tok.startsWith('Controls.')) {
            let key = tok.slice(9);
            let isY = false;
            if (key.length >= 2 && key.endsWith('.Y')) {
                isY = true;
                key = key.slice(0, -2);
            }
            const v = ctx.control.get(key + (isY ? '.Y' : '.X'));
            if (v !== undefined) return v;
            ok = false;
            return 0;
        }
        const num = tok.match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/)?.[0];
        if (num !== undefined && num.length > 0) return Number(num);
        ok = false;
        return 0;
    };
    const v = expr();
    return ok ? v : null;
}

/** 无公式且 V≠0：按母版默认尺寸推断显式公式（0.5/1 比例，eps=1e-6）。 */
function inferFormula(cellName: string, vInch: number, masterW: number,
                      masterH: number): string {
    const eps = 1e-6;
    if (cellName === 'D') {
        if (masterH > 0 && Math.abs(vInch - masterW / masterH) < eps) {
            return 'Width/Height*1';
        }
        return '';
    }
    if (masterW > 0) {
        const r = vInch / masterW;
        if (Math.abs(r - 0.5) < eps) return 'Width*0.5';
        if (Math.abs(r - 1.0) < eps) return 'Width*1';
    }
    if (masterH > 0) {
        const r = vInch / masterH;
        if (Math.abs(r - 0.5) < eps) return 'Height*0.5';
        if (Math.abs(r - 1.0) < eps) return 'Height*1';
    }
    return '';
}

function cellValueInches(cell: XmlNode): number {
    const v = attr(cell, 'V');
    const n = Number(v);
    return v.length > 0 && Number.isFinite(n) ? n : 0;
}

function cellValueIn(formula: string, fallbackInches: number, ctx: EvalCtx): number {
    if (formula.length === 0) return fallbackInches;
    const v = evalFormula(formula, ctx);
    return v !== null ? v : fallbackInches;
}

/** 重写 cell 的 V（公式求值成功才写，16 位语义 → String 最短等价；F 保留）。 */
function rewriteCellV(cell: XmlNode, ctx: EvalCtx, masterW: number, masterH: number): void {
    const f = attr(cell, 'F');
    if (f === 'No Formula') return;
    let formula = f;
    let value: number | null = null;
    if (formula.length > 0) {
        value = evalFormula(formula, ctx);
    } else {
        const inferred = inferFormula(attr(cell, 'N'), cellValueInches(cell), masterW, masterH);
        if (inferred.length > 0) {
            formula = inferred;
            value = evalFormula(formula, ctx);
            if (value !== null) setAttr(cell, 'F', formula);
        }
    }
    if (value === null) return; // 软失败：保留原 V
    setAttr(cell, 'V', String(value));
}

function rewriteSectionRows(section: XmlNode, ctx: EvalCtx, masterW: number,
                            masterH: number): void {
    for (const row of elementChildren(section)) {
        if (row.name !== 'Row') continue;
        for (const cell of elementChildren(row)) {
            if (cell.name !== 'Cell') continue;
            const n = attr(cell, 'N');
            if (n !== 'X' && n !== 'Y' && n !== 'A' && n !== 'B' &&
                n !== 'C' && n !== 'D' && n !== 'Value') continue;
            rewriteCellV(cell, ctx, masterW, masterH);
        }
    }
}

/** 递归克隆（plain 对象安全）。 */
function cloneNode(node: XmlNode): XmlNode {
    return JSON.parse(JSON.stringify(node)) as XmlNode;
}

/** 行补 T="Connection"、X/Y 强制 U="IN"（坑位 ⑨-9.4 母版侧唯一 U 强制点）。 */
function fixConnectionRows(section: XmlNode): void {
    for (const row of elementChildren(section)) {
        if (row.name !== 'Row') continue;
        if (attr(row, 'T').length === 0) setAttr(row, 'T', 'Connection');
        for (const cell of elementChildren(row)) {
            if (cell.name !== 'Cell') continue;
            const n = attr(cell, 'N');
            if (n === 'X' || n === 'Y') setAttr(cell, 'U', 'IN');
        }
    }
}

// ═══════════════════════════════════════════════════════
// 连接线/生命线母版改写（pack 前预处理）
// ═══════════════════════════════════════════════════════

/** 递归移除全部 Control Section（侧向偏移手柄，保留单一 TextPosition 手柄）。 */
function stripConnectorControl(masterXml: string): string {
    const doc = parseDocument(masterXml, 'master.xml');
    const toRemove: XmlNode[] = [];
    const collect = (node: XmlNode) => {
        for (const child of elementChildren(node)) {
            if (child.name === 'Section' && attr(child, 'N') === 'Control') {
                toRemove.push(child);
            } else {
                collect(child);
            }
        }
    };
    collect(doc);
    if (toRemove.length === 0) return masterXml;
    for (const node of toRemove) {
        const parent = findParentOf(doc, node);
        if (parent) {
            parent.children = parent.children.filter((c) => c !== node);
        }
    }
    return serializeDocument(doc);
}

/** 母版树内找父节点。 */
function findParentOf(root: XmlNode, target: XmlNode): XmlNode | null {
    for (const child of elementChildren(root)) {
        if (child === target) return root;
        const found = findParentOf(child, target);
        if (found) return found;
    }
    return null;
}

/** 递归找首个 Shape 节点。 */
function findFirstShapeNode(node: XmlNode): XmlNode | null {
    for (const child of elementChildren(node)) {
        if (child.name === 'Shape') return child;
        const found = findFirstShapeNode(child);
        if (found) return found;
    }
    return null;
}

/** 连接线母版规范化：Type=Shape + 删子形状 + 13 个 1-D 身份 cell 固化根 Shape。 */
function normalizeConnectorMaster(masterXml: string): string {
    const doc = parseDocument(masterXml, 'master.xml');
    const rootShape = findFirstShapeNode(doc);
    if (!rootShape) return masterXml;
    if (attr(rootShape, 'Type') === 'Group') setAttr(rootShape, 'Type', 'Shape');
    for (const child of elementChildren(rootShape)) {
        if (child.name === 'Shapes') {
            rootShape.children = rootShape.children.filter((c) => c !== child);
            break;
        }
    }
    const cells: Array<[string, string, string | undefined]> = [
        ['Angle', '0', 'GUARD(0DA)'],
        ['FlipX', '0', 'GUARD(FALSE)'],
        ['FlipY', '0', 'GUARD(FALSE)'],
        ['ResizeMode', '0', undefined],
        ['ObjType', '2', undefined],
        ['GlueType', '2', undefined],
        ['DynFeedback', '2', undefined],
        ['NoLiveDynamics', '1', undefined],
        ['ShapeSplittable', '1', undefined],
        ['LockHeight', '1', undefined],
        ['LockCalcWH', '1', undefined],
        ['NoAlignBox', '1', undefined],
        ['TxtAngle', '0', undefined],
    ];
    for (const [name, v, f] of cells) setDirectCell(rootShape, name, v, f);
    return serializeDocument(doc);
}

/** 生命线母版尺寸调整（方案 A：头 30MM×12MM、虚线默认 6"、V 缓存同步）。 */
function normalizeLifelineMaster(masterXml: string): string {
    const doc = parseDocument(masterXml, 'master.xml');
    const kHeadW = '1.1811023622047243'; // 30MM
    const kHeadH = '0.4724409448818898'; // 12MM
    const kHalfW = '0.5905511811023622';
    const kHalfH = '0.2362204724409449';

    const shapes: XmlNode[] = [];
    const collect = (node: XmlNode) => {
        for (const child of elementChildren(node)) {
            if (child.name === 'Shape') shapes.push(child);
            collect(child);
        }
    };
    collect(doc);
    if (shapes.length === 0) return masterXml;
    const rootShape = shapes[0]!;
    let headShape: XmlNode | null = null;
    let lineShape: XmlNode | null = null;
    for (const shp of shapes) {
        const w = findDirectCell(shp, 'Width');
        const wf = w ? attr(w, 'F') : '';
        if (wf.includes('GUARD(MAX(18MM')) headShape = shp;
        const ey = findDirectCell(shp, 'EndY');
        if (ey && attr(ey, 'F').includes('Controls.Row_1.Y')) lineShape = shp;
    }
    setDirectCell(rootShape, 'Width', kHeadW);
    setDirectCell(rootShape, 'Height', kHeadH);
    setDirectCell(rootShape, 'LocPinX', kHalfW);
    setDirectCell(rootShape, 'LocPinY', kHalfH);
    if (headShape) {
        setDirectCell(headShape, 'Width', kHeadW, 'GUARD(MAX(30MM,TEXTWIDTH(TheText)))');
        setDirectCell(headShape, 'Height', kHeadH, 'GUARD(MAX(12MM,TEXTHEIGHT(TheText,10)))');
        setDirectCell(headShape, 'PinX', kHalfW);
        setDirectCell(headShape, 'PinY', kHalfH);
        setDirectCell(headShape, 'LocPinX', kHalfW);
        setDirectCell(headShape, 'LocPinY', kHalfH);
    }
    for (const child of elementChildren(rootShape)) {
        if (child.name !== 'Section' || attr(child, 'N') !== 'Control') continue;
        for (const row of elementChildren(child)) {
            if (row.name !== 'Row' || attr(row, 'N') !== 'Row_1') continue;
            setDirectCell(row, 'X', kHalfW);
            setDirectCell(row, 'Y', '-6', 'Height-6.4724409448818898');
        }
    }
    if (lineShape) {
        setDirectCell(lineShape, 'PinY', '-3');
        setDirectCell(lineShape, 'Width', '6');
        setDirectCell(lineShape, 'LocPinX', '3');
        setDirectCell(lineShape, 'BeginX', kHalfW);
        setDirectCell(lineShape, 'EndX', kHalfW);
        setDirectCell(lineShape, 'EndY', '-6');
    }
    for (const shp of shapes) {
        for (const cell of elementChildren(shp)) {
            if (cell.name !== 'Cell') continue;
            const f = attr(cell, 'F');
            const n = attr(cell, 'N');
            if (f.includes('Height+1.25MM') && n === 'PinY') {
                setDirectCell(shp, 'PinY', '0.5216535433070867');
            } else if (f.includes('Controls.Row_1.Y-3MM') && n === 'PinY') {
                setDirectCell(shp, 'PinY', '-6.1181102362204724');
            }
        }
    }
    return serializeDocument(doc);
}

// ═══════════════════════════════════════════════════════
// 打包（pack：ID 重写/重排/rels/写包）
// ═══════════════════════════════════════════════════════

function packMasters(core: MasterLibraryCore, package_: Package,
                     selection: StencilSelection,
                     options: CreateOptions): Map<string, number> {
    const result = new Map<string, number>();
    if (!options.useConnectorMaster) return result;
    const stencil = core.load(selection.stencil);

    // 连接线母版：本模具 541 优先；否则从 flowchart 补充（只认 NameU 精确名）
    const wanted = [...selection.nameUs];
    const connectorMaster: StencilMaster | null =
        stencil.masters.find((m) => m.masterType === 541 &&
            (m.nameU === 'Dynamic connector' || m.nameU === 'Dynamic Connector')) ?? null;
    let connectorSource: LoadedStencil | null = null;
    let connectorMasterRec: StencilMaster | null = connectorMaster;
    if (!connectorMasterRec) {
        const fallback = core.load('flowchart');
        const found = fallback.masters.find((m) => m.masterType === 541);
        if (found) {
            connectorSource = fallback;
            connectorMasterRec = found;
        }
    }
    if (connectorMasterRec && !wanted.includes(connectorMasterRec.nameU)) {
        wanted.push(connectorMasterRec.nameU);
    }

    // 解析 masters.xml；标记删除 + 按 wanted 序重排分配 ID（gantt 空洞偏移）
    const mastersDoc = parseDocument(stencil.mastersXml, 'masters.xml');
    const root = mastersDoc;
    const hasIdHole = selection.stencil === 'gantt';
    const skipHole = (id: number) =>
        hasIdHole && id >= 109 && id < 112 ? id + 3 : id;

    let nextId = 100;
    const relsToKeep: Array<[string, string]> = []; // rId -> file
    let connectorFile = '';
    const lifelineFiles: string[] = [];

    const keptNodes: XmlNode[] = [];
    const toRemove = elementChildren(root).filter((m) => m.name === 'Master' &&
        !wanted.includes(attr(m, 'NameU')));
    for (const nameU of wanted) {
        const master = elementChildren(root).find(
            (m) => m.name === 'Master' && attr(m, 'NameU') === nameU);
        if (!master) continue;
        // 摘除后重挂末尾（按 wanted 顺序重排物理序）
        root.children = root.children.filter((c) => c !== master);
        root.children.push(master);
        keptNodes.push(master);
    }
    for (const master of keptNodes) {
        const nameU = attr(master, 'NameU');
        nextId = skipHole(nextId);
        setAttr(master, 'ID', String(nextId));
        result.set(nameU, nextId++);
        let relId = '';
        for (const child of elementChildren(master)) {
            if (child.name === 'Rel') {
                relId = attr(child, 'id') || attr(child, 'r:id');
                break;
            }
        }
        if (relId.length > 0) {
            const masterRec = stencil.masters.find((m) => m.relId === relId);
            if (masterRec && masterRec.fileName.length > 0) {
                relsToKeep.push([relId, masterRec.fileName]);
                if (connectorMasterRec && nameU === connectorMasterRec.nameU) {
                    connectorFile = masterRec.fileName;
                }
                if (nameU === 'Object lifeline' || nameU === 'Actor lifeline') {
                    lifelineFiles.push(masterRec.fileName);
                }
            }
        }
    }

    // 跨模具补充连接线（复制 Master 元素 + 文件；relId 冲突换新并更新 r:id）
    if (connectorMasterRec && connectorSource !== null &&
        !result.has(connectorMasterRec.nameU)) {
        const fallbackDoc = parseDocument(connectorSource.mastersXml, 'masters.xml');
        for (const master of elementChildren(fallbackDoc)) {
            if (master.name !== 'Master') continue;
            if (attr(master, 'NameU') !== connectorMasterRec.nameU) continue;
            let relId = '';
            for (const child of elementChildren(master)) {
                if (child.name === 'Rel') {
                    relId = attr(child, 'id') || attr(child, 'r:id');
                    break;
                }
            }
            const copy = cloneNode(master);
            // 跨文档移入节点携带 ns 声明（等效 libxml xmlAddChild 行为）
            copy.attrs.unshift({ name: 'xmlns:r', value: kOfficeRelsNs });
            copy.attrs.unshift({ name: 'xmlns', value: kVisioNamespace });
            nextId = skipHole(nextId);
            setAttr(copy, 'ID', String(nextId));
            result.set(connectorMasterRec.nameU, nextId++);
            root.children.push(copy);
            const sourceMaster = connectorSource.masters.find((m) => m.relId === relId);
            const file = sourceMaster ? sourceMaster.fileName : '';
            if (file.length > 0) {
                let newRelId = relId;
                if (relsToKeep.some(([rid]) => rid === relId)) {
                    let n = 1;
                    do {
                        newRelId = 'rId' + n++;
                    } while (relsToKeep.some(([rid]) => rid === newRelId));
                    for (const relChild of elementChildren(copy)) {
                        if (relChild.name === 'Rel') {
                            const found = relChild.attrs.find((a) => a.name === 'r:id');
                            if (found) found.value = newRelId;
                            else setAttr(relChild, 'r:id', newRelId);
                            break;
                        }
                    }
                }
                connectorFile = file;
                relsToKeep.push([newRelId, file]);
            }
            break;
        }
    }
    for (const node of toRemove) {
        root.children = root.children.filter((c) => c !== node);
    }

    // 写 masters.xml
    package_.addPart(PartUri.parse('visio/masters/masters.xml'),
        kMastersContentType, Buffer.from(serializeDocument(root), 'utf8'));

    // 写 masterN.xml + 重建 rels（relId 绝不重编）
    const rels = Relationships.create(PartUri.parse('visio/masters/masters.xml'));
    for (const [relId, file] of relsToKeep) {
        let content = stencil.contents.get(file);
        if (content === undefined && connectorSource !== null) {
            content = connectorSource.contents.get(file);
        }
        if (content === undefined) continue;
        if (connectorFile.length > 0 && file === connectorFile) {
            content = stripConnectorControl(content);
            content = normalizeConnectorMaster(content);
        }
        if (lifelineFiles.includes(file)) {
            content = normalizeLifelineMaster(content);
        }
        package_.addPart(PartUri.parse('visio/masters/' + file), kMasterContentType,
            Buffer.from(content, 'utf8'));
        rels.add(kMasterRelationship, file, 0 /* Internal */, relId);
    }
    package_.setRelationships(rels);
    return result;
}

// ═══════════════════════════════════════════════════════
// mergeStyles：StyleSheets/Colors/FaceNames 分别整体替换
// ═══════════════════════════════════════════════════════

export function mergeStyles(documentRoot: XmlNode, stylesXml: string | null): void {
    if (!stylesXml || stylesXml.length === 0) return;
    const styles = parseDocument(stylesXml, 'styles.xml');
    if (styles.name !== 'VisioStyles') return;
    const replaceOrAppend = (localName: string, replacement: XmlNode | null) => {
        if (!replacement) return;
        const copy = cloneNode(replacement);
        let replaced = false;
        for (const child of elementChildren(documentRoot)) {
            if (child.name === localName) {
                const idx = documentRoot.children.indexOf(child);
                documentRoot.children[idx] = copy;
                replaced = true;
                break;
            }
        }
        if (!replaced) documentRoot.children.push(copy);
    };
    for (const child of elementChildren(styles)) {
        if (child.name === 'StyleSheets' || child.name === 'Colors' ||
            child.name === 'FaceNames') {
            replaceOrAppend(child.name, child);
        }
    }
}

// ═══════════════════════════════════════════════════════
// applyInstanceOverrides（母版实例固化：克隆 + 求值）
// ═══════════════════════════════════════════════════════

function ensureEventXFMod(shape: XmlNode): void {
    if (findDirectCell(shape, 'EventXFMod')) return;
    const cell: XmlNode = { name: 'Cell', attrs: [{ name: 'N', value: 'EventXFMod' }, { name: 'V', value: '0' }], children: [] };
    const sectionIdx = shape.children.findIndex(
        (c) => typeof c !== 'string' && c.name === 'Section');
    if (sectionIdx >= 0) shape.children.splice(sectionIdx, 0, cell);
    else shape.children.push(cell);
}

function applyFromMasterShape(shape: XmlNode, masterShape: XmlNode, width: number,
                              height: number): void {
    let masterW = 0;
    let masterH = 0;
    for (const cell of elementChildren(masterShape)) {
        if (cell.name !== 'Cell') continue;
        const n = attr(cell, 'N');
        if (n === 'Width') masterW = cellValueInches(cell);
        else if (n === 'Height') masterH = cellValueInches(cell);
    }

    const ctx: EvalCtx = {
        w: width, h: height, scratchX: 0, geo1X: 0, geo1Y: 0,
        txtWidth: 0, txtHeight: 0, user: new Map(), control: new Map(),
    };

    const txtCells: XmlNode[] = [];
    let userSection: XmlNode | null = null;
    let controlSection: XmlNode | null = null;
    let scratchSection: XmlNode | null = null;
    let connectionSection: XmlNode | null = null;
    const geometrySections: XmlNode[] = [];
    for (const child of elementChildren(masterShape)) {
        if (child.name === 'Cell') {
            if (attr(child, 'N').startsWith('Txt')) txtCells.push(child);
            continue;
        }
        if (child.name !== 'Section') continue;
        const n = attr(child, 'N');
        if (n === 'User') userSection = child;
        else if (n === 'Control') controlSection = child;
        else if (n === 'Scratch') scratchSection = child;
        else if (n === 'Connection') connectionSection = child;
        else if (n === 'Geometry') geometrySections.push(child);
    }

    // 求值依赖序：User 常量行 → Control → User 其余 → Scratch → Geometry 首 MoveTo
    if (userSection) {
        for (const row of elementChildren(userSection)) {
            if (row.name !== 'Row') continue;
            const rowName = attr(row, 'N');
            const valueCell = elementChildren(row).find(
                (c) => c.name === 'Cell' && attr(c, 'N') === 'Value');
            if (!valueCell) continue;
            if (attr(valueCell, 'F').includes('Controls.')) continue;
            ctx.user.set(rowName,
                cellValueIn(attr(valueCell, 'F'), cellValueInches(valueCell), ctx));
        }
    }
    if (controlSection) {
        for (const row of elementChildren(controlSection)) {
            if (row.name !== 'Row') continue;
            const rowName = attr(row, 'N');
            for (const cell of elementChildren(row)) {
                if (cell.name !== 'Cell') continue;
                const n = attr(cell, 'N');
                if (n !== 'X' && n !== 'Y') continue;
                ctx.control.set(rowName + '.' + n,
                    cellValueIn(attr(cell, 'F'), cellValueInches(cell), ctx));
            }
        }
    }
    if (userSection) {
        for (const row of elementChildren(userSection)) {
            if (row.name !== 'Row') continue;
            const rowName = attr(row, 'N');
            if (ctx.user.has(rowName)) continue;
            const valueCell = elementChildren(row).find(
                (c) => c.name === 'Cell' && attr(c, 'N') === 'Value');
            if (!valueCell) continue;
            ctx.user.set(rowName,
                cellValueIn(attr(valueCell, 'F'), cellValueInches(valueCell), ctx));
        }
    }
    if (scratchSection) {
        for (const row of elementChildren(scratchSection)) {
            if (row.name !== 'Row') continue;
            for (const cell of elementChildren(row)) {
                if (cell.name !== 'Cell' || attr(cell, 'N') !== 'X') continue;
                ctx.scratchX = cellValueIn(attr(cell, 'F'), cellValueInches(cell), ctx);
            }
        }
    }
    for (const gs of geometrySections) {
        for (const row of elementChildren(gs)) {
            if (row.name !== 'Row' || attr(row, 'T') !== 'MoveTo') continue;
            for (const cell of elementChildren(row)) {
                if (cell.name !== 'Cell') continue;
                const n = attr(cell, 'N');
                if (n === 'X') ctx.geo1X = cellValueIn(attr(cell, 'F'), cellValueInches(cell), ctx);
                else if (n === 'Y') ctx.geo1Y = cellValueIn(attr(cell, 'F'), cellValueInches(cell), ctx);
            }
            break;
        }
    }

    // TxtPin 六件套先求值供引用，再克隆到页内（首个 Section 前）
    for (const tc of txtCells) {
        const v = evalFormula(attr(tc, 'F'), ctx);
        if (v === null) continue;
        const n = attr(tc, 'N');
        if (n === 'TxtWidth') ctx.txtWidth = v;
        else if (n === 'TxtHeight') ctx.txtHeight = v;
    }
    const firstSectionIdx = shape.children.findIndex(
        (c) => typeof c !== 'string' && c.name === 'Section');
    for (const tc of txtCells) {
        const copy = cloneNode(tc);
        rewriteCellV(copy, ctx, masterW, masterH);
        // 每次重算首个 Section 位置插入（等效 xmlAddPrevSibling 保序追加）
        const idx = shape.children.findIndex(
            (c) => typeof c !== 'string' && c.name === 'Section');
        if (idx >= 0) shape.children.splice(idx, 0, copy);
        else shape.children.push(copy);
    }
    void firstSectionIdx;

    // 克隆 Sections：User 合并行 / Control+Scratch 追加 / Connection 补 T+U /
    // Geometry 追加
    if (userSection) {
        const copy = cloneNode(userSection);
        rewriteSectionRows(copy, ctx, masterW, masterH);
        const existing = elementChildren(shape).find(
            (s) => s.name === 'Section' && attr(s, 'N') === 'User') ?? null;
        if (existing) {
            for (const row of elementChildren(copy)) {
                if (row.name === 'Row') existing.children.push(row);
            }
        } else {
            shape.children.push(copy);
        }
    }
    for (const src of [controlSection, scratchSection]) {
        if (!src) continue;
        const copy = cloneNode(src);
        rewriteSectionRows(copy, ctx, masterW, masterH);
        shape.children.push(copy);
    }
    if (connectionSection) {
        const copy = cloneNode(connectionSection);
        rewriteSectionRows(copy, ctx, masterW, masterH);
        fixConnectionRows(copy);
        shape.children.push(copy);
    }
    for (const gs of geometrySections) {
        const copy = cloneNode(gs);
        rewriteSectionRows(copy, ctx, masterW, masterH);
        shape.children.push(copy);
    }
}

/** masterChildShapeIds：跨全部模具扫描 Group 子形状 ID（带缓存）。 */
function collectMasterChildShapeIds(core: MasterLibraryCore, nameU: string,
                                    childCache: Map<string, number[]>): number[] {
    const cached = childCache.get(nameU);
    if (cached) return cached;
    const result: number[] = [];
    for (const stencilName of Object.keys(STENCIL_DATA)) {
        const st = core.load(stencilName);
        for (const master of st.masters) {
            if (master.nameU !== nameU) continue;
            const content = st.contents.get(master.fileName);
            if (content === undefined) break;
            const doc = parseDocument(content, master.fileName);
            const collectGroupChildren = (group: XmlNode) => {
                for (const shapes of elementChildren(group)) {
                    if (shapes.name !== 'Shapes') continue;
                    for (const sub of elementChildren(shapes)) {
                        if (sub.name === 'Shape') {
                            result.push(Number(attr(sub, 'ID') || '0'));
                        }
                    }
                }
            };
            for (const top of elementChildren(doc)) {
                if (top.name === 'Shapes') {
                    for (const shp of elementChildren(top)) {
                        if (shp.name === 'Shape') collectGroupChildren(shp);
                    }
                } else if (top.name === 'Shape') {
                    collectGroupChildren(top);
                }
            }
        }
    }
    childCache.set(nameU, result);
    return result;
}

/** 模具 styles.xml（<VisioStyles>…）读取（装配期 mergeStyles 用）。 */
export function stylesXmlFor(stencilName: string): string | null {
    const core = new MasterLibraryCore();
    return core.load(stencilName).stylesXml;
}

/** 真实母版客户端（每次翻译一个独立实例：pack 映射不跨文档串扰，⑨-9.1b）。 */
export function realMasterClient(): RealMasterClient {
    const core = new MasterLibraryCore();
    const childCache = new Map<string, number[]>();
    const masterIds = new Map<string, number>();
    return {
        masterIdFor: (nameU) => masterIds.get(nameU) ?? 0,
        masterChildShapeIds: (nameU) => collectMasterChildShapeIds(core, nameU, childCache),
        applyInstanceOverrides: (node, nameU, width, height) => {
            for (const stencilName of Object.keys(STENCIL_DATA)) {
                const st = core.load(stencilName);
                const master = st.masters.find((m) => m.nameU === nameU);
                if (!master) continue;
                const content = st.contents.get(master.fileName);
                if (content === undefined) return;
                const doc = parseDocument(content, master.fileName);
                let masterShape: XmlNode | null = null;
                for (const top of elementChildren(doc)) {
                    if (top.name === 'Shapes') {
                        const first = elementChildren(top).find((s) => s.name === 'Shape');
                        if (first) {
                            masterShape = first;
                            break;
                        }
                    } else if (top.name === 'Shape') {
                        masterShape = top;
                        break;
                    }
                }
                if (!masterShape) return;
                applyFromMasterShape(node, masterShape, width, height);
                ensureEventXFMod(node);
                return;
            }
        },
        masterNameForShape: (type, kind) => shapeMasterName(type, kind),
        pack: (package_, selection, options) => {
            const map = packMasters(core, package_, selection, options);
            masterIds.clear();
            for (const [k, v] of map) masterIds.set(k, v);
            return map;
        },
        mergeStylesInto: (documentRoot, stylesXml) => mergeStyles(documentRoot, stylesXml),
    };
}

/** 真实母版客户端接口（MasterClient + 装配期操作）。 */
export interface RealMasterClient extends MasterClient {
    pack(package_: Package, selection: StencilSelection,
         options: CreateOptions): Map<string, number>;
    mergeStylesInto(documentRoot: XmlNode, stylesXml: string | null): void;
}

