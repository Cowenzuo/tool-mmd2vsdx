// 浏览器端 xychart 提取器：DB 可绘制元素（柱/线）→ 无文本节点矩形
// 金标准同构：仅柱状单元（rect）产出形状，文本全部忽略。
(function () {
    'use strict';

    window.__mmdExtractXY = function (diagram) {
        var d = (diagram && diagram.db) || {};
        var nodes = [];
        try {
            var elems = (typeof d.getDrawableElem === 'function' ? d.getDrawableElem() : []) || [];
            for (var e of elems) {
                if (e.type !== 'rect' || !e.data) continue;
                for (var r of e.data) {
                    var w = Number(r.width) || 10;
                    var h = Number(r.height) || 10;
                    var x = Number(r.x) || 0;
                    var y = Number(r.y) || 0;
                    nodes.push({
                        id: 'bar-' + nodes.length,
                        label: '',
                        shape: 'rect',
                        x: x + w / 2,
                        y: y + h / 2,
                        width: w,
                        height: h,
                        styleClass: '',
                        parentId: '',
                        dividers: []
                    });
                }
            }
        } catch (e) { nodes = []; }
        var maxX = 0, maxY = 0;
        for (var n of nodes) {
            if (n.x + n.width / 2 > maxX) maxX = n.x + n.width / 2;
            if (n.y + n.height / 2 > maxY) maxY = n.y + n.height / 2;
        }
        return {
            nodes: nodes,
            edges: [],
            clusters: [],
            diagramType: 'xy',
            direction: 'LR',
            boundingBox: { minX: 0, minY: 0, maxX: maxX || 700, maxY: maxY || 500 }
        };
    };
})();
