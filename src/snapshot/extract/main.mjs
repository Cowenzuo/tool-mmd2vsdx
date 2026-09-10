// mermaid-snapshot - extract/main.mjs：makeExtractFn 编排（浏览器内渲染 + 提取）。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。
//
// 返回函数被 page.evaluate 序列化执行时，依赖的提取函数
// （extractFlowchartParts / extractER / extractGitGraph ...）已在页面
// 全局作用域中（由 snapshot.mjs 注入的 bundle 定义），可直接调用。

export function makeExtractFn() {
    return async (text) => {
        const mermaid = window.__mermaid;
        if (!mermaid) throw new Error('mermaid not initialized');

        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
        document.body.appendChild(container);

        try {
            let svg = '';
            try {
                const r = await mermaid.render('diagram', text);
                svg = r.svg;
                container.innerHTML = svg;
            } catch (_renderErr) {
                // mermaid 渲染失败（如 gantt 的 after 中文名语法不被 mermaid 支持）：
                // 保留空 svg，仍从文本推断类型并解析 gantt 结构化数据，不被渲染阻断。
                container.innerHTML = '';
            }
            const svgEl = container.querySelector('svg');

            // direction: 从节点位置推断 (aria-roledescription 不含方向)
            let direction = 'TB';
            const nodePositions = [];
            for (const el of container.querySelectorAll('.node')) {
                const tr = el.getAttribute('transform') || '';
                const m = tr.match(/translate\(([^,)]+),\s*([^)]+)\)/);
                if (m) nodePositions.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
            }
            if (nodePositions.length >= 2) {
                const xs = nodePositions.map(p => p.x);
                const ys = nodePositions.map(p => p.y);
                const xRange = Math.max(...xs) - Math.min(...xs);
                const yRange = Math.max(...ys) - Math.min(...ys);
                direction = xRange > yRange ? 'LR' : 'TB';
            }

            // 图表类型检测：优先 SVG aria-roledescription；渲染失败时从文本首行推断。
            const aria = svgEl?.getAttribute('aria-roledescription') || '';
            let diagramType = aria.replace('-v2', '').replace('-beta', '') || '';
            if (!diagramType) {
                const firstLine = (text || '').trim().split('\n')[0].trim();
                if (/^gantt\b/i.test(firstLine)) diagramType = 'gantt';
                else if (/^sequenceDiagram\b/i.test(firstLine)) diagramType = 'sequence';
                else if (/^classDiagram\b/i.test(firstLine)) diagramType = 'class';
                else if (/^stateDiagram\b/i.test(firstLine)) diagramType = 'state';
                else if (/^erDiagram\b/i.test(firstLine)) diagramType = 'er';
                else if (/^C4Context\b|^C4Diagram\b/i.test(firstLine)) diagramType = 'c4';
                else diagramType = 'flowchart';
            }

            // ── 通用 node-based 提取：节点 + 边 + 子图（flowchart/class/state/block）──
            const { nodes, edges, clusters } = extractFlowchartParts(container, diagramType);

            // ── 类型特定提取（仅处理非 node-based 或需要特殊边提取的）──
            let gantt = null;
            let git = null;
            let pie = null;
            let quadrant = null;
            let sequence = null;
            if (diagramType === 'gantt') gantt = parseGantt(text);
            if (diagramType === 'gitGraph') git = extractGitGraph(container);
            if (diagramType === 'pie') pie = extractPie(text, container);
            if (diagramType === 'quadrantChart') quadrant = extractQuadrant(text, container);
            if (diagramType === 'mindmap') extractMindmap(container, nodes, edges);
            if (diagramType === 'er') extractER(container, nodes, edges);
            if (diagramType === 'sequence') sequence = extractSequence(container, nodes, edges);
            if (diagramType === 'class' || diagramType === 'classDiagram') extractClassEdges(container, nodes, edges);
            if (diagramType === 'state' || diagramType === 'stateDiagram') extractStateEdges(container, nodes, edges);
            if (diagramType === 'c4') extractC4(container, nodes, edges);

            // ── 通用 fallback: rect+text → Node ──
            if (!nodes.length && diagramType !== 'gantt' && diagramType !== 'gitGraph'
                && diagramType !== 'pie' && diagramType !== 'quadrantChart' && diagramType !== 'mindmap')
                extractGeneric(container, nodes, edges);

            // ── 包围盒 ──
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const n of nodes) {
                const hw = n.width / 2, hh = n.height / 2;
                if (isFinite(n.x - hw) && n.x - hw < minX) minX = n.x - hw;
                if (isFinite(n.y - hh) && n.y - hh < minY) minY = n.y - hh;
                if (isFinite(n.x + hw) && n.x + hw > maxX) maxX = n.x + hw;
                if (isFinite(n.y + hh) && n.y + hh > maxY) maxY = n.y + hh;
            }
            // gitGraph：包围盒以语义提取（分支线 + commit + 标签空间）为准
            if (git) {
                minX = git.bounds.minX;
                minY = git.bounds.minY;
                maxX = git.bounds.maxX;
                maxY = git.bounds.maxY;
            }
            // pie：饼图 + 标题 + 图例空间
            if (pie) {
                minX = pie.bounds.minX;
                minY = pie.bounds.minY;
                maxX = pie.bounds.maxX;
                maxY = pie.bounds.maxY;
            }
            // quadrant：象限图 + 标题 + 轴标签空间
            if (quadrant) {
                minX = quadrant.bounds.minX;
                minY = quadrant.bounds.minY;
                maxX = quadrant.bounds.maxX;
                maxY = quadrant.bounds.maxY;
            }
            // Handle empty/invalid bounding box
            if (!isFinite(minX)) minX = 0;
            if (!isFinite(minY)) minY = 0;
            if (!isFinite(maxX)) maxX = 0;
            if (!isFinite(maxY)) maxY = 0;

            // Fix missing xlink namespace (mermaid C4 diagrams use <image xlink:href>)
            let fixedSvg = svg;
            if (svg.includes('xlink:href') && !svg.includes('xmlns:xlink')) {
                fixedSvg = svg.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
            }

            return { svg: fixedSvg, nodes, edges, clusters, diagramType, direction, gantt, git, pie, quadrant, sequence, boundingBox: { minX, minY, maxX, maxY } };
        } finally {
            if (container.parentNode) container.parentNode.removeChild(container);
        }
    };
}
