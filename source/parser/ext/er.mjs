// 浏览器端 er 提取器：DB 语义（实体/属性/关系）→ 结构 JSON
// 属性文本拼装：`类型 名称`；键属性由 attributeKeyTypeList 标记。
(function () {
    'use strict';

    window.__mmdExtractER = function (diagram) {
        var d = (diagram && diagram.db) || {};
        var entities = [];
        try {
            var map = (typeof d.getEntities === 'function' ? d.getEntities() : {}) || {};
            for (var k of Object.keys(map)) {
                var e = map[k] || {};
                entities.push({
                    id: String(k),
                    name: String(k),
                    attributes: (e.attributes || []).map(function (at) {
                        return {
                            name: String(at.attributeName || ''),
                            type: String(at.attributeType || ''),
                            primaryKey: !!((at.attributeKeyTypeList || []).indexOf('PK') >= 0),
                            foreignKey: !!((at.attributeKeyTypeList || []).indexOf('FK') >= 0),
                            required: !!(at.comment || '').length
                        };
                    })
                });
            }
        } catch (e) { entities = []; }
        var relations = [];
        try {
            var rels = (typeof d.getRelationships === 'function' ? d.getRelationships() : []) || [];
            for (var r of rels) {
                if (!r || !r.entityA || !r.entityB) continue;
                var spec = r.relSpec || {};
                relations.push({
                    from: String(r.entityA),
                    to: String(r.entityB),
                    label: String(r.roleA || ''),
                    multiplicityFrom: String(spec.cardA || ''),
                    multiplicityTo: String(spec.cardB || ''),
                    identifying: spec.relType === 'IDENTIFYING'
                });
            }
        } catch (e) { relations = []; }
        return {
            diagramType: 'er',
            erModel: { entities: entities, relations: relations },
            boundingBox: { minX: 0, minY: 0, maxX: 800, maxY: 700 }
        };
    };
})();
