// mmd2vsdx - testcoordinate：坐标变换专项（CoordinateTransform）
// 蓝本：C++ testtranslate.cpp 坐标节 + 05 文档正反例 + 坑位 ④-4.1
// （scale=outputScale/96、y 翻转、边距、空图默认 96×96 源界、最小 0.1" 内容）。
import { describe, expect, it } from 'vitest';
import { CoordinateTransform } from '../src/vsdxdoc/render/coordinateTransform.js';
import { defaultDiagram } from '../src/core/types.js';
import type { Diagram } from '../src/core/types.js';

function diagramWith(bounds: [number, number, number, number] | null = null): Diagram {
    const d = defaultDiagram();
    if (bounds) {
        d.bounds = { minX: bounds[0], minY: bounds[1], maxX: bounds[2], maxY: bounds[3] };
    }
    return d;
}

describe('CoordinateTransform 基础（C++ 语义）', () => {
    it('scale = outputScale/96；空内容默认源界 {0,0,96,96}', () => {
        const t = new CoordinateTransform(diagramWith(), 1.0);
        // 空图：96px × (1/96) = 1.0in 内容 + 0.5+0.5 边距
        expect(t.pageWidth()).toBeCloseTo(2.0, 9);
        expect(t.pageHeight()).toBeCloseTo(2.0, 9);
    });
    it('带 bounds 的图：页面 = 边距 + max(内容,0.1) + 边距；坐标含 y 翻转', () => {
        const d = diagramWith([0, 0, 96, 96]);
        const t = new CoordinateTransform(d, 1.0, { left: 1, right: 1, top: 0.5, bottom: 0.5 });
        expect(t.pageWidth()).toBeCloseTo(3.0, 9); // 1 + 1.0 + 1
        expect(t.pageHeight()).toBeCloseTo(2.0, 9); // 0.5 + 1.0 + 0.5
        // 左上角 (0,0)：x=1+0，y=0.5+(96-0)/96=1.5
        const p = t.point(0, 0);
        expect(p.x).toBeCloseTo(1.0, 9);
        expect(p.y).toBeCloseTo(1.5, 9);
        // 右下角 (96,96)：x=1+1=2，y=0.5+0=0.5
        const q = t.point(96, 96);
        expect(q.x).toBeCloseTo(2.0, 9);
        expect(q.y).toBeCloseTo(0.5, 9);
    });
    it('节点四角参与源界（含 waypoints/cluster）与 length 换算', () => {
        const d = diagramWith(null);
        d.nodes.push({
            ...defaultDiagram().nodes[0]!,
            id: 'A', x: 100, y: 100, width: 40, height: 20,
        });
        d.edges.push({
            ...defaultDiagram().edges[0]!,
            from: 'A', to: 'B', waypoints: [{ x: 200, y: 200 }],
        });
        const t = new CoordinateTransform(d, 96.0, {}); // scale=1
        // 源界 x: 80..200（宽 120）、y: 90..200（高 110）
        expect(t.pageWidth()).toBeCloseTo(0.5 + 120 + 0.5, 6);
        expect(t.pageHeight()).toBeCloseTo(0.5 + 110 + 0.5, 6);
        expect(t.length(96)).toBeCloseTo(96.0, 9);
        expect(t.length(48)).toBeCloseTo(48.0, 9);
    });
    it('y 翻转方向：SVG 顶(y 小) → 页面高(y 大)', () => {
        const d = diagramWith([0, 0, 100, 100]);
        const t = new CoordinateTransform(d, 1.0, { left: 0, right: 0, top: 0, bottom: 0 });
        const top = t.point(50, 0);
        const bottom = t.point(50, 100);
        expect(top.y).toBeGreaterThan(bottom.y); // 页面坐标自下而上
        expect(top.x).toBeCloseTo(bottom.x, 9);
    });
});

describe('CoordinateTransform 校验（C++ invalid_argument 语义 → TypeError）', () => {
    it('outputScale 非有限/非正抛', () => {
        expect(() => new CoordinateTransform(diagramWith(), 0)).toThrow(TypeError);
        expect(() => new CoordinateTransform(diagramWith(), NaN)).toThrow(TypeError);
        expect(() => new CoordinateTransform(diagramWith(), Infinity)).toThrow(TypeError);
    });
    it('边距非法抛（含负值与 NaN）', () => {
        expect(() => new CoordinateTransform(diagramWith(), 1, { left: -1 })).toThrow(TypeError);
        expect(() => new CoordinateTransform(diagramWith(), 1, { top: NaN })).toThrow(TypeError);
    });
    it('节点尺寸非法/坐标非有限抛', () => {
        const d1 = diagramWith(null);
        d1.nodes.push({ ...defaultDiagram().nodes[0]!, id: 'A', x: 1, y: 1, width: -1, height: 2 });
        expect(() => new CoordinateTransform(d1, 1)).toThrow(/invalid node size/);
        const d2 = diagramWith(null);
        d2.edges.push({ ...defaultDiagram().edges[0]!, from: 'A', to: 'B', waypoints: [{ x: NaN, y: 0 }] });
        expect(() => new CoordinateTransform(d2, 1)).toThrow(/non-finite coordinate/);
        const d3 = diagramWith(null);
        d3.clusters.push({ id: 'c', label: '', x: 0, y: 0, width: 5, height: -5 });
        expect(() => new CoordinateTransform(d3, 1)).toThrow(/invalid cluster size/);
    });
});
