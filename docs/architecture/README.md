# mmd2vsdx 架构文档（TS 版现状）

> 适用对象：`D:\_dev\tool-mmd2vsdx`（纯 Node/TypeScript 实现）。描述以**当前代码实测**为准
> （依赖图由脚本对全部 `import` 语句提取，非人工默写）。
>
> 配套文档树：
> - `00-模块结构与边界.md` —— 分层模型、模块卡、依赖图结论、边界规则
> - `01-数据流与主流程.md` —— 转换流水线、进程生命周期、开发期资源管线
> - `03-代码审核报告.md` —— 分层深度审核的问题清单与处理结论
> - `diagrams/` —— Mermaid 结构图（.mmd，可在 Mermaid Live Editor / 本工具产物中查看）

## 一、工程定位一句话

把 Mermaid 文本 →（Chromium 渲染快照）→ 统一中间表示（IR/Diagram）→ 自研 OPC 容器与
Visio XML 部件 → `.vsdx` 文件。全部格式能力自研（XML 栈、ZIP、VSDX 部件模型），
**1:1 移植自已验证的 C++17 工程**（`docs/reference/archive` 存原始工程文档），
测试以 C++ 基线的 16 样本 golden `.vsdx` 做结构等价比对。

## 二、目录速览（37 个 .ts，约 1 万行；另含 14 个 .mjs 浏览器注入脚本与 1 份生成资产）

| 目录 | 文件数 | 一句话职责 |
| --- | --- | --- |
| `src/cli.ts` | 1 | 命令行入口（单文件 / --dir / --serve），退出码 0/1/2 |
| `src/app/` | 1 | 编排门面：文件/目录/HTTP 三种驱动 + 转换阶段错误包装 + shutdown |
| `src/vsdxdoc/` | 18 | VSDX 文档层：docmodel 纯模型 / translate 导入 / render 渲染 / serialize 序列化 / masters 母版 |
| `src/mmdtransform/` | 2 | Mermaid 快照 JSON → IR（jsonToDiagram）+ 门面 translator |
| `src/snapshot/` | 1 | 进程内 Chromium 渲染器（注入自研 extract bundle + mermaid UMD） |
| `src/opcpkg/` | 6 | OPC/ZIP 容器层（VSDX 即 OPC 包） |
| `src/xml/` | 3 | 自研 XML 树/解析/序列化 + VSDX 常量 |
| `src/core/` | 5 | 纯类型与错误码（无任何业务依赖，被全仓依赖） |

依赖规则（实测结论）：**严格单向分层，无跨层反向边**；唯一文件级“环”在
`docmodel/model.ts ↔ documentCore.ts`，经核实为**双向 `import type`（类型层互引），
编译后无运行时环**——详见 `00-模块结构与边界.md` 附注。

## 三、设计原则（代码中反复出现的一致约定）

1. **1:1 平移、字节对齐**：cell/部件书写顺序与 C++ 一致；数字格式化统一走
   `xmlBuilder.number()/cppFixed6()`，是 golden 结构等价的前提。
2. **去指针红利**：C++ 的 xmlNodePtr 句柄与“树外按 id 刷新”索引，在 TS 中改为
   live 对象引用（`ShapeModel.nodeRef`、`ConnectorModel.begin/endConnectRef`），
   模型↔树对应显式可查。
3. **分层门面**：每层只暴露门面级 API（`vsdxTranslator.translate`、`translator`、
   `OpcPackager`、`Application`），内部工厂/渲染器不跨层泄漏。
4. **双路径母版**：渲染层只依赖 `MasterClient` 抽象（`masterId=0` 本地内容 与
   真实官方 stencil 母版两种实现），M2 的 masterless 路径至今保留作无资源环境兜底。
5. **错误分级**：`MmdError` 4 码（NodeNotFound/JsonParseError/SubprocessCrashed/MermaidError，
   数值对齐 C++）+ `ZipError` 7 码（opcpkg 自含），参数/结构错误走内置
   `TypeError/RangeError`；`application.phaseError` 统一加 `[phase]` 前缀。
6. **确定性产物**：ZIP DOS 时间恒 0、GUID 由 `guidFor(seed)` 确定性生成、
   页面/部件命名单调分配——同一输入产出逐字节可复现（除已文档化的数字语义等价项）。

## 四、测试与门禁（与架构配套的验证面）

- `npm run typecheck` / `npm run build`（build = tsc + 资产复制，见 01 §资源管线）
- `npm test`：9 个测试文件 / 186 用例；`tests/fixtures/golden/*.vsdx`（16 样本，
  由 C++ 基线生成并再生成的字节参照）+ `snapshot/*.json`（渲染快照夹具，跑测试不启动浏览器）
- `scripts/batch-convert.mjs` 用于真实批量（256 文件容错转换 + `_report.json`）

## 五、已知文档化偏差（刻意保留，勿当缺陷修）

- `guidFor` 与 C++ 实现哈希字节不同 → golden 比对把 GUID 形状属性按“结构等价”处理；
- 数值以**语义**等价而非逐字节等价（浮点表示 1e-9·max(1,|a|,|b|) 容差）；
- extract `.mjs` 为浏览器内 IIFE，P2 前不做 TS 化（读源码→剥 export→按依赖序拼接注入）。
