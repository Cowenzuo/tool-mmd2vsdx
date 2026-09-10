// 浏览器端通用提取器（flowchart/state/c4/block 等扁平图）
// 输入：mermaid 渲染出的 SVG 元素；输出：结构 JSON（与契约 A 骨架同构）。
// 挂到 window.__mmdExtractGeneric；由 parser/renderer.ts 注入调用。
(function () {
    'use strict';

    function attr(el, name) {
        return el.getAttribute(name) || '';
    }

    function box(el) {
        const r = el.getBBox();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    /** 世界坐标包围盒：g.node 的 getBBox 是局部坐标（不含元素 transform），
     *  用屏幕矩形 + screenCTM 反变换获得 SVG 用户坐标（与 mindmap/sequence 提取一致）。 */
    function worldBox(svg, el) {
        const r = el.getBoundingClientRect();
        const pt = svg.createSVGPoint();
        pt.x = r.left + r.width / 2;
        pt.y = r.top + r.height / 2;
        const ctm = svg.getScreenCTM();
        if (!ctm) {
            const b = el.getBBox();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
        }
        const w = pt.matrixTransform(ctm.inverse());
        const sx = Math.abs(ctm.a) || 1;
        const sy = Math.abs(ctm.d) || 1;
        return { x: w.x - r.width / 2 / sx, y: w.y - r.height / 2 / sy, width: r.width / sx, height: r.height / sy };
    }

    function shapeKind(el) {
        if (el.querySelector('polygon.pentagon')) return 'rect';
        const p = el.querySelector('path, polygon, rect, ellipse');
        if (!p) return 'rect';
        const tag = p.tagName;
        if (tag === 'ellipse') return 'circle';
        if (tag === 'polygon') {
            const pts = attr(p, 'points');
            const n = pts.split(' ').length;
            return n === 4 ? 'diamond' : n === 5 ? 'rect' : 'rect';
        }
        if (tag === 'path') return 'roundRect';
        return 'rect';
    }

    function nodeId(el) {
        const id = attr(el, 'id');
        // mermaid 节点前缀：flowchart-开始-x；取其第二段
        const m = /^[a-z]+-(.+)-.*$/.exec(id);
        return m ? m[1] : id;
    }

    function nodeLabel(el) {
        const span = el.querySelector('.nodeLabel, text');
        return span ? (span.textContent || '').trim() : '';
    }

    function edgeIds(path) {
        // v10：flowchart id 形如 L-A-B-0；class 形如 "… LS-A LE-B"；
        // state/其它图型 id 形如 state-A-B-1 或 A-B；统一容错解析
        let id = attr(path, 'id');
        if (id) {
            const m = /^[a-z]*-([A-Za-z0-9_]+)--?([A-Za-z0-9_]+)-?\d*$/.exec(id);
            if (m) return { from: m[1], to: m[2] };
            const m2 = /^([A-Za-z0-9_]+)--?([A-Za-z0-9_]+)-?\d*$/.exec(id);
            if (m2) return { from: m2[1], to: m2[2] };
        }
        const cls = attr(path, 'class');
        const cm = /LS-([A-Za-z0-9_]+)\s+LE-([A-Za-z0-9_]+)/.exec(cls);
        if (cm) return { from: cm[1], to: cm[2] };
        return null;
    }

    function waypoints(path) {
        const d = attr(path, 'd');
        const pts = [];
        const re = /M\s*([\d.]+)[,\s]+([\d.]+)/g;
        const lm = d.match(/M\s*([\d.]+)[,\s]+([\d.]+)/);
        if (lm) pts.push({ x: +lm[1], y: +lm[2] });
        for (const mm of d.matchAll(/[Ll]\s*([\d.]+)[,\s]+([\d.]+)/g)) {
            pts.push({ x: +mm[1], y: +mm[2] });
        }
        return pts;
    }

    function arrowKind(path) {
        const me = attr(path, 'marker-end');
        if (!me) return 'none';
        return me.indexOf('open') >= 0 ? 'openarrow' : 'arrow';
    }

    function userPoint(svg, cx, cy) {
        const pt = svg.createSVGPoint();
        pt.x = cx;
        pt.y = cy;
        const ctm = svg.getScreenCTM();
        return ctm ? pt.matrixTransform(ctm.inverse()) : { x: cx, y: cy };
    }

    function extract(svgEl) {
        const svg = svgEl.querySelector('svg') || svgEl;
        const nodes = [];
        for (const el of svgEl.querySelectorAll('g.node')) {
            const b = worldBox(svg, el);
            nodes.push({
                id: nodeId(el),
                label: nodeLabel(el),
                shape: shapeKind(el),
                x: b.x + b.width / 2,
                y: b.y + b.height / 2,
                width: b.width,
                height: b.height,
                styleClass: 'flowchart-label',
                parentId: '',
                dividers: [],
            });
        }
        const edges = [];
        // 标签按位置匹配：每个 .edgeLabel 的包围盒中心 vs 边中点，取最近者
        const labels = [...svgEl.querySelectorAll('.edgeLabels .edgeLabel')].map((t) => {
            const r = t.getBoundingClientRect();
            const p = userPoint(svg, r.left + r.width / 2, r.top + r.height / 2);
            return { text: (t.textContent || '').trim(), cx: p.x, cy: p.y };
        });
        for (const el of svgEl.querySelectorAll('.edgePaths path')) {
            const ids = edgeIds(el);
            if (!ids) continue;
            const pts = waypoints(el);
            let label = '';
            if (pts.length >= 2 && labels.length > 0) {
                const midX = (pts[0].x + pts[pts.length - 1].x) / 2;
                const midY = (pts[0].y + pts[pts.length - 1].y) / 2;
                let best = null;
                let bestD = Infinity;
                for (const l of labels) {
                    const d = Math.hypot(l.cx - midX, l.cy - midY);
                    if (d < bestD && d < 40) {
                        bestD = d;
                        best = l.text;
                    }
                }
                label = best ?? '';
            }
            edges.push({
                from: ids.from,
                to: ids.to,
                label: label,
                style: 'normal',
                arrowHead: arrowKind(el),
                arrowTail: 'none',
                waypoints: pts,
                fromMultiplicity: '',
                toMultiplicity: '',
            });
        }
        const clusters = [];
        for (const el of svgEl.querySelectorAll('g.cluster')) {
            const b = box(el);
            clusters.push({ id: attr(el, 'id'), label: '', x: b.x, y: b.y, width: b.width, height: b.height });
        }
        // 边界：节点方形 + 边采样点并集；空时兜底 svg.getBBox
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const extend = (x, y) => {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        };
        for (const n of nodes) {
            extend(n.x - n.width / 2, n.y - n.height / 2);
            extend(n.x + n.width / 2, n.y + n.height / 2);
        }
        for (const e of edges) {
            for (const p of e.waypoints) extend(p.x, p.y);
        }
        let bb = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        if (minX > maxX) {
            try {
                const rootEl = svgEl.querySelector('svg') || svgEl;
                const b = rootEl.getBBox();
                bb = { x: b.x, y: b.y, width: b.width, height: b.height };
            } catch (e) {
                bb = { x: 0, y: 0, width: 0, height: 0 };
            }
        }
        return {
            nodes,
            edges,
            clusters,
            diagramType: 'flowchart',
            direction: 'TB',
            boundingBox: { minX: bb.x, minY: bb.y, maxX: bb.x + bb.width, maxY: bb.y + bb.height },
        };
    }

    window.__mmdExtractGeneric = extract;
})();
