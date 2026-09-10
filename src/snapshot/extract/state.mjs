// mermaid-snapshot - extract/state.mjs：状态图边提取。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// 状态图迁移边：.edgePaths path + .edgeLabel 标签。
// 依赖（同 bundle 全局）：parsePathD / closestNode（dom.mjs）。
export function extractStateEdges(container, nodes, edges) {
    const transPaths = container.querySelectorAll('.edgePaths path');
    const transLabels = container.querySelectorAll('.edgeLabel text, .edgeLabel span');
    transPaths.forEach((p, i) => {
        const d = p.getAttribute('d') || '';
        const pts = parsePathD(d);
        const label = transLabels[i]?.textContent?.trim() || '';
        if (pts.length >= 2) {
            const from = closestNode(pts[0], nodes);
            const to = closestNode(pts[pts.length - 1], nodes);
            edges.push({ from, to, label, style: 'normal', arrowHead: 'arrow', arrowTail: 'none', waypoints: pts });
        }
    });
}
