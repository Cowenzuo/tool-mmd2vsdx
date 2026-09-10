# mmd2vsdx — Mermaid → Visio VSDX 转换器（纯 Node/TypeScript）

把 Mermaid 文本转换为**原生可编辑的 Visio VSDX** 文档，不依赖 Visio COM。

## 能力

- **5 类 Mermaid 图**：**flowchart / block / class / er / sequence**。
  其余图型（state、c4、gantt、gitGraph、mindmap、timeline、pie、quadrantChart、xychart）
  不再支持：解析层直接抛错并列出支持清单，不做静默降级；
- **原生可编辑**：官方模具母版实例（`Master="N"` 加局部覆盖）、1-D 连接线双端
  `_WALKGLUE` 自动连接（路由避让 `ShapeRouteStyle=5`）、五节点几何、线型与箭头映射；
- **母版程序化**：basic 家族节点 5 种与 Dynamic connector，加 class、ER、sequence
  的官方模板包内容逐字固化，无 vssx 与资产文件依赖，克隆后构建即全量可用；
- **准则验收**：9 个样本逐条断言 `docs/VSDX解压结构研究/` 的准则
  （`tests/spec.test.ts`，缺一即败）。

## 使用

环境：Node 22.2 以上；首次要装 Chromium，mermaid 渲染用它。

```bash
npm install
npx playwright install chromium        # 首次
npm run build                          # 产出 dist/
```

库调用是管道四步，说明见 `docs/AI开发约定/项目特定规范.md` 的"构建与运行"：

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

批量转换、产物校验等辅助脚本属开发期工具，可再生成，随 `temp/` 走、不入库；
发布形态以库 API 为准。

## 测试

```bash
npm test          # 9 样本准则验收（含真实 Chromium 渲染）+ 不支持图型报错用例
npm run typecheck
```

## 仓库结构

```
source/     实现，分层与依赖见 source/README.md
tests/      验收测试：按准则逐条断言
docs/       文档，总入口 docs/README.md
resources/  mmd-input 验收源稿（入库）；vsdx-output 转换产物（本地产出，不入库）
```

## 文档

文档总入口是 [docs/README.md](docs/README.md)，按"回答什么问题"分四个区：

| 区 | 回答什么 |
| --- | --- |
| `docs/VSDX解压结构研究/` | Visio 产物内部长什么样，唯一验收准则 |
| `docs/VSDX处理经验/` | 踩过哪些坑、怎么验证 |
| `docs/开发过程/` | 当初为什么这么设计、现在什么状态 |
| `docs/AI开发约定/` | 提交、代码、文档的规范 |

历史参考材料随 git 历史保留，原 docs/archived 区已移除。

## 状态

当前版本 `0.1.0-alpha2`，对应 tag `v0.1-alpha2`。重做完成：mermaid 文本到契约 A、
契约 B、OPC/ZIP 全链路纯 TS。验收唯一标尺是 `docs/VSDX解压结构研究/` 的准则：
9 个样本逐条断言（`tests/spec.test.ts`）；另有开发期守门脚本（批量转换、产物校验、
架构检查），随 `temp/` 走、不入库，重建办法见
`docs/VSDX处理经验/03-工具与脚本手册.md`。克隆后 `npm install && npm run build && npm test`
即可复现全部验证，零外部资产。
