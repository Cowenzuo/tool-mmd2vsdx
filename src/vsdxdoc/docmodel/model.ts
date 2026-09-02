// mmd2vsdx - vsdxdoc/docmodel：model（纯数据模型）
//
// C++ docmodel/model.hpp 平移（v2 B3 去指针设计 + TS 化 05 §1.3）。
// TS 差异（去指针红利）：
//   - C++ xmlNodePtr 句柄与页面级索引（shapeNodes/connectorNodes/
//     connectorConnects）是为"树外修改后按 id 刷新"服务；TS 中节点是
//     live 对象引用 → ShapeModel.nodeRef / ConnectorModel.begin/endConnectRef
//     直接持引用，"模型↔树对应"显式可查；
//   - 页面 = 树的容器：PageModel 持有自己页面文档树的根/Shapes/Connects 引用。

import type { XmlNode } from '../../xml/xmlNode.js';
import type { PartUri } from '../../opcpkg/partUri.js';
import type {
    ArrowType,
    EdgeStyle,
    NodeShape,
    Point,
} from '../../core/types.js';
import type { ShapeStyle } from '../../core/vsdx.js';
import type { DocumentCore } from './documentCore.js';

export type PageId = number;
export type ShapeId = number;

// ── 形状内部模型（纯数据） ──

export interface ShapeModel {
    id: ShapeId;
    logicalId: string;
    text: string;
    kind: NodeShape;
    x: number;
    y: number;
    width: number;
    height: number;
    style: ShapeStyle;
    /** 提取层"特殊形状"（managed 渲染路径）。 */
    managed: boolean;
    /** 母版标识（渲染层经 MasterLibrary.masterIdFor 查数字 Master ID；空=无母版）。 */
    masterId: string;
    /** 类图分区线（相对中心的本地 y 偏移）。 */
    dividers: number[];
    /** 渲染时填写的 XML 节点引用（模型↔树对应）。 */
    nodeRef: XmlNode | null;
}

export function defaultShapeModel(): ShapeModel {
    return {
        id: 0,
        logicalId: '',
        text: '',
        kind: 'rect',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        style: { fillColor: '#FFFFFF', lineColor: '#000000', textColor: '#000000', lineWidthPoints: 0.5, fontSizePoints: 12 },
        managed: false,
        masterId: '',
        dividers: [],
        nodeRef: null,
    };
}

// ── 连接线内部模型（纯数据） ──

export interface ConnectorModel {
    id: ShapeId;
    logicalId: string;
    text: string;
    source: ShapeId;
    target: ShapeId;
    waypoints: Point[];
    style: EdgeStyle;
    arrowHead: ArrowType;
    arrowTail: ArrowType;
    /** ER 关系起点基数（mermaid marker 名）。 */
    fromMultiplicity: string;
    /** ER 关系终点基数。 */
    toMultiplicity: string;
    managed: boolean;
    /** 连接线形状 XML 节点引用。 */
    nodeRef: XmlNode | null;
    /** 页面 <Connects> 中 BeginX/EndX 两条记录节点引用。 */
    beginConnectRef: XmlNode | null;
    endConnectRef: XmlNode | null;
}

export function defaultConnectorModel(): ConnectorModel {
    return {
        id: 0,
        logicalId: '',
        text: '',
        source: 0,
        target: 0,
        waypoints: [],
        style: 'normal',
        arrowHead: 'arrow',
        arrowTail: 'none',
        fromMultiplicity: '',
        toMultiplicity: '',
        managed: false,
        nodeRef: null,
        beginConnectRef: null,
        endConnectRef: null,
    };
}

// ── 页面内部模型（页面 = 树的容器） ──

export interface PageModel {
    id: PageId;
    name: string;
    width: number;
    height: number;
    partUri: PartUri;
    relationshipId: string;
    /** 页面文档树根元素（<PageContents>）。 */
    root: XmlNode | null;
    /** 树内 <Shapes> 元素引用（惰性创建）。 */
    shapesNode: XmlNode | null;
    /** 树内 <Connects> 元素引用（惰性创建，页面级）。 */
    connectsNode: XmlNode | null;
    nextShapeId: ShapeId;
    shapes: Map<ShapeId, ShapeModel>;
    connectors: Map<ShapeId, ConnectorModel>;
    /** 反向引用（DocumentCore；母版查询等用）。 */
    document: DocumentCore | null;
}

export function defaultPageModel(): PageModel {
    return {
        id: 0,
        name: '',
        width: 0,
        height: 0,
        partUri: null as unknown as PartUri,
        relationshipId: '',
        root: null,
        shapesNode: null,
        connectsNode: null,
        nextShapeId: 1,
        shapes: new Map(),
        connectors: new Map(),
        document: null,
    };
}

/** 页内形状/连接线 ID 是否已占用（C++ logicalIdExists 语义按 id 查）。 */
export function shapeExists(page: PageModel, id: ShapeId): boolean {
    return page.shapes.has(id) || page.connectors.has(id);
}
