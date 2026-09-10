// 浏览器端 sequence 提取器：DB 语义（参与者/消息/激活/片段）+ 确定性布局
// 输入：getDiagramFromText 返回的包装对象（db 在 .db 上）；输出结构 JSON。
// 布局常量须与 diag/sequence.ts 一致（同一份设计：间距 0.541667in=52px…）。
(function () {
    'use strict';

    var HEADER_H = 40;
    var HEADER_TOP = 20;
    var ROW_GAP = 52;
    var FIRST_ROW_Y = 85;
    var X_W = 150;
    var X_GAP = 200;

    function rowY(i) { return FIRST_ROW_Y + i * ROW_GAP; }

    window.__mmdExtractSequence = function (diagram, svgEl) {
        var d = (diagram && diagram.db) || {};
        var actors = [];
        var actorX = {};
        try {
            var am = (typeof d.getActors === 'function' ? d.getActors() : {}) || {};
            var keys = (typeof d.getActorKeys === 'function' ? d.getActorKeys() : Object.keys(am)) || [];
            for (var k of keys) {
                var a = am[k] || {};
                var label = String(a.description || k).trim();
                actors.push({ id: String(k), label: label, kind: a.type === 'actor' ? 'actor' : 'object', x: 75 + i * X_GAP });
            }
        } catch (e) { actors = []; }

        // X 位置：优先 SVG 中与标签匹配的参与者框，缺省确定性列
        for (var i = 0; i < actors.length; i++) {
            actorX[actors[i].id] = 75 + i * X_GAP;
        }
        if (svgEl && actors.length > 0) {
            try {
                var boxes = [];
                for (var g of svgEl.querySelectorAll('g')) {
                    var r = g.getBBox();
                    if (r.width < 100 || r.height < 30) continue;
                    var txt = (g.textContent || '').trim();
                    if (!txt || txt.length > 60) continue;
                    boxes.push({ txt: txt, cx: r.x + r.width / 2 });
                }
                for (var j = 0; j < actors.length; j++) {
                    for (var b of boxes) {
                        if (b.txt === actors[j].label) {
                            actorX[actors[j].id] = Math.round(b.cx);
                            actors[j].x = actorX[actors[j].id];
                            break;
                        }
                    }
                }
            } catch (e) { /* 保持确定性列 */ }
        }

        var messages = [];
        try {
            var raw = (typeof d.getMessages === 'function' ? d.getMessages() : []) || [];
            for (var m of raw) {
                var kind = 'sync';
                var t = m.type;
                if (t === 1) kind = 'return';
                else if (t === 2) kind = 'note';
                else if (t === 4 || t === 5 || t === 6) kind = 'async';
                else if (t === 10) kind = 'loop';
                else if (t === 11) kind = 'loopend';
                else if (t === 12) kind = 'alt';
                else if (t === 13) kind = 'altelse';
                else if (t === 14) kind = 'altend';
                else if (t === 15) kind = 'opt';
                else if (t === 16) kind = 'optend';
                else if (t === 17) kind = 'activate';
                else if (t === 18) kind = 'deactivate';
                var from = typeof m.from === 'string' ? m.from : (m.from && m.from.actor) || '';
                var to = typeof m.to === 'string' ? m.to : (m.to && m.to.actor) || '';
                messages.push({
                    from: String(from || ''),
                    to: String(to || ''),
                    label: String(m.message || ''),
                    kind: kind,
                    activate: !!m.activate
                });
            }
        } catch (e) { messages = []; }

        // 激活：按行号开合（17 开、18 关），几何 y 一次算好
        var activations = [];
        try {
            var open = {};
            var n = messages.length;
            for (var i2 = 0; i2 < n; i2++) {
                var msg = messages[i2];
                if (msg.kind === 'activate') {
                    open[msg.from] = i2;
                } else if (msg.kind === 'deactivate') {
                    var s = open[msg.from];
                    if (s !== undefined) {
                        activations.push({
                            actorId: msg.from,
                            x: actorX[msg.from] || 0,
                            yTop: rowY(s),
                            yBottom: rowY(i2),
                            width: 12
                        });
                        delete open[msg.from];
                    }
                }
            }
            for (var aId in open) {
                if (open.hasOwnProperty(aId)) {
                    activations.push({
                        actorId: aId,
                        x: actorX[aId] || 0,
                        yTop: rowY(open[aId]),
                        yBottom: rowY(n),
                        width: 12
                    });
                }
            }
        } catch (e) { activations = []; }

        // 片段矩形：loop/alt/opt；边界行号同上
        var fragments = [];
        try {
            var stack = [];
            for (var i3 = 0; i3 < messages.length; i3++) {
                var mm = messages[i3];
                if (mm.kind === 'loop' || mm.kind === 'alt' || mm.kind === 'opt') {
                    stack.push({ kind: mm.kind, label: mm.label, row: i3 });
                } else if ((mm.kind === 'loopend' || mm.kind === 'altend' || mm.kind === 'optend') && stack.length > 0) {
                    var f = stack.pop();
                    var xMin = Infinity, xMax = -Infinity;
                    for (var mk = f.row; mk <= i3; mk++) {
                        var m2 = messages[mk];
                        var x1 = actorX[m2.from] || 0;
                        var x2 = actorX[m2.to] || 0;
                        var lo = Math.min(x1, x2), hi = Math.max(x1, x2);
                        if (lo < xMin) xMin = lo;
                        if (hi > xMax) xMax = hi;
                    }
                    if (xMin > xMax) { xMin = 0; xMax = X_W; }
                    fragments.push({
                        kind: f.kind,
                        label: f.label,
                        x: (xMin - 40) + (xMax - xMin + 80) / 2,
                        y: rowY(f.row),
                        width: xMax - xMin + 80,
                        height: rowY(i3) - rowY(f.row) + 60
                    });
                }
            }
        } catch (e) { fragments = []; }

        // 边界：以最后一行 + 底部余量
        var maxX = 150 + X_GAP * (actors.length - 1) + 100;
        for (var f2 of fragments) {
            var rx = f2.x + f2.width / 2;
            if (rx > maxX) maxX = rx;
        }
        var maxY = rowY(messages.length) + 80;
        return {
            diagramType: 'sequence',
            sequence: {
                actors: actors,
                messages: messages,
                activations: activations,
                fragments: fragments
            },
            boundingBox: { minX: 0, minY: 0, maxX: maxX, maxY: maxY }
        };
    };
})();
