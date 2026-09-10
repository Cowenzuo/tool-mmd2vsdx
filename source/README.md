# source —— 重构后的新实现根目录

> 本目录按 `docs/redesign/` 的详细设计从零实现，**不背 `src/` 的现有代码
> 包袱**。过渡期策略：本目录与 `src/` 并存，全部包实现并验收完成后
> 移除 `src/`。
> 设计文档在 `docs/redesign/`：00 一页看懂 → 01 体例 → 02 契约层 →
> 03 解析层 → 04 转义层（10 篇）→ 05 打包层 → 06 验证与旧代码处置。

## 实现顺序（= 文档编号）

1. `contracts/` 契约层（02）：契约 A、契约 B 纯类型与校验；
2. `parser/` 解析层（03）：mermaid 文本 → 契约 A；
3. `common/` 转义层公用库（04-10）：几何/cell/公式/文本/样式/母版/端口/校验；
4. `diag-*` 九个图型包（04-01..09）：契约 A → 契约 B；
5. `xml-parts/`、`squeeze/` 打包层（05）：契约 B → .vsdx；
6. 16 样本 golden 对等验证，齐了移除 `src/`、改写 docs/architecture。

## 约定

- 包目录与 `docs/redesign/01-设计体例与约定.md` 一致；
- 每包含 `index.ts` 门面与包内单测（`*.test.ts` 同目录）；
- 本目录代码暂不参与旧构建（`tsconfig.build.json` 只编 `src/`），
  typecheck 与测试通过根配置接入。
