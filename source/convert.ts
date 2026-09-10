// 编排门面：契约 A → 契约 B（按图型分派到各 diag 包；docs/redesign/01 包 app 职责）
import type { ContractA, ContractB, XmlPart } from './contracts/index.js';
import { part } from './contracts/index.js';
import { CommonRenderer, buildPagesXml, kCanvasMargin } from './diag/common.js';
import { SeqRenderer, sequenceContentBox } from './diag/sequence.js';
import { ClassRenderer, classPageSize } from './diag/class.js';
import { ErRenderer, erPageSize } from './diag/er.js';
import { buildDocumentPart, buildOfficialDocumentPart, buildOfficialErDocumentPart, buildOfficialSequenceDocumentPart } from './common/styles/writer.js';
import { StyleRegistry } from './common/styles/model.js';
import { buildConnectorStyleXml } from './common/styles/connector.js';
import type { MasterCatalog } from './common/masters/assets.js';
import { buildMasterCatalog } from './common/masters/assets.js';
import { MasterPacker } from './common/masters/packer.js';

export interface ConvertOptions {
    /** 官方模具目录（可为空：自足式）。 */
    stencil?: MasterCatalog;
    pxPerInch?: number;
}

/** 已实现的图型包清单（2026-09 收敛到软件行业常用 5 类）。
 *  其余图型在解析层直接抛错，不再有"通用骨架占位"的降级路径。 */
export const kImplementedKinds = new Set(['flowchart', 'block', 'class', 'er', 'sequence']);

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

/** sequence 分支所需母版名（按契约消息/片段语义收集）。 */
function wantedSequenceMasters(m: { actors: Array<{ kind: string }>; messages: Array<{ kind: string }>; activations: unknown[]; fragments: Array<{ kind: string; operands?: unknown[] }> }): string[] {
    const names: string[] = [];
    const push = (n: string) => { if (!names.includes(n)) names.push(n); };
    for (const a of m.actors) push(a.kind === 'actor' ? 'Actor lifeline' : 'Object lifeline');
    for (const msg of m.messages) {
        if (msg.kind === 'return') push('Return Message');
        else if (msg.kind === 'self') push('Self Message');
        else if (msg.kind === 'async') push('Asynchronous Message');
        else if (msg.kind === 'sync') push('Message');
        // 备注复用官方 Note 母版（class 包同名母版，母版目录跨记录可见）
        else if (msg.kind === 'note') push('Note');
    }
    if (m.activations.length > 0) push('Activation');
    for (const f of m.fragments) {
        if (f.kind === 'loop') push('Loop fragment');
        else if (f.kind === 'opt') push('Optional fragment');
        else if (f.kind === 'alt') { push('Alternative fragment'); push('Interaction operand'); }
        else if (f.kind === 'par' || f.kind === 'critical' || f.kind === 'break') {
            push('Other fragment');
            if ((f.operands?.length ?? 0) > 1) push('Interaction operand');
        }
    }
    return names;
}

export function renderContract(a: ContractA, opts: ConvertOptions = {}): ContractB {
    const parts = [];
    const pageH = a.meta.bounds.maxY;
    // class：官方 document 基座（StyleSheets ID6=Theme 完整、ID7=Connector、Colors 9 条——母版
    // 引用 LineStyle/FillStyle='7' 即官方 Connector 样式；旧合成样式表缺 Theme 致黑填充）。
    // er：官方 er-all-in-one document 基座（ID6=Theme、ID7=Connector、Colors 6 条——关系母版
    // LineStyle/FillStyle='7' 同引用官方 Connector；旧合成样式表缺 Theme 同坑）。
    // sequence：官方 sequence document 基座（ID7=Connector 的 TextBkgnd='#ffffff' 提供消息
    // 文字白底——合成基座里 Connector 在 ID5，母版引用 '7' 落空导致线压文字）。
    // 其它图型：合成样式表 + 注入 Connector(ID5)（原有 5.4.4 语义保持不变）。
    let docXml = a.kind === 'class'
        ? buildOfficialDocumentPart().xml
        : a.kind === 'er'
            ? buildOfficialErDocumentPart().xml
            : a.kind === 'sequence'
                ? buildOfficialSequenceDocumentPart().xml
                : buildDocumentPart(new StyleRegistry()).xml;
    if (a.kind !== 'class' && a.kind !== 'er' && a.kind !== 'sequence' && !docXml.includes('NameU="Connector"')) {
        docXml = docXml.replace('</StyleSheets>', buildConnectorStyleXml() + '\n</StyleSheets>');
    }
    const doc = part('/visio/document.xml', 'application/vnd.ms-visio.drawing.main+xml', docXml);
    parts.push(doc);
    // 页面部分
    // 母版目录：引用与骨架统一（注释见 loadShapeCatalog）；显式传入优先。
    // 连接线母版来自 flowchart 官方模具（Dynamic connector），节点来自 basic_shape。
    const catalog = opts.stencil ?? loadShapeCatalog();
    const cfg = { pxPerInch: opts.pxPerInch, stencil: catalog ?? undefined, pageMargin: kCanvasMargin };
    if (a.kind === 'sequence' && a.sequence) {
        const packed = new MasterPacker(catalog).pack(wantedSequenceMasters(a.sequence));
        parts.push(...packed.parts);
        // 页面 = 内容外包围框 + 半线宽呼吸位（P-4 画布策略；呼吸位由 buildPagesXml 统一叠加）
        const box = sequenceContentBox(a.sequence);
        const m = kCanvasMargin;
        const w = (box.maxX - box.minX) / 96;
        const h = (box.maxY - box.minY) / 96;
        const a2 = { ...a, meta: { ...a.meta, bounds: { minX: 0, minY: 0, maxX: Math.ceil(w * 96), maxY: Math.ceil(h * 96) } } };
        parts.push(buildPagesXml(a2, { ...cfg, drawingResizeType: '2' }));
        parts.push(new SeqRenderer().render(a2, box.maxY + m * 96, opts.pxPerInch ?? 96, packed.masterIds, box.minX - m * 96));
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
    // 其它图型（flowchart / block）：通用骨架直译
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
