// mmd2vsdx - core 数据层：vsdx（VSDX 文档语义契约）
//
// C++ core/vsdx.hpp 平移：ID 别名、ShapeStyle、CreateOptions、PageSpec/ShapeSpec/
// ConnectorSpec（vsdxdoc 门面输入规格）。DiagramType 定义在 types.ts。

import type { ArrowType, DiagramType, EdgeStyle, NodeShape, Point } from './types.js';

// ── ID 别名（对应 C++ uint32；TS 以 number 承载，无运行时断言） ──

export type PageId = number;
export type ShapeId = number;

// ── 样式值类型 ──

export interface ShapeStyle {
    fillColor: string;
    lineColor: string;
    textColor: string;
    lineWidthPoints: number;
    fontSizePoints: number;
}

// ── 配置 / 规格（vsdxdoc 门面输入） ──

export interface CreateOptions {
    outputScale: number;
    marginLeft: number;
    marginRight: number;
    marginTop: number;
    marginBottom: number;
    /**
     * Connectors 以 Dynamic connector 母版实例输出（Master="N" + masters part）。
     * Visio 只为携带 Dynamic connector 母版身份的形状提供线型切换 UI
     * （straight/curved/right-angle），纯本地 1-D 连接线会失去该 UI。
     * 2D 形状同样引用母版。禁用时不打包任何母版，形状回退本地几何。
     */
    useConnectorMaster: boolean;
    /** 图型选择内置官方模具及其母版子集；'auto' 由第一个 Diagram 的 diagramType 推导。 */
    diagramType: DiagramType;
}

export interface PageSpec {
    name: string;
    width: number;
    height: number;
}

export interface ShapeSpec {
    logicalId: string;
    text: string;
    kind: NodeShape;
    x: number;
    y: number;
    width: number;
    height: number;
    style: ShapeStyle;
    /** 类图分区线：相对节点中心的 y 偏移（SVG y-down，页面单位）。空=普通节点。 */
    dividers: number[];
}

export interface ConnectorSpec {
    logicalId: string;
    source: ShapeId;
    target: ShapeId;
    text: string;
    waypoints: Point[];
    style: EdgeStyle;
    arrowHead: ArrowType;
    arrowTail: ArrowType;
    /** ER 关系多重性（mermaid marker 名），空=无标记。 */
    fromMultiplicity: string;
    toMultiplicity: string;
}

// ── 默认工厂（C++ 默认成员初始化 1:1 平移） ──

export function defaultShapeStyle(): ShapeStyle {
    return {
        fillColor: '#FFFFFF',
        lineColor: '#000000',
        textColor: '#000000',
        lineWidthPoints: 0.5,
        fontSizePoints: 12.0,
    };
}

export function defaultCreateOptions(): CreateOptions {
    return {
        outputScale: 1.0,
        marginLeft: 0.5,
        marginRight: 0.5,
        marginTop: 0.5,
        marginBottom: 0.5,
        useConnectorMaster: true,
        diagramType: 'auto',
    };
}

export function defaultPageSpec(): PageSpec {
    return { name: '', width: 8.5, height: 11.0 };
}

export function defaultShapeSpec(): ShapeSpec {
    return {
        logicalId: '',
        text: '',
        kind: 'rect',
        x: 0,
        y: 0,
        width: 1,
        height: 0.5,
        style: defaultShapeStyle(),
        dividers: [],
    };
}

export function defaultConnectorSpec(): ConnectorSpec {
    return {
        logicalId: '',
        source: 0,
        target: 0,
        text: '',
        waypoints: [],
        style: 'normal',
        arrowHead: 'arrow',
        arrowTail: 'none',
        fromMultiplicity: '',
        toMultiplicity: '',
    };
}

/** waypoints 简写（对照 C++ 容器初始化习惯）。 */
export function waypoints(points: Array<[number, number]>): Point[] {
    return points.map(([x, y]) => ({ x, y }));
}
