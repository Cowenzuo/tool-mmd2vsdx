// mermaid-snapshot - extract/gantt.mjs：甘特图语法解析。
//
// 注意：本文件由 snapshot.mjs 启动时读取并拼接注入页面（page.addScriptTag），
// 跨文件函数引用依赖拼接后的同一全局作用域（函数声明 hoist），
// 因此各 extract 文件间不写 import；`export` 前缀在拼接时被剥离。

// 甘特图：mermaid 渲染出的 SVG 只有几何，无日期/时长；原始文本在此直接解析。
// 支持: dateFormat / title / section / 任务: 日期, 时长[, 依赖]
export function parseGantt(text) {
    const gantt = {
        title: '', dateFormat: 'YYYY-MM-DD',
        startSerial: 0, endSerial: 0, sections: [], tasks: [],
    };
    const sections = [];
    let curSection = '';
    const dateSerial = (y, m, d) =>
        Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
    const lines = String(text || '').split('\n');
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('%%') || line === 'gantt') continue;
        let m = line.match(/^dateFormat\s+(.+)$/);
        if (m) { gantt.dateFormat = m[1].trim(); continue; }
        m = line.match(/^title\s+(.+)$/);
        if (m) { gantt.title = m[1].trim(); continue; }
        m = line.match(/^section\s+(.+)$/);
        if (m) {
            curSection = m[1].trim();
            if (!sections.includes(curSection)) sections.push(curSection);
            continue;
        }
        m = line.match(/^([^:]+):\s*(.+)$/);
        if (!m) continue;
        const name = m[1].trim();
        const parts = m[2].split(',').map(s => s.trim()).filter(Boolean);
        let startSerial = 0, duration = 0, isAfter = false;
        const startTok = parts[0] || '';
        const dm = startTok.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (dm) {
            startSerial = dateSerial(+dm[1], +dm[2], +dm[3]);
        } else if (/^after\s+/i.test(startTok)) {
            isAfter = true;
        }
        if (parts.length >= 2) {
            const dm2 = parts[1].match(/^([\d.]+)\s*([hdwMy]?)$/);
            if (dm2) {
                let v = parseFloat(dm2[1]);
                const u = dm2[2] || 'd';
                if (u === 'h') v /= 24;
                else if (u === 'w') v *= 7;
                else if (u === 'M') v *= 30;
                else if (u === 'y') v *= 365;
                duration = v;
            }
        }
        // 依赖解析：'after 任务X' 或 非日期/时长的剩余段 = 依赖任务名
        // （mermaid gantt 依赖语法：任务: 日期, 时长[, after 前置] 或 任务: 日期, 时长, 前置）
        const dependsOn = [];
        for (const p of parts) {
            const am = p.match(/^after\s+(.+)$/i);
            if (am) { const dn = am[1].trim(); if (dn) dependsOn.push(dn); continue; }
            if (p === parts[0]) continue;
            if (/^[\d.]+\s*[hdwMy]?$/.test(p)) continue;
            if (p) dependsOn.push(p);
        }
        gantt.tasks.push({
            name, section: curSection,
            startSerial, duration,
            milestone: duration === 0 && !isAfter && dm ? true : false,
            isAfter, dependsOn,
        });
    }
    if (gantt.tasks.length) {
        let minS = Infinity, maxE = -Infinity;
        for (const t of gantt.tasks) {
            if (t.startSerial) {
                if (t.startSerial < minS) minS = t.startSerial;
                if (t.startSerial + t.duration > maxE) maxE = t.startSerial + t.duration;
            }
        }
        if (isFinite(minS)) gantt.startSerial = minS;
        // endSerial = 最后结束时间的"天" + 2（对齐官方 GC：
        // EndDate=floor(最后任务/里程碑结束)+2，时间轴延伸到结束后下一天，
        // 否则主刻度会比官方少 2 天）。
        if (isFinite(maxE)) gantt.endSerial = Math.floor(maxE) + 2;
    }
    gantt.sections = sections;
    return gantt;
}
