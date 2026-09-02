// mermaid-snapshot - extract/flowchart.mjs：node-based 图（flowchart/class/state/block）
// 的节点/边/子图通用提取。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// 提取 node-based 图的节点、边、子图。
// 依赖（同 bundle 全局）：detectShape / parsePathD（dom.mjs）。
export function extractFlowchartParts(container, diagramType) {
    // ── 节点 ──
    const nodes = [];
    const edges = [];
    // Node-based diagrams: flowchart, class, state all use .node elements
    const isNodeBased = (diagramType === 'flowchart' || !diagramType
        || diagramType === 'class' || diagramType === 'classDiagram'
        || diagramType === 'state' || diagramType === 'stateDiagram'
        || diagramType === 'block');
    // Class diagrams have multi-line labels (name + members)
    const isClassLike = (diagramType === 'class' || diagramType === 'classDiagram');
    // Edge extraction via .edgePaths only for flowchart (not class/state)
    const isFlowchartEdges = (diagramType === 'flowchart' || !diagramType);
    // mermaid appends a numeric index to every node id (A → A-0,
    // A-1 → A-1-0). Strip only that trailing index; user ids that
    // themselves end in digits (A-1, A-2) are preserved.
    const normalizeNodeId = (id) => id.replace(/-\d+$/, '');

    if (isNodeBased) {
    for (const el of container.querySelectorAll('.node')) {
        const rawId = (el.getAttribute('id') || '')
            .replace(/^(flowchart|classId|state)-/, '');
        const id = normalizeNodeId(rawId);
        // Try multiple label selectors, pick first non-empty
        let label = '';
        const labelCandidates = el.querySelectorAll('.nodeLabel, .label text, .label foreignObject, .classTitle, .classTitleText, .label span');
        if (isClassLike) {
            // Class diagrams: collect unique member texts
            const parts = [];
            const seen = new Set();
            for (const lc of labelCandidates) {
                const txt = (lc.textContent || '').trim();
                if (txt && !seen.has(txt)) {
                    seen.add(txt);
                    parts.push(txt);
                }
            }
            label = parts.join('\n');
        } else {
            for (const lc of labelCandidates) {
                const txt = (lc.textContent || '').trim();
                if (txt) { label = txt; break; }
            }
        }
        if (!label) {
            const anyText = el.querySelector('text, tspan');
            if (anyText) label = (anyText.textContent || '').trim();
        }

        // translate = 左上角坐标
        const tr = el.getAttribute('transform') || '';
        const m = tr.match(/translate\(([^,)]+),\s*([^)]+)\)/);
        const tx = m ? parseFloat(m[1]) : 0;
        const ty = m ? parseFloat(m[2]) : 0;

        // 形状尺寸
        let bw = 0, bh = 0;
        const shapeEl = el.querySelector('rect, polygon, circle, ellipse, path:not([class*="edge"])');
        if (shapeEl) {
            try { const bb = shapeEl.getBBox(); bw = bb.width; bh = bb.height; } catch (_) {}
        }

        // translate 即节点中心 (mermaid 的 dagre-wrapper 保证)
        const cx = tx;
        const cy = ty;

        const shape = detectShape(el);
        const cls = (el.getAttribute('class') || '')
            .replace(/\bnode\b/g, '').replace(/\bdefault\b/g, '').trim();

        // Class diagrams: capture partition lines (y relative to the
        // node center, SVG y-down) so the VSDX shape can be drawn as
        // a UML class box with separators.
        const dividers = [];
        if (isClassLike) {
            for (const dl of el.querySelectorAll('line.divider')) {
                const dy = parseFloat(dl.getAttribute('y1'));
                if (isFinite(dy)) dividers.push(dy);
            }
        }

        nodes.push({ id, label, shape, x: cx, y: cy, width: bw, height: bh, styleClass: cls, parentId: '', dividers });
    }
    } // end isNodeBased nodes

    // Known normalized node ids, used to disambiguate edge path ids
    // whose endpoints may themselves contain dashes.
    const nodeIdSet = new Set(nodes.map(n => n.id));

    // ── 边 ──
    if (isFlowchartEdges) {
    const pathEls = [...container.querySelectorAll('.edgePaths path')];
    const labelEls = [...container.querySelectorAll('.edgeLabels > .edgeLabel')];

    pathEls.forEach((pathEl, idx) => {
        const d = pathEl.getAttribute('d') || '';
        const cls = pathEl.getAttribute('class') || '';
        const pid = pathEl.getAttribute('id') || '';

        let from = '', to = '';
        // Path ids look like L-<from>-<to>-<index>: a trailing numeric
        // edge index is appended, and the node ids themselves may
        // contain dashes. Strip the index, then resolve the remainder
        // against the known node id set using the longest prefix match.
        const idMatch = pid.replace(/-\d+$/, '').match(/^L-(.+)$/);
        if (idMatch) {
            const rest = idMatch[1];
            let best = '';
            for (const candidate of nodeIdSet) {
                if (candidate.length <= rest.length &&
                    rest.startsWith(candidate) &&
                    (candidate.length === rest.length ||
                     rest[candidate.length] === '-') &&
                    candidate.length > best.length) {
                    best = candidate;
                }
            }
            if (best) {
                from = best;
                const tail = rest.slice(best.length);
                to = tail.startsWith('-') ? tail.slice(1) : '';
            }
        }

        let style = 'normal';
        if (cls.includes('edge-pattern-dotted') || cls.includes('edge-pattern-dashed'))
            style = 'dotted';
        else if (cls.includes('edge-thickness-thick'))
            style = 'thick';

        let arrowHead = 'arrow', arrowTail = 'none';
        const markerEnd = pathEl.getAttribute('marker-end') || '';
        if (!markerEnd) arrowHead = 'none';
        else if (markerEnd.includes('circle')) arrowHead = 'circle';

        let label = '';
        if (labelEls[idx])
            label = (labelEls[idx].textContent || '').trim();

        edges.push({ from, to, label, style, arrowHead, arrowTail, waypoints: parsePathD(d) });
    });
    } // end isFlowchartEdges

    // ── 子图 (clusters) ──
    const clusters = [];
    if (isFlowchartEdges) {
    for (const cl of container.querySelectorAll('.clusters .cluster')) {
        const rect = cl.querySelector('rect');
        if (!rect) continue;
        let rx = 0, ry = 0, rw = 0, rh = 0;
        try {
            const bb = rect.getBBox();
            rx = bb.x; ry = bb.y; rw = bb.width; rh = bb.height;
        } catch (_) {}
        const label = (cl.querySelector('.cluster-label text, .cluster-label span')?.textContent || '').trim();
        const cid = cl.getAttribute('id') || '';
        clusters.push({
            id: cid,
            label,
            x: rx + rw / 2,
            y: ry + rh / 2,
            width: rw,
            height: rh,
        });
    }
    } // end isFlowchartEdges clusters

    return { nodes, edges, clusters };
}
