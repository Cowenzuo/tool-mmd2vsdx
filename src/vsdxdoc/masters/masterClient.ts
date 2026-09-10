// mmd2vsdx - vsdxdoc/masters：masterClient（母版查询客户端接口）
//
// M2 暂以 masterlessClient 提供（masterId=0 → 形状清 Master、走本地内容，
// 即 C++ useConnectorMaster=false 语义）；M5 接入真实 MasterLibrary 后
// 以打包映射实现同一接口（pack 后 NameU→ID、masterChildShapeIds 缓存、
// applyInstanceOverrides 实例固化）。
// resolveDiagramType：C++ masterlibrary.cpp:603-618 纯函数平移（Auto 时按
// 首个 Diagram.diagramType 子串匹配，未命中 → Basic；空图 → Basic）。

import type { XmlNode } from '../../xml/xmlNode.js';
import type { Diagram, DiagramType, NodeShape } from '../../core/types.js';
import { kDiagramTypeOrder } from '../../core/types.js';

/** 母版查询面（渲染层唯一入口）。 */
export interface MasterClient {
    masterIdFor(nameU: string): number;
    masterChildShapeIds(nameU: string): number[];
    applyInstanceOverrides(node: XmlNode, nameU: string, width: number, height: number): void;
    masterNameForShape(type: DiagramType, kind: NodeShape): string;
}

/** M2 空实现：无母版打包（useConnectorMaster=false 语义）。 */
export const masterlessClient: MasterClient = {
    masterIdFor: () => 0,
    masterChildShapeIds: () => [],
    applyInstanceOverrides: () => { /* M5 接入 */ },
    masterNameForShape: (type, kind) => shapeMasterName(type, kind),
};

/** DiagramType 推导（C++ masterlibrary.cpp:603-618）。 */
export function resolveDiagramType(requested: DiagramType, diagrams: Diagram[]): DiagramType {
    if (requested !== 'auto') return requested;
    if (diagrams.length === 0) return 'basic';
    const type = diagrams[0]!.diagramType;
    if (type.includes('class')) return 'class';
    if (type.includes('sequence')) return 'sequence';
    if (type.includes('er')) return 'er';
    if (type.includes('gantt')) return 'gantt';
    if (type.includes('timeline')) return 'timeline';
    if (type.includes('calendar')) return 'calendar';
    if (type.includes('flowchart')) return 'flowchart';
    if (type.includes('git')) return 'git';
    if (type.includes('mindmap')) return 'mindmap';
    return 'basic';
}

/**
 * 形状 kind → 母版 NameU（C++ masterlibrary.cpp:619-669；M2 值仅作数据，
 * masterIdFor 空实现恒 0；Basic 段与 655+ 行细节 M5 全量核对）。
 */
export function shapeMasterName(type: DiagramType, kind: NodeShape): string {
    switch (type) {
        case 'flowchart':
            switch (kind) {
                case 'diamond': return 'Decision';
                case 'circle':
                case 'ellipse': return 'Data';
                default: return 'Process';
            }
        case 'er':
            switch (kind) {
                case 'diamond': return 'Relationship';
                default: return 'Entity';
            }
        case 'class':
            return 'Class';
        case 'sequence':
            return 'Object lifeline';
        case 'gantt':
            return 'Task bar';
        case 'timeline':
            return 'Line timeline';
        case 'calendar':
            return 'Day';
        case 'git':
            return 'Circle';
        case 'mindmap':
            switch (kind) {
                case 'diamond': return 'Diamond';
                case 'circle': return 'Circle';
                case 'ellipse': return 'Ellipse';
                case 'roundRect': return 'Rounded Rectangle';
                default: return 'Rectangle';
            }
        case 'basic':
        default:
            switch (kind) {
                case 'diamond': return 'Diamond';
                case 'circle': return 'Circle';
                case 'ellipse': return 'Ellipse';
                case 'roundRect': return 'Rounded Rectangle';
                default: return 'Rectangle';
            }
    }
}

/** DiagramType 常量列表（core types.ts 再导出，便于调用方）。 */
export const kTypes = kDiagramTypeOrder;
