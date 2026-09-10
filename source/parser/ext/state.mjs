// 浏览器端 state 提取器：DB 供关系语义，SVG 供节点几何与路径采样
(function () {
    'use strict';

    function box(el) {
        var r = el.getBBox();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    function nodeId(el) {
        var id = el.id || '';
        var m = /^[a-z]+-(.+)-.*$/.exec(id);
        return m ? m[1] : id;
    }

    function waypoints(path) {
        var d = path.getAttribute('d') || '';
        var pts = [];
        var lm = d.match(/M\s*([\d.]+)[,\s]+([\d.]+)/);
        if (lm) pts.push({ x: +lm[1], y: +lm[2] });
        for (var m of d.matchAll(/[Ll]\s*([\d.]+)[,\s]+([\d.]+)/g)) {
            pts.push({ x: +m[1], y: +m[2] });
        }
        return pts;
    }

    window.__mmdExtractState = function (diagram, svgEl) {
        var inner = diagram && diagram.db;
        var nodes = [];
        for (var el of svgEl.querySelectorAll('g.node')) {
            var b = box(el);
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
                waypoints: waypoints(paths[i]),
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
