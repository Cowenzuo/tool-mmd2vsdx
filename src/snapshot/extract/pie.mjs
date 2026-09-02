// mermaid-snapshot - extract/pie.mjs：饼图语义提取（mermaid pie 文本 + SVG 布局/颜色）。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。
//
// 返回：{ title, cx, cy, r, slices:[{label,value,color}], bounds }

// 依赖（同 bundle 全局）：cssColorToHex（dom.mjs）。
export function extractPie(text, container) {
    const pie = { title: '', cx: 0, cy: 0, r: 0, slices: [] };
    const lines = (text || '').split('\n');
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // "pie title 宠物统计" 同行
        const tm0 = line.match(/^pie\s+title\s+(.+)$/i);
        if (tm0) { pie.title = tm0[1].trim(); continue; }
        if (/^pie\b/i.test(line)) continue;
        const tm = line.match(/^title\s+(.+)$/i);
        if (tm) { pie.title = tm[1].trim(); continue; }
        const dm = line.match(/^"?([^":]+)"?\s*:\s*([\d.]+)\s*$/);
        if (dm) {
            pie.slices.push({ label: dm[1].trim(),
                              value: parseFloat(dm[2]) });
        }
    }
    // SVG：圆心（含 pieCircle 的容器 g）与半径、扇区颜色（path fill）
    const pieG = [...container.querySelectorAll('g')]
        .find(g => g.querySelector('path.pieCircle'));
    if (pieG) {
        const tr = pieG.getAttribute('transform') || '';
        const m = tr.match(/translate\(([^,)]+),\s*([^)]+)\)/);
        if (m) { pie.cx = parseFloat(m[1]); pie.cy = parseFloat(m[2]); }
    }
    const paths = [...container.querySelectorAll('path.pieCircle')];
    paths.forEach((p, i) => {
        if (i >= pie.slices.length) return;
        const d = p.getAttribute('d') || '';
        const am = d.match(/[Aa]\s*([\d.]+)[\s,]+([\d.]+)/);
        if (am) pie.r = Math.max(pie.r, parseFloat(am[1]));
        const fill = p.getAttribute('fill') || '';
        if (fill) pie.slices[i].color = cssColorToHex(fill);
    });
    // bounds：饼图 + 标题（上） + 图例（右）空间
    const rr = pie.r || 185;
    pie.bounds = {
        minX: pie.cx - rr - 40,
        minY: pie.cy - rr - 60,
        maxX: pie.cx + rr + 240,
        maxY: pie.cy + rr + 20,
    };
    return pie;
}
