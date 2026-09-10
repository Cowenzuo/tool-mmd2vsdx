// mermaid-snapshot - extract/sequence.mjs：UML 序列图提取。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// 序列图：actor 生命线 + 消息线 + 激活条 + 循环片段。
// 依赖（同 bundle 全局）：closestNodeByX（dom.mjs）。
export function extractSequence(container, nodes, edges) {
    const sequence = { activations: [], fragments: [] };
    const actors = new Map();  // actor label -> x center

    // 人形 icon 元素（显式 `actor X` 声明才有）：
    // mermaid v10 中 actor 生命线头部是 <g class="actor-man actor-top">（线条小人），
    // participant/隐式生命线头部是 <rect class="actor actor-top">（无 icon）。
    // 按 x 中心匹配（lifeline 均匀排布，text 与 icon 中心一致）。
    const actorManX = [];
    for (const am of container.querySelectorAll('[class*="actor-man"]')) {
        try {
            const bb = am.getBBox();
            actorManX.push(bb.x + bb.width / 2);
        } catch (_) {}
    }
    const isActorMan = (x) =>
        actorManX.some(ax => Math.abs(ax - x) < 10);

    // Actors
    const actorEls = container.querySelectorAll('.actor, [class*="actor"]');
    const seenActors = new Set();
    for (const el of actorEls) {
        if (el.parentElement?.closest?.('.actor, [class*="actor"]')) continue;
        let label = '';
        const textEls = el.querySelectorAll('text, tspan');
        for (const t of textEls) {
            const txt = (t.textContent || '').trim();
            if (txt && txt.length < 100) { label = txt; break; }
        }
        if (!label || seenActors.has(label)) continue;
        seenActors.add(label);

        // Get actor center from the rect (more reliable than group bbox)
        let x = 0, y = 0, w = 60, h = 30;
        try {
            const rect = el.querySelector('rect');
            if (rect) {
                const bb = rect.getBBox();
                x = bb.x + bb.width / 2;
                y = bb.y + bb.height / 2;
                w = bb.width;
                h = bb.height;
            } else {
                const bb = el.getBBox();
                x = bb.x + bb.width / 2;
                y = bb.y + bb.height / 2;
                w = bb.width;
                h = bb.height;
            }
        } catch (_) {}
        // Ensure non-zero position for closestNode matching
        if (x === 0 && y === 0) { x = nodes.length * 100 + 50; y = 50; }

        nodes.push({ id: label, label, shape: 'roundRect', x, y, width: w, height: h,
            styleClass: '', parentId: '', lifelineKind: isActorMan(x) ? 'actor' : 'object' });
        actors.set(label, x);
    }
    // Messages: use message text x-position combined with line endpoints
    // 消息线：mermaid 复用 messageLine0 / messageLine1 类名轮换
    // （第 1 条=messageLine0, 第 2 条=messageLine1, 第 3 条=messageLine0...）
    // 按 y 排序配对：消息文本和消息线都从上到下排列。
    const msgTexts = Array.from(container.querySelectorAll('.messageText'));
    msgTexts.sort((a, b) => (parseFloat(a.getAttribute('y')) || 0) - (parseFloat(b.getAttribute('y')) || 0));
    const allLines = Array.from(container.querySelectorAll('[class*="messageLine"]'));
    allLines.sort((a, b) => (parseFloat(a.getAttribute('y1')) || 0) - (parseFloat(b.getAttribute('y1')) || 0));
    let seqMinY = Infinity, seqMaxY = -Infinity;
    for (let i = 0; i < msgTexts.length; i++) {
        const label = msgTexts[i]?.textContent?.trim() || '';
        const l = allLines[i];
        if (!l) continue;
        let x1 = parseFloat(l.getAttribute('x1')) || 0;
        let x2 = parseFloat(l.getAttribute('x2')) || 0;
        const y1 = parseFloat(l.getAttribute('y1')) || 0;
        const y2 = parseFloat(l.getAttribute('y2')) || 0;
        // 虚线检测：attribute + computed style 双重兜底
        const attrDash = l.getAttribute('stroke-dasharray') || '';
        let isDashed = attrDash && attrDash !== 'none';
        if (!isDashed && typeof getComputedStyle !== 'undefined') {
            const csd = getComputedStyle(l).strokeDasharray;
            isDashed = csd && csd !== 'none';
        }
        // Track Y range from message lines
        if (y1 > 0 && y1 < seqMinY) seqMinY = y1;
        if (y1 > seqMaxY) seqMaxY = y1;
        if (y2 > 0 && y2 < seqMinY) seqMinY = y2;
        if (y2 > seqMaxY) seqMaxY = y2;
        // If x coordinates are very close (sub-segment), use message text position
        const msgTextX = msgTexts[i] ? parseFloat(msgTexts[i].getAttribute('x') || '0') : 0;
        if (Math.abs(x2 - x1) < 20 && msgTextX > 0) {
            x1 = msgTextX - 40;
            x2 = msgTextX + 40;
        }
        // Fallback for (0,0): use actor x positions
        if (x1 === 0 && x2 === 0 && nodes.length >= 2) {
            x1 = nodes[0].x;
            x2 = nodes[nodes.length - 1].x;
        }
        const from = closestNodeByX(x1, nodes);
        const to   = closestNodeByX(x2, nodes);
        if (from && to && from !== to) {
            edges.push({ from, to, label,
                style: isDashed ? 'dotted' : 'normal',
                arrowHead: 'arrow', arrowTail: 'none',
                waypoints: [{x:x1,y:y1},{x:x2,y:y2}] });
        }
    }
    // actor 生命线需要延伸到消息底部。固定高度覆盖典型 sequence 范围。
    // mermaid v10 复刻了 actor（top/bottom），取到的 y 可能是底部复制品，
    // 统一放到顶部附近。
    if (isFinite(seqMinY) && isFinite(seqMaxY)) {
        for (const n of nodes) {
            if (n.y > 200) n.y = 50;
            n.height = Math.max(n.height, 350);
        }
    }

    // ── 激活条：<rect class='activation0/1/...'>，位于某 actor 生命线上 ──
    const actRects = container.querySelectorAll('rect[class*="activation"]');
    actRects.forEach(rect => {
        let ax = 0, ay = 0, aw = 10, ah = 40;
        try {
            const bb = rect.getBBox();
            ax = bb.x; ay = bb.y; aw = bb.width; ah = bb.height;
        } catch (_) {}
        // 找最近的 actor（按 x 中心）
        let bestActor = '', bestD = Infinity;
        for (const [name, cx] of actors) {
            const d = Math.abs(ax + aw / 2 - cx);
            if (d < bestD) { bestD = d; bestActor = name; }
        }
        if (!bestActor) return;
        sequence.activations.push({
            actorId: bestActor,
            x: ax + aw / 2,
            yTop: ay,
            yBottom: ay + ah,
            width: aw,
        });
    });

    // ── 循环片段：loopLine 组成边框 + loopText 标签 ──
    const loopLines = container.querySelectorAll('line.loopLine, [class*="loopLine"]');
    if (loopLines.length >= 2) {
        let lx1 = Infinity, ly1 = Infinity, lx2 = -Infinity, ly2 = -Infinity;
        loopLines.forEach(ln => {
            const x1 = parseFloat(ln.getAttribute('x1')) || 0;
            const y1 = parseFloat(ln.getAttribute('y1')) || 0;
            const x2 = parseFloat(ln.getAttribute('x2')) || 0;
            const y2 = parseFloat(ln.getAttribute('y2')) || 0;
            lx1 = Math.min(lx1, x1, x2);
            ly1 = Math.min(ly1, y1, y2);
            lx2 = Math.max(lx2, x1, x2);
            ly2 = Math.max(ly2, y1, y2);
        });
        if (isFinite(lx1) && isFinite(ly1) && lx2 > lx1 && ly2 > ly1) {
            const loopText = container.querySelector('text.loopText, [class*="loopText"]');
            const labelText = container.querySelector('text.labelText, [class*="labelText"]');
            sequence.fragments.push({
                kind: (labelText?.textContent || 'loop').trim(),
                label: (loopText?.textContent || '').trim(),
                x: lx1,
                y: ly1,
                width: lx2 - lx1,
                height: ly2 - ly1,
            });
        }
    }

    return sequence;
}
