// mmd2vsdx - vsdxdoc/translate：diagramImporter（Diagram → DocumentCore）
//
// C++ translate/diagramimporter.cpp（415 行）平移。三步职责照抄：
//   1. resolveType：类型解析（Auto 推导）+ outputScale 校验；
//   2. assembleDocumentCore：Package + 文档部件 + Relationships + DocumentCore；
//   3. buildPageContent：坐标变换 + 页面/形状/连接线组装（专用渲染器分支
//      gantt/git/pie/quadrant/sequence 属 M4，暂以明确错误拦截）。
// M2 适配：母版打包属 M5 —— useConnectorMaster=true 时抛明确错误；
// 渲染经 masterlessClient（masterId=0 本地内容路径）。
// TS 差异（去指针）：shape.nodeRef/connector 的 begin/endConnectRef 直持引用，
// C++ 的页面句柄索引机制消失；页面关系部件在 addPage 即时写包。

import {
    appendChild,
    directChild,
    makeElement,
    serializeDocument,
    setAttribute,
} from '../../xml/xmlNode.js';
import type { XmlNode } from '../../xml/xmlNode.js';
import { Package } from '../../opcpkg/package.js';
import { PartUri } from '../../opcpkg/partUri.js';
import { Relationships } from '../../opcpkg/relationships.js';
import { resolveDiagramType, masterlessClient } from '../masters/masterClient.js';
import { realMasterClient, selectForType, stylesXmlFor } from '../masters/masterLibrary.js';
import { renderManagedConnector, renderManagedShape, logicalIdExists } from '../render/renderer.js';
import { renderPie } from '../render/piRenderer.js';
import { renderQuadrant } from '../render/quadrantRenderer.js';
import { renderGitGraph } from '../render/gitRenderer.js';
import { renderSequence } from '../render/sequenceRenderer.js';
import { renderGantt, addPageEngineConfig } from '../render/ganttRenderer.js';
import { CoordinateTransform } from './coordinateTransform.js';
import {
    addPageMetadata,
    createAppProperties,
    createCoreProperties,
    createCustomProperties,
    createDocumentXml,
    createPageXml,
    createPagesXml,
    createWindowsXml,
} from '../serialize/documentParts.js';
import { validateShapeBounds, validateStyle } from '../serialize/validator.js';
import { DocumentCore } from '../docmodel/documentCore.js';
import { defaultConnectorModel, defaultPageModel, defaultShapeModel } from '../docmodel/model.js';
import type { PageModel, ShapeModel, ConnectorModel } from '../docmodel/model.js';
import type { Diagram } from '../../core/types.js';
import type { CreateOptions, PageSpec, ShapeSpec, ConnectorSpec } from '../../core/vsdx.js';
import { defaultCreateOptions } from '../../core/vsdx.js';
import {
    kAppUri,
    kCoreUri,
    kCustomUri,
    kDocumentUri,
    kPagesUri,
    kWindowsUri,
    kCustomContentType,
    kCoreContentType,
    kCustomRelationship,
    kDocumentContentType,
    kDocumentRelationship,
    kExtendedContentType,
    kExtendedRelationship,
    kCoreRelationship,
    kPageContentType,
    kPageRelationship,
    kPagesContentType,
    kPagesRelationship,
    kWindowsContentType,
    kWindowsRelationship,
    kMastersRelationship,
} from '../../xml/constants.js';

// ═══════════════════════════════════════════════════════
// 步骤 1：纯翻译（类型解析 + 校验）
// ═══════════════════════════════════════════════════════

export function resolveType(diagram: Diagram, options: CreateOptions): CreateOptions {
    const resolved: CreateOptions = { ...options };
    resolved.diagramType = resolveDiagramType(options.diagramType, [diagram]);
    if (!Number.isFinite(resolved.outputScale) || resolved.outputScale <= 0) {
        throw new TypeError('VSDX outputScale must be finite and positive');
    }
    return resolved;
}

// ═══════════════════════════════════════════════════════
// 步骤 2：装配（建包/部件/关系/DocumentCore）
// ═══════════════════════════════════════════════════════

function assembleDocumentCore(diagram: Diagram, resolved: CreateOptions): DocumentCore {
    const package_ = Package.create();
    const documentXml = createDocumentXml(resolved.diagramType);
    const pagesXml = createPagesXml();
    const app = createAppProperties();
    const coreProps = createCoreProperties();
    const custom = createCustomProperties();
    const windows = createWindowsXml(resolved.diagramType);

    const core = new DocumentCore(package_, resolved);
    core.documentRoot = documentXml;
    core.pagesRoot = pagesXml;
    core.pagesRelsDirty = true;

    if (resolved.useConnectorMaster) {
        // M5：真实母版管线（selectForType → pack → mergeStyles；映射在客户端内）
        const client = realMasterClient();
        const selection = selectForType(resolved.diagramType);
        client.pack(package_, selection, resolved);
        client.mergeStylesInto(documentXml, stylesXmlFor(selection.stencil));
        core.masterClient = client;
    } else {
        core.masterClient = masterlessClient;
    }

    const addPartText = (uri: string, contentType: string, root: XmlNode) => {
        package_.addPart(PartUri.parse(uri), contentType,
            Buffer.from(serializeDocument(root), 'utf8'));
    };
    addPartText(kDocumentUri, kDocumentContentType, documentXml);
    addPartText(kPagesUri, kPagesContentType, pagesXml);
    addPartText(kAppUri, kExtendedContentType, app);
    addPartText(kCoreUri, kCoreContentType, coreProps);
    addPartText(kCustomUri, kCustomContentType, custom);
    addPartText(kWindowsUri, kWindowsContentType, windows);

    const rootRelationships = Relationships.create(null);
    rootRelationships.add(kDocumentRelationship, 'visio/document.xml');
    rootRelationships.add(kCoreRelationship, 'docProps/core.xml');
    rootRelationships.add(kExtendedRelationship, 'docProps/app.xml');
    rootRelationships.add(kCustomRelationship, 'docProps/custom.xml');
    package_.setRelationships(rootRelationships);

    const documentRelationships = Relationships.create(PartUri.parse(kDocumentUri));
    if (resolved.useConnectorMaster) {
        documentRelationships.add(kMastersRelationship, 'masters/masters.xml');
    }
    documentRelationships.add(kPagesRelationship, 'pages/pages.xml');
    documentRelationships.add(kWindowsRelationship, 'windows.xml');
    package_.setRelationships(documentRelationships);

    // 页面关系部件（占位空表；addPage 逐页追加后即时写包）
    package_.setRelationships(Relationships.create(PartUri.parse(kPagesUri)));

    void diagram; // 装配阶段不依赖 diagram（页面内容在步骤 3 组装）
    return core;
}

// ═══════════════════════════════════════════════════════
// 步骤 3：翻译+渲染（页面/形状/连接线组装）
// ═══════════════════════════════════════════════════════

function buildPageContent(core: DocumentCore, diagram: Diagram, resolved: CreateOptions): void {
    const transform = new CoordinateTransform(diagram, resolved.outputScale, {
        left: resolved.marginLeft,
        right: resolved.marginRight,
        top: resolved.marginTop,
        bottom: resolved.marginBottom,
    });

    const pageSpec: PageSpec = {
        name: diagram.diagramType.length === 0 ? 'Page-1' : diagram.diagramType,
        width: transform.pageWidth(),
        height: transform.pageHeight(),
    };
    // gantt：A3 横向固定尺寸（官方模板，坑位 ④-4.2）——M4 专用渲染
    if (diagram.gantt.tasks.length > 0) {
        pageSpec.width = 16.03543307086614;
        pageSpec.height = 11.69291338582677;
    }
    const pageId = addPage(core, pageSpec);

    // 专用渲染器：gantt（引擎配置随行）→ pie/quadrant/gitGraph/sequence
    if (diagram.gantt.tasks.length > 0) {
        const ganttPage = core.page(pageId);
        renderGantt(ganttPage, diagram.gantt, core.masterClient);
        addPageEngineConfig(ganttPage, diagram.gantt);
        return;
    }
    if (diagram.pie.slices.length > 0) {
        renderPie(core.page(pageId), diagram.pie, transform);
        return;
    }
    if (diagram.quadrant.points.length > 0) {
        renderQuadrant(core.page(pageId), diagram.quadrant, transform, core.masterClient);
        return;
    }
    if (diagram.git.commits.length > 0) {
        renderGitGraph(core.page(pageId), diagram.git, transform, core.masterClient);
        return;
    }
    if (resolved.diagramType === 'sequence' && diagram.nodes.length > 0) {
        renderSequence(core.page(pageId), diagram, transform, core.masterClient);
        return;
    }

    const nodeToShape = new Map<string, number>();
    const usedIds = new Set<string>();
    for (const node of diagram.nodes) {
        const center = transform.point(node.x, node.y);
        const shapeSpec: ShapeSpec = {
            logicalId: node.id,
            text: node.label,
            kind: node.shape,
            x: center.x,
            y: center.y,
            width: Math.max(transform.length(node.width), 0.1),
            height: Math.max(transform.length(node.height), 0.1),
            style: { fillColor: '#FFFFFF', lineColor: '#000000', textColor: '#000000', lineWidthPoints: 0.5, fontSizePoints: 12 },
            dividers: [],
        };
        if (!usedIds.has(shapeSpec.logicalId)) {
            usedIds.add(shapeSpec.logicalId);
        } else {
            for (let dup = 2; ; dup++) {
                const candidate = node.id + '-' + dup;
                if (!usedIds.has(candidate)) {
                    usedIds.add(candidate);
                    shapeSpec.logicalId = candidate;
                    break;
                }
            }
        }
        if (node.fillColor.length > 0) {
            shapeSpec.style.fillColor = node.fillColor;
        }
        for (const dy of node.dividers) {
            shapeSpec.dividers.push(transform.length(dy));
        }
        const added = addShape(core, pageId, shapeSpec);
        nodeToShape.set(node.id, added);
    }

    for (let edgeIndex = 0; edgeIndex < diagram.edges.length; edgeIndex++) {
        const edge = diagram.edges[edgeIndex]!;
        const source = nodeToShape.get(edge.from);
        const target = nodeToShape.get(edge.to);
        if (source === undefined || target === undefined) continue;
        const connector: ConnectorSpec = {
            logicalId: 'edge-' + (edgeIndex + 1),
            source,
            target,
            text: edge.label,
            waypoints: edge.waypoints.map((p) => transform.point(p.x, p.y)),
            style: edge.style,
            arrowHead: edge.arrowHead,
            arrowTail: edge.arrowTail,
            fromMultiplicity: edge.fromMultiplicity,
            toMultiplicity: edge.toMultiplicity,
        };
        addConnector(core, pageId, connector);
    }
}

// ═══════════════════════════════════════════════════════
// 组装原语：页面/形状/连接线
// ═══════════════════════════════════════════════════════

function addPage(core: DocumentCore, spec: PageSpec): number {
    if (!Number.isFinite(spec.width) || !Number.isFinite(spec.height) ||
        spec.width <= 0 || spec.height <= 0) {
        throw new TypeError('VSDX page dimensions must be finite and positive');
    }

    const page: PageModel = defaultPageModel();
    page.id = core.nextPageId++;
    page.name = core.uniquePageName(spec.name);
    page.width = spec.width;
    page.height = spec.height;
    page.document = core;
    page.partUri = core.nextPagePartUri();
    page.root = createPageXml();
    page.shapesNode = directChild(page.root, 'Shapes');
    if (!page.shapesNode) throw new Error('[vsdxdoc] createPageXml 未含 Shapes 容器');
    page.connectsNode = null; // 惰性创建（有连接线时）

    const filename = page.partUri.string().slice(page.partUri.string().lastIndexOf('/') + 1);
    // 页面关系部件：core 侧占位表维护 + 每次 addPage 即时写包（C++ 语义）
    const relsUri = PartUri.parse(kPagesUri);
    const current = core.package.relationships(relsUri);
    page.relationshipId = current.add(kPageRelationship, filename);
    core.package.setRelationships(
        Relationships.parse(current.serialize(), relsUri));

    core.package.addPart(page.partUri, kPageContentType,
        Buffer.from(serializeDocument(page.root), 'utf8'));
    addPageMetadata(core, page);
    core.pages.push(page);
    core.pagesXmlDirty = true;
    core.pagesRelsDirty = true;
    core.markPageDirty(page.id);
    return page.id;
}

function addShape(core: DocumentCore, pageId: number, spec: ShapeSpec): number {
    const page = core.page(pageId);
    validateShapeBounds(spec.x, spec.y, spec.width, spec.height);
    validateStyle(spec.style);

    const id = page.nextShapeId++;
    const logicalId = spec.logicalId.length === 0
        ? 'shape-' + id
        : spec.logicalId;
    if (logicalIdExists(page, logicalId)) {
        throw new TypeError('Duplicate VSDX logical shape ID: ' + logicalId);
    }

    const node = appendChild(page.shapesNode!, makeElement('Shape'));
    setAttribute(node, 'ID', String(id));
    setAttribute(node, 'Type', 'Shape');
    setAttribute(node, 'NameU', 'Mermaid Shape');
    setAttribute(node, 'Name', 'Mermaid Shape');
    setAttribute(node, 'LineStyle', '3');
    setAttribute(node, 'FillStyle', '3');
    setAttribute(node, 'TextStyle', '3');

    const data: ShapeModel = defaultShapeModel();
    data.id = id;
    data.logicalId = logicalId;
    data.text = spec.text;
    data.kind = spec.kind;
    data.x = spec.x;
    data.y = spec.y;
    data.width = spec.width;
    data.height = spec.height;
    data.style = spec.style;
    data.dividers = spec.dividers;
    data.managed = true;
    data.nodeRef = node;
    page.shapes.set(id, data);
    renderManagedShape(page, data, core.masterClient);
    core.needsRecalculation = true;
    core.markPageDirty(pageId);
    return id;
}

function addConnector(core: DocumentCore, pageId: number, spec: ConnectorSpec): void {
    const page = core.page(pageId);
    if (!page.shapes.has(spec.source) || !page.shapes.has(spec.target)) {
        throw new TypeError('Connector endpoint shape does not exist');
    }
    const id = page.nextShapeId++;
    const logicalId = spec.logicalId.length === 0
        ? 'connector-' + id
        : spec.logicalId;
    if (logicalIdExists(page, logicalId)) {
        throw new TypeError('Duplicate VSDX logical connector ID: ' + logicalId);
    }
    if (!page.connectsNode) {
        // 页面级 <Connects> 惰性创建（跟在 Shapes 之后）
        page.connectsNode = appendChild(page.root!, makeElement('Connects'));
    }

    const node = appendChild(page.shapesNode!, makeElement('Shape'));
    setAttribute(node, 'ID', String(id));
    setAttribute(node, 'NameU', 'Dynamic connector');
    setAttribute(node, 'Name', 'Dynamic connector');
    setAttribute(node, 'Type', 'Shape');
    // 连接线母版选择（C++ diagramimporter.cpp:361-388）：ER→Relationship、
    // sequence 虚线→Return Message.22/实线→Message.21、其余 Dynamic connector
    // （小写先试、大写兜底）；masterId 命中才写 Master 并同步 NameU/Name。
    if (core.options.useConnectorMaster) {
        const isER = core.options.diagramType === 'er';
        const isSequence = core.options.diagramType === 'sequence';
        let masterId = 0;
        if (isER) {
            masterId = core.masterClient.masterIdFor('Relationship');
            if (masterId !== 0) {
                setAttribute(node, 'NameU', 'Relationship');
                setAttribute(node, 'Name', 'Relationship');
            }
        } else if (isSequence) {
            const msgMaster = spec.style === 'dotted'
                ? 'Return Message.22' : 'Message.21';
            masterId = core.masterClient.masterIdFor(msgMaster);
            if (masterId !== 0) {
                setAttribute(node, 'NameU', msgMaster);
                setAttribute(node, 'Name', msgMaster);
            }
        }
        if (masterId === 0) masterId = core.masterClient.masterIdFor('Dynamic connector');
        if (masterId === 0) masterId = core.masterClient.masterIdFor('Dynamic Connector');
        if (masterId !== 0) setAttribute(node, 'Master', String(masterId));
    }

    const data: ConnectorModel = defaultConnectorModel();
    data.id = id;
    data.logicalId = logicalId;
    data.text = spec.text;
    data.source = spec.source;
    data.target = spec.target;
    data.waypoints = spec.waypoints;
    data.style = spec.style;
    data.arrowHead = spec.arrowHead;
    data.arrowTail = spec.arrowTail;
    data.fromMultiplicity = spec.fromMultiplicity;
    data.toMultiplicity = spec.toMultiplicity;
    data.managed = true;
    data.nodeRef = node;
    const beginConnect = appendChild(page.connectsNode!, makeElement('Connect'));
    const endConnect = appendChild(page.connectsNode!, makeElement('Connect'));
    data.beginConnectRef = beginConnect;
    data.endConnectRef = endConnect;
    page.connectors.set(id, data);
    renderManagedConnector(page, data, core.masterClient);
    core.needsRecalculation = true;
    core.markPageDirty(pageId);
}

// ═══════════════════════════════════════════════════════
// 门面：Diagram → DocumentCore（三步编排）
// ═══════════════════════════════════════════════════════

export function translate(diagram: Diagram, options?: Partial<CreateOptions>): DocumentCore {
    const base = defaultCreateOptions();
    const merged: CreateOptions = {
        ...base,
        ...options,
        // 边距/outputScale/diagramType 显式字段合并
        marginLeft: options?.marginLeft ?? base.marginLeft,
        marginRight: options?.marginRight ?? base.marginRight,
        marginTop: options?.marginTop ?? base.marginTop,
        marginBottom: options?.marginBottom ?? base.marginBottom,
        outputScale: options?.outputScale ?? base.outputScale,
        diagramType: options?.diagramType ?? base.diagramType,
    };
    // 1. 纯翻译：类型解析 + 校验
    const resolved = resolveType(diagram, merged);
    // 2. 装配
    const core = assembleDocumentCore(diagram, resolved);
    // 3. 翻译+渲染
    buildPageContent(core, diagram, resolved);
    return core;
}
