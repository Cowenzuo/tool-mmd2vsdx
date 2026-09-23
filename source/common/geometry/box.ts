// 几何组：矩形/圆角矩形的几何行构造（docs/开发过程/01-结构设计.md）
import { cell, row, type CellIntent, type GeometryIntent, type RowIntent } from '../intents.js';

/** XY 坐标 cell：V 为英寸缓存，F 为引用公式，U=MM 显示。 */
function cellXY(xv: string, xf: string, yv: string, yf: string): CellIntent[] {
    return [cell('X', xv, 'MM', xf), cell('Y', yv, 'MM', yf)];
}

/**
 * 五行闭合矩形，坐标公式引用 Width/Height，V 为英寸缓存：
 * MoveTo(0,0) → (W,0) → (W,H) → (0,H) → 显式闭合。
 */
export function rectRows(w: number, h: number, closed = true): RowIntent[] {
    const sw = String(w);
    const sh = String(h);
    const rows: RowIntent[] = [
        row('MoveTo', 1, cellXY('0', 'Width*0', '0', 'Height*0')),
        row('LineTo', 2, cellXY(sw, 'Width*1', '0', 'Height*0')),
        row('LineTo', 3, cellXY(sw, 'Width*1', sh, 'Height*1')),
        row('LineTo', 4, cellXY('0', 'Width*0', sh, 'Height*1')),
    ];
    if (closed) {
        rows.push(row('LineTo', 5, [
            cell('X', '0', 'MM', 'Geometry1.X1'),
            cell('Y', '0', 'MM', 'Geometry1.Y1'),
        ]));
    }
    return rows;
}
/** 默认几何开关（NoFill/NoLine/NoShow 全 0，NoSnap/NoQuickDrag 固化）。 */
export function defaultSwitches(filled = true): CellIntent[] {
    return [
        cell('NoFill', filled ? '0' : '1'),
        cell('NoLine', '0'),
        cell('NoShow', '0'),
        cell('NoSnap', '0', undefined, 'No Formula'),
        cell('NoQuickDrag', '0', undefined, 'No Formula'),
    ];
}

/** 完整几何意图：开关 + 行。 */
export function geometry(rows: RowIntent[], filled = true): GeometryIntent {
    return { rows, switches: defaultSwitches(filled) };
}
