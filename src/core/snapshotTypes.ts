// mmd2vsdx - core 数据层：snapshotTypes（提取层 JSON 协议类型）
//
// snapshot（原 mermaid-snapshot extract）返回 JSON 的编译期类型（TS-105）。
// 字段名以实测为准（main.mjs 顶层结构 + jsonparser.cpp 逐键消费清单核对）：
// 提取层=宽松产出（类型化仅声明结构），转换层 jsonToDiagram=收紧收编（M2）。
// 注意：JSON 协议使用 camelCase；枚举值即本协议值（shape/style/arrowHead/arrowTail）。

import type {
    ArrowType,
    EdgeStyle,
    NodeShape,
    Point,
} from './types.js';

export interface SnapshotBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface SnapshotNode {
    id: string;
    label: string;
    shape: NodeShape;
    x: number;
    y: number;
    width: number;
    height: number;
    styleClass: string;
    /** 实测：node-based 提取常不产出该键（classDef 填充时才有）。 */
    fillColor?: string;
    parentId: string;
    /** 时序图生命线（actor/object）才有。 */
    lifelineKind?: string;
    /** 类图分区线才有。 */
    dividers?: number[];
}

export interface SnapshotEdge {
    from: string;
    to: string;
    label: string;
    style: EdgeStyle;
    arrowHead: ArrowType;
    arrowTail: ArrowType;
    waypoints?: Point[];
    /** ER 关系多重性（mermaid marker 名）。 */
    fromMultiplicity?: string;
    toMultiplicity?: string;
}

export interface SnapshotCluster {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

// gantt（parseGantt 文本解析产出）
export interface SnapshotGanttTask {
    name: string;
    section: string;
    startSerial: number;
    duration: number;
    milestone: boolean;
    /**
     * 提取层预计算的 after 标记；jsonToDiagram 有意丢弃（C++ 行为，勿加回，
     * 见坑位 3.3——渲染器按 dependsOn 重算真实日期）。
     */
    isAfter?: boolean;
    dependsOn: string[];
}

export interface SnapshotGantt {
    title: string;
    dateFormat: string;
    startSerial: number;
    endSerial: number;
    sections: string[];
    tasks: SnapshotGanttTask[];
    bounds?: SnapshotBounds;
}

// gitGraph（extractGitGraph 产出）
export interface SnapshotGitCommit {
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

export interface SnapshotGitBranch {
    name: string;
    index: number;
    y: number;
    x1: number;
    x2: number;
    color: string;
}

export interface SnapshotGitArrow {
    from: string;
    to: string;
    kind: string;
    branchIndex: number;
    waypoints: Point[];
}

export interface SnapshotGit {
    commits: SnapshotGitCommit[];
    branches: SnapshotGitBranch[];
    arrows: SnapshotGitArrow[];
    bounds?: SnapshotBounds;
}

// pie（extractPie 产出）
export interface SnapshotPieSlice {
    label: string;
    value: number;
    color: string;
}

export interface SnapshotPie {
    title: string;
    cx: number;
    cy: number;
    r: number;
    slices: SnapshotPieSlice[];
    bounds?: SnapshotBounds;
}

// quadrantChart（extractQuadrant 产出）
export interface SnapshotQuadrantPoint {
    label: string;
    cx: number;
    cy: number;
}

export interface SnapshotQuadrant {
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
    points: SnapshotQuadrantPoint[];
    bounds?: SnapshotBounds;
}

// sequenceDiagram（extractSequence 产出）
export interface SnapshotActivationBar {
    actorId: string;
    x: number;
    yTop: number;
    yBottom: number;
    width: number;
}

export interface SnapshotLoopFragment {
    kind: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SnapshotSequence {
    activations: SnapshotActivationBar[];
    fragments: SnapshotLoopFragment[];
}

/** snapshot /convert 的完整成功载荷（main.mjs makeExtractFn 返回结构）。 */
export interface SnapshotResult {
    svg: string;
    nodes: SnapshotNode[];
    edges: SnapshotEdge[];
    clusters: SnapshotCluster[];
    /** 图类型（已去 -v2/-beta），如 flowchart/gitGraph/quadrantChart。 */
    diagramType: string;
    /** 推断方向：TB/LR。 */
    direction: string;
    boundingBox: SnapshotBounds;
    gantt: SnapshotGantt | null;
    git: SnapshotGit | null;
    pie: SnapshotPie | null;
    quadrant: SnapshotQuadrant | null;
    sequence: SnapshotSequence | null;
}
