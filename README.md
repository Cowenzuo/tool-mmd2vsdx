# mmd2vsdx — Mermaid → Visio VSDX 转换器（纯 Node/TypeScript 版）

把 Mermaid 文本转换为**原生可编辑的 Visio VSDX** 文档（不依赖 Visio COM）。

本仓库是源工程 `D:\_dev\mmd2vsdx`（C++17 引擎 + Node/mermaid-snapshot 复合结构，经验证）
的**纯 Node/TypeScript 移植版**：拆除 C++/Node 复合结构，MMD 解析（mermaid.js +
Playwright 渲染提取）与 VSDX 生成（OPC/ZIP/XML + 官方模具母版实例）统一于单一
Node 生态。

## 文档

- `docs/port-plan/` — 移植实施规划（00 总纲 / 01 坑位清单 / README 索引）
- `docs/reference/` — 源工程文档收档（ts-port 原样 / architecture / 过时归档精选）
- `resources/` — 验收样本（testio）与官方模具（visio，仅开发机，不随包分发）
- `tests/fixtures/` — 金标准（golden: C++ 基线产物 16 份；snapshot: 提取 JSON 快照 16 份）

## 命令

```bash
npm install            # dev: typescript + vitest（M3 起追加 playwright + mermaid）
npm run typecheck      # tsc --noEmit
npm test               # vitest run（当前阶段：testir）
npm run make:fixtures  # 重新采集 snapshot JSON 快照（需源仓库 snapshot 组件与 Chromium）
```

## 状态

- 步骤 0 ✅（奠基/收档/金标准固化）；M0 ✅（core 类型层，testir 绿）
- 下一阶段：M1（xml + opcpkg 容器层，testopc 绿）——见 `docs/port-plan/00-移植实施规划.md`
