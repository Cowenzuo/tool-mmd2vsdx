// 浏览器端 state 提取器：DB 供关系语义，SVG 供节点几何与路径采样
(function () {
    'use strict';

    function box(svg, el) {
        // 局部 getBBox 不含元素 transform——用屏幕矩形 + screenCTM 反变换（同 generic）
        var r = el.getBoundingClientRect();
        var pt = svg.createSVGPoint();
        pt.x = r.left + r.width / 2;
        pt.y = r.top + r.height / 2;
        var ctm = svg.getScreenCTM();
        if (!ctm) {
            var b = el.getBBox();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
        }
        var w = pt.matrixTransform(ctm.inverse());
        var sx = Math.abs(ctm.a) || 1;
        var sy = Math.abs(ctm.d) || 1;
        return { x: w.x - r.width / 2 / sx, y: w.y - r.height / 2 / sy, width: r.width / sx, height: r.height / sy };
    }

    function nodeId(el) {
        var id = el.id || '';
        var m = /^[a-z]+-(.+)-.*$/.exec(id);
        return m ? m[1] : id;
    }

    function waypoints(svg, path) {
        // 与 generic 同口径：d 属性局部坐标 → path.getCTM() 到根用户空间 →
        // svg.getScreenCTM().inverse() 世界坐标（路径容器带 transform 时 d 不可直接用）
        var d = path.getAttribute('d') || '';
        var raw = [];
        var lm = /M\s*([\d.]+)[,\s]+([\d.]+)/.exec(d);
        if (lm) raw.push({ x: +lm[1], y: +lm[2] });
        for (var mm = d.matchAll(/[Ll]\s*([\d.]+)[,\s]+([\d.]+)/g); ; ) {
            var n = mm.next();
            if (n.done) break;
            raw.push({ x: +n.value[1], y: +n.value[2] });
        }
        var ctm = svg.getScreenCTM();
        var pathCtm = path.getScreenCTM();
        if (!ctm || !pathCtm) return raw;
        return raw.map(function (p) {
            var pt = svg.createSVGPoint();
            pt.x = p.x;
            pt.y = p.y;
            var w = pt.matrixTransform(pathCtm).matrixTransform(ctm.inverse());
            return { x: w.x, y: w.y };
        });
    }

    window.__mmdExtractState = function (diagram, svgEl) {
        var inner = diagram && diagram.db;
        var svg = svgEl && (svgEl.querySelector('svg') || svgEl);
        if (!svg) return { diagramType: 'stateDiagram', nodes: [], edges: [], clusters: [], boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
        var nodes = [];
        for (var el of svgEl.querySelectorAll('g.node')) {
            var b = box(svg, el);
            var span = el.querySelector('.nodeLabel, text');
            nodes.push({
                id: nodeId(el),
                label: span ? (span.textContent || '').trim() : '',
                shape: 'rect',
                x: b.x + b.width / 2,
                y: b.y + b.height / 2,
                width: b.width,
                height: b.height,
                styleClass: '',
                parentId: '',
                dividers: []
            });
        }
        var rels = [];
        try {
            rels = inner.getRootDocV2().doc.filter(function (s) { return s.stmt === 'relation'; });
        } catch (e) { rels = []; }
        var paths = [...svgEl.querySelectorAll('path.transition, path.edge-thickness-normal')];
        var edges = [];
        for (var i = 0; i < paths.length; i++) {
            var rel = rels[i];
            if (!rel) break;
            edges.push({
                from: rel.state1.id,
                to: rel.state2.id,
                label: rel.description || '',
                style: 'normal',
                arrowHead: 'arrow',
                arrowTail: 'none',
                waypoints: waypoints(svg, paths[i]),
                fromMultiplicity: '',
                toMultiplicity: ''
            });
        }
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var n of nodes) {
            minX = Math.min(minX, n.x - n.width / 2);
            minY = Math.min(minY, n.y - n.height / 2);
            maxX = Math.max(maxX, n.x + n.width / 2);
            maxY = Math.max(maxY, n.y + n.height / 2);
        }
        return {
            nodes: nodes,
            edges: edges,
            clusters: [],
            diagramType: 'stateDiagram',
            direction: 'TB',
            boundingBox: minX <= maxX
                ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY }
                : { minX: 0, minY: 0, maxX: 0, maxY: 0 }
        };
    };
})();
