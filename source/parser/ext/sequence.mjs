// 浏览器端 sequence 提取器：DB 语义（参与者/消息/激活/片段）+ 确定性布局
// 输入：getDiagramFromText 返回的包装对象（db 在 .db 上）；输出结构 JSON。
// 布局常量须与 diag/sequence.ts 一致（官方时间格 0.25IN=24px @96dpi；页眉区 65px…）。
(function () {
    'use strict';

    var HEADER_H = 40;
    var HEADER_TOP = 20;
    var ROW_GAP = 24;          // 0.25IN @96dpi（官方母版时间格步进 6.35MM）
    var FIRST_ROW_Y = 65;
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
            var ai = 0;
            for (var k of keys) {
                var a = am[k] || {};
                var label = String(a.description || k).trim();
                // 注意：这里必须用独立下标 ai。早先用 var i（后文才声明）→ 提升为 undefined，
                // x 变 NaN，契约归一化后落成 0（实测 actor 型参与者被摆到 x=0）。
                actors.push({ id: String(k), label: label, kind: a.type === 'actor' ? 'actor' : 'object', x: 75 + ai * X_GAP });
                ai++;
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
                    // 下限 30×20：actor（火柴人）框仅约 36px 宽，旧阈值 100 会漏掉它，
                    // 导致该参与者退回确定性列位（本次实测：x 变 NaN → 0）。
                    if (r.width < 30 || r.height < 20) continue;
                    if (r.width > 2000 || r.height > 4000) continue;   // 整图框
                    if (r.x < 0 || r.y < 0) continue;                  // 负坐标/未布局框
                    var txt = (g.textContent || '').trim();
                    if (!txt || txt.length > 60) continue;
                    boxes.push({ txt: txt, cx: r.x + r.width / 2 });
                }
                for (var j = 0; j < actors.length; j++) {
                    for (var b of boxes) {
                        if (b.txt === actors[j].label && b.cx > 0) {
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
                // 官方时序模具只有四类消息母版（Message/Return/Self/Asynchronous，无 cross 母版），
                // 故开放箭头与交叉箭头都落到 Asynchronous Message。
                // 实测 mermaid db type：0=->> 1=-->> 2=note 3=-x 4=--x 5=-> 6=--> 24=-) 25=--)
                else if (t === 3 || t === 4 || t === 5 || t === 6 || t === 24 || t === 25) kind = 'async';
                else if (t === 10) kind = 'loop';
                else if (t === 11) kind = 'loopend';
                else if (t === 12) kind = 'alt';
                else if (t === 13) kind = 'altelse';
                else if (t === 14) kind = 'altend';
                else if (t === 15) kind = 'opt';
                else if (t === 16) kind = 'optend';
                else if (t === 17) kind = 'activate';
                else if (t === 18) kind = 'deactivate';
                // 其余片段族（实测 type）：par 19/20/21、critical 27/28/29、break 30/31、rect 22/23
                else if (t === 19) kind = 'par';
                else if (t === 20) kind = 'parelse';
                else if (t === 21) kind = 'parend';
                else if (t === 27) kind = 'critical';
                else if (t === 28) kind = 'criticalelse';
                else if (t === 29) kind = 'criticalend';
                else if (t === 30) kind = 'break';
                else if (t === 31) kind = 'breakend';
                else if (t === 22) kind = 'rect';
                else if (t === 23) kind = 'rectend';
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

        // 自消息：mermaid 的 db 用 type=0 且 from===to 表示（无独立 type），契约有 'self' 语义
        // 与官方 Self Message 母版。activate/deactivate 行同样 from===to，但 kind 已非消息类，不参与。
        for (var si = 0; si < messages.length; si++) {
            var sm = messages[si];
            if (sm.from && sm.from === sm.to && (sm.kind === 'sync' || sm.kind === 'async' || sm.kind === 'return')) {
                sm.kind = 'self';
            }
        }

        // 时间格行模型（渲染器 diag/sequence.ts 用同一规则）：普通消息占 1 格，
        // 自消息占 2 格（官方 Self Message 高 0.5IN = 2×0.25IN），
        // 备注（note）占 2 格（官方 Note 高约 0.315IN，需 0.5IN 槽位才不压下一行）。
        // 行号必须**累计**——直接用消息下标会让跨行构件与相邻消息压在同一行。
        var startRows = [], endRows = [];
        var cursor = 0;
        for (var ri = 0; ri < messages.length; ri++) {
            startRows[ri] = cursor;
            if (messages[ri].kind === 'self') cursor += 2;
            else if (messages[ri].kind === 'note') cursor += 1;
            endRows[ri] = cursor;
            cursor += 1;
        }
        var totalRows = cursor;

        // 激活：按行号开合（17 开、18 关），几何 y 一次算好
        var activations = [];
        try {
            var open = {};
            var n = messages.length;
            for (var i2 = 0; i2 < n; i2++) {
                var msg = messages[i2];
                if (msg.kind === 'activate') {
                    open[msg.from] = startRows[i2];
                } else if (msg.kind === 'deactivate') {
                    var s = open[msg.from];
                    if (s !== undefined) {
                        activations.push({
                            actorId: msg.from,
                            x: actorX[msg.from] || 0,
                            yTop: rowY(s),
                            yBottom: rowY(startRows[i2]),
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
                        yBottom: rowY(totalRows),
                        width: 12
                    });
                }
            }
        } catch (e) { activations = []; }

        // 片段矩形：loop/opt（两段带）、alt/par/critical/break（容器 + 分支操作数）；
        // 分支 = altelse/parelse/criticalelse 行；rect 不产出片段（无母版，仅占行）。
        var kStarts = { loop: 1, opt: 1, alt: 1, par: 1, critical: 1, break: 1 };
        var kEnds = { loopend: 1, optend: 1, altend: 1, parend: 1, criticalend: 1, breakend: 1 };
        var kElse = { altelse: 'alt', parelse: 'par', criticalelse: 'critical' };
        var fragments = [];
        try {
            var stack = [];
            for (var i3 = 0; i3 < messages.length; i3++) {
                var mm = messages[i3];
                if (kStarts[mm.kind]) {
                    stack.push({ kind: mm.kind, label: mm.label, row: i3, branches: [{ label: mm.label, row: i3 }] });
                } else if (kElse[mm.kind] && stack.length > 0 && stack[stack.length - 1].kind === kElse[mm.kind]) {
                    stack[stack.length - 1].branches.push({ label: mm.label, row: i3 });
                } else if (kEnds[mm.kind] && stack.length > 0) {
                    var f = stack.pop();
                    var xMin = Infinity, xMax = -Infinity;
                    for (var mk = f.row; mk <= i3; mk++) {
                        var m2 = messages[mk];
                        if (!m2) continue;
                        // 只统计有实际参与者的消息：loop/loopend 等标记行 from/to 为空，
                        // 若按 0 参与包围盒会把片段左边界拖到页面外（实测 -40px）。
                        var pts = [];
                        if (typeof actorX[m2.from] === 'number') pts.push(actorX[m2.from]);
                        if (typeof actorX[m2.to] === 'number') pts.push(actorX[m2.to]);
                        if (!pts.length) continue;
                        var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
                        if (lo < xMin) xMin = lo;
                        if (hi > xMax) xMax = hi;
                    }
                    if (xMin > xMax) { xMin = 0; xMax = X_W; }
                    var operands = [];
                    if (f.branches.length > 1) {
                        for (var bi = 0; bi < f.branches.length; bi++) {
                            var nextRow = bi + 1 < f.branches.length ? f.branches[bi + 1].row : i3;
                            operands.push({
                                label: f.branches[bi].label,
                                yTop: rowY(startRows[f.branches[bi].row]),
                                yBottom: rowY(startRows[nextRow])
                            });
                        }
                    }
                    fragments.push({
                        kind: f.kind,
                        label: f.label,
                        x: (xMin - 40) + (xMax - xMin + 80) / 2,
                        y: rowY(startRows[f.row]),
                        width: xMax - xMin + 80,
                        height: rowY(endRows[i3]) - rowY(startRows[f.row]) + 60,
                        operands: operands
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
        var maxY = rowY(totalRows) + 80;
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
