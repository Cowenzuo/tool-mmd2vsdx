// 浏览器端 pie 提取器：从 mermaid pie 的 diagram DB（diagram.db）取语义
(function () {
    'use strict';

    window.__mmdExtractPieDB = function (diagram) {
        var inner = diagram && diagram.db;
        var slices = [];
        var title = '';
        try {
            var sections = inner.getSections();
            slices = Object.entries(sections).map(function (e) {
                return { label: String(e[0]), value: Number(e[1]), color: '' };
            });
        } catch (e) { /* 无语义块 */ }
        try {
            title = inner.getDiagramTitle() || '';
        } catch (e) { title = ''; }
        return {
            diagramType: 'pie',
            pie: { title: title, cx: 0, cy: 0, r: 185, slices: slices }
        };
    };
})();
