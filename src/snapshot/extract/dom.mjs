// mermaid-snapshot - extract/dom.mjs：浏览器端通用 DOM/路径/颜色工具
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// 从节点元素推断形状类型（按内部元素优先级）。
export function detectShape(el) {
    if (el.querySelector('polygon')) return 'diamond';
    if (el.querySelector('circle'))  return 'circle';
    if (el.querySelector('ellipse')) return 'ellipse';
    const rect = el.querySelector('rect');
    if (rect) return (parseFloat(rect.getAttribute('rx')) || 0) > 0 ? 'roundRect' : 'rect';
    return 'rect';
}

// SVG path 'd' 解析：M/L/C/Q 采样为点序列（C/Q 按固定步数插值）。
export function parsePathD(d) {
    if (!d) return [];
    const pts = [];
    // 分词: 命令字母 + 参数
    const re = /([MLCQZmlcqz])([^MLCQZmlcqz]*)/g;
    let mt;
    let prevX = 0, prevY = 0;
    while ((mt = re.exec(d)) !== null) {
        const rawCmd = mt[1];
        const cmd = rawCmd.toUpperCase();
        const isRelative = (rawCmd === rawCmd.toLowerCase());
        const nums = mt[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
        switch (cmd) {
            case 'M':
            case 'L':
                for (let i = 0; i + 1 < nums.length; i += 2) {
                    let px = nums[i], py = nums[i + 1];
                    if (isRelative) { px += prevX; py += prevY; }
                    prevX = px; prevY = py;
                    pts.push({ x: px, y: py });
                }
                break;
            case 'C':
                for (let i = 0; i + 5 < nums.length; i += 6) {
                    const x1 = prevX, y1 = prevY;
                    let cx1 = nums[i],     cy1 = nums[i + 1];
                    let cx2 = nums[i + 2], cy2 = nums[i + 3];
                    let x2  = nums[i + 4], y2  = nums[i + 5];
                    if (isRelative) {
                        cx1 += prevX; cy1 += prevY;
                        cx2 += prevX; cy2 += prevY;
                        x2  += prevX; y2  += prevY;
                    }
                    for (let s = 1; s <= 8; s++) {
                        const t = s / 8, u = 1 - t;
                        pts.push({
                            x: u**3*x1 + 3*u**2*t*cx1 + 3*u*t**2*cx2 + t**3*x2,
                            y: u**3*y1 + 3*u**2*t*cy1 + 3*u*t**2*cy2 + t**3*y2,
                        });
                    }
                    prevX = x2; prevY = y2;
                }
                break;
            case 'Q':
                for (let i = 0; i + 3 < nums.length; i += 4) {
                    const x1 = prevX, y1 = prevY;
                    let cpx = nums[i],   cpy = nums[i + 1];
                    let x2  = nums[i + 2], y2  = nums[i + 3];
                    if (isRelative) {
                        cpx += prevX; cpy += prevY;
                        x2  += prevX; y2  += prevY;
                    }
                    for (let s = 1; s <= 6; s++) {
                        const t = s / 6, u = 1 - t;
                        pts.push({
                            x: u**2*x1 + 2*u*t*cpx + t**2*x2,
                            y: u**2*y1 + 2*u*t*cpy + t**2*y2,
                        });
                    }
                    prevX = x2; prevY = y2;
                }
                break;
            case 'Z':
            case 'z':
                // closepath: 已由前面的点覆盖，无需额外处理
                break;
        }
    }
    return pts;
}

// 按 x 坐标就近匹配（sequence 泳道用）。
export function closestNodeByX(px, list) {
    let best = '', bestD = Infinity;
    for (const n of list) {
        const d = Math.abs(px - n.x);
        if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
}

// 按欧氏距离就近匹配节点，返回节点 id。
export function closestNode(pt, list) {
    let best = '', bestD = Infinity;
    for (const n of list) {
        const d = (pt.x - n.x)**2 + (pt.y - n.y)**2;
        if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
}

// CSS 颜色字符串 → #rrggbb（支持 hsl()/rgb()/#hex；失败返回空串）。
export function cssColorToHex(v) {
    v = (v || '').trim();
    let m = v.match(/^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
    if (m) return hslToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    m = v.match(/^rgb\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/);
    if (m) {
        const hx = (x) => Math.max(0, Math.min(255, Math.round(parseFloat(x)))).toString(16).padStart(2, '0');
        return '#' + hx(m[1]) + hx(m[2]) + hx(m[3]);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    return '';
}

// hsl(h,s%,l%) → #rrggbb。
export function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hx = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
    return '#' + hx(f(0)) + hx(f(8)) + hx(f(4));
}
