// 浏览器端 er 提取器：DB 语义（实体/属性/关系）+ SVG 布局（中心点/盒尺寸）+ 边选择 → 结构 JSON
// 属性文本拼装：`类型 名称`；键属性由 attributeKeyTypeList 标记。
// 布局：mermaid dagre 布局结果保比例（每实体 g transform=translate(盒左上角)、rect width/height；
//      中心=左上+尺寸/2）；盒内容尺寸由实体定义决定，此处仅记录 mmd 布局供渲染器按比例重排。
(function () {
    'use strict';

    // mermaid generateId 净化（BAD_ID_CHARS_REGEXP）：名称→纯字母数字（如 ORDER_LINE→ORDERLINE）
    var BAD_ID_RE = /[^\dA-Za-z](\W)*/g;
    var sanitize = function (s) { return String(s).replace(BAD_ID_RE, ''); };

    function extractLayout(svgEl, knownNames) {
        var out = {};
        if (!svgEl) return out;
        // knownNames（DB 实体名）→ sanitized 名索引：id 段 → 真实名（下划线等被净化时回映）
        var bySan = {};
        for (var n of knownNames || []) bySan[sanitize(n)] = n;
        try {
            for (var g of svgEl.querySelectorAll('g')) {
                var tr = g.getAttribute('transform') || '';
                var m = /translate\(([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(tr);
                if (!m) continue;
                var idm = /^entity-([^-]+)-/.exec(g.id || '');
                if (!idm) continue;
                var rect = g.querySelector('rect');
                if (!rect) continue;
                var w = parseFloat(rect.getAttribute('width') || '0');
                var h = parseFloat(rect.getAttribute('height') || '0');
                if (!w || !h) continue;
                var seg = decodeURIComponent(idm[1]);
                var name = bySan[seg] !== undefined ? bySan[seg] : seg;
                // mmd ER：g transform = 盒左上角（graph.node.x-width/2）；中心 = 左上 + 尺寸/2
                var x0 = parseFloat(m[1]);
                var y0 = parseFloat(m[2]);
                if (out[name] === undefined) out[name] = { x: x0 + w / 2, y: y0 + h / 2, width: w, height: h };
            }
        } catch (e) { out = {}; }
        return out;
    }

    // 边判定（mmd 边选择：起终点贴盒哪条边；位置由渲染端取边中点——不用 mmd 角点）
    function edgeOf(px, py, box) {
        var dL = Math.abs(px - (box.x - box.width / 2));
        var dR = Math.abs((box.x + box.width / 2) - px);
        var dT = Math.abs(py - (box.y - box.height / 2));
        var dB = Math.abs((box.y + box.height / 2) - py);
        var best = 'left', bd = dL;
        if (dR < bd) { bd = dR; best = 'right'; }
        if (dT < bd) { bd = dT; best = 'top'; }
        if (dB < bd) { bd = dB; best = 'bottom'; }
        return best;
    }

    function extractEdges(svgEl, layout, relations) {
        if (!svgEl || !relations || !relations.length) return;
        try {
            var paths = [];
            var nodes = svgEl.querySelectorAll('path.er.relationshipLine');
            if (!nodes.length) nodes = svgEl.querySelectorAll('path');
            for (var p of nodes) {
                var d = p.getAttribute('d') || '';
                if (!d || d.charAt(0) !== 'M') continue;
                var m = /^M\s?([-\d.]+)[,\s]+([-\d.]+)/.exec(d);
                if (!m) continue;
                var parts = d.match(/[LC]\s?([-\d.]+)[,\s]+([-\d.]+)/g) || [];
                if (!parts.length) continue;
                var last = /([-\d.]+)[,\s]+([-\d.]+)/.exec(parts[parts.length - 1]);
                if (!last) continue;
                paths.push({ sx: +m[1], sy: +m[2], ex: +last[1], ey: +last[2] });
            }
            // 每条关系匹配最近 path：起终点与 layout 中心匹配（与 relations 顺序同 db 顺序，按名称对齐）
            for (var r of relations) {
                var b = layout[r.from], t = layout[r.to];
                if (!b || !t) continue;
                var bestP = null, bestD = Infinity;
                for (var p of paths) {
                    var db2 = Math.hypot(p.sx - b.x, p.sy - b.y) + Math.hypot(p.ex - t.x, p.ey - t.y);
                    if (db2 < bestD) { bestD = db2; bestP = p; }
                }
                if (bestP) {
                    r.fromEdge = edgeOf(bestP.sx, bestP.sy, b);
                    r.toEdge = edgeOf(bestP.ex, bestP.ey, t);
                }
            }
        } catch (e) { /* 边缺失不致命 */ }
        return relations;
    }

    window.__mmdExtractER = function (diagram, svgEl) {
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
        var layout = extractLayout(svgEl, entities.map(function (x) { return x.name; }));
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
        extractEdges(svgEl, layout, relations);
        return {
            diagramType: 'er',
            erModel: { entities: entities, relations: relations, layout: layout },
            boundingBox: { minX: 0, minY: 0, maxX: 800, maxY: 700 }
        };
    };
})();
