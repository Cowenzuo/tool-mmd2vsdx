// 页面桥：注入与渲染入口（由 renderer.ts 以 addScriptTag 注入）
// 语义提取优先：getDiagramFromText → 对应 DB 提取器；失败回退 SVG 提取。
(function () {
    'use strict';

    window.__mmdRender = function (payload) {
        var mermaid = window.mermaid;
        if (!mermaid) {
            return Promise.resolve({ ok: false, error: 'mermaid 未注入' });
        }
        if (!window.__mmdInitFlag) {
            try {
                mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
            } catch (e) { /* 幂等 */ }
            window.__mmdInitFlag = true;
        }
        var dbExtract = null;
        var diagramType = null;
        var dbDiagram = null;
        return Promise.resolve()
            .then(function () {
                var api = mermaid.mermaidAPI;
                if (api && typeof api.getDiagramFromText === 'function') {
                    var p = api.getDiagramFromText(payload.text);
                    if (p && typeof p.catch === 'function') {
                        return p.catch(function () { return null; });
                    }
                    return p || null;
                }
                return null;
            })
            .then(function (db) {
                if (db && typeof db.getType === 'function') {
                    var t = String(db.getType());
                    diagramType = t;
                    dbDiagram = db;
                    if (t === 'pie' && typeof window.__mmdExtractPieDB === 'function') {
                        dbExtract = window.__mmdExtractPieDB(db);
                    }
                }
                // gantt 含 after/relative 日期时 DB 与渲染均会抛错：直接文本提取
                if (dbDiagram && diagramType === 'gantt' && typeof window.__mmdExtractGantt === 'function') {
                    return { ok: true, data: window.__mmdExtractGantt(dbDiagram, null, payload.text), __early: true };
                }
                if (!db && /^\s*gantt\b/i.test(payload.text) && typeof window.__mmdExtractGantt === 'function') {
                    return { ok: true, data: window.__mmdExtractGantt(null, null, payload.text), __early: true };
                }
                return mermaid.render(payload.ns + '-' + Date.now().toString(36), payload.text);
            })
            .then(function (res) {
                if (res && res.__early) return res;
                if (!res || !res.svg) return { ok: false, error: '渲染无 svg' };
                var host = document.createElement('div');
                host.innerHTML = res.svg;
                document.body.appendChild(host);
                try {
                    if (dbExtract) return { ok: true, data: dbExtract };
                    var svgEl = host.querySelector('svg');
                    if (!svgEl) return { ok: false, error: '渲染结果无 svg' };
                    if (diagramType === 'quadrantChart' && typeof window.__mmdExtractQuadrant === 'function') {
                        return { ok: true, data: window.__mmdExtractQuadrant(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'stateDiagram' && typeof window.__mmdExtractState === 'function') {
                        return { ok: true, data: window.__mmdExtractState(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'gitGraph' && typeof window.__mmdExtractGit === 'function') {
                        return { ok: true, data: window.__mmdExtractGit(dbDiagram) };
                    }
                    if (diagramType === 'sequence' && typeof window.__mmdExtractSequence === 'function') {
                        return { ok: true, data: window.__mmdExtractSequence(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'mindmap' && typeof window.__mmdExtractMindmap === 'function') {
                        return { ok: true, data: window.__mmdExtractMindmap(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'c4' && typeof window.__mmdExtractC4 === 'function') {
                        return { ok: true, data: window.__mmdExtractC4(dbDiagram) };
                    }
                    if (diagramType === 'xychart' && typeof window.__mmdExtractXY === 'function') {
                        return { ok: true, data: window.__mmdExtractXY(dbDiagram) };
                    }
                    if (diagramType === 'classDiagram' && typeof window.__mmdExtractClass === 'function') {
                        return { ok: true, data: window.__mmdExtractClass(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'er' && typeof window.__mmdExtractER === 'function') {
                        return { ok: true, data: window.__mmdExtractER(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'gantt' && typeof window.__mmdExtractGantt === 'function') {
                        return { ok: true, data: window.__mmdExtractGantt(dbDiagram, svgEl, payload.text) };
                    }
                    return { ok: true, data: window.__mmdExtractGeneric(svgEl) };
                } finally {
                    host.remove();
                }
            })
            .catch(function (e) {
                return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
            });
    };
})();
