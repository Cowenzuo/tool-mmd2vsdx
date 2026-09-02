# tool-mmd2vsdx — 纯 Node 化移植（规划与实施）文档索引

> 本仓库将把源工程 `D:\_dev\mmd2vsdx`（C++17 + Node/mermaid-snapshot 复合结构，基线
> `b428945`）翻译并优化为**单一纯 Node/TypeScript 工程**。
> 本目录为规划系列文档；源工程文档与留存文档（ts-port 系列等）原样收档于
> `docs/reference/`（步骤 0 执行）。

## 文档

| 文档 | 内容 |
|---|---|
| [00-移植实施规划.md](00-移植实施规划.md) | **总纲**：意图解读、源工程事实基线、判别记录（冗余/瑕疵 → 处置定案）、目标工程形态、模块映射、路线图（步骤 0 + M0–M6）、验收金标准、风险对策 |
| [01-坑位清单.md](01-坑位清单.md) | 08 坑位清单的实施期对照附录（待补：以源 `docs/ts-port/08-实施要点-全流程坑位清单.md` 摘录为底） |
| （执行期新增） | 各阶段实施记录/决策记录/性能基线（docs/bench.md 等） |

## 源工程参照（收档目标位置，步骤 0）

| 源路径（D:\_dev\mmd2vsdx） | 收档至 | 说明 |
|---|---|---|
| docs/ts-port/（00–08 + README） | docs/reference/ts-port-original/ | TS 化设计期系列（git 未提交，原样保留） |
| docs/architecture/ | docs/reference/architecture/ | 现行设计文档（与代码一致） |
| docs/过时归档/（精选） | docs/reference/archive/ | 历史/沿革/参考手册/官方参照 .vsdx |
| mermaid-snapshot/ | src/snapshot/（实施期收编） | 渲染与提取组件 |
| resources/testio/input/ | resources/testio/input/ | 16 验收样本 |
| resources/visio/ | resources/visio/ | 官方模具（仅开发机；版权与再分发约束见其 README） |
| temp/output/*.vsdx（16） | tests/fixtures/golden/ | C++ 基线产物（金标准，步骤 0 重新生成） |

## 关键结论（TL;DR）

1. **可行且应做**：源工程 v2 七模块 + 门面对门面 + 纯数据契约（core）不绑定 C++；
   瓶颈在 Chromium 渲染，与语言无关；纯 Node 化去掉子进程/HTTP/WinHTTP/libxml2/zlib
   四套复杂度，开发与维护效率显著提升（效率论证见源 ts-port/01）。
2. **主策略**：逐模块 1:1 平移 + 同构保留；snapshot 提取层进程内直调收编（.mjs 原样）；
   测试 8 套平移 vitest；16 样本产物结构等价为金标准。
3. **判别定案 20 条**（D1–D20，见 00 §3）：错误分层、转义口径、空图界语义、
   custom.xml 恒存在、CT 归属 Package、资源管线闭环等全部以源码为准拍板。
4. **阶段红线**：步骤 0 固化金标准 → M0–M2 离线闭环 → M3 真实渲染 → M4 专用渲染器 →
   M5 母版 → M6 编排/发布；每阶段构建 + 测试全绿 + 闸门校验。

## 下一步

等待用户确认决策点（见 00 §9 / 会话提问）后执行步骤 0 + M0。
