// 浏览器端 git 提取器：DB 语义（分支/提交/父链）+ 确定性布局网格
(function () {
    'use strict';

    window.__mmdExtractGit = function (diagram) {
        var inner = diagram && diagram.db;
        var branches = [];
        try {
            var arr = inner.getBranchesAsObjArray();
            branches = (arr || []).map(function (b) { return b.name; });
        } catch (e) { branches = []; }
        var commits = {};
        try { commits = inner.getCommits() || {}; } catch (e) { commits = {}; }
        // 布局网格（与旧基线同构：列距 0.520833 英寸=50px、行距 0.9375 英寸=90px）
        var colGap = 50, rowGap = 90, x0 = 148, y0 = 368;
        var list = [];
        for (var id of Object.keys(commits)) {
            var c = commits[id];
            var row = Math.max(0, branches.indexOf(c.branch));
            list.push({
                id: id,
                label: id,
                tag: c.tag || '',
                branchIndex: row,
                x: x0 + (c.seq || 0) * colGap,
                y: y0 - row * rowGap,
                r: 12,
                merge: c.type === 3,
                highlight: c.type === 2,
                reverse: c.type === 4,
                parents: (c.parents || []).slice()
            });
        }
        return { diagramType: 'gitGraph', git: { branches: branches, commits: list } };
    };
})();
