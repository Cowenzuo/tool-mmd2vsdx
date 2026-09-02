// mermaid-snapshot - extract/mindmap.mjs：脑图语义提取（树 → nodes/edges）。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。
//
// mermaid mindmap：g.mindmap-node（transform=中心；root 为 circle.node-bkg，
// 其余为 path.node-bkg 圆角矩形）+ path.edge（父→子折线）。
// 层级样式表（复用流程图渲染管线，按树深度分配形状与浅色填充）：
//   0 root  Ellipse（浅蓝 #DEEBF7）
//   1 一级   Rounded Rectangle（浅黄 #FFF2CC）
//   2 二级   Rectangle（浅绿 #E2EFDA）
//   3+ 三级  Circle（浅橙 #FCE4D6）

// 依赖（同 bundle 全局）：parsePathD / closestNode（dom.mjs）。
export function extractMindmap(container, nodes, edges) {
    const kMindmapShapes = ['ellipse', 'roundRect', 'rect', 'circle'];
    const kMindmapColors = ['#DEEBF7', '#FFF2CC', '#E2EFDA', '#FCE4D6'];
    let rootId = '';
    for (const el of container.querySelectorAll('g.mindmap-node')) {
        const cls = el.getAttribute('class') || '';
        const tr = el.getAttribute('transform') || '';
        const m = tr.match(/translate\(([^,)]+),\s*([^)]+)\)/);
        const x = m ? parseFloat(m[1]) : 0;
        const y = m ? parseFloat(m[2]) : 0;
        const tEl = el.querySelector('text');
        const txt = (tEl ? tEl.textContent : '').trim();
        let w = 53, h = 38;
        const circle = el.querySelector('circle.node-bkg');
        if (circle) {
            // root：椭圆（横向），宽按文本自适应
            const r = parseFloat(circle.getAttribute('r')) || 26.5;
            h = 2 * r * 0.85;
            let tw = 0;
            for (const ch of txt) tw += (ch.charCodeAt(0) > 127) ? 15 : 8;
            w = Math.max(2 * r * 1.2, tw + 30);
        } else {
            const bkg = el.querySelector('path.node-bkg, rect.node-bkg');
            if (bkg) {
                try {
                    const bb = bkg.getBBox();
                    if (bb.width > 0 && bb.height > 0) {
                        w = bb.width; h = bb.height;
                    }
                } catch (_) {}
            }
        }
        const id = `node${nodes.length}`;
        nodes.push({ id, label: txt, shape: '', x, y, width: w, height: h,
                     styleClass: '', parentId: '' });
        if (cls.includes('section-root')) rootId = id;
    }
    // 树形边：path.edge 折线端点就近匹配节点；waypoints 只保留
    // 起终点（直线），去掉中间折点
    for (const p of container.querySelectorAll('path.edge')) {
        const pts = parsePathD(p.getAttribute('d') || '');
        if (pts.length < 2) continue;
        const from = closestNode(pts[0], nodes);
        const to = closestNode(pts[pts.length - 1], nodes);
        if (!from || !to || from === to) continue;
        edges.push({ from, to, label: '', style: 'normal',
                     arrowHead: 'none', arrowTail: 'none',
                     waypoints: [pts[0], pts[pts.length - 1]] });
    }
    // 按树深度分配样式（BFS 从 root）
    const depth = new Map();
    const children = new Map();
    for (const e of edges) {
        if (!children.has(e.from)) children.set(e.from, []);
        children.get(e.from).push(e.to);
    }
    if (!rootId && nodes.length) rootId = nodes[0].id;
    depth.set(rootId, 0);
    const queue = [rootId];
    while (queue.length) {
        const cur = queue.shift();
        for (const ch of (children.get(cur) || [])) {
            if (depth.has(ch)) continue;
            depth.set(ch, depth.get(cur) + 1);
            queue.push(ch);
        }
    }
    for (const n of nodes) {
        const d = Math.min(depth.get(n.id) || 0,
                           kMindmapShapes.length - 1);
        n.shape = kMindmapShapes[d];
        n.fillColor = kMindmapColors[d];
    }
}
