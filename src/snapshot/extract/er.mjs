// mermaid-snapshot - extract/er.mjs：ER 图提取。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// ER 图：实体（text-entity-* 分组）+ 关系线（.relationshipLine）。
// 依赖（同 bundle 全局）：parsePathD / closestNode（dom.mjs）。
export function extractER(container, nodes, edges) {
    // Group text elements by their containing entity <g>.
    // mermaid ER text ids follow a pattern:
    //   header  : text-entity-<NAME>-<uuid>
    //   attr    : text-entity-<NAME>-<uuid>-attr-<N>-type | -name
    // Each attribute is one row: type + name (e.g. `string name`).
    const entityMap = new Map(); // groupEl → { rect, header, attrs[] }
    const textEls = container.querySelectorAll('text.er, text[class*="entityLabel"]');
    for (const t of textEls) {
        const txt = (t.textContent || '').trim();
        if (!txt) continue;
        // Walk up to find the entity <g> that directly contains a rect
        let entityG = t.parentElement;
        while (entityG && entityG.tagName !== 'g') entityG = entityG.parentElement;
        if (!entityG) continue;
        // Use the DOM element itself as key (reliable grouping)
        if (!entityMap.has(entityG)) {
            const rect = entityG.querySelector('rect');
            entityMap.set(entityG, { rect, header: '', attrs: [] });
        }
        const grp = entityMap.get(entityG);
        const id = t.id || '';
        const m = id.match(/attr-(\d+)-(type|name)$/);
        if (m) {
            const n = parseInt(m[1], 10);
            const kind = m[2];
            while (grp.attrs.length < n) grp.attrs.push({ type: '', name: '' });
            grp.attrs[n - 1][kind] = txt;
        } else if (!grp.header) {
            grp.header = txt;
        }
    }
    // Create one node per entity group
    for (const [entityG, grp] of entityMap) {
        if (!grp.rect || !grp.header) continue;
        // label = header + one line per attribute ("type name")
        const attrLines = grp.attrs.map(a =>
            a.type ? `${a.type} ${a.name}` : a.name);
        const label = [grp.header, ...attrLines].join('\n');
        const name = grp.header;
        // Entity position lives in the <g> transform
        // (translate(tx,ty)); rect.getBBox() ignores the transform and
        // returns local 0,0, which would stack every entity at the
        // same spot. Read the transform + rect w/h instead.
        let tx = 0, ty = 0, w = 0, h = 0;
        try {
            const tr = entityG.getAttribute('transform') || '';
            const m2 = tr.match(/translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)/);
            if (m2) { tx = parseFloat(m2[1]); ty = parseFloat(m2[2]); }
            w = parseFloat(grp.rect.getAttribute('width')) || 0;
            h = parseFloat(grp.rect.getAttribute('height')) || 0;
        } catch (_) {}
        nodes.push({ id: name, label, shape: 'rect', x: tx + w / 2, y: ty + h / 2, width: w, height: h, styleClass: '', parentId: '' });
    }
    // Relationships: mermaid ER draws <path class="er relationshipLine">
    // with a 'd' attribute (no x1/y1), so parse the path endpoints
    // instead of reading line x/y attributes.
    const relLines = container.querySelectorAll('.relationshipLine');
    const labelEls = container.querySelectorAll('.relationshipLabel');
    relLines.forEach((line, i) => {
        const d = line.getAttribute('d') || '';
        const pts = parsePathD(d);
        if (pts.length < 2) return;
        const from = closestNode(pts[0], nodes);
        const to = closestNode(pts[pts.length - 1], nodes);
        const label = labelEls[i]?.textContent?.trim() || '';
        // ER 多重性（基数）：marker 引用形如 url(#ONLY_ONE_START)。
        // from 端 marker-start，to 端 marker-end。
        const ms = (line.getAttribute('marker-start') || '')
            .match(/#([A-Z_]+)_(?:START|END)/)?.[1] || '';
        const me = (line.getAttribute('marker-end') || '')
            .match(/#([A-Z_]+)_(?:START|END)/)?.[1] || '';
        edges.push({ from, to, label, style: 'normal', arrowHead: 'arrow', arrowTail: 'none', waypoints: pts, fromMultiplicity: ms, toMultiplicity: me });
    });
}
