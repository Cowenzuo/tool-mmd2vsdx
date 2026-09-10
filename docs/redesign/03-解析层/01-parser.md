# parser（① mmd-parser）

## 1. 模块职能

parser 是管线第一段：mermaid 文本 → 契约 A。它负责"把图翻译成结构"，不懂
任何 Visio。渲染在进程内 Chromium 完成（注入 mermaid 与提取脚本），
提取结果在 Node 侧归一化为契约 A。

## 2. 目录与文件

```
src/parser/
├── index.ts              门面：Parser.convertText(text, opts) → 契约A
├── renderer.ts           SnapshotRenderer：浏览器生命周期与串行队列
├── ext/                  浏览器端提取脚本
│   ├── generic.mjs       通用骨架提取（flowchart/block）
│   ├── class.mjs  er.mjs  sequence.mjs
│   ├── bridge.mjs        页面桥（保留 mermaid 真实图型名，供归一化判支持）
│   └── bundle.d.ts       注入脚本的契约声明
├── normalize/
│   ├── generic.ts        快照 → 契约 A（含 kind 判定：不支持即抛错）
│   └── guards.ts         契约 A 校验与兜底实现
└── types.ts              本包私有类型（快照 JSON 形状）
```

> 支持范围（2026-09 收敛）：flowchart / block / class / er / sequence；
> 其余图型不注入提取器，`mapKind` 抛「不支持的图型」。

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| Parser | 门面：编排快照与归一化，产契约 A | `convertText(text, opts?): ContractA` |
| SnapshotRenderer | Chromium 单例：注入提取 bundle + mermaid，串行渲染，失败重建 | `render(text): SnapshotJson` |
| Normalizer | 按 kind 分派的纯函数族 | `normalize(kind, json): ContractA` |

## 4. 函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| convertText | text, options | ContractA | 渲染 → 归一化 → 校验兜底 |
| renderText | text | SnapshotJson | 进程内渲染，一次失败重建页面后重试 |
| extractGeneric / extractClass / extractEr / extractSequence / extractGantt / extractGit / extractPie / extractQuadrant / extractMindmap | 页面上下文 | 图型 JSON | 浏览器端提取，只取语义与像素几何 |
| normalizeGeneric | 图型 JSON | 契约A(shapes) | 通用骨架与尺寸兜底 |
| normalizeClass / normalizeEr / normalizeSequence / normalizeGantt / normalizeGit / normalizePie / normalizeQuadrant / normalizeMindmap | 图型 JSON | 契约A(对应块) | 各图型私有字段的缺省补齐 |
| applyDefaultKind | 契约 A | kind | kind 为空时按扩展块推断 |

## 5. 边界与注意

- parser 不产任何 `.xml` 字符串；失败抛 `[parse]` 前缀错误；
- 提取脚本只读 mermaid 渲染出的 DOM/图结构，不做布局计算（布局像素
  直接来自 mermaid）；归一化函数零浏览器依赖，可单测；
- 新增图型：写一个 extract + 一个 normalize，注册到分派表即完成，
  不动其它图型。
