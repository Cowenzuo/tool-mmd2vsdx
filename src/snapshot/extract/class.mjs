// mermaid-snapshot - extract/class.mjs：UML 类图边提取。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// 类图关系边：path.relation，优先按 id "id_<from>_<to>_<n>" 解析端点。
// 依赖（同 bundle 全局）：parsePathD / closestNode（dom.mjs）。
export function extractClassEdges(container, nodes, edges) {
    if (edges.length > 0) return;
    const nodeIdSet = new Set(nodes.map(n => n.id));
    const relationPaths = container.querySelectorAll('path.relation, [class*="relation"]');
    relationPaths.forEach(p => {
        const d = p.getAttribute('d') || '';
        const pts = parsePathD(d);
        // Prefer parsing from/to from the relation id "id_<from>_<to>_<n>"
        // (node ids are the class names). Endpoint-based closestNode is
        // unreliable: mermaid 10 renders some relations (e.g. aggregation
        // --o) with a path that does not actually reach the target node,
        // so both endpoints resolve to the source node.
        let from = '', to = '';
        const idm = (p.id || '').match(/^id_(.+?)_(.+?)_\d+$/);
        if (idm && nodeIdSet.has(idm[1]) && nodeIdSet.has(idm[2])) {
            from = idm[1];
            to = idm[2];
        } else if (pts.length >= 2) {
            from = closestNode(pts[0], nodes);
            to = closestNode(pts[pts.length - 1], nodes);
        }
        let style = 'normal';
        const cls = p.getAttribute('class') || '';
        if (cls.includes('edge-pattern-dotted') || cls.includes('edge-pattern-dashed'))
            style = 'dotted';
        // Arrow head from marker-end (mermaid class markers):
        // aggregationEnd = hollow diamond (--o), compositionEnd = solid
        // diamond (--*), extensionEnd = hollow triangle (--|>, ..|>),
        // dependencyEnd = arrow (-->, ..>).
        let arrowHead = 'none';
        const markerEnd = p.getAttribute('marker-end') || '';
        if (markerEnd.includes('aggregation') || markerEnd.includes('composition'))
            arrowHead = 'circle';
        else if (markerEnd.includes('extension'))
            arrowHead = 'openarrow';
        else if (markerEnd.includes('dependency'))
            arrowHead = 'arrow';
        if (from && to && pts.length >= 2) {
            edges.push({ from, to, label: '', style, arrowHead, arrowTail: 'none', waypoints: pts });
        }
    });
}
