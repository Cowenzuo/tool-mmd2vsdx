# mmd2vsdx — Mermaid → Visio VSDX 转换器（纯 Node/TypeScript 版）

把 Mermaid 文本转换为**原生可编辑的 Visio VSDX** 文档（不依赖 Visio COM）。

本仓库是源工程 `D:\_dev\mmd2vsdx`（C++17 引擎 + Node/mermaid-snapshot 复合结构，经验证）
的**纯 Node/TypeScript 移植版**：MMD 解析（mermaid.js + Playwright 渲染提取）与
VSDX 生成（OPC/ZIP/XML + 官方模具母版实例）统一于单一 Node 生态，无 C++ 复合结构。

## 能力（与 C++ 基线结构等价验证）

- 14 类 Mermaid 图（flowchart/state/class/er/sequence/block/gantt/pie/gitGraph/
  mindmap/timeline/quadrantChart/xychart/c4）
- 原生可编辑 VSDX：官方模具母版实例（Master="N"+局部覆盖）、1-D 连接线
  `_WALKGLUE` 粘附、五节点几何、线型/箭头映射、多页
- 16 个验收样本产物与 C++ 基线 **逐部件结构等价**（tests/testmasters 金标准闸门）

## 使用

```bash
npm install
npx playwright install chromium        # 首次（渲染需 Chromium）

# CLI（npm run build 后；或 npm link 全局注册 mmd2vsdx）
node dist/cli.js in.mmd out.vsdx
node dist/cli.js --dir inputDir outDir
node dist/cli.js --serve --port 12138    # POST /convert {text} → {status, vsdx(base64),...}
```

三种消费场景（手动/目录批量、另一 Node 项目 import、AI 本地工具调用）的
完整说明见 **[docs/usage.md](docs/usage.md)**（含构建、打包分发对照、serve JSON 协议
与 LLM 工具描述示例）。

```ts
// 库 API（ESM；包已声明 main/types，import 名即包名）
import { application } from 'mmd2vsdx';
const r = await application.convertText('flowchart LR\n  A-->B');
if (r.ok) fs.writeFileSync('out.vsdx', Buffer.from(r.vsdxBase64, 'base64'));
```

## 测试

```bash
npm test          # 186 用例（8 套件，含真实 Chromium 渲染与金标准闸门）
npm run typecheck
npm run build
```

## Visio 人工验收指引（M5/M6）

自动化闸门已保证与 C++ 基线产物**结构等价**（部件清单 + 全部 XML parse 级一致）；
建议再用真实 Visio 目视确认一次：

1. `node dist/cli.js resources/test-examples/mmd-input/05-flowchart-1.mmd temp/v.vsdx`
2. 用 Visio 打开 `temp/v.vsdx`：节点为官方形状（拖动把手/连接线端点粘附、
   线型右键切换可用）；保存后无"格式修复"提示（Document.Saved=True 语义）
3. 抽查甘特（07）：GC 组件列拖动重排、右键"配置"菜单与官方模板一致

## 文档

- `docs/usage.md` — 使用指南（构建/打包/三场景调用/母版资产供给）
- `docs/roadmap.md` — 未来待办（预览渲染器立项，含方案与待确认清单）
- `docs/工程规范.md` — 提交/命名/代码规范（源自 dsh-plugins）
- `docs/bench.md` — 性能冒烟基线
- `docs/architecture/` — 架构文档（模块结构/数据流/审核报告/结构图）
- `docs/research/` — Visio 产物内部结构研究（逐图类型解包剖析，实证认知库）
- `docs/archived/` — 过程文件与历史参考（移植规划/源工程文档，**v1.0 定版后移除**）
- `resources/test-examples/` — 验收样本三件套（mmd-input 源稿 /
  svg-json-medium 浏览器快照 / vsdx-output 金标准参照）
- `resources/visio-template|binary/` — 官方模具与提取物（仅本地开发用，不入库）

## 状态

M0–M6 全部完成：core/xml/opcpkg/mmdtransform/snapshot/vsdxdoc/masters/app 全链路
纯 TS；金标准 16/16 结构等价；测试 201/201 绿。官方模具资产**不随包、不入公开
仓库**（`resources/visio-*`：template 原件与 binary 提取物均已 gitignore 并在历史中清除）：
运行期自动搜寻本机 Visio 或经 `--stencil-dir/--stencil-asset` 显式导入
（详见 docs/usage.md §〇·一）；公开克隆无模具文件——真实母版/金标准测试自动
跳过，本地与私有 CI 提供模具后全量 201/201 通过。
