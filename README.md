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

1. `node dist/cli.js resources/testio/input/05-flowchart-1.mmd temp/v.vsdx`
2. 用 Visio 打开 `temp/v.vsdx`：节点为官方形状（拖动把手/连接线端点粘附、
   线型右键切换可用）；保存后无"格式修复"提示（Document.Saved=True 语义）
3. 抽查甘特（07）：GC 组件列拖动重排、右键"配置"菜单与官方模板一致

## 文档

- `docs/port-plan/` — 移植实施规划（00 总纲 / 01 坑位清单 / README 索引）
- `docs/工程规范.md` — 提交/命名/代码规范（源自 dsh-plugins）
- `docs/reference/` — 源工程文档收档
- `docs/bench.md` — 性能冒烟基线
- `resources/` — 验收样本（testio）；`resources/visio` 官方模具仅开发用、不随包分发
- `tests/fixtures/` — 金标准（golden：C++ 基线产物；snapshot：提取 JSON）

## 状态

M0–M6 全部完成：core/xml/opcpkg/mmdtransform/snapshot/vsdxdoc/masters/app 全链路
纯 TS；金标准 16/16 结构等价；测试 199/199 绿。官方模具资产**不随包分发**：
运行期自动搜寻本机 Visio 或经 `--stencil-dir/--stencil-asset` 显式导入
（详见 docs/usage.md §〇·一），公开 npm 分发无合规障碍。
