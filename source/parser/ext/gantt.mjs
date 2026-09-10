// 浏览器端 gantt 提取器：解析 mermaid 文本（DB getTasks 对 after/relative 日期会抛错）
// 日期 → Excel 序列（1899-12-30=0）；after 关系按任务名解析，两遍求解。
(function () {
    'use strict';

    function serial(dateStr) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
        if (!m) return null;
        return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) + 25569;
    }

    function durationOf(s) {
        s = String(s || '').trim();
        var m = /^(\d+(?:\.\d+)?)\s*(d|w|h|m)?$/.exec(s);
        if (!m) return 1;
        var n = parseFloat(m[1]);
        var u = m[2] || 'd';
        if (u === 'w') n *= 7;
        else if (u === 'h') n = Math.max(1, Math.round(n / 8));
        else if (u === 'm') n = Math.max(1, Math.round(n / 30));
        return Math.round(n);
    }

    window.__mmdExtractGantt = function (diagram, svgEl, text) {
        var lines = String(text || '').split(/\r?\n/);
        var title = '';
        var sections = [];
        var curSection = '';
        var tasks = [];
        for (var i = 0; i < lines.length; i++) {
            var ln = lines[i].replace(/\r/g, '');
            var st = ln.trim();
            if (!st || st.charAt(0) === '%') continue;
            var m = /^title\s+(.+)$/.exec(st);
            if (m) { title = m[1].trim(); continue; }
            m = /^section\s+(.+)$/.exec(st);
            if (m) { curSection = m[1].trim(); sections.push(curSection); continue; }
            m = /^([^:]+):\s*(.+)$/.exec(st);
            if (!m) continue;
            var body = m[2];
            // 形如 <名称>: <开始|after X>, 时长
            var bodyM = /^([^,]+?)\s*(?:,\s*(.+))?$/.exec(body);
            var startRaw = (bodyM ? bodyM[1] : body).trim();
            var durRaw = (bodyM && bodyM[2] ? bodyM[2] : '').trim();
            var name = st.slice(0, st.indexOf(':')).trim();
            if (!name || /^title$|^section$|^dateFormat$/i.test(name)) continue;
            if (!/^after\s+/i.test(startRaw) && !/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) continue;
            var afterMatch = /^after\s+(.+)$/i.exec(startRaw);
            var task = {
                name: name,
                section: curSection,
                startSerial: afterMatch ? null : serial(startRaw),
                duration: durationOf(durRaw),
                milestone: /0\s*[dw]?/.test(durRaw) || durRaw === '0d',
                dependsOn: afterMatch ? [afterMatch[1].trim()] : []
            };
            tasks.push(task);
        }
        // after 解析（两遍）
        for (var pass = 0; pass < 3; pass++) {
            for (var t of tasks) {
                if (t.startSerial !== null) continue;
                for (var dep of t.dependsOn) {
                    var base = null;
                    for (var t2 of tasks) {
                        if (t2.name === dep) { base = t2; break; }
                    }
                    if (base && base.startSerial !== null) {
                        t.startSerial = base.startSerial + base.duration;
                        break;
                    }
                }
            }
        }
        var start = null, end = null;
        for (var t3 of tasks) {
            if (t3.startSerial === null) continue;
            if (start === null || t3.startSerial < start) start = t3.startSerial;
            var e = t3.startSerial + t3.duration;
            if (end === null || e > end) end = e;
        }
        if (start === null) { start = 0; end = 0; }
        return {
            diagramType: 'gantt',
            gantt: {
                title: title,
                sections: sections,
                startSerial: start,
                endSerial: end,
                tasks: tasks
            },
            boundingBox: { minX: 0, minY: 0, maxX: 900, maxY: 500 }
        };
    };
})();
