// mermaid-snapshot - extract/quadrant.mjs：象限图语义提取（mermaid quadrant 文本 + SVG 布局）。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

export function extractQuadrant(text, container) {
    const quadrant = { title: '', xLabelLow: 'Low', xLabelHigh: 'High',
        yLabelLow: 'Low', yLabelHigh: 'High',
        minX: 0, minY: 0, maxX: 500, maxY: 500,
        crossX: 0, crossY: 0, points: [] };
    const lines = (text || '').split('\n');
    for (const raw of lines) {
        const li = raw.trim();
        if (!li || /^quadrantChart\b/i.test(li)) continue;
        const tm = li.match(/^title\s+(.+)$/i);
        if (tm) { quadrant.title = tm[1].trim(); continue; }
        const xm = li.match(/^x-axis\s+(.+)\s*-->\s*(.+)$/i);
        if (xm) { quadrant.xLabelLow = xm[1].trim(); quadrant.xLabelHigh = xm[2].trim(); continue; }
        const ym = li.match(/^y-axis\s+(.+)\s*-->\s*(.+)$/i);
        if (ym) { quadrant.yLabelLow = ym[1].trim(); quadrant.yLabelHigh = ym[2].trim(); continue; }
        const dm = li.match(/^([^:\[]+):\s*\[([\d.]+),\s*([\d.]+)\]\s*$/);
        if (dm) { quadrant.points.push({ label: dm[1].trim() }); }
    }
    // SVG：边框范围、十字线中点、数据圆心
    const borderG = container.querySelector('g.border');
    if (borderG) {
        for (const l of borderG.querySelectorAll('line')) {
            const x1 = parseFloat(l.getAttribute('x1')) || 0, y1 = parseFloat(l.getAttribute('y1')) || 0;
            const x2 = parseFloat(l.getAttribute('x2')) || 0, y2 = parseFloat(l.getAttribute('y2')) || 0;
            quadrant.minX = Math.min(quadrant.minX, x1, x2);
            quadrant.minY = Math.min(quadrant.minY, y1, y2);
            quadrant.maxX = Math.max(quadrant.maxX, x1, x2);
            quadrant.maxY = Math.max(quadrant.maxY, y1, y2);
        }
    }
    quadrant.crossX = (quadrant.minX + quadrant.maxX) / 2;
    quadrant.crossY = (quadrant.minY + quadrant.maxY) / 2;
    const dpg = container.querySelector('g.data-points');
    if (dpg) {
        const ptGs = [...dpg.querySelectorAll('g.data-point')];
        let pi = 0;
        for (const pg of ptGs) {
            if (pi >= quadrant.points.length) break;
            const c = pg.querySelector('circle');
            const t = pg.querySelector('text');
            quadrant.points[pi].cx = parseFloat(c && c.getAttribute('cx')) || 0;
            quadrant.points[pi].cy = parseFloat(c && c.getAttribute('cy')) || 0;
            if (t) quadrant.points[pi].label = (t.textContent || '').trim();
            pi++;
        }
    }
    quadrant.bounds = {
        minX: quadrant.minX - 30, minY: quadrant.minY - 30,
        maxX: quadrant.maxX + 10, maxY: quadrant.maxY + 35,
    };
    return quadrant;
}
