# source —— 当前实现根目录

> 本目录按 `docs/redesign/` 的详细设计实现（旧 `src/` 已移除，历史随 git 保留）。
> 设计文档在 `docs/redesign/`：00 一览 → 01 体例 → 02 契约层 →
> 03 解析层 → 04 转义层（10 篇）→ 05 打包层 → 06 验证与旧代码处置；
> 现状说明见 `docs/redesign/现状-*.md`。

## 模块（= 文档编号）

1. `contracts/` 契约层（02）：契约 A、契约 B 纯类型与校验；
2. `parser/` 解析层（03）：mermaid 文本 → 契约 A（Chromium + 提取脚本组）；
3. `common/` 转义层公用库（04-10）：几何/cell/公式/文本/样式/母版/端口/校验；
4. `diag-*` 图型包（04-01..09）：契约 A → 契约 B；
5. `xml-parts/`、`squeeze/` 打包层（05）：契约 B → .vsdx；

验收唯一标尺 = docs/research 准则：`tests/spec.test.ts`（16 样本逐条断言）。

## 约定

- 包目录与 `docs/redesign/01-设计体例与约定.md` 一致；
- 每包含 `index.ts` 门面与包内单测（`*.test.ts` 同目录）；
- 构建：根 `tsconfig.build.json` 编 `source/`，`npm run build` 内联复制
  `parser/ext/*.mjs` 到 `dist/`。
