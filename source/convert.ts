// 编排门面：契约 A → 契约 B（按图型分派到各 diag 包；docs/redesign/01 包 app 职责）
import type { ContractA, ContractB, XmlPart } from './contracts/index.js';
import { part } from './contracts/index.js';
import { CommonRenderer, buildPagesXml } from './diag/common.js';
import { PieRenderer } from './diag/pie.js';
import { QuadrantRenderer } from './diag/quadrant.js';
import { GitRenderer } from './diag/git.js';
import { SeqRenderer, sequencePageSize } from './diag/sequence.js';
import { MindmapRenderer } from './diag/mindmap.js';
import { ClassRenderer, classPageSize } from './diag/class.js';
import { ErRenderer, erPageSize } from './diag/er.js';
import { GanttRenderer, ganttPageSize } from './diag/gantt.js';
import { buildDocumentPart, buildOfficialDocumentPart } from './common/styles/writer.js';
import { StyleRegistry } from './common/styles/model.js';
import { injectPrStyles } from './common/styles/pr.js';
import { buildConnectorStyleXml } from './common/styles/connector.js';
import type { MasterCatalog } from './common/masters/assets.js';
import { buildMasterCatalog } from './common/masters/assets.js';
import { MasterPacker } from './common/masters/packer.js';

export interface ConvertOptions {
    /** 官方模具目录（可为空：自足式）。 */
    stencil?: MasterCatalog;
    pxPerInch?: number;
}

/** 已实现的图型包清单（其余走通用骨架占位，golden 达标后逐个转正）。 */
export const kImplementedKinds = new Set(['flowchart', 'pie', 'quadrant', 'state', 'git', 'block', 'timeline', 'sequence', 'mindmap', 'c4', 'xy', 'class', 'er', 'gantt']);

const kSkeletonMasterName = 'Rectangle';

/** 母版目录（程序化构建）：节点=basic 家族模板（矩形/圆角/菱形/圆/椭圆），
 *  连接线=Dynamic connector 模板——不再依赖 vssx/stencil-data.json；
 *  图型专用包保持自足式（research 6.2.4 合法）。 */
function loadShapeCatalog(): MasterCatalog | null {
    return buildMasterCatalog();
}

/** 专用包母版骨架：未引用母版，仅为满足 research 6.1.4 的"两支目录恒有"。 */
function packSkeletonMasters(catalog: MasterCatalog | null): XmlPart[] {
    if (!catalog) return [];
    return new MasterPacker(catalog).pack([kSkeletonMasterName]).parts;
}

/** class 分支所需母版名（按契约 A 语义收集；仅官方 3 关系类型）。 */
function wantedClassMasters(m: { classes: Array<{ stereotypes: string[]; attributes: unknown[]; operations: unknown[] }>; relations: Array<{ kind: string }> }): string[] {
    const names: string[] = [];
    const push = (n: string) => { if (!names.includes(n)) names.push(n); };
    let needsMember = false;
    let needsSep = false;
    for (const c of m.classes) {
        push(c.stereotypes.includes('interface') ? 'Interface' : 'Class');
        if (c.attributes.length > 0 || c.operations.length > 0) needsMember = true;
        if (c.attributes.length > 0 && c.operations.length > 0) needsSep = true;
    }
    if (needsMember) push('Member');
    if (needsSep) push('Separator');
    for (const r of m.relations) {
        // 官方模板库（class-all-in-one）每类 mmd 关系线型一个独立母版（MasterType=541）：
        // 继承→Inheritance、实现→Interface Realization、直接关联→Directed Association、
        // 聚合→Aggregation、依赖→Dependency、复合→Composition、关联→Association。
        // 与类/成员/分隔符等同级，不使用"单型+覆写"模拟（旧实现）。
        if (r.kind === 'inheritance') push('Inheritance');
        else if (r.kind === 'realization') push('Interface Realization');
        else if (r.kind === 'dependency') push('Dependency');
        else if (r.kind === 'aggregation') push('Aggregation');
        else if (r.kind === 'composition') push('Composition');
        else if (r.kind === 'association') push('Directed Association');
    }
    return names;
}

/** 契约 A → 部件（页面 + 文档基座 + 母版按需）。 */
/** er 分支所需母版名（按契约 A 语义收集）。 */
function wantedErMasters(m: { entities: Array<{ attributes: Array<{ primaryKey: boolean }> }>; relations: unknown[] }): string[] {
    const names: string[] = ['Entity'];
    const push = (n: string) => { if (!names.includes(n)) names.push(n); };
    let hasPk = false;
    let hasAttr = false;
    for (const e of m.entities) {
        for (const at of e.attributes) {
            if (at.primaryKey) hasPk = true;
            else hasAttr = true;
        }
    }
    if (hasPk) push('Primary Key Attribute');
    if (hasPk && hasAttr) push('Primary Key Separator');
    if (hasAttr) push('Attribute');
    if (m.relations.length > 0) push('Relationship');
    return names;
}

/** gantt 分支：全套 10 枚官方母版（结构按母版承载，按需全量打包）。 */
function wantedGanttMasters(): string[] {
    return ['Gantt Chart frame', 'Column', 'Sec scale cell', 'Pri scale cell', 'Non working time', 'Row', 'Task bar', 'Text Entry', 'Milestone', 'Link lines'];
}

/** sequence 分支所需母版名（按契约消息/片段语义收集）。 */
function wantedSequenceMasters(m: { actors: Array<{ kind: string }>; messages: Array<{ kind: string }>; activations: unknown[]; fragments: Array<{ kind: string }> }): string[] {
    const names: string[] = [];
    const push = (n: string) => { if (!names.includes(n)) names.push(n); };
    for (const a of m.actors) push(a.kind === 'actor' ? 'Actor lifeline' : 'Object lifeline');
    for (const msg of m.messages) {
        if (msg.kind === 'return') push('Return Message');
        else if (msg.kind === 'self') push('Self Message');
        else if (msg.kind === 'async') push('Asynchronous Message');
        else if (msg.kind === 'sync') push('Message');
    }
    if (m.activations.length > 0) push('Activation');
    for (const f of m.fragments) {
        if (f.kind === 'loop') push('Loop fragment');
        else if (f.kind === 'opt') push('Optional fragment');
    }
    return names;
}

export function renderContract(a: ContractA, opts: ConvertOptions = {}): ContractB {
    const parts = [];
    const pageH = a.meta.bounds.maxY;
    // class：官方 document 基座（StyleSheets ID6=Theme 完整、ID7=Connector、Colors 9 条——母版
    // 引用 LineStyle/FillStyle='7' 即官方 Connector 样式；旧合成样式表缺 Theme 致黑填充）。
    // 其它图型：合成样式表 + 注入 Connector(ID5)（原有 5.4.4 语义保持不变）。
    let docXml = a.kind === 'class'
        ? buildOfficialDocumentPart().xml
        : buildDocumentPart(new StyleRegistry()).xml;
    if (a.kind !== 'class' && !docXml.includes('NameU="Connector"')) {
        docXml = docXml.replace('</StyleSheets>', buildConnectorStyleXml() + '\n</StyleSheets>');
    }
    // gantt：注入 pr 样式家族（gantt 专篇 2.2：24 枚）
    if (a.kind === 'gantt') docXml = injectPrStyles(docXml);
    const doc = part('/visio/document.xml', 'application/vnd.ms-visio.drawing.main+xml', docXml);
    parts.push(doc);
    // 页面部分
    // 母版目录：引用与骨架统一（注释见 loadShapeCatalog）；显式传入优先。
    // 连接线母版来自 flowchart 官方模具（Dynamic connector），节点来自 basic_shape。
    const catalog = opts.stencil ?? loadShapeCatalog();
    const cfg = { pxPerInch: opts.pxPerInch, stencil: catalog ?? undefined };
    if (a.kind === 'pie' && a.pie) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new PieRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'quadrant' && a.quadrant) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new QuadrantRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'git' && a.git) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new GitRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'sequence' && a.sequence) {
        const packed = new MasterPacker(catalog).pack(wantedSequenceMasters(a.sequence));
        parts.push(...packed.parts);
        const { w, h } = sequencePageSize(a);
        const a2 = { ...a, meta: { ...a.meta, bounds: { minX: 0, minY: 0, maxX: Math.ceil(w * 96), maxY: Math.ceil(h * 96) } } };
        parts.push(buildPagesXml(a2, cfg));
        parts.push(new SeqRenderer().render(a2, pageH, opts.pxPerInch ?? 96, packed.masterIds));
        return { parts };
    }
    if (a.kind === 'mindmap' && a.mindmap) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new MindmapRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'class' && a.classModel) {
        const packed = new MasterPacker(catalog).pack(wantedClassMasters(a.classModel));
        parts.push(...packed.parts);
        const { w, h } = classPageSize(a);
        const a2 = { ...a, meta: { ...a.meta, bounds: { minX: 0, minY: 0, maxX: Math.ceil(w * 96), maxY: Math.ceil(h * 96) } } };
        parts.push(buildPagesXml(a2, cfg));
        parts.push(new ClassRenderer().render(a2, pageH, opts.pxPerInch ?? 96, packed.masterIds));
        return { parts };
    }
    if (a.kind === 'er' && a.erModel) {
        const packed = new MasterPacker(catalog).pack(wantedErMasters(a.erModel));
        parts.push(...packed.parts);
        const { w, h } = erPageSize(a);
        const a2 = { ...a, meta: { ...a.meta, bounds: { minX: 0, minY: 0, maxX: Math.ceil(w * 96), maxY: Math.ceil(h * 96) } } };
        parts.push(buildPagesXml(a2, cfg));
        parts.push(new ErRenderer().render(a2, pageH, opts.pxPerInch ?? 96, packed.masterIds));
        return { parts };
    }
    if (a.kind === 'gantt' && a.gantt) {
        const packed = new MasterPacker(catalog).pack(wantedGanttMasters());
        parts.push(...packed.parts);
        const { w, h } = ganttPageSize(a);
        const a2 = { ...a, meta: { ...a.meta, bounds: { minX: 0, minY: 0, maxX: Math.ceil(w * 96), maxY: Math.ceil(h * 96) } } };
        parts.push(buildPagesXml(a2, cfg));
        parts.push(new GanttRenderer().render(a2, pageH, opts.pxPerInch ?? 96, packed.masterIds));
        return { parts };
    }
    // 其它图型：通用骨架直译
    const common = new CommonRenderer().render(a, cfg);
    for (const p of common.parts) {
        if (p.uri === '/visio/document.xml') continue;
        parts.push(p);
    }
    // 通用路径未产生母版（如 timeline 空页）时补骨架（research 6.1.4 两支目录恒有）
    if (!parts.some((p) => p.uri === '/visio/masters/masters.xml')) {
        parts.push(...packSkeletonMasters(catalog));
    }
    return { parts };
}
