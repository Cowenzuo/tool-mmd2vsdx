// 母版组：形状到官方母版名的映射（docs/开发过程/01-结构设计.md）
import type { NodeShapeKind } from '../../contracts/index.js';

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
