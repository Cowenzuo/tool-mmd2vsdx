# Git（gitGraph）专用渲染 —— 设计结论（2026-08-07）

> 目标：为 08-git（gitGraph）提供「语义解析 + 专用渲染器」，还原 git 分支图
> 的可视结构与可编辑性（对标 gantt/er 的成熟模式），不依赖通用 rect/边提取。
> 验证：构建 + ctest 8/8 + 产物 XML 复核 + Visio 实测。

## 设计状态

### 数据流
```
.mmd (gitGraph)
  → snapshot.mjs extractGitGraph(container)        # DOM → GitGraph JSON
  → jsonparser.cpp                              # JSON → Diagram.git (GitGraph)
  → diagramimporter.cpp 特判 !diagram.git.empty()
  → GitRenderer::render(page, git, transform)   # → page.shapesNode
```
坐标：`CoordinateTransform`（SVG px → 页面英寸，y 翻转），页面尺寸按 bounds 自适应。

### 语义模型（ir.hpp GitGraph）
- `GitCommit`：id / label / tag / branchIndex / x,y,r / merge / highlight / reverse
- `GitBranch`：name / index / y / x1,x2 / color
- `GitArrow`：from / to / kind(seq|branch|merge) / branchIndex(线色) / waypoints

### 渲染结构（产物 08-git-1 复杂样例 = 57 形状）
| 元素 | 表达 |
|---|---|
| 分支线 | 2-D 折线，虚线（LP=2）、分支色、0.75pt |
| 分支名标签 | Rounded Rectangle 母版实例（分支色填充、无边框、黑/白字按亮度），分支线左端左侧 |
| commit | Circle 母版实例（分支色填充/描边、无文本） |
| merge | 双同心圆（外 2r + 内 2r·6/9，内圈描边 #ECECFF） |
| HIGHLIGHT | 深色描边 #000000 + 1.5pt 粗线 |
| cherry-pick | 浅描边 #ECECFF（REVERSE） |
| commit 标签 | 无边框文本框，圆点下方，8pt |
| tag 标签 | 圆点上方；tag==label（cherry-pick）不重复 |
| 推进/merge/创建线 | 2-D 折线（弧线已采样），2pt；branch 创建虚线其余实线 |

### 关键机制（防回退约束）
- commit 提取必须同时查 `circle.commit` 和 `rect.commit`（HIGHLIGHT 是 rect 不是 circle）
- 装饰小圆 r<4 必须过滤（cherry-pick 主圆旁 2 个 r=2.75 小圆）
- merge 双圈按同位置去重取外圈；HIGHLIGHT 双框跳过 inner 取 outer
- cherry-pick 无 commitN 分支索引 → 按 y 就近匹配分支线
- 分支色从 `<style>` 解析 `.commitN{stroke:hsl(...)}` → hslToHex 精确还原
- 线色：seq/创建=目标分支色，merge=源(子)分支色（提取时定 branchIndex）
- kGitMasters 必须含 Circle + Rounded Rectangle（缺 Rounded Rectangle 时分支名标签无母版）
- `resolveDiagramType` 匹配 `type.find("git")`；DiagramType::Git = 9（枚举尾部追加）

## 遗留（B2，有意保留）
1. 线用 2-D Geometry（非 1-D connector），commit 圆点移动时线不跟随（无粘附/重路由）
2. commit 标签为水平文本（未还原 mermaid 45° 斜体）
3. merge 弧线为折线采样近似（未用真样条）

## 验证
1. 构建：`cmake --build build --config Debug`；测试：`ctest -C Debug --test-dir build`（8/8）
2. 产物：`resources/testio/output/08-git-1.vsdx`（只读，防 Visio 改写污染）
3. 输入样本：`resources/testio/input/08-git-1.mmd`（复杂版：4 分支 + 6 merge +
   HIGHLIGHT×3 + cherry-pick + tag，14 commit / 17 箭头）
4. XML 复核：形状数、Master 引用、坐标、线型、颜色（分支名/commit/线）
