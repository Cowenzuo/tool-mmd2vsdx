// 浏览器端 c4 提取器：DB 语义（形状/关系/标题）+ 确定性行布局
// 文本拼装：`<<类型>>\n名称`（与金标准一致，实体转义由转义层处理）。
(function () {
    'use strict';

    window.__mmdExtractC4 = function (diagram) {
        var d = (diagram && diagram.db) || {};
        var shapes = [];
        try {
            var arr = (typeof d.getC4ShapeArray === 'function' ? d.getC4ShapeArray() : []) || [];
            var w = 250, h = 80, x0 = 100, gap = 60;
            for (var i = 0; i < arr.length; i++) {
                var s = arr[i];
                var type = (s.typeC4Shape && s.typeC4Shape.text) || '';
                var label = (s.label && s.label.text) || s.alias || '';
                var x = x0 + i * (w + gap);
                shapes.push({
                    id: String(s.alias || i),
                    label: '<<' + type + '>>\n' + label,
                    shape: 'rect',
                    x: x + w / 2,
                    y: 200,
                    width: w,
                    height: h,
                    styleClass: 'flowchart-label',
                    parentId: '',
                    dividers: []
                });
            }
        } catch (e) { shapes = []; }
        var nodes = shapes.slice();
        try {
            var title = (typeof d.getTitle === 'function' ? d.getTitle() : '') || '';
            if (title) {
                nodes.unshift({
                    id: '___c4_title___',
                    label: title,
                    shape: 'rect',
                    x: 100 + (shapes.length * (250 + 60)) / 2,
                    y: 80,
                    width: 200,
                    height: 40,
                    styleClass: '',
                    parentId: '',
                    dividers: []
                });
            }
        } catch (e) { /* 无标题 */ }
        var edges = [];
        try {
            var rels = (typeof d.getRels === 'function' ? d.getRels() : []) || [];
            for (var r of rels) {
                var from = shapes.find(function (s) { return s.id === r.from; });
                var to = shapes.find(function (s) { return s.id === r.to; });
                if (!from || !to) continue;
                edges.push({
                    from: from.id,
                    to: to.id,
                    label: (r.label && r.label.text) || '',
                    style: 'normal',
                    arrowHead: 'arrow',
                    arrowTail: 'none',
                    waypoints: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
                    fromMultiplicity: '',
                    toMultiplicity: ''
                });
            }
        } catch (e) { edges = []; }
        var maxX = 200 + shapes.length * (250 + 60);
        var maxY = 400;
        return {
            nodes: nodes,
            edges: edges,
            clusters: [],
            diagramType: 'c4',
            direction: 'TB',
            boundingBox: { minX: 0, minY: 0, maxX: maxX, maxY: maxY }
        };
    };
})();
