// 浏览器端 class 提取器：DB 语义（类/成员/关系）+ SVG 布局（中心点/盒尺寸）→ 结构 JSON
// 布局：mermaid dagre 布局结果保比例（每类 g.transform=translate(中心)、rect width/height）；
//      盒内容尺寸由类定义决定，此处仅记录 mmd 布局供渲染器按比例重排（行高不一致防重叠）。
(function () {
    'use strict';

    function extractLayout(svgEl) {
        var out = {};
        if (!svgEl) return out;
        try {
            for (var g of svgEl.querySelectorAll('g')) {
                var tr = g.getAttribute('transform') || '';
                var m = /translate\(([-\d.]+)[,\s]+([-\d.]+)\)/.exec(tr);
                if (!m) continue;
                var idm = /classId-([^-]+)-(\d+)/.exec(g.id || '');
                if (!idm) continue;
                var rect = g.querySelector('rect');
                if (!rect) continue;
                var w = parseFloat(rect.getAttribute('width') || '0');
                var h = parseFloat(rect.getAttribute('height') || '0');
                if (!w || !h) continue;
                out[decodeURIComponent(idm[1])] = { x: parseFloat(m[1]), y: parseFloat(m[2]), width: w, height: h };
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
            for (var p of svgEl.querySelectorAll('path')) {
                var d = p.getAttribute('d') || '';
                if (!d || d.charAt(0) !== 'M') continue;
                // 跳过箭头小形状（起点在 0..20 局部区间且不含 L 到 300+ 的），取长路径
                if (/^M\s?[0-9]{1,2}[,\s]/.test(d) && !/C/.test(d)) continue;
                var m = /^M\s?([-\d.]+)[,\s]+([-\d.]+)/.exec(d);
                if (!m) continue;
                var parts = d.match(/[LC]\s?([-\d.]+)[,\s]+([-\d.]+)/g) || [];
                if (!parts.length) continue;
                var last = /([-\d.]+)[,\s]+([-\d.]+)/.exec(parts[parts.length - 1]);
                if (!last) continue;
                paths.push({ sx: +m[1], sy: +m[2], ex: +last[1], ey: +last[2] });
            }
            // 每条关系匹配最近 path：按起终点与 layout 中心匹配（顺序对应 db.getRelations）
            // 更稳：起终点最近的盒名 = from/to（与 relations 顺序同 db 顺序——按 from/to 名称对齐）
            for (var r of relations) {
                var b = layout[r.from], t = layout[r.to];
                if (!b || !t) continue;
                // 找起点靠近 b 盒且终点靠近 t 盒的 path
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

    window.__mmdExtractClass = function (diagram, svgEl) {
        var layout = extractLayout(svgEl);
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
                // 布局（主键=类名；mmd 中心点/盒宽高——仅保比例）
                var ly = layout[String(c.label || k)];
                if (ly) {
                    box.x = ly.x;
                    box.y = ly.y;
                    box.width = ly.width;
                    box.height = ly.height;
                }
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
                if (typeof console !== 'undefined') console.log('[class-raw]', r.id1, '->', r.id2, 'type2=', t2, 'lineType=', lt, JSON.stringify(r.relation && r.relation.title || ''));
                // 官方母版映射（mermaid 10.9 实证：type2 0=AGGREGATION/1=EXTENSION/2=COMPOSITION/3=DEPENDENCY/4=LOLLIPOP；
                // lineType 0=实线/1=虚线）：
                //  --|>  solid EXTENSION → inheritance；..|>  dashed EXTENSION → realization；
                //  ..>   dashed DEPENDENCY → dependency；-->（solid）与 --o/--*（聚合/组合）无官方母版 → unsupported。
                var kind = null;
                // mermaid 10.9 实测：type2 0=AGGREGATION/1=EXTENSION/2=COMPOSITION/3=DEPENDENCY/4=LOLLIPOP；
                // lineType 0=实线/1=虚线。官方母版15（Inheritance 载体）Actions 菜单逐项对应：
                //  --|> 1:0 EXTENSION 实线 → inheritance；..|> 1:1 → realization；
                //  ..>  3:1 DEPENDENCY 虚线 → dependency；--> 3:0 DEPENDENCY 实线=定向关联 → association；
                //  --o  0:0 AGGREGATION → aggregation；*-- 2:0 COMPOSITION → composition。
                if (t2 === 1 && lt === 0) kind = 'inheritance';
                else if (t2 === 1 && lt === 1) kind = 'realization';
                else if (t2 === 3 && lt === 1) kind = 'dependency';
                else if (t2 === 3 && lt === 0) kind = 'association';
                else if (t2 === 0 && lt === 0) kind = 'aggregation';
                else if (t2 === 2 && lt === 0) kind = 'composition';
                else kind = 'unsupported';
                relations.push({
                    from: String(r.id1),
                    to: String(r.id2),
                    label: '',
                    kind: kind
                });
            }
        } catch (e) { relations = []; }
        extractEdges(svgEl, layout, relations);
        return {
            diagramType: 'class',
            classModel: { classes: classes, relations: relations, layout: layout },
            boundingBox: { minX: 0, minY: 0, maxX: 800, maxY: 600 }
        };
    };
})();
