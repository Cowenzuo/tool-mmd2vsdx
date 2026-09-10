# diag/git（⑦ git 包）

## 1. 模块职能

git 包写 git 图：提交圆点（Circle 母版）、分支线、提交间箭头（含弧线
采样）、标签文本。语义全部来自契约 A 的 GitGraph 块，几何沿用像素坐标。

## 2. 目录与文件

```
source/diag/git/
├── index.ts       GitRenderer.render(a) → 契约B
├── commit.ts      提交点写手
├── branch.ts      分支线写手
└── arrow.ts       箭头写手
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| GitRenderer | 编排 | `render(git): ContractB` |
| CommitWriter | 提交点 | `write(commit)` |
| BranchWriter | 分支线 | `write(branch)` |
| GitArrowWriter | 箭头 | `write(arrow)` |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| commitCells(c) | 提交 | cell 表 | 圆心/半径/高亮色/标签位置 |
| mergeToken(c) | 提交 | 文本 run | merge 双圈/标签文本叠加 |
| branchLine(b) | 分支 | 几何行 | 分支横线 + 分支名文本 |
| arrowPolyline(a) | 箭头 | 几何行 | 采样折线，弧线段按设计近似为直线 |

## 5. 边界与注意

- git 包复用通用边的粘附逻辑，但箭头连接的是圆点中心 → 走 WALKGLUE；
  行为按设计约定实现，避免本包引入额外粘附分支；
- 标签与高亮色写实例 cell，不新增样式表。
