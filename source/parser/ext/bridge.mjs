// 页面桥：注入与渲染入口（由 renderer.ts 以 addScriptTag 注入）
// 语义提取优先：getDiagramFromText 取真实图型名 → 专用提取器（sequence/class/er）；
// 其余走通用 SVG 提取，但**保留真实图型名**，归一化层据此判定支持与否。
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
                    diagramType = String(db.getType());
                    dbDiagram = db;
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
                    var svgEl = host.querySelector('svg');
                    if (!svgEl) return { ok: false, error: '渲染结果无 svg' };
                    if (diagramType === 'sequence' && typeof window.__mmdExtractSequence === 'function') {
                        return { ok: true, data: window.__mmdExtractSequence(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'classDiagram' && typeof window.__mmdExtractClass === 'function') {
                        return { ok: true, data: window.__mmdExtractClass(dbDiagram, svgEl) };
                    }
                    if (diagramType === 'er' && typeof window.__mmdExtractER === 'function') {
                        return { ok: true, data: window.__mmdExtractER(dbDiagram, svgEl) };
                    }
                    // 通用兜底：把 mermaid 的真实图型名带回快照——归一化层据此判定
                    // 是否支持（不支持即抛错，绝不能静默当流程图）。
                    var data = window.__mmdExtractGeneric(svgEl);
                    if (diagramType && data && typeof data === 'object') data.diagramType = diagramType;
                    return { ok: true, data: data };
                } finally {
                    host.remove();
                }
            })
            .catch(function (e) {
                return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
            });
    };
})();
