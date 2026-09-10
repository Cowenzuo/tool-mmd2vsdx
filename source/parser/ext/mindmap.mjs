// 浏览器端 mindmap 提取器：DB 树（节点/父子）+ SVG 盒子坐标
// 深度取 DB 树层级；盒子按标签文本关联 g.mindmap-node 的屏幕坐标。
(function () {
    'use strict';

    window.__mmdExtractMindmap = function (diagram, svgEl) {
        var d = (diagram && diagram.db) || {};
        var tree = null;
        try {
            tree = (typeof d.getMindmap === 'function' ? d.getMindmap() : null) || null;
        } catch (e) { tree = null; }
        if (!tree) return { diagramType: 'mindmap', boundingBox: { minX: 0, minY: 0, maxX: 700, maxY: 400 } };

        // SVG 盒子：屏幕坐标 → 页面坐标（svg 局部）
        var boxes = [];
        if (svgEl) {
            try {
                var svg = svgEl.querySelector('svg') || svgEl;
                for (var g of svgEl.querySelectorAll('g.mindmap-node')) {
                    var r = g.getBoundingClientRect();
                    var pt = svg.createSVGPoint();
                    pt.x = r.left + r.width / 2;
                    pt.y = r.top + r.height / 2;
                    var ctm = svg.getScreenCTM();
                    var world = ctm ? pt.matrixTransform(ctm.inverse()) : { x: pt.x, y: pt.y };
                    var txt = (g.textContent || '').trim();
                    if (!txt) continue;
                    boxes.push({ label: txt, x: world.x, y: world.y, w: r.width, h: r.height });
                }
            } catch (e) { boxes = []; }
        }

        function collect(node, depth, out, parent) {
            var label = node.descr || node.nodeId || String(node.id);
            var b = boxes.find(function (x) { return x.label === label; });
            out.push({
                id: String(node.id),
                label: label,
                parentId: parent ? String(parent.id) : '',
                depth: depth,
                x: b ? b.x : 150 + depth * 180,
                y: b ? b.y : 200 + out.length * 30,
                width: b ? b.w : 60,
                height: b ? b.h : 30
            });
            for (var ch of (node.children || [])) collect(ch, depth + 1, out, node);
        }

        var nodes = [];
        collect(tree, 0, nodes, null);
        var maxX = 0, maxY = 0;
        for (var n2 of nodes) {
            var rx = n2.x + n2.width / 2 + 20;
            var ry = n2.y + n2.height / 2 + 20;
            if (rx > maxX) maxX = rx;
            if (ry > maxY) maxY = ry;
        }
        return {
            diagramType: 'mindmap',
            mindmap: { rootId: String(tree.id), nodes: nodes },
            boundingBox: { minX: 0, minY: 0, maxX: maxX || 700, maxY: maxY || 400 }
        };
    };
})();
