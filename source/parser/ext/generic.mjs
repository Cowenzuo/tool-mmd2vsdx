// 浏览器端通用提取器（flowchart/state/c4/block 等扁平图）
// 输入：mermaid 渲染出的 SVG 元素；输出：结构 JSON（与契约 A 骨架同构）。
// 挂到 window.__mmdExtractGeneric；由 parser/renderer.ts 注入调用。
(function () {
    'use strict';

    function attr(el, name) {
        return el.getAttribute(name) || '';
    }

    function box(el) {
        const r = el.getBBox();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    /** 世界坐标包围盒：g.node 的 getBBox 是局部坐标（不含元素 transform），
     *  用屏幕矩形 + screenCTM 反变换获得 SVG 用户坐标（与 mindmap/sequence 提取一致）。 */
    function worldBox(svg, el) {
        const r = el.getBoundingClientRect();
        const pt = svg.createSVGPoint();
        pt.x = r.left + r.width / 2;
        pt.y = r.top + r.height / 2;
        const ctm = svg.getScreenCTM();
        if (!ctm) {
            const b = el.getBBox();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
        }
        const w = pt.matrixTransform(ctm.inverse());
        const sx = Math.abs(ctm.a) || 1;
        const sy = Math.abs(ctm.d) || 1;
        return { x: w.x - r.width / 2 / sx, y: w.y - r.height / 2 / sy, width: r.width / sx, height: r.height / sy };
    }

    function shapeKind(el) {
        if (el.querySelector('polygon.pentagon')) return 'rect';
        const p = el.querySelector('path, polygon, rect, ellipse');
        if (!p) return 'rect';
        const tag = p.tagName;
        if (tag === 'ellipse') return 'circle';
        if (tag === 'polygon') {
            const pts = attr(p, 'points');
            const n = pts.split(' ').length;
            return n === 4 ? 'diamond' : n === 5 ? 'rect' : 'rect';
        }
        if (tag === 'path') return 'roundRect';
        return 'rect';
    }

    function nodeId(el) {
        const id = attr(el, 'id');
        // mermaid 节点前缀：flowchart-开始-x；取其第二段
        const m = /^[a-z]+-(.+)-.*$/.exec(id);
        return m ? m[1] : id;
    }

    function nodeLabel(el) {
        const span = el.querySelector('.nodeLabel, text');
        return span ? (span.textContent || '').trim() : '';
    }

    function edgeIds(path) {
        // v10：flowchart id 形如 L-A-B-0；class 形如 "… LS-A LE-B"；
        // state/其它图型 id 形如 state-A-B-1 或 A-B；block 形如 1-A-B（数字序号前缀）；
        // 统一容错解析
        let id = attr(path, 'id');
        if (id) {
            const block = /^\d+-([A-Za-z0-9_]+)-([A-Za-z0-9_]+)$/.exec(id);
            if (block) return { from: block[1], to: block[2] };
            const m = /^[a-z]*-([A-Za-z0-9_]+)--?([A-Za-z0-9_]+)-?\d*$/.exec(id);
            if (m) return { from: m[1], to: m[2] };
            const m2 = /^([A-Za-z0-9_]+)--?([A-Za-z0-9_]+)-?\d*$/.exec(id);
            if (m2) return { from: m2[1], to: m2[2] };
        }
        const cls = attr(path, 'class');
        const cm = /LS-([A-Za-z0-9_]+)\s+LE-([A-Za-z0-9_]+)/.exec(cls);
        if (cm) return { from: cm[1], to: cm[2] };
        return null;
    }

    function waypoints(svg, path) {
        // d 属性是路径局部坐标（g.edgePaths / g.block 等容器带 transform）——先经 path.getCTM()
        // 到根用户空间，再经 svg.getScreenCTM().inverse() 返回世界坐标（与 worldBox 同口径）。
        // 逐段解析：M/L/H/V 的每个端点都在线上；C/S/Q/T 只取该段末端（控制点不在线上）；
        // 坐标可带负号（block 的边整条都在负坐标区），不能用 [\d.] 硬匹配。
        const d = attr(path, 'd');
        const raw = [];
        const numRe = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
        const segRe = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
        let cx = 0;
        let cy = 0;
        let sx = 0;
        let sy = 0;
        const push = (x, y) => {
            const last = raw[raw.length - 1];
            if (last && Math.abs(last.x - x) < 1e-9 && Math.abs(last.y - y) < 1e-9) return;
            raw.push({ x, y });
        };
        for (const seg of d.matchAll(segRe)) {
            const cmd = seg[1];
            const nums = (seg[2].match(numRe) || []).map(Number);
            const rel = cmd === cmd.toLowerCase();
            const upper = cmd.toUpperCase();
            if (upper === 'M' || upper === 'L' || upper === 'T') {
                const step = upper === 'T' ? 2 : 2;
                for (let i = 0; i + 1 < nums.length; i += step) {
                    const x = rel ? cx + nums[i] : nums[i];
                    const y = rel ? cy + nums[i + 1] : nums[i + 1];
                    cx = x;
                    cy = y;
                    if (upper === 'M' && i === 0) {
                        sx = x;
                        sy = y;
                    }
                    push(x, y);
                }
            } else if (upper === 'H') {
                for (const v of nums) {
                    cx = rel ? cx + v : v;
                    push(cx, cy);
                }
            } else if (upper === 'V') {
                for (const v of nums) {
                    cy = rel ? cy + v : v;
                    push(cx, cy);
                }
            } else if (upper === 'C') {
                for (let i = 0; i + 5 < nums.length; i += 6) {
                    const x = rel ? cx + nums[i + 4] : nums[i + 4];
                    const y = rel ? cy + nums[i + 5] : nums[i + 5];
                    cx = x;
                    cy = y;
                    push(x, y);
                }
            } else if (upper === 'S' || upper === 'Q') {
                for (let i = 0; i + 3 < nums.length; i += 4) {
                    const x = rel ? cx + nums[i + 2] : nums[i + 2];
                    const y = rel ? cy + nums[i + 3] : nums[i + 3];
                    cx = x;
                    cy = y;
                    push(x, y);
                }
            } else if (upper === 'A') {
                for (let i = 0; i + 6 < nums.length; i += 7) {
                    const x = rel ? cx + nums[i + 5] : nums[i + 5];
                    const y = rel ? cy + nums[i + 6] : nums[i + 6];
                    cx = x;
                    cy = y;
                    push(x, y);
                }
            } else if (upper === 'Z') {
                cx = sx;
                cy = sy;
                push(cx, cy);
            }
        }
        const ctm = svg.getScreenCTM();
        const pathCtm = path.getScreenCTM();
        if (!ctm || !pathCtm) return raw;
        // 顺序明确：path 局部 → (pathCtm) → 屏幕 → (ctm⁻¹) → 世界坐标
        return raw.map((p) => {
            const pt = svg.createSVGPoint();
            pt.x = p.x;
            pt.y = p.y;
            const w = pt.matrixTransform(pathCtm).matrixTransform(ctm.inverse());
            return { x: w.x, y: w.y };
        });
    }

    function arrowKind(path) {
        const me = attr(path, 'marker-end');
        if (!me) return 'none';
        return me.indexOf('open') >= 0 ? 'openarrow' : 'arrow';
    }

    function userPoint(svg, cx, cy) {
        const pt = svg.createSVGPoint();
        pt.x = cx;
        pt.y = cy;
        const ctm = svg.getScreenCTM();
        return ctm ? pt.matrixTransform(ctm.inverse()) : { x: cx, y: cy };
    }

    function extract(svgEl) {
        const svg = svgEl.querySelector('svg') || svgEl;
        const nodes = [];
        for (const el of svgEl.querySelectorAll('g.node')) {
            const b = worldBox(svg, el);
            nodes.push({
                id: nodeId(el),
                label: nodeLabel(el),
                shape: shapeKind(el),
                x: b.x + b.width / 2,
                y: b.y + b.height / 2,
                width: b.width,
                height: b.height,
                styleClass: 'flowchart-label',
                parentId: '',
                dividers: [],
            });
        }
        const edges = [];
        // 标签按位置匹配：每个 .edgeLabel 的包围盒中心 vs 边中点，取最近者
        const labels = [...svgEl.querySelectorAll('.edgeLabels .edgeLabel')].map((t) => {
            const r = t.getBoundingClientRect();
            const p = userPoint(svg, r.left + r.width / 2, r.top + r.height / 2);
            return { text: (t.textContent || '').trim(), cx: p.x, cy: p.y };
        });
        // 边路径容器因图型而异：flowchart 在 g.edgePaths 下，block 直接挂在 g.block 下
        // （block 的边若漏选会整批丢线，且 master 目录里连 Dynamic connector 都不会出现）
        const edgePathEls = [];
        for (const el of svgEl.querySelectorAll('.edgePaths path, g.block > path.flowchart-link')) {
            if (edgePathEls.indexOf(el) < 0) edgePathEls.push(el);
        }
        for (const el of edgePathEls) {
            const ids = edgeIds(el);
            if (!ids) continue;
            const pts = waypoints(svg, el);
            let label = '';
            if (pts.length >= 2 && labels.length > 0) {
                const midX = (pts[0].x + pts[pts.length - 1].x) / 2;
                const midY = (pts[0].y + pts[pts.length - 1].y) / 2;
                let best = null;
                let bestD = Infinity;
                for (const l of labels) {
                    const d = Math.hypot(l.cx - midX, l.cy - midY);
                    if (d < bestD && d < 40) {
                        bestD = d;
                        best = l.text;
                    }
                }
                label = best ?? '';
            }
            edges.push({
                from: ids.from,
                to: ids.to,
                label: label,
                style: 'normal',
                arrowHead: arrowKind(el),
                arrowTail: 'none',
                waypoints: pts,
                fromMultiplicity: '',
                toMultiplicity: '',
            });
        }
        const clusters = [];
        for (const el of svgEl.querySelectorAll('g.cluster')) {
            const b = box(el);
            clusters.push({ id: attr(el, 'id'), label: '', x: b.x, y: b.y, width: b.width, height: b.height });
        }
        // 边界：节点方形 + 边采样点并集；空时兜底 svg.getBBox
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const extend = (x, y) => {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        };
        for (const n of nodes) {
            extend(n.x - n.width / 2, n.y - n.height / 2);
            extend(n.x + n.width / 2, n.y + n.height / 2);
        }
        for (const e of edges) {
            for (const p of e.waypoints) extend(p.x, p.y);
        }
        let bb = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        if (minX > maxX) {
            try {
                const rootEl = svgEl.querySelector('svg') || svgEl;
                const b = rootEl.getBBox();
                bb = { x: b.x, y: b.y, width: b.width, height: b.height };
            } catch (e) {
                bb = { x: 0, y: 0, width: 0, height: 0 };
            }
        }
        return {
            nodes,
            edges,
            clusters,
            diagramType: 'flowchart',
            direction: 'TB',
            boundingBox: { minX: bb.x, minY: bb.y, maxX: bb.x + bb.width, maxY: bb.y + bb.height },
        };
    }

    window.__mmdExtractGeneric = extract;
})();
