// mermaid-snapshot - extract/c4.mjs：C4 图提取。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// C4：person-man/system 组件组 + 独立标题文本 + 带 marker 的连线。
// 依赖（同 bundle 全局）：parsePathD / closestNode（dom.mjs）。
export function extractC4(container, nodes, edges) {
    // C4 uses <g class="person-man"> for each component
    const groups = container.querySelectorAll('[class*="person-man"], [class*="system"]');
    for (const g of groups) {
        const rect = g.querySelector('rect');
        if (!rect) continue;
        const texts = g.querySelectorAll('text, tspan');
        const seen = new Set();
        const textParts = [];
        for (const t of texts) {
            const txt = (t.textContent || '').trim();
            if (txt && !seen.has(txt)) {
                seen.add(txt);
                textParts.push(txt);
            }
        }
        if (textParts.length === 0) continue;
        const label = textParts.join('\n');
        const name = textParts[textParts.length - 1];
        let x = 0, y = 0, w = 0, h = 0;
        try { const bb = rect.getBBox(); x = bb.x + bb.width/2; y = bb.y + bb.height/2; w = bb.width; h = bb.height; } catch (_) {}
        nodes.push({ id: name, label, shape: 'rect', x, y, width: w, height: h, styleClass: '', parentId: '' });
    }
    // Title text (standalone, outside any group)
    const allTexts = container.querySelectorAll('text');
    for (const t of allTexts) {
        if (t.closest('[class*="person-man"]') || t.closest('[class*="system"]') || t.closest('g:not(:root)')) continue;
        const txt = (t.textContent || '').trim();
        if (txt && txt.length < 50) {
            const x = parseFloat(t.getAttribute('x')) || 0;
            const y = parseFloat(t.getAttribute('y')) || 0;
            nodes.push({ id: txt, label: txt, shape: 'rect', x, y, width: 200, height: 20, styleClass: '', parentId: '' });
        }
    }
    // Edges: lines and paths with markers (arrows)
    const edgeEls = container.querySelectorAll('line[marker-end], path[marker-end], line[stroke], path[stroke]');
    for (const el of edgeEls) {
        if (el.closest('[class*="person-man"]') || el.closest('[class*="system"]')) continue;
        const d = el.getAttribute('d') || '';
        let pts = [];
        if (d) {
            pts = parsePathD(d);
        } else {
            const x1 = parseFloat(el.getAttribute('x1')) || 0;
            const y1 = parseFloat(el.getAttribute('y1')) || 0;
            const x2 = parseFloat(el.getAttribute('x2')) || 0;
            const y2 = parseFloat(el.getAttribute('y2')) || 0;
            if (x1 || y1 || x2 || y2) pts = [{x:x1,y:y1}, {x:x2,y:y2}];
        }
        if (pts.length >= 2) {
            const from = closestNode(pts[0], nodes);
            const to = closestNode(pts[pts.length - 1], nodes);
            let label = '';
            let sib = el.nextElementSibling;
            while (sib && !label) {
                if (sib.tagName === 'text' || sib.tagName === 'tspan')
                    label = (sib.textContent || '').trim();
                sib = sib.nextElementSibling;
            }
            if (from && to && from !== to) {
                edges.push({ from, to, label, style: 'normal', arrowHead: 'arrow', arrowTail: 'none', waypoints: pts });
            }
        }
    }
    // Title text (standalone text not inside a person-man group)
    const titleEl = container.querySelector(':scope > text');
    if (titleEl && nodes.length === 0) {
        // Only if no nodes were found, add title as a node
    }
}
