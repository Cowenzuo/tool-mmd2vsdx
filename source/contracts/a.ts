// 契约 A：图型 json（docs/redesign/02-契约层/01-契约A-图型json.md）
//
// 纯数据层：不携带方法，语义谓词以独立函数导出。
// 类型即契约：parser 产出、diag 包消费，谁都不许改对方内部。

// ── 基础几何 ──

export interface Point {
    x: number;
    y: number;
}

export interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function defaultPoint(): Point {
    return { x: 0, y: 0 };
}

export function defaultBoundingBox(): BoundingBox {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export function boundsWidth(b: BoundingBox): number {
    return b.maxX - b.minX;
}

export function boundsHeight(b: BoundingBox): number {
    return b.maxY - b.minY;
}

// ── 图型枚举（值即 mermaid 语义，不借用旧实现枚举） ──

/** 契约 A 支持的图型（软件行业常用 Visio 格式，2026-09 收敛）。
 *  其它 mermaid 图型不再支持：解析层直接抛错，不做兜底降级。 */
export const kDiagramKinds = [
    'flowchart',
    'block',
    'class',
    'er',
    'sequence',
] as const;

export type DiagramKind = (typeof kDiagramKinds)[number];

export type NodeShapeKind = 'rect' | 'roundRect' | 'diamond' | 'circle' | 'ellipse';
export type EdgeStyleKind = 'normal' | 'dotted' | 'thick';
export type ArrowKind = 'none' | 'arrow' | 'circle' | 'openarrow';

// ── 通用骨架（扁平图类） ──

export interface Meta {
    title: string;
    direction: string;
    /** 整图像素边界（SVG 坐标，y 向下为正）。 */
    bounds: BoundingBox;
    /** 原始 mermaid 文本。 */
    sourceText: string;
}

export interface GenericShape {
    id: string;
    label: string;
    shapeKind: NodeShapeKind;
    /** 布局后的中心坐标（像素）。 */
    x: number;
    y: number;
    width: number;
    height: number;
    /** classDef 类名，空串=无。 */
    styleClass: string;
    /** 填充色，#rrggbb 或空。 */
    fillColor: string;
    /** 子图父节点 ID，空串=顶层。 */
    parentId: string;
    /** 时序图生命线类型：actor/object，空=非生命线。 */
    lifelineKind: string;
    /** 类图分区线相对中心的 y 偏移（像素，向下为正）。 */
    dividers: number[];
}

export interface GenericEdge {
    from: string;
    to: string;
    label: string;
    style: EdgeStyleKind;
    arrowHead: ArrowKind;
    arrowTail: ArrowKind;
    /** 走线采样点（像素）。 */
    waypoints: Point[];
    /** ER 关系多重性（mermaid marker 名），空=无。 */
    fromMultiplicity: string;
    toMultiplicity: string;
}

export interface Cluster {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

// ── class 扩展块 ──

export interface ClassMember {
    name: string;
    /** 可见性标记：+ - # ~，空=默认。 */
    visibility?: string;
}

export interface ClassBox {
    id: string;
    name: string;
    /** mermaid marker（<<person>> 等），原样保留。 */
    stereotypes: string[];
    attributes: ClassMember[];
    operations: ClassMember[];
    /** mmd 布局（保比例）：中心 + 盒尺寸（px）；行高不一致，仅用于相对位置。 */
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export interface ClassLayoutItem {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ClassRelationKind = 'dependency' | 'inheritance' | 'realization' | 'aggregation' | 'composition' | 'association' | 'unsupported';

export interface ClassRelation {
    from: string;
    to: string;
    label: string;
    kind: ClassRelationKind;
    /** mmd 边选择（left/right/top/bottom）：渲染端取盒边中点连接；缺则按轴优选取边。 */
    fromEdge?: string;
    toEdge?: string;
}

export interface ClassModel {
    classes: ClassBox[];
    relations: ClassRelation[];
    /** mmd 布局全集（类名 → 中心/尺寸），缺失则不启用比例布局。 */
    layout?: Record<string, ClassLayoutItem>;
}

// ── er 扩展块 ──

export interface ErAttribute {
    name: string;
    type: string;
    primaryKey: boolean;
    foreignKey: boolean;
    required: boolean;
}

export interface ErEntity {
    id: string;
    name: string;
    attributes: ErAttribute[];
}

export interface ErRelation {
    from: string;
    to: string;
    label: string;
    multiplicityFrom: string;
    multiplicityTo: string;
    identifying: boolean;
    /** mmd 边选择（left/right/top/bottom）：渲染端取盒边中点连接；缺则按轴优选取边。 */
    fromEdge?: string;
    toEdge?: string;
}

export interface ErModel {
    entities: ErEntity[];
    relations: ErRelation[];
    /** mmd 布局全集（实体名 → 中心/尺寸），缺失则不启用比例布局。 */
    layout?: Record<string, { x: number; y: number; width: number; height: number }>;
}

// ── sequence 扩展块 ──

export interface SeqActor {
    id: string;
    label: string;
    kind: 'object' | 'actor';
    /** 生命线中心 X（像素）。 */
    x: number;
}

export type MessageKind =
    | 'sync'
    | 'return'
    | 'self'
    | 'async'
    | 'note'
    | 'activate'
    | 'deactivate'
    | 'loop'
    | 'loopend'
    | 'alt'
    | 'altelse'
    | 'altend'
    | 'opt'
    | 'optend'
    | 'par'
    | 'parelse'
    | 'parend'
    | 'critical'
    | 'criticalelse'
    | 'criticalend'
    | 'break'
    | 'breakend'
    | 'rect'
    | 'rectend';

export interface SeqMessage {
    from: string;
    to: string;
    label: string;
    kind: MessageKind;
}

export interface SeqActivation {
    actorId: string;
    /** 中心 X（像素）。 */
    x: number;
    yTop: number;
    yBottom: number;
    width: number;
}

/** 片段内的分支（alt/else、par/and、critical/option）：分支标签 + 起止行（像素 y）。 */
export interface SeqOperand {
    label: string;
    /** 分支起始行 y（alt/else 标记行）。 */
    yTop: number;
    /** 分支结束行 y（下一条 else / 片段 end 标记行）。 */
    yBottom: number;
}

export interface SeqFragment {
    /** loop/alt/opt/par/critical/break 等。 */
    kind: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** 多分支片段（alt/par/critical）的分支列表；单分支片段为空。 */
    operands?: SeqOperand[];
}

export interface SequenceModel {
    actors: SeqActor[];
    messages: SeqMessage[];
    activations: SeqActivation[];
    fragments: SeqFragment[];
}

// ── 总装 ──

export interface ContractA {
    kind: DiagramKind;
    meta: Meta;
    shapes: GenericShape[];
    edges: GenericEdge[];
    clusters: Cluster[];
    classModel?: ClassModel;
    erModel?: ErModel;
    sequence?: SequenceModel;
}

// ── 默认工厂 ──

export function defaultMeta(): Meta {
    return { title: '', direction: '', bounds: defaultBoundingBox(), sourceText: '' };
}

export function defaultGenericShape(): GenericShape {
    return {
        id: '',
        label: '',
        shapeKind: 'rect',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        styleClass: '',
        fillColor: '',
        parentId: '',
        lifelineKind: '',
        dividers: [],
    };
}

export function defaultGenericEdge(): GenericEdge {
    return {
        from: '',
        to: '',
        label: '',
        style: 'normal',
        arrowHead: 'arrow',
        arrowTail: 'none',
        waypoints: [],
        fromMultiplicity: '',
        toMultiplicity: '',
    };
}

export function defaultCluster(): Cluster {
    return { id: '', label: '', x: 0, y: 0, width: 0, height: 0 };
}

export function defaultContractA(): ContractA {
    return {
        kind: 'flowchart',
        meta: defaultMeta(),
        shapes: [],
        edges: [],
        clusters: [],
    };
}

// ── 语义谓词 ──

export function isSequenceEmpty(s: SequenceModel): boolean {
    return s.actors.length === 0 && s.messages.length === 0;
}
