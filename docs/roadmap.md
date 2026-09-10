# 未来待办（Roadmap）

> 本文件收录"已讨论清楚、暂不实施"的功能立项，避免决策丢失。
> 每条含：背景、机制结论、已定决策、方案摘要、开工前待确认项。
> 关联：`docs/architecture/03-代码审核报告.md` §九（代码遗留台账）。

---

## P-3 docProps 字段与 Visio 产物的差异归档

> 状态：**记录归档**（研究 Visio docProps 时发现的差异对照，需要时再处理）。

| 文件 | Visio 保存的 | 本工具生成 |
| --- | --- | --- |
| core.xml | 作者=系统账户、完整时间戳、语言等全字段 | 仅 title/creator = mmd2vsdx |
| app.xml | Application=Microsoft Visio、HeadingPairs/TitlesOfParts 结构统计、AppVersion=16.0000 | Application=mmd2vsdx、AppVersion=2.0 |
| custom.xml | BuildNumberCreated/Edited、IsMetric、TimeEdited | 同结构 + `RecalcDocument=true` |
| thumbnail.emf | 有（首页矢量封面，保存时生成） | 无 |

字段全集与结构一致，本工具按"最小必要"填写——解析器按元素名读取，
缺省字段按空处理，不影响打开。
处置前提（需要时）：若对接方/文档库要求属性完整（作者、统计、封面预览）时，
再按上表补齐；thumbnail 议题另见 P-1。

---

## P-2 scripts/ 目录重构（论证已毕，暂缓执行）

> 状态：**已论证、用户暂缓**（2026-09："暂时先不动，最后处理"）。
> 结论：5 个脚本中 3 个是"放错位置的代码"，按 A/B/C 三类归位：

| 脚本 | 分类 | 论证结论 | 去向 |
| --- | --- | --- | --- |
| `batch-convert.mjs` | A 交付能力 | 容错批量+报告是产品能力，且"仓库外脚本 import dist"是反模式 | 收进 `src/app`（`--dir` 加 `--tolerant --report` 或库方法 `convertDirResilient`，形态待定） |
| `gen-stencils.mjs` | A 交付能力 | 提取逻辑与 `stencilAssets.ts` 双份实现，必然漂移 | 收进 stencilAssets（`exportStencilAssets(dir,out)`）+ CLI 子命令 `--export-stencils`，删除脚本 |
| `make-fixtures.mjs` | B 测试资产工具 | 夹具重采集器，依赖 C++ 源仓库，低频 | `tests/tools/`（版本化；勿放 gitignored 的 temp/） |
| `check-architecture.mjs` | C 质量门禁 | lint 类守门，位置合理 | 保留 scripts/（或 tools/） |
| `copy-assets.mjs` | C 构建步骤 | 9 行 build 一步 | 内联 build 或留 scripts/ |

执行后 scripts/ 剩 0–2 个（取决于用户对 C 类最终取舍）。

---

## P-1 自研"自产物预览渲染器"（docx 嵌入预览 / Visio 观感出图）

> 状态：**已归档待办（2026-09 讨论定案，暂不施工）**。
> 用户场景：另一工程（OpenXML 构造 docx）调用本工程转 vsdx 后嵌入 Word，
> 嵌入处需要一张预览图（现状留空、盲点双击）。**工程主旨：全程不依赖本机 Visio。**

### 背景与机制结论（已取证）

- 真实 Visio 产物的缩略图结构（解包 `15-sequence-1-example.vsdx` 实证）：
  `docProps/thumbnail.emf` + CT `<Default Extension="emf" ContentType="image/x-emf"/>`
  + 根 rels `.../package/2006/relationships/metadata/thumbnail`。
  结构可照抄，EMF 无法自产；OPC 不限定格式（jpeg/png 可）。
- docx 嵌入 vsdx（OpenXML EmbeddedPackage 类方式）时，嵌入处显示的是**生成方放置
  的图片**——与 vsdx 包内 thumbnail 解耦。因此交付形态 = **一张 PNG**（嵌入方放置）。
- 图源候选：mermaid SVG（现成，内容一致、风格不同）／自研"自产物光栅化"
  （几何同源，逼近 Visio）／LibreOffice（外部重依赖）／Visio（违背主旨，排除）。

### 已定决策（用户拍板）

1. 嵌入方式：OpenXML 构造 docx，图片由生成方放置 → 我方交付 PNG；
2. 路线：**一步到位直接自研**（不做 mermaid 观感 PNG 垫底）；
3. 范围：**只支持自产 vsdx**（不解析任意 vsdx，复杂度差一个量级）；
4. 部署环境：混合（Windows + Linux）；预览图默认行为待定（见下）。

### 方案摘要（骨架）

- 输入不走 vsdx XML 解析：在 convertText 打包前截取
  `DocumentCore.pages[].root`（PageContents 树，cell 全为本工程写入的字面量，
  免公式求值）＋ masters 资产（按 `Master=` 查母版几何/样式）；
- 渲染链：页面树（managed 五几何 + 母版实例 Group + 连接线 + 文本）→ **SVG**
  → Chromium（已在手，零新依赖）→ PNG/JPEG；
- 文本：建议 `<foreignObject>`+HTML div 让 Chromium 排版（自动换行/度量/对齐），
  代价：PNG 输出强依赖 Chromium；
- 背景白底；DPI 默认 150，超 Chromium 截图边限（~16384px）自动降 DPI；
- 母版样式链：LineStyle/FillStyle + 实例 cell 覆盖需解析（M2 主工作量）；
- 接口草案：库 `convertText(text, { previewPng: true })` →
  `result.previewPngBase64`；CLI 默认同生 `<stem>.png`（`--no-preview` 关闭）。

### 里程碑（渐进、每步可验收）

| 里程碑 | 覆盖 | 备注 |
| --- | --- | --- |
| M1 基础几何 | flowchart/state/block：五几何 + 文本 + 直连/折线 + 箭头 + 线型 | 日常约 60% 场景 |
| M2 母版几何 | class / ER / 官方形状外观（资产几何 + 样式链） | 工作量重心 |
| M3 专用图布局 | sequence / gantt / pie / quadrant / git | gantt 公式密集，或接受简化呈现 |
| M4 精度 | 多行对齐/字号/箭头/主题色/虚线线宽/DPI；并排目检修差 | 与 Visio 逐项差异清单迭代 |

### 客观上限（无法 100% 复刻 Visio）

- Visio 打开时的公式重算 / glue 重排（离线只能信 V 缓存"保存态"值）；
- 主题与字体回退细节；1-D 连接线交互重路由。

### 开工前待确认清单（讨论未竟项）

1. **验收基准**：人工参照集（用户在装 Visio 的机器导出代表样本 PNG 交我方）
   + 自回归像素阈值；参照集存放位置；
2. **字体策略（混合环境）**：文档要求装 fonts-noto-cjk ／ OFL 字体子集随包
   （体积 +几 MB，无再分发限制）／ 环境变量指定字体路径；
3. **gantt 等公式密集型组件的离线边界**：是否接受第一版"近似/简化呈现"；
4. **超大图 DPI 策略**与 docx 嵌入图幅（固定输出宽度？）；
5. **默认生成 PNG 对已上线对接方的影响**：默认开 vs 显式开关；
6. 输出强依赖 Chromium（foreignObject 排版）是否接受。

---
