// 浏览器端 quadrant 提取器：DB 取点与标题，SVG 补轴标签
(function () {
    'use strict';

    window.__mmdExtractQuadrant = function (diagram, svgEl) {
        var inner = diagram && diagram.db;
        var title = '';
        var points = [];
        try { title = inner.getDiagramTitle() || ''; } catch (e) { title = ''; }
        try {
            var data = inner.getQuadrantData();
            points = (data.points || []).map(function (p) {
                var t = p.text || {};
                return { label: t.text || '', x: p.x || 0, y: p.y || 0 };
            });
        } catch (e) { points = []; }
        // 轴标签：SVG 文本中不在标题/点标签里的
        var known = new Set(points.map(function (p) { return p.label; }));
        if (title) known.add(title);
        var extra = [];
        try {
            var texts = [];
            svgEl.querySelectorAll('text').forEach(function (t) {
                var s = (t.textContent || '').trim();
                if (s && !known.has(s)) texts.push(s);
            });
            extra = texts.slice(0, 4);
        } catch (e) { extra = []; }
        return {
            diagramType: 'quadrant',
            quadrant: { title: title, points: points, axisTexts: extra }
        };
    };
})();
