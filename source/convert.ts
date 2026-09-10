// 编排门面：契约 A → 契约 B（按图型分派到各 diag 包；docs/redesign/01 包 app 职责）
import type { ContractA, ContractB, XmlPart } from './contracts/index.js';
import { part } from './contracts/index.js';
import { CommonRenderer } from './diag-common/index.js';
import { PieRenderer } from './diag-pie/index.js';
import { QuadrantRenderer } from './diag-quadrant/index.js';
import { GitRenderer } from './diag-git/index.js';
import { SeqRenderer } from './diag-sequence/index.js';
import { MindmapRenderer } from './diag-mindmap/index.js';
import { ClassRenderer } from './diag-class/index.js';
import { ErRenderer } from './diag-er/index.js';
import { GanttRenderer } from './diag-gantt/index.js';
import { buildPagesXml } from './diag-common/index.js';
import { buildDocumentPart } from './common/styles/writer.js';
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

/** 契约 A → 部件（页面 + 文档基座 + 母版按需）。 */
export function renderContract(a: ContractA, opts: ConvertOptions = {}): ContractB {
    const parts = [];
    const pageH = a.meta.bounds.maxY;
    let docXml = buildDocumentPart(new StyleRegistry()).xml;
    // Connector 样式（标准模板连接线独立样式；所有图型含连接线时注入，5.4.4"样式表跟随内容"）
    if (!docXml.includes('NameU="Connector"')) {
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
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new SeqRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'mindmap' && a.mindmap) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new MindmapRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'class' && a.classModel) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new ClassRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'er' && a.erModel) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new ErRenderer().render(a, pageH, opts.pxPerInch ?? 96));
        return { parts };
    }
    if (a.kind === 'gantt' && a.gantt) {
        parts.push(...packSkeletonMasters(catalog));
        parts.push(buildPagesXml(a, cfg));
        parts.push(new GanttRenderer().render(a, pageH, opts.pxPerInch ?? 96));
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
