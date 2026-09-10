// mermaid-snapshot - extract/git.mjs：gitGraph 语义提取 + 路径/弧线采样工具。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。
//
// 输出：
//   commits:  [{ id, label, branchIndex, x, y, r, merge }]
//   branches: [{ index, name, y, x1, x2, color }]
//   arrows:   [{ from, to, waypoints, kind:'seq'|'branch'|'merge',
//                branchIndex(线色) }]
//   bounds:   { minX, minY, maxX, maxY }

// gitGraph：分支线 + commit 圆点 + 标签 + 箭头（含 A 弧线采样）。
// 依赖（同 bundle 全局）：cssColorToHex（dom.mjs）。
export function extractGitGraph(container) {
    const commits = [];
    const branches = [];
    const arrows = [];

    // ── 分支色：从 <style> 解析 .commitN{stroke:hsl(...)} → hex ──
    const branchColors = {};
    const styleEl = container.querySelector('style');
    if (styleEl) {
        const css = styleEl.textContent || '';
        const re = /\.commit(\d+)\{stroke:(hsl\([^)]+\)|rgb\([^)]+\)|#[0-9a-fA-F]{6})/g;
        let m;
        while ((m = re.exec(css)) !== null) {
            branchColors[parseInt(m[1], 10)] = cssColorToHex(m[2]);
        }
    }

    // ── 1) 分支线 line.branch.branchN ──
    for (const l of container.querySelectorAll('line.branch')) {
        const cls = l.getAttribute('class') || '';
        const bm = cls.match(/branch(\d+)/);
        const index = bm ? parseInt(bm[1], 10) : branches.length;
        branches.push({
            index,
            y: parseFloat(l.getAttribute('y1')) || 0,
            x1: parseFloat(l.getAttribute('x1')) || 0,
            x2: parseFloat(l.getAttribute('x2')) || 0,
            name: '',
            color: branchColors[index] || '#000000',
        });
    }
    // 分支名：g.branchLabel > text，按 y 就近匹配分支线
    for (const gl of container.querySelectorAll('g.branchLabel')) {
        const t = gl.querySelector('text');
        const name = (t ? t.textContent : '').trim();
        if (!name) continue;
        const labelG = gl.querySelector('g.label') || gl;
        const tr = labelG.getAttribute('transform') || '';
        const m2 = tr.match(/translate\(([^,)]+),\s*([^)]+)\)/);
        const by = m2 ? parseFloat(m2[2]) : NaN;
        let best = null, bestD = Infinity;
        for (const b of branches) {
            const d = Math.abs(by - b.y);
            if (isFinite(by) && d < bestD) { bestD = d; best = b; }
        }
        if (best && bestD < 40) best.name = name;
    }

    // ── 2) commit：circle.commit（merge 双圈）+ rect.commit（HIGHLIGHT 方框）──
    const circles = [];
    // 2a) 圆点 circle.commit
    for (const c of container.querySelectorAll('circle.commit')) {
        const cls = c.getAttribute('class') || '';
        const cx = parseFloat(c.getAttribute('cx')) || 0;
        const cy = parseFloat(c.getAttribute('cy')) || 0;
        const r = parseFloat(c.getAttribute('r')) || 10;
        let branchIndex = -1, id = '';
        for (const tok of cls.split(/\s+/)) {
            const bm = tok.match(/^commit(\d+)$/);
            if (bm) { branchIndex = parseInt(bm[1], 10); continue; }
            if (!tok || tok === 'commit' || tok === 'commit-merge'
                || tok === 'commit-reverse' || tok === 'commit-highlight'
                || tok === 'commit-highlight-outer'
                || tok === 'commit-highlight-inner') continue;
            id = tok;
        }
        circles.push({ id, branchIndex, x: cx, y: cy, r,
                       merge: cls.includes('commit-merge'),
                       reverse: cls.includes('commit-cherry-pick'),
                       highlight: false });
    }
    // 2b) HIGHLIGHT 方框 rect.commit（取外框；inner 并入外框）
    for (const c of container.querySelectorAll('rect.commit')) {
        const cls = c.getAttribute('class') || '';
        if (cls.includes('commit-highlight-inner')) continue;
        const x = parseFloat(c.getAttribute('x')) || 0;
        const y = parseFloat(c.getAttribute('y')) || 0;
        const w = parseFloat(c.getAttribute('width')) || 0;
        const h = parseFloat(c.getAttribute('height')) || 0;
        let branchIndex = -1, id = '';
        for (const tok of cls.split(/\s+/)) {
            const bm = tok.match(/^commit(\d+)$/);
            if (bm) { branchIndex = parseInt(bm[1], 10); continue; }
            const hm = tok.match(/^commit-highlight(\d+)$/);
            if (hm && branchIndex < 0) {
                branchIndex = parseInt(hm[1], 10); continue;
            }
            if (!tok || tok === 'commit' || tok === 'commit-merge'
                || tok === 'commit-highlight'
                || tok === 'commit-highlight-outer'
                || tok === 'commit-highlight-inner') continue;
            id = tok;
        }
        circles.push({ id, branchIndex, x: x + w / 2, y: y + h / 2,
                       r: Math.max(w, h) / 2, merge: false,
                       reverse: false, highlight: true });
    }
    // 2c) 过滤装饰小圆（cherry-pick 的 r=2.75 小圆）并按位置去重
    const seen = new Map();
    for (const cm of circles) {
        if (cm.r < 4) continue;   // 忽略装饰小圆
        const key = cm.x.toFixed(3) + ',' + cm.y.toFixed(3);
        const prev = seen.get(key);
        if (!prev) { seen.set(key, cm); }
        else {
            if (cm.r > prev.r) {
                prev.id = cm.id || prev.id;
                prev.r = cm.r;
            }
            prev.merge = prev.merge || cm.merge;
            prev.highlight = prev.highlight || cm.highlight;
            prev.reverse = prev.reverse || cm.reverse;
        }
    }
    for (const cm of seen.values()) {
        // 2d) 无 commitN 的（cherry-pick）按 y 就近匹配分支线
        if (cm.branchIndex < 0) {
            let best = -1, bestD = Infinity;
            for (const b of branches) {
                const d = Math.abs(b.y - cm.y);
                if (d < bestD) { bestD = d; best = b.index; }
            }
            cm.branchIndex = best >= 0 ? best : 0;
        }
        commits.push(cm);
    }

    // ── 3) commit 标签：text.commit-label，就近匹配 commit ──
    for (const t of container.querySelectorAll('text.commit-label')) {
        const txt = (t.textContent || '').trim();
        if (!txt) continue;
        let lx = NaN, ly = NaN;
        const g = t.closest('g');
        if (g) {
            const r = g.querySelector('rect.commit-label-bkg');
            if (r) {
                try {
                    const bb = r.getBBox();
                    lx = bb.x + bb.width / 2;
                    ly = bb.y + bb.height / 2;
                } catch (_) {}
            }
        }
        if (!isFinite(lx)) continue;
        let best = null, bestD = Infinity;
        for (const cm of commits) {
            const d = Math.abs(lx - cm.x) + Math.abs(ly - cm.y);
            if (d < bestD) { bestD = d; best = cm; }
        }
        if (best && bestD < 120) {
            best.label = txt;
            // 标签优先作为 commit id（比 class token 可靠）
            best.id = txt;
        }
    }

    // ── 3b) tag 标签：text.tag-label，就近匹配 commit（含 cherry-pick 标签）──
    for (const t of container.querySelectorAll('text.tag-label')) {
        const txt = (t.textContent || '').trim();
        if (!txt) continue;
        const tx = parseFloat(t.getAttribute('x')) || 0;
        const ty = parseFloat(t.getAttribute('y')) || 0;
        let best = null, bestD = Infinity;
        for (const cm of commits) {
            const d = Math.abs(tx - cm.x) + Math.abs(ty - cm.y);
            if (d < bestD) { bestD = d; best = cm; }
        }
        if (best && bestD < 120) {
            best.tag = txt;
            // cherry-pick commit：无普通 label，用 tag 当 id/label
            if (!best.label && txt.startsWith('cherry-pick:')) {
                best.label = txt;
                best.id = txt;
            }
        }
    }

    // ── 4) 箭头 path.arrow：d 解析（含 A 弧线采样），端点就近匹配 ──
    const nearestCommit = (pt) => {
        let best = null, bestD = Infinity;
        for (const cm of commits) {
            const d = (pt.x - cm.x) ** 2 + (pt.y - cm.y) ** 2;
            if (d < bestD) { bestD = d; best = cm; }
        }
        return (best && bestD < 400) ? best : null;
    };
    for (const p of container.querySelectorAll('path.arrow')) {
        const cls = p.getAttribute('class') || '';
        const am = cls.match(/arrow(\d+)/);
        const pts = parseGitPathD(p.getAttribute('d') || '');
        if (pts.length < 2) continue;
        const from = nearestCommit(pts[0]);
        const to = nearestCommit(pts[pts.length - 1]);
        if (!from || !to || from.id === to.id) continue;
        const fromBranch = from.branchIndex;
        const toBranch = to.branchIndex;
        let kind = 'seq';
        if (fromBranch !== toBranch) {
            // 视觉上分支从上方父分支向下分出；merge 反向向上合并
            kind = (from.y < to.y) ? 'branch' : 'merge';
        }
        // 线色分支：seq/创建 = 目标分支色，merge = 源(子)分支色
        const colorBranch = (kind === 'merge') ? fromBranch : toBranch;
        arrows.push({
            from: from.id, to: to.id,
            waypoints: pts,
            kind,
            branchIndex: colorBranch,
        });
    }

    // ── 5) 包围盒（分支线 + commit + 标签空间）──
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of branches) {
        minX = Math.min(minX, b.x1); maxX = Math.max(maxX, b.x2);
        minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
    }
    for (const c of commits) {
        minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
        minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
    else {
        minX -= 90; maxX += 30;   // 左：分支标签；右：余量
        minY -= 30; maxY += 40;   // 上：余量；下：commit 标签
    }

    return { commits, branches, arrows, bounds: { minX, minY, maxX, maxY } };
}

// gitGraph 路径 d 解析：支持 M/L/C/A（弧线采样为折线）。返回点序列。
export function parseGitPathD(d) {
    const pts = [];
    if (!d) return pts;
    const re = /([MLACZmlacz])([^MLACZmlacz]*)/g;
    let mt;
    let px = 0, py = 0;
    const push = (x, y) => { px = x; py = y; pts.push({ x, y }); };
    while ((mt = re.exec(d)) !== null) {
        const rawCmd = mt[1];
        const cmd = rawCmd.toUpperCase();
        const isRel = rawCmd === rawCmd.toLowerCase();
        const nums = mt[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
        const nx = (v) => isRel ? v + px : v;
        const ny = (v) => isRel ? v + py : v;
        switch (cmd) {
            case 'M':
            case 'L': {
                for (let i = 0; i + 1 < nums.length; i += 2) {
                    push(nx(nums[i]), ny(nums[i + 1]));
                }
                break;
            }
            case 'A': {
                for (let i = 0; i + 6 < nums.length; i += 7) {
                    const rx = Math.abs(nums[i]);
                    const ry = Math.abs(nums[i + 1]);
                    const rot = nums[i + 2];
                    const largeArc = nums[i + 3] !== 0;
                    const sweep = nums[i + 4] !== 0;
                    const x2 = nx(nums[i + 5]);
                    const y2 = ny(nums[i + 6]);
                    sampleArc(px, py, rx, ry, rot, largeArc, sweep, x2, y2, push);
                }
                break;
            }
            case 'C': {
                for (let i = 0; i + 5 < nums.length; i += 6) {
                    const x1 = px, y1 = py;
                    const cx1 = nx(nums[i]), cy1 = ny(nums[i + 1]);
                    const cx2 = nx(nums[i + 2]), cy2 = ny(nums[i + 3]);
                    const x2 = nx(nums[i + 4]), y2 = ny(nums[i + 5]);
                    for (let s = 1; s <= 8; s++) {
                        const t = s / 8, u = 1 - t;
                        push(u ** 3 * x1 + 3 * u ** 2 * t * cx1 + 3 * u * t ** 2 * cx2 + t ** 3 * x2,
                             u ** 3 * y1 + 3 * u ** 2 * t * cy1 + 3 * u * t ** 2 * cy2 + t ** 3 * y2);
                    }
                }
                break;
            }
            case 'Z': break;
        }
    }
    return pts;
}

// SVG 椭圆弧采样（A 命令）为折线点（W3C 标准椭圆弧参数化）。
export function sampleArc(x0, y0, rx, ry, rotDeg, largeArc, sweep, x2, y2, push) {
    if (rx === 0 || ry === 0) { push(x2, y2); return; }
    const rad = rotDeg * Math.PI / 180;
    const cosr = Math.cos(rad), sinr = Math.sin(rad);
    const dx = (x0 - x2) / 2, dy = (y0 - y2) / 2;
    const x1p = cosr * dx + sinr * dy;
    const y1p = -sinr * dx + cosr * dy;
    let rx2 = rx * rx, ry2 = ry * ry;
    const x1p2 = x1p * x1p, y1p2 = y1p * y1p;
    const lambda = x1p2 / rx2 + y1p2 / ry2;
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s; ry *= s; rx2 = rx * rx; ry2 = ry * ry;
    }
    const num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
    const den = rx2 * y1p2 + ry2 * x1p2;
    const coef = (den === 0 || num < 0) ? 0 :
                 Math.sqrt(num / den) * ((largeArc === sweep) ? -1 : 1);
    const cxp = coef * (rx * y1p / ry);
    const cyp = coef * (-ry * x1p / rx);
    const cx = cosr * cxp - sinr * cyp + (x0 + x2) / 2;
    const cy = sinr * cxp + cosr * cyp + (y0 + y2) / 2;
    const vx = (x1p - cxp) / rx, vy = (y1p - cyp) / ry;
    const ux = (-x1p - cxp) / rx, uy = (-y1p - cyp) / ry;
    const a1 = Math.atan2(vy, vx);
    let a2 = Math.atan2(uy, ux);
    let delta = a2 - a1;
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    else if (sweep && delta < 0) delta += 2 * Math.PI;
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
        const t = a1 + delta * s / steps;
        const ex = cx + rx * Math.cos(t) * cosr - ry * Math.sin(t) * sinr;
        const ey = cy + rx * Math.cos(t) * sinr + ry * Math.sin(t) * cosr;
        push(ex, ey);
    }
}
