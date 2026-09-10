// 几何组：矩形/圆角矩形的几何行构造（docs/redesign/04-转义层/10-公用库）
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

/**
 * 圆角矩形：底左起，直边与四段 EllipticalArcTo 交替，四角圆角。
 * B 为弓高比例值；精确的逐行形态在 golden 校准阶段对照 stencil
 * 资产修正（research class 篇 master3 有同款几何）。
 */
export function roundRectRows(w: number, h: number, r: number): RowIntent[] {
    const insetX = r / Math.max(w, 1e-9);
    const insetY = r / Math.max(h, 1e-9);
    const r1x = (1 - insetX).toFixed(6);
    const r1y = (1 - insetY).toFixed(6);
    const tx = insetX.toFixed(6);
    const ty = insetY.toFixed(6);
    const bulge = (r / Math.min(w, h)).toFixed(6);
    return [
        row('MoveTo', 1, cellXY('0', 'Width*0', String(r), `Height*${ty}`)),
        row('LineTo', 2, cellXY(String(w - r), `Width*${r1x}`, String(r), `Height*${ty}`)),
        row('EllipticalArcTo', 3, [
            ...cellXY(String(w - r), `Width*${r1x}`, '0', 'Height*0'),
            cell('B', bulge, 'DL'),
        ]),
        row('LineTo', 4, cellXY(String(w), 'Width*1', String(h - r), `Height*${r1y}`)),
        row('EllipticalArcTo', 5, [
            ...cellXY(String(w - r), `Width*${r1x}`, String(h - r), `Height*${r1y}`),
            cell('B', bulge, 'DL'),
        ]),
        row('LineTo', 6, cellXY(String(r), `Width*${tx}`, String(h), 'Height*1')),
        row('EllipticalArcTo', 7, [
            ...cellXY(String(r), `Width*${tx}`, String(h - r), `Height*${r1y}`),
            cell('B', bulge, 'DL'),
        ]),
        row('LineTo', 8, cellXY('0', 'Width*0', String(r), `Height*${ty}`)),
        row('EllipticalArcTo', 9, [
            ...cellXY('0', 'Width*0', String(r), `Height*${ty}`),
            cell('B', bulge, 'DL'),
        ]),
    ];
}

/** 折线几何：点列 → MoveTo + LineTo；delTail=true 时补 Del 占位行（行号稳定）。 */
export function polylineRows(points: ReadonlyArray<readonly [number, number]>, delTail = true): RowIntent[] {
    const rows: RowIntent[] = [];
    points.forEach(([x, y], i) => {
        rows.push(row(i === 0 ? 'MoveTo' : 'LineTo', i + 1, [cell('X', String(x)), cell('Y', String(y))]));
    });
    if (delTail) rows.push(row('LineTo', points.length + 1, [], true));
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
