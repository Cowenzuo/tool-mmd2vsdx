// mmd2vsdx - core 数据层：types（IR 图语义域）
//
// C++ core/base.hpp + core/ir.hpp 平移（TS 化设计：04 文档 §1）。
// 约定：
//   - C++ struct → TS interface；所有聚合类型配 defaultX() 工厂（默认值双保险：
//     构造处 defaultX()、消费处 {...defaultX(), ...raw} 合并兜底）；
//   - C++ 枚举 → 字符串字面量联合，值即 snapshot JSON 协议值
//     （shape/style/arrow 与 jsonparser.cpp 映射表一致，映射层因此消失）；
//   - 纯数据：不携带方法；语义谓词以独立函数导出（对应 C++ empty() 等）。

// ── 几何（base.hpp） ──

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

/** 对应 C++ BoundingBox::width()。 */
export function boundsWidth(b: BoundingBox): number {
    return b.maxX - b.minX;
}

/** 对应 C++ BoundingBox::height()。 */
export function boundsHeight(b: BoundingBox): number {
    return b.maxY - b.minY;
}

// ── 图元素语义枚举（ir.hpp，JSON 协议值） ──

/** C++ NodeShape：rect/roundRect/diamond/circle/ellipse。 */
export type NodeShape = 'rect' | 'roundRect' | 'diamond' | 'circle' | 'ellipse';

/** C++ EdgeStyle：normal/dotted/thick。 */
export type EdgeStyle = 'normal' | 'dotted' | 'thick';

/** C++ ArrowType：none/arrow/circle/openarrow。 */
export type ArrowType = 'none' | 'arrow' | 'circle' | 'openarrow';

/**
 * C++ DiagramType（枚举序 Auto..Mindmap = 0..10，此数组保持该序供对照与
 * 母版映射表使用；'auto' 时由 Diagram::diagramType 自动推导）。
 */
export const kDiagramTypeOrder = [
    'auto',
    'basic',
    'flowchart',
    'class',
    'sequence',
    'er',
    'gantt',
    'timeline',
    'calendar',
    'git',
    'mindmap',
] as const;

export type DiagramType = (typeof kDiagramTypeOrder)[number];

// ── 图数据结构（ir.hpp） ──

export interface Node {
    id: string;
    label: string;
    shape: NodeShape; // A[text] rect / A(text) roundRect / A{text} diamond / A((text)) circle / ellipse
    x: number; // 布局后的真实中心坐标
    y: number;
    width: number;
    height: number;
    styleClass: string; // classDef 对应的类名
    fillColor: string; // 填充色（#rrggbb，空=默认白）
    parentId: string; // 子图父节点 ID，空串=顶层
    lifelineKind: string; // 时序图生命线类型："actor"/"object"，空=非生命线
    dividers: number[]; // 类图分区线相对中心的 y 偏移（SVG 向下为正），空=普通节点
}

export interface Edge {
    from: string;
    to: string;
    label: string;
    style: EdgeStyle;
    arrowHead: ArrowType;
    arrowTail: ArrowType;
    waypoints: Point[]; // 贝塞尔曲线采样点
    // ER 关系多重性（mermaid marker 名）：ONLY_ONE / ZERO_OR_ONE /
    // ONE_OR_MORE / ZERO_OR_MORE。空=无标记。
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

// ── gantt 语义（仅 diagramType=gantt 时有效） ──

export interface GanttTask {
    name: string;
    section: string; // 所属 section，空=无
    startSerial: number; // Excel 序列日期（1899-12-30=0）
    duration: number; // 天数
    milestone: boolean; // 0 时长 = 里程碑
    dependsOn: string[]; // 依赖任务名（链接线用）
}

export interface GanttChart {
    title: string;
    dateFormat: string;
    startSerial: number; // 图表最早开始日期
    endSerial: number; // 图表最晚结束日期
    sections: string[];
    tasks: GanttTask[];
}

// ── git 语义（仅 diagramType=gitGraph 时有效） ──

export interface GitCommit {
    id: string; // commit 标识（标签文本或 class token）
    label: string; // commit 标签（merge/cherry-pick commit 可为空）
    tag: string; // tag 标签（tag-label，可空）
    branchIndex: number; // 所属分支索引（commit0/commit1...）
    x: number; // 圆点中心（SVG 像素）
    y: number;
    r: number; // 圆点半径
    merge: boolean; // merge commit（双圈）
    highlight: boolean; // HIGHLIGHT 类型（深色高亮）
    reverse: boolean; // cherry-pick（REVERSE，浅描边）
}

export interface GitBranch {
    name: string; // 分支名（main / dev）
    index: number; // branch0/branch1...
    y: number; // 分支线 y
    x1: number; // 分支线 x 范围
    x2: number;
    color: string; // 分支色（#rrggbb）
}

export interface GitArrow {
    from: string; // 起点 commit id
    to: string; // 终点 commit id
    kind: string; // seq（同分支推进）/ branch（分支创建）/ merge（合并）
    branchIndex: number; // 线色分支索引
    waypoints: Point[]; // 路径采样点（含弧线近似）
}

export interface GitGraph {
    commits: GitCommit[];
    branches: GitBranch[];
    arrows: GitArrow[];
}

// ── pie 语义（仅 diagramType=pie 时有效） ──

export interface PieSlice {
    label: string; // 数据项名称
    value: number; // 数值
    color: string; // 扇区颜色（#rrggbb，提取自 SVG fill）
}

export interface PieChart {
    title: string;
    cx: number; // 圆心（SVG 像素）
    cy: number;
    r: number; // 半径
    slices: PieSlice[];
}

// ── quadrant 语义（仅 diagramType=quadrantChart 时有效） ──

export interface QuadrantPoint {
    label: string;
    cx: number; // 圆心（SVG 像素）
    cy: number;
}

export interface QuadrantChart {
    title: string;
    xLabelLow: string;
    xLabelHigh: string;
    yLabelLow: string;
    yLabelHigh: string;
    minX: number; // 画布范围
    minY: number;
    maxX: number;
    maxY: number;
    crossX: number; // 十字线位置
    crossY: number;
    points: QuadrantPoint[];
}

// ── sequence 语义（仅 diagramType=sequenceDiagram 时有效） ──

export interface ActivationBar {
    actorId: string; // 所属 lifeline（actor id）
    x: number; // 中心 X（SVG 像素）
    yTop: number; // 顶 Y（SVG 像素）
    yBottom: number; // 底 Y（SVG 像素）
    width: number; // 条宽（SVG 像素）
}

export interface LoopFragment {
    kind: string; // loop/alt/opt 片段类型
    label: string; // 片段条件文本（如 [HealthCheck]）
    x: number; // 左上角（SVG 像素）
    y: number;
    width: number;
    height: number;
}

export interface SequenceData {
    activations: ActivationBar[];
    fragments: LoopFragment[];
}

// ── 总装 Diagram（ir.hpp） ──

export interface Diagram {
    nodes: Node[];
    edges: Edge[];
    clusters: Cluster[];
    diagramType: string;
    direction: string;
    bounds: BoundingBox;
    svg: string; // raw SVG from mermaid render
    gantt: GanttChart; // gantt 专用数据（非 gantt 时为空）
    git: GitGraph; // gitGraph 专用数据（非 gitGraph 时为空）
    pie: PieChart; // pie 专用数据（非 pie 时为空）
    quadrant: QuadrantChart; // quadrantChart 专用数据（非 quadrant 时为空）
    sequence: SequenceData; // sequence 专用数据（激活条/循环片段）
}

// ── 默认工厂（C++ 默认成员初始化 1:1 平移） ──

export function defaultNode(): Node {
    return {
        id: '',
        label: '',
        shape: 'rect',
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

export function defaultEdge(): Edge {
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

export function defaultGanttTask(): GanttTask {
    return { name: '', section: '', startSerial: 0, duration: 0, milestone: false, dependsOn: [] };
}

export function defaultGanttChart(): GanttChart {
    return { title: '', dateFormat: 'YYYY-MM-DD', startSerial: 0, endSerial: 0, sections: [], tasks: [] };
}

export function defaultGitCommit(): GitCommit {
    return { id: '', label: '', tag: '', branchIndex: 0, x: 0, y: 0, r: 10, merge: false, highlight: false, reverse: false };
}

export function defaultGitBranch(): GitBranch {
    return { name: '', index: 0, y: 0, x1: 0, x2: 0, color: '#000000' };
}

export function defaultGitArrow(): GitArrow {
    return { from: '', to: '', kind: 'seq', branchIndex: 0, waypoints: [] };
}

export function defaultGitGraph(): GitGraph {
    return { commits: [], branches: [], arrows: [] };
}

export function defaultPieSlice(): PieSlice {
    return { label: '', value: 0, color: '' };
}

export function defaultPieChart(): PieChart {
    return { title: '', cx: 0, cy: 0, r: 0, slices: [] };
}

export function defaultQuadrantPoint(): QuadrantPoint {
    return { label: '', cx: 0, cy: 0 };
}

export function defaultQuadrantChart(): QuadrantChart {
    return {
        title: '',
        xLabelLow: '',
        xLabelHigh: '',
        yLabelLow: '',
        yLabelHigh: '',
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        crossX: 0,
        crossY: 0,
        points: [],
    };
}

export function defaultActivationBar(): ActivationBar {
    return { actorId: '', x: 0, yTop: 0, yBottom: 0, width: 10 };
}

export function defaultLoopFragment(): LoopFragment {
    return { kind: 'loop', label: '', x: 0, y: 0, width: 0, height: 0 };
}

export function defaultSequenceData(): SequenceData {
    return { activations: [], fragments: [] };
}

export function defaultDiagram(): Diagram {
    return {
        nodes: [],
        edges: [],
        clusters: [],
        diagramType: '',
        direction: '',
        bounds: defaultBoundingBox(),
        svg: '',
        gantt: defaultGanttChart(),
        git: defaultGitGraph(),
        pie: defaultPieChart(),
        quadrant: defaultQuadrantChart(),
        sequence: defaultSequenceData(),
    };
}

// ── 语义谓词（对应 C++ 各结构 empty() 方法） ──

export function ganttIsEmpty(c: GanttChart): boolean {
    return c.tasks.length === 0;
}

export function gitGraphIsEmpty(g: GitGraph): boolean {
    return g.commits.length === 0;
}

export function pieIsEmpty(p: PieChart): boolean {
    return p.slices.length === 0;
}

export function quadrantIsEmpty(q: QuadrantChart): boolean {
    return q.points.length === 0;
}

export function sequenceIsEmpty(s: SequenceData): boolean {
    return s.activations.length === 0 && s.fragments.length === 0;
}
