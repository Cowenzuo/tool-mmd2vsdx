// mmd2vsdx - vsdxdoc/render：connectorBinder（端点粘附/端口/箭头/Connect）
//
// C++ render/connectorbinder.{hpp,cpp} 平移（坑位 ⑦-7.2/7.7/7.9，三修复
// 行为红线：菱形 X3/X4 与矩形相反、类框角锚点、连接点粘附）。
// 语义照抄：
//   - choosePort：类框（dividers 非空）= 左下角锚（框边自角推导）；普通形状
//     中心锚；X 主导选左右中点（X1 左/X2 右），Y 主导按形状类型选垂直点：
//     菱形 X3=上 X4=下，其余 X3=下 X4=上（9b3591a/2324c28 两次修复的最终态）；
//   - arrowValue：None=0、Arrow=4、Circle=30（空心菱形=聚合）、OpenArrow=14；
//   - cleanWaypoints：非有限抛、去重相邻同点；
//   - setConnect：FromSheet/FromCell/FromPart/ToSheet/ToCell/ToPart（直线粘整体
//     ToPart=3，直角折线粘连接点 100..103 由调用方给参）。

import type { XmlNode } from '../../xml/xmlNode.js';
import { setAttribute } from '../../xml/xmlNode.js';
import type { ArrowType, Point } from '../../core/types.js';
import type { ShapeId, ShapeModel } from '../docmodel/model.js';

/** 端口绑定结果。 */
export interface PortBinding {
    index: number; // 0..3 → Connections.X{1..4} / ToPart 100..103
    cell: string;
    toPart: number;
    point: Point;
}

/** 连接线绑定结果。 */
export interface ConnectorBinding {
    begin: PortBinding;
    end: PortBinding;
    path: Point[];
}

export function samePoint(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

/** 清理路点：非有限抛（TypeError，消息同 C++）、相邻重复点去重。 */
export function cleanWaypoints(input: Point[]): Point[] {
    const result: Point[] = [];
    for (const point of input) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            throw new TypeError('Connector waypoint is not finite');
        }
        if (result.length === 0 || !samePoint(result[result.length - 1]!, point)) {
            result.push(point);
        }
    }
    return result;
}

/**
 * 端口选择：按源/目标相对方向挑框边中点连接点。
 * 类框（dividers 非空）以左下角为锚（LocPin=(0,0)）；其余中心锚。
 */
export function choosePort(shape: ShapeModel, dx: number, dy: number): PortBinding {
    const cornerAnchor = shape.dividers.length > 0;
    const left = cornerAnchor ? shape.x : shape.x - shape.width / 2;
    const right = cornerAnchor ? shape.x + shape.width : shape.x + shape.width / 2;
    const bottom = cornerAnchor ? shape.y : shape.y - shape.height / 2;
    const top = cornerAnchor ? shape.y + shape.height : shape.y + shape.height / 2;
    const cx = (left + right) / 2;
    const cy = (bottom + top) / 2;

    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx >= 0) return { index: 1, cell: 'Connections.X2', toPart: 101, point: { x: right, y: cy } };
        return { index: 0, cell: 'Connections.X1', toPart: 100, point: { x: left, y: cy } };
    }
    // 实测：菱形 X3(Y=H)=上、X4(Y=0)=下，与矩形/圆/椭圆相反（坑位 ⑦-7.2）
    if (shape.kind === 'diamond') {
        if (dy >= 0) return { index: 2, cell: 'Connections.X3', toPart: 102, point: { x: cx, y: top } };
        return { index: 3, cell: 'Connections.X4', toPart: 103, point: { x: cx, y: bottom } };
    }
    if (dy >= 0) return { index: 3, cell: 'Connections.X4', toPart: 103, point: { x: cx, y: top } };
    return { index: 2, cell: 'Connections.X3', toPart: 102, point: { x: cx, y: bottom } };
}

/** 绑定连接线端点：首末方向由路点推断（退化用整体走向），端口落框边中点。 */
export function bindConnector(source: ShapeModel, target: ShapeModel,
                              waypoints: Point[]): ConnectorBinding {
    const path = cleanWaypoints(waypoints);
    let sourceDx = target.x - source.x;
    let sourceDy = target.y - source.y;
    let targetDx = source.x - target.x;
    let targetDy = source.y - target.y;

    if (path.length >= 2) {
        for (let index = 1; index < path.length; index++) {
            if (!samePoint(path[index - 1]!, path[index]!)) {
                sourceDx = path[index]!.x - path[index - 1]!.x;
                sourceDy = path[index]!.y - path[index - 1]!.y;
                break;
            }
        }
        for (let index = path.length - 1; index > 0; index--) {
            if (!samePoint(path[index]!, path[index - 1]!)) {
                targetDx = path[index - 1]!.x - path[index]!.x;
                targetDy = path[index - 1]!.y - path[index]!.y;
                break;
            }
        }
    }

    const binding: ConnectorBinding = {
        begin: choosePort(source, sourceDx, sourceDy),
        end: choosePort(target, targetDx, targetDy),
        path,
    };
    if (binding.path.length < 2) {
        binding.path = [binding.begin.point, binding.end.point];
    } else {
        binding.path[0] = binding.begin.point;
        binding.path[binding.path.length - 1] = binding.end.point;
        binding.path = cleanWaypoints(binding.path);
        if (binding.path.length < 2) {
            binding.path = [binding.begin.point, binding.end.point];
        }
    }
    return binding;
}

/** 箭头索引：None=0、Arrow=4、Circle=30、OpenArrow=14（坑位 ⑦-7.7）。 */
export function arrowValue(arrow: ArrowType): number {
    switch (arrow) {
        case 'none': return 0;
        case 'arrow': return 4;
        case 'circle': return 30;
        case 'openarrow': return 14;
    }
    return 0;
}

/** Connect 记录粘附（页面级 <Connects> 子节点）。 */
export function setConnect(connect: XmlNode, connectorId: ShapeId, fromCell: string,
                           fromPart: number, targetId: ShapeId,
                           toCell = 'PinX', toPart = 3): void {
    setAttribute(connect, 'FromSheet', String(connectorId));
    setAttribute(connect, 'FromCell', fromCell);
    setAttribute(connect, 'FromPart', String(fromPart));
    setAttribute(connect, 'ToSheet', String(targetId));
    setAttribute(connect, 'ToCell', toCell);
    setAttribute(connect, 'ToPart', String(toPart));
}
