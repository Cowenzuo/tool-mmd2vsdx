# 架构文档

> 本目录描述**现状**：`source/` 新管线（重做后）的模块结构与运行方式。
> 设计过程、取舍与每包细节见 `docs/redesign/`（设计文档集，00-16 与各图型专篇）。

## 目录

| 文档 | 内容 |
| --- | --- |
| [00-模块结构与边界](00-模块结构与边界.md) | source/ 模块树、分层依赖规则、与旧代码关系 |
| [01-数据流与主流程](01-数据流与主流程.md) | mermaid 文本 → 契约 A → 契约 B → vsdx 的水管与各图型走法 |
| [03-代码审核报告](03-代码审核报告.md) | 新结构验收结果：golden 16/16、全量测试、类型、依赖门禁 |
| [diagrams/](diagrams/) | 总览图与数据流图（mermaid 源） |

## 一句话总览

```
mermaid 文本 → Parser(Chromium + mermaid 库) → 契约A(图型 json)
             → diag-* 各图型包 → 契约B(部件清单) → PartsAssembler → Squeeze(OPC/ZIP) → .vsdx
```

旧实现已移除（代码/测试/文档/基线产物全部清除，历史随 git 保留）；
验收以 **docs/research 准则**为唯一标尺——`source/golden.test.ts` 对 16 样本
做逐条准则条款断言（不比对任何旧产物）。

## 验证基线

- `npm test`：source/ 套件全绿（结构断言 + 16 样本准则验收，见 golden.test.ts）。
- `npm run typecheck`：零错误。
- `npm run check:arch`：source/ 源文件跨组边，无越层依赖。
- `node scripts/verify-vsdx.mjs`：对产物逐条断言研究条款（A-F 六组守门）。
