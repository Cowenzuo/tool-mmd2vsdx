// mermaid-snapshot - extract/generic.mjs：通用兜底提取（rect+text → Node，line/path → Edge）。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// 依赖（同 bundle 全局）：closestNode（dom.mjs）。
export function extractGeneric(container, nodes, edges) {
    // For gantt, pie, gitGraph, mindmap, timeline, journey, quadrant, xy
    const rects = [...container.querySelectorAll('rect')].filter(r => {
        const cls = r.getAttribute('class') || '';
        return !cls.includes('background') && !cls.includes('grid') && !cls.includes('axis');
    });
    const texts = [...container.querySelectorAll('text')];
    const lines = [...container.querySelectorAll('line, path')].filter(l => {
        const cls = l.getAttribute('class') || '';
        return cls.includes('line') || cls.includes('link') || cls.includes('message') || cls.includes('edge');
    });

    // Group rects by vertical/horizontal position for complex layouts
    for (const rect of rects) {
        try {
            const bb = rect.getBBox();
            if (bb.width < 5 || bb.height < 5) continue;
            const cx = bb.x + bb.width/2, cy = bb.y + bb.height/2;
            // Find nearest text as label
            let label = '';
            let bestD = Infinity;
            for (const t of texts) {
                try {
                    const tb = t.getBBox();
                    const dx = (tb.x + tb.width/2) - cx;
                    const dy = (tb.y + tb.height/2) - cy;
                    const d = dx*dx + dy*dy;
                    if (d < bestD && d < 10000) { bestD = d; label = t.textContent?.trim() || ''; }
                } catch(_) {}
            }
            nodes.push({ id: label || `node${nodes.length}`, label, shape: 'rect', x: cx, y: cy, width: bb.width, height: bb.height, styleClass: '', parentId: '' });
        } catch(_) {}
    }

    // Extract lines as edges
    for (const line of lines) {
        const x1 = parseFloat(line.getAttribute('x1')) || 0;
        const y1 = parseFloat(line.getAttribute('y1')) || 0;
        const x2 = parseFloat(line.getAttribute('x2') || line.getAttribute('x')) || 0;
        const y2 = parseFloat(line.getAttribute('y2') || line.getAttribute('y')) || 0;
        if (x1 || y1 || x2 || y2) {
            const from = closestNode({x:x1,y:y1}, nodes);
            const to   = closestNode({x:x2,y:y2}, nodes);
            edges.push({ from, to, label: '', style: 'normal', arrowHead: 'arrow', arrowTail: 'none',
                waypoints: [{x:x1,y:y1},{x:x2,y:y2}] });
        }
    }
}
