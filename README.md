# mmd2vsdx — Mermaid → Visio VSDX 转换器（纯 Node/TypeScript 版）

把 Mermaid 文本转换为**原生可编辑的 Visio VSDX** 文档（不依赖 Visio COM）。

## 能力

- 14 类 Mermaid 图（flowchart/state/class/er/sequence/block/gantt/pie/gitGraph/
  mindmap/timeline/quadrantChart/xychart/c4）
- 原生可编辑 VSDX：官方模具母版实例（Master="N"+局部覆盖）、1-D 连接线双端
  `_WALKGLUE` 自动连接（路由避让 ShapeRouteStyle=5）、五节点几何、线型/箭头映射
- 母版程序化：6 枚模板构建函数（节点 5 种 + Dynamic connector），无 vssx/资产
  文件依赖；样式基座程序化（StyleRegistry）——克隆后构建即全量可用
- 16 个验收样本逐条断言 docs/research 准则（`tests/spec.test.ts`，缺一即败）

## 使用

```bash
npm install
npx playwright install chromium        # 首次（渲染需 Chromium）
npm run build                          # 产出 dist/
```

库调用（管道四步，详见 docs/AI开发约定/部署说明.md）：

```ts
import { Parser } from 'mmd2vsdx/dist/parser/index.js';
import { renderContract } from 'mmd2vsdx/dist/convert.js';
import { PartsAssembler } from 'mmd2vsdx/dist/xml-parts/index.js';
import { Squeeze } from 'mmd2vsdx/dist/squeeze/index.js';

const a = await new Parser().convertText('flowchart LR\n  A-->B');  // 契约 A
const b = renderContract(a);                                        // 契约 B
const pack = new PartsAssembler().assemble(b.parts);                // 完整包
const bytes = new Squeeze().pack(pack);                             // .vsdx 字节
```

批量转换/产物校验等辅助脚本属开发期工具（可再生成），位于本仓库 `temp/` 下，
不入库、不作为公开接口；发布形态以库 API 为准。

## 测试

```bash
npm test          # 16 样本准则验收（tests/spec.test.ts，含真实 Chromium 渲染）
npm run typecheck
```

## 文档

- `docs/AI开发约定/` — 部署说明（构建/库调用/批量/校验）、工程规范、文档写作规范、性能基线
- `docs/redesign/` — 设计文档（00 一览 + 契约/解析/转义/打包各层）+ 现状（模块结构/数据流/验收报告）
- `docs/research/` — Visio 产物内部结构研究（唯一验收准则：规范版 + class/ER/gantt/sequence 专篇 + 素材解压包）
- `docs/待讨论功能备忘.md` — 未来待办（预览渲染器立项等）
- 历史参考材料已随 git 历史保留（原 docs/archived 区已移除）
- `resources/mmd-input/` — 验收源稿（入库）；`resources/vsdx-output/` — 转换产物（本地产出、可再生成，不入库）

## 状态

重做完成：mermaid 文本 → 契约 A → 契约 B → OPC/ZIP 全链路纯 TS。
验收唯一标尺 = docs/research 准则：16 样本逐条断言（`tests/spec.test.ts`），
`verify-vsdx.mjs` A-F 六组守门。克隆后 `npm install && npm run build`
即可复现全部验证，零外部资产。
