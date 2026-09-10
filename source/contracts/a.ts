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

/** 契约 A 支持的图型。timeline/xy 暂走通用骨架兜底表现。 */
export const kDiagramKinds = [
    'flowchart',
    'state',
    'c4',
    'block',
    'class',
    'er',
    'gantt',
    'sequence',
    'git',
    'pie',
    'quadrant',
    'mindmap',
    'timeline',
    'xy',
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
}

export type ClassRelationKind = 'dependency' | 'inheritance' | 'realization';

export interface ClassRelation {
    from: string;
    to: string;
    label: string;
    kind: ClassRelationKind;
}

export interface ClassModel {
    classes: ClassBox[];
    relations: ClassRelation[];
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
}

export interface ErModel {
    entities: ErEntity[];
    relations: ErRelation[];
}

// ── gantt 扩展块 ──

export interface GanttTask {
    name: string;
    /** 所属 section，空=无。 */
    section: string;
    /** Excel 序列日期（1899-12-30=0）。 */
    startSerial: number;
    /** 天数。 */
    duration: number;
    /** 0 时长 = 里程碑。 */
    milestone: boolean;
    dependsOn: string[];
}

export interface GanttModel {
    title: string;
    dateFormat: string;
    startSerial: number;
    endSerial: number;
    sections: string[];
    tasks: GanttTask[];
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
    | 'optend';

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

export interface SeqFragment {
    /** loop/alt/opt 等。 */
    kind: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SequenceModel {
    actors: SeqActor[];
    messages: SeqMessage[];
    activations: SeqActivation[];
    fragments: SeqFragment[];
}

// ── git 扩展块 ──

export interface GitCommit {
    id: string;
    label: string;
    tag: string;
    branchIndex: number;
    x: number;
    y: number;
    r: number;
    merge: boolean;
    highlight: boolean;
    reverse: boolean;
}

export interface GitBranch {
    name: string;
    index: number;
    y: number;
    x1: number;
    x2: number;
    color: string;
}

export interface GitArrow {
    from: string;
    to: string;
    kind: string;
    branchIndex: number;
    waypoints: Point[];
}

export interface GitGraph {
    commits: GitCommit[];
    branches: GitBranch[];
    arrows: GitArrow[];
}

// ── pie / quadrant / mindmap 扩展块 ──

export interface PieSlice {
    label: string;
    value: number;
    color: string;
}

export interface PieChart {
    title: string;
    cx: number;
    cy: number;
    r: number;
    slices: PieSlice[];
}

export interface QuadrantPoint {
    label: string;
    cx: number;
    cy: number;
}

export interface QuadrantChart {
    title: string;
    xLabelLow: string;
    xLabelHigh: string;
    yLabelLow: string;
    yLabelHigh: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    crossX: number;
    crossY: number;
    points: QuadrantPoint[];
}

export interface MindNode {
    id: string;
    label: string;
    parentId: string;
    depth: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MindmapModel {
    rootId: string;
    nodes: MindNode[];
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
    gantt?: GanttModel;
    sequence?: SequenceModel;
    git?: GitGraph;
    pie?: PieChart;
    quadrant?: QuadrantChart;
    mindmap?: MindmapModel;
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

export function isGanttEmpty(g: GanttModel): boolean {
    return g.tasks.length === 0;
}

export function isGitEmpty(g: GitGraph): boolean {
    return g.commits.length === 0;
}

export function isPieEmpty(p: PieChart): boolean {
    return p.slices.length === 0;
}

export function isQuadrantEmpty(q: QuadrantChart): boolean {
    return q.points.length === 0;
}

export function isSequenceEmpty(s: SequenceModel): boolean {
    return s.actors.length === 0 && s.messages.length === 0;
}
