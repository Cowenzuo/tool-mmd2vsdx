// 母版组：MasterClient 抽象与本地实现（docs/redesign/04-转义层/10-公用库）
import type { NodeShapeKind } from '../../contracts/index.js';

/** 渲染层唯一依赖的母版查询接口。 */
export interface MasterClient {
    /** 按 NameU 查母版 ID；0 = 无（走本地内容）。 */
    masterIdFor(nameU: string): number;
}

/** 无资产兜底：一律 0，渲染走自足式。 */
export const masterlessClient: MasterClient = {
    masterIdFor: () => 0,
};

/** 形状 → 官方母版 NameU（basic 家族）。 */
export function shapeKindToMasterName(kind: NodeShapeKind): string {
    switch (kind) {
        case 'rect':
            return 'Rectangle';
        case 'roundRect':
            return 'Rounded Rectangle';
        case 'diamond':
            return 'Diamond';
        case 'circle':
            return 'Circle';
        case 'ellipse':
            return 'Ellipse';
    }
}
