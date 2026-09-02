// mmd2vsdx - mmdtransform：jsonToDiagram（snapshot JSON → Diagram）
//
// C++ mmdtransform/jsonparser.cpp 平移（坑位 ③ 全组）。语义逐条照抄：
//   - 顶层 status 必须 "ok"，否则抛 MmdError(MermaidError, message ?? "unknown error")；
//   - 枚举映射表 + 未知值回退默认（shape→rect、style→normal、arrow→none）；
//   - 全部字段 value(key, default) 兜底；缺字段/非数组/非对象 → 跳过或兜底
//     （宽松读，提取层产出我方收紧在 jsonToDiagram 收编）；
//   - 专用子结构 gantt/git/pie/quadrant/sequence 各自 is_object 才解析；
//     gantt 任务的 isAfter 有意丢弃（渲染器按 dependsOn 重算，勿加回）；
//   - 与 C++ 差异：nlohmann 类型不匹配抛 type_error——TS 侧等价处理为
//     类型不符即走兜底/跳过（提取层输出类型恒定，实际不可达，注释留痕）。

import {
    defaultDiagram,
    defaultEdge,
    defaultNode,
    defaultGanttChart,
    defaultGitGraph,
    defaultPieChart,
    defaultQuadrantChart,
    defaultSequenceData,
} from '../core/types.js';
import type { Diagram, NodeShape, EdgeStyle, ArrowType, Point } from '../core/types.js';
import { MmdError, MmdErrorCode } from '../core/errors.js';

// ── 守卫助手（宽松读） ──

function asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

function num(rec: Record<string, unknown>, key: string, fallback: number): number {
    const v = rec[key];
    return typeof v === 'number' ? v : fallback;
}

function str(rec: Record<string, unknown>, key: string, fallback: string): string {
    const v = rec[key];
    return typeof v === 'string' ? v : fallback;
}

function bool(rec: Record<string, unknown>, key: string, fallback: boolean): boolean {
    const v = rec[key];
    return typeof v === 'boolean' ? v : fallback;
}

function numArray(rec: Record<string, unknown>, key: string): number[] {
    const v = rec[key];
    if (!Array.isArray(v)) return [];
    return v.filter((e): e is number => typeof e === 'number');
}

function stringArray(rec: Record<string, unknown>, key: string): string[] {
    const v = rec[key];
    if (!Array.isArray(v)) return [];
    return v.filter((e): e is string => typeof e === 'string');
}

function points(value: unknown): Point[] {
    if (!Array.isArray(value)) return [];
    const result: Point[] = [];
    for (const item of value) {
        const p = asRecord(item);
        if (p) result.push({ x: num(p, 'x', 0), y: num(p, 'y', 0) });
    }
    return result;
}

function entries(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    return value.filter((e): e is Record<string, unknown> => asRecord(e) !== null);
}

// ── 枚举映射（未知 → 默认，坑位 ③-3.2：union 不能直接 as，用查表） ──

const kShapeMap: Record<string, NodeShape> = {
    rect: 'rect',
    roundRect: 'roundRect',
    diamond: 'diamond',
    circle: 'circle',
    ellipse: 'ellipse',
};

const kEdgeStyleMap: Record<string, EdgeStyle> = {
    normal: 'normal',
    dotted: 'dotted',
    thick: 'thick',
};

const kArrowMap: Record<string, ArrowType> = {
    none: 'none',
    arrow: 'arrow',
    circle: 'circle',
    openarrow: 'openarrow',
};

function mapShape(v: string): NodeShape {
    return kShapeMap[v] ?? 'rect';
}

function mapEdgeStyle(v: string): EdgeStyle {
    return kEdgeStyleMap[v] ?? 'normal';
}

function mapArrowType(v: string): ArrowType {
    return kArrowMap[v] ?? 'none';
}

// ── 主入口 ──

/**
 * snapshot /convert JSON → Diagram。
 * @throws MmdError(status != ok 时，MermaidError)
 */
export function jsonToDiagram(json: unknown): Diagram {
    const j = asRecord(json);
    if (!j || j['status'] !== 'ok') {
        const message = typeof j?.['message'] === 'string'
            ? (j['message'] as string)
            : 'unknown error';
        throw new MmdError(MmdErrorCode.MermaidError, message);
    }

    const d = defaultDiagram();
    d.diagramType = str(j, 'diagramType', '');
    d.direction = str(j, 'direction', 'TB');

    // Nodes
    if (Array.isArray(j['nodes'])) {
        for (const item of j['nodes']) {
            const nj = asRecord(item);
            if (!nj) continue;
            const n = defaultNode();
            n.id = str(nj, 'id', '');
            n.label = str(nj, 'label', '');
            n.shape = mapShape(str(nj, 'shape', 'rect'));
            n.x = num(nj, 'x', 0);
            n.y = num(nj, 'y', 0);
            n.width = num(nj, 'width', 0);
            n.height = num(nj, 'height', 0);
            n.styleClass = str(nj, 'styleClass', '');
            n.fillColor = str(nj, 'fillColor', '');
            n.parentId = str(nj, 'parentId', '');
            n.lifelineKind = str(nj, 'lifelineKind', '');
            n.dividers = numArray(nj, 'dividers');
            d.nodes.push(n);
        }
    }

    // Edges
    if (Array.isArray(j['edges'])) {
        for (const item of j['edges']) {
            const ej = asRecord(item);
            if (!ej) continue;
            const e = defaultEdge();
            e.from = str(ej, 'from', '');
            e.to = str(ej, 'to', '');
            e.label = str(ej, 'label', '');
            e.style = mapEdgeStyle(str(ej, 'style', 'normal'));
            e.arrowHead = mapArrowType(str(ej, 'arrowHead', 'arrow'));
            e.arrowTail = mapArrowType(str(ej, 'arrowTail', 'none'));
            e.fromMultiplicity = str(ej, 'fromMultiplicity', '');
            e.toMultiplicity = str(ej, 'toMultiplicity', '');
            e.waypoints = points(ej['waypoints']);
            d.edges.push(e);
        }
    }

    // Clusters
    if (Array.isArray(j['clusters'])) {
        for (const item of j['clusters']) {
            const cj = asRecord(item);
            if (!cj) continue;
            d.clusters.push({
                id: str(cj, 'id', ''),
                label: str(cj, 'label', ''),
                x: num(cj, 'x', 0),
                y: num(cj, 'y', 0),
                width: num(cj, 'width', 0),
                height: num(cj, 'height', 0),
            });
        }
    }

    // Bounding box
    const bb = asRecord(j['boundingBox']);
    if (bb) {
        d.bounds.minX = num(bb, 'minX', 0);
        d.bounds.minY = num(bb, 'minY', 0);
        d.bounds.maxX = num(bb, 'maxX', 0);
        d.bounds.maxY = num(bb, 'maxY', 0);
    }

    // gantt
    const g = asRecord(j['gantt']);
    if (g) {
        const chart = defaultGanttChart();
        chart.title = str(g, 'title', '');
        chart.dateFormat = str(g, 'dateFormat', 'YYYY-MM-DD');
        chart.startSerial = num(g, 'startSerial', 0);
        chart.endSerial = num(g, 'endSerial', 0);
        chart.sections = stringArray(g, 'sections');
        for (const item of entries(g['tasks'])) {
            chart.tasks.push({
                name: str(item, 'name', ''),
                section: str(item, 'section', ''),
                startSerial: num(item, 'startSerial', 0),
                duration: num(item, 'duration', 0),
                milestone: bool(item, 'milestone', false),
                dependsOn: stringArray(item, 'dependsOn'),
            });
        }
        d.gantt = chart;
    }

    // git
    const git = asRecord(j['git']);
    if (git) {
        const graph = defaultGitGraph();
        for (const item of entries(git['commits'])) {
            graph.commits.push({
                id: str(item, 'id', ''),
                label: str(item, 'label', ''),
                tag: str(item, 'tag', ''),
                branchIndex: num(item, 'branchIndex', 0),
                x: num(item, 'x', 0),
                y: num(item, 'y', 0),
                r: num(item, 'r', 10),
                merge: bool(item, 'merge', false),
                highlight: bool(item, 'highlight', false),
                reverse: bool(item, 'reverse', false),
            });
        }
        for (const item of entries(git['branches'])) {
            graph.branches.push({
                name: str(item, 'name', ''),
                index: num(item, 'index', 0),
                y: num(item, 'y', 0),
                x1: num(item, 'x1', 0),
                x2: num(item, 'x2', 0),
                color: str(item, 'color', '#000000'),
            });
        }
        for (const item of entries(git['arrows'])) {
            graph.arrows.push({
                from: str(item, 'from', ''),
                to: str(item, 'to', ''),
                kind: str(item, 'kind', 'seq'),
                branchIndex: num(item, 'branchIndex', 0),
                waypoints: points(item['waypoints']),
            });
        }
        d.git = graph;
    }

    // pie
    const pie = asRecord(j['pie']);
    if (pie) {
        const chart = defaultPieChart();
        chart.title = str(pie, 'title', '');
        chart.cx = num(pie, 'cx', 0);
        chart.cy = num(pie, 'cy', 0);
        chart.r = num(pie, 'r', 0);
        for (const item of entries(pie['slices'])) {
            chart.slices.push({
                label: str(item, 'label', ''),
                value: num(item, 'value', 0),
                color: str(item, 'color', ''),
            });
        }
        d.pie = chart;
    }

    // quadrant
    const quadrant = asRecord(j['quadrant']);
    if (quadrant) {
        const chart = defaultQuadrantChart();
        chart.title = str(quadrant, 'title', '');
        chart.xLabelLow = str(quadrant, 'xLabelLow', '');
        chart.xLabelHigh = str(quadrant, 'xLabelHigh', '');
        chart.yLabelLow = str(quadrant, 'yLabelLow', '');
        chart.yLabelHigh = str(quadrant, 'yLabelHigh', '');
        chart.minX = num(quadrant, 'minX', 0);
        chart.minY = num(quadrant, 'minY', 0);
        chart.maxX = num(quadrant, 'maxX', 0);
        chart.maxY = num(quadrant, 'maxY', 0);
        chart.crossX = num(quadrant, 'crossX', 0);
        chart.crossY = num(quadrant, 'crossY', 0);
        for (const item of entries(quadrant['points'])) {
            chart.points.push({
                label: str(item, 'label', ''),
                cx: num(item, 'cx', 0),
                cy: num(item, 'cy', 0),
            });
        }
        d.quadrant = chart;
    }

    // sequence
    const seq = asRecord(j['sequence']);
    if (seq) {
        const data = defaultSequenceData();
        for (const item of entries(seq['activations'])) {
            data.activations.push({
                actorId: str(item, 'actorId', ''),
                x: num(item, 'x', 0),
                yTop: num(item, 'yTop', 0),
                yBottom: num(item, 'yBottom', 0),
                width: num(item, 'width', 10),
            });
        }
        for (const item of entries(seq['fragments'])) {
            data.fragments.push({
                kind: str(item, 'kind', 'loop'),
                label: str(item, 'label', ''),
                x: num(item, 'x', 0),
                y: num(item, 'y', 0),
                width: num(item, 'width', 0),
                height: num(item, 'height', 0),
            });
        }
        d.sequence = data;
    }

    // Raw SVG
    d.svg = str(j, 'svg', '');

    return d;
}
