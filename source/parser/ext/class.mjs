// 浏览器端 class 提取器：DB 语义（类/成员/关系）→ 结构 JSON
// 文本拼装约定：类型标记以 «» 展示；成员显示名 = 可见性+名（方法含参数表）。
(function () {
    'use strict';

    window.__mmdExtractClass = function (diagram) {
        var d = (diagram && diagram.db) || {};
        var classes = [];
        try {
            var map = (typeof d.getClasses === 'function' ? d.getClasses() : {}) || {};
            var ids = Object.keys(map);
            for (var k of ids) {
                var c = map[k] || {};
                var box = {
                    id: String(c.id || k),
                    name: String(c.label || k),
                    stereotypes: (c.annotations || []).map(function (a) { return String(a); }),
                    attributes: [],
                    operations: []
                };
                for (var m of (c.members || [])) {
                    if (m.memberType !== 'attribute') continue;
                    box.attributes.push({
                        name: String(m.id || ''),
                        visibility: String(m.visibility || '')
                    });
                }
                for (var m2 of (c.methods || [])) {
                    var p = String(m2.parameters || '');
                    box.operations.push({
                        name: String(m2.id || '') + '(' + p + ')',
                        visibility: String(m2.visibility || '')
                    });
                }
                classes.push(box);
            }
        } catch (e) { classes = []; }
        var relations = [];
        try {
            var rels = (typeof d.getRelations === 'function' ? d.getRelations() : []) || [];
            for (var r of rels) {
                if (!r || !r.id1 || !r.id2) continue;
                var t2 = r.relation && r.relation.type2;
                var lt = r.relation && r.relation.lineType;
                // 官方母版映射（mermaid 10.9 实证：type2 0=AGGREGATION/1=EXTENSION/2=COMPOSITION/3=DEPENDENCY/4=LOLLIPOP；
                // lineType 0=实线/1=虚线）：
                //  --|>  solid EXTENSION → inheritance；..|>  dashed EXTENSION → realization；
                //  ..>   dashed DEPENDENCY → dependency；-->（solid）与 --o/--*（聚合/组合）无官方母版 → unsupported。
                var kind = null;
                if (t2 === 1 && lt === 0) kind = 'inheritance';
                else if (t2 === 1 && lt === 1) kind = 'realization';
                else if (t2 === 3 && lt === 1) kind = 'dependency';
                else kind = 'unsupported';
                relations.push({
                    from: String(r.id1),
                    to: String(r.id2),
                    label: '',
                    kind: kind
                });
            }
        } catch (e) { relations = []; }
        return {
            diagramType: 'class',
            classModel: { classes: classes, relations: relations },
            boundingBox: { minX: 0, minY: 0, maxX: 800, maxY: 600 }
        };
    };
})();
