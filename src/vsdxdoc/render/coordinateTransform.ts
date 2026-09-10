// mmd2vsdx - vsdxdoc/render：coordinateTransform（坐标变换）
//
// C++ translate/coordinatetransform.{hpp,cpp} 平移（坑位 ④-4.1、判别 D7）。
// 归位说明：importer 与全部专用渲染器共用（px→inch 页面坐标），放 render
// 消除专用渲染器 → translate 的反向依赖。
// 语义逐条照抄：
//   - scale = outputScale / 96；outputScale 非有限/≤0 抛（TypeError，消息同 C++）；
//   - 边距 ≥0 有限，否则抛 'Invalid page margin: <name>'；
//   - sourceBounds = diagram.bounds（自洽且有面积时）+ 全部节点四角 + 边 waypoints
//     + cluster 四角；任一坐标非有限抛 'Diagram contains a non-finite coordinate'；
//     节点/cluster 宽高非有限或 <0 抛 invalid size；
//   - 空内容 → 默认源界 {0,0,96,96}（96×96px 源盒）；
//   - 页面尺寸 = 边距 + max(内容尺寸, 0.1") + 边距；
//   - point(x,y) = (marginLeft + (x-minX)*scale, marginBottom + (maxY-y)*scale)
//     —— y 翻转（SVG 向下 → 页面向上，页面坐标自下而上）。

import type { Diagram, Point } from '../../core/types.js';

export interface PageMargins {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export interface PagePoint {
    x: number;
    y: number;
}

export interface PageBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

function defaultMargins(): PageMargins {
    return { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 };
}

export class CoordinateTransform {
    private readonly sourceBounds_: PageBounds;
    private readonly margins_: PageMargins;
    private readonly scale_: number;
    private readonly pageWidth_: number;
    private readonly pageHeight_: number;

    constructor(diagram: Diagram, outputScale: number, margins?: Partial<PageMargins>) {
        const m: PageMargins = { ...defaultMargins(), ...(margins ?? {}) };
        this.margins_ = m;
        if (!Number.isFinite(outputScale) || outputScale <= 0) {
            throw new TypeError('VSDX output scale must be finite and positive');
        }
        for (const [name, value] of Object.entries(m) as Array<[keyof PageMargins, number]>) {
            if (!Number.isFinite(value) || value < 0) {
                throw new TypeError('Invalid page margin: ' + name);
            }
        }
        this.scale_ = outputScale / 96.0;

        let hasContent = false;
        let bounds: PageBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        const includePoint = (x: number, y: number) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                throw new TypeError('Diagram contains a non-finite coordinate');
            }
            if (!hasContent) {
                bounds = { minX: x, minY: y, maxX: x, maxY: y };
                hasContent = true;
                return;
            }
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
        };

        const b = diagram.bounds;
        if (b.maxX >= b.minX && b.maxY >= b.minY &&
            Number.isFinite(b.minX) && Number.isFinite(b.minY) &&
            Number.isFinite(b.maxX) && Number.isFinite(b.maxY) &&
            (b.maxX - b.minX > 0 || b.maxY - b.minY > 0)) {
            includePoint(b.minX, b.minY);
            includePoint(b.maxX, b.maxY);
        }

        for (const node of diagram.nodes) {
            if (!Number.isFinite(node.width) || !Number.isFinite(node.height) ||
                node.width < 0 || node.height < 0) {
                throw new TypeError('Diagram contains an invalid node size');
            }
            includePoint(node.x - node.width / 2, node.y - node.height / 2);
            includePoint(node.x + node.width / 2, node.y + node.height / 2);
        }
        for (const edge of diagram.edges) {
            for (const waypoint of edge.waypoints) {
                includePoint(waypoint.x, waypoint.y);
            }
        }
        for (const cluster of diagram.clusters) {
            if (!Number.isFinite(cluster.width) || !Number.isFinite(cluster.height) ||
                cluster.width < 0 || cluster.height < 0) {
                throw new TypeError('Diagram contains an invalid cluster size');
            }
            includePoint(cluster.x - cluster.width / 2, cluster.y - cluster.height / 2);
            includePoint(cluster.x + cluster.width / 2, cluster.y + cluster.height / 2);
        }

        this.sourceBounds_ = hasContent ? bounds : { minX: 0, minY: 0, maxX: 96, maxY: 96 };
        const contentWidth = (this.sourceBounds_.maxX - this.sourceBounds_.minX) * this.scale_;
        const contentHeight = (this.sourceBounds_.maxY - this.sourceBounds_.minY) * this.scale_;
        this.pageWidth_ = m.left + Math.max(contentWidth, 0.1) + m.right;
        this.pageHeight_ = m.bottom + Math.max(contentHeight, 0.1) + m.top;
    }

    point(x: number, y: number): PagePoint;
    point(value: Point): PagePoint;
    point(xOrValue: number | Point, y?: number): PagePoint {
        const x = typeof xOrValue === 'number' ? xOrValue : xOrValue.x;
        const py = typeof xOrValue === 'number' ? (y as number) : xOrValue.y;
        return {
            x: this.margins_.left + (x - this.sourceBounds_.minX) * this.scale_,
            y: this.margins_.bottom + (this.sourceBounds_.maxY - py) * this.scale_,
        };
    }

    /** 像素 → 页面单位（英寸）。 */
    length(pixels: number): number {
        return pixels * this.scale_;
    }

    pageWidth(): number {
        return this.pageWidth_;
    }

    pageHeight(): number {
        return this.pageHeight_;
    }
}
