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
  （`tests/spec.test.ts`，缺一即败）；
- **两种接入方式**：库引入（`mmd2vsdx/service`）与本地命令行（`mmd2vsdx`），
  字段、错误码与退出码见 [docs/接口协议.md](docs/接口协议.md)。

## 使用

环境：Node 22.2 以上；首次要装 Chromium，mermaid 渲染用它。

```bash
npm install
npx playwright install chromium        # 首次
npm run build                          # 产出 dist/
```

其他工程接入推荐走适配层，进程内会复用同一个浏览器：

```ts
import { ServiceSession } from 'mmd2vsdx/service';

const session = new ServiceSession({ outputDir: 'D:/work/vsdx' });
try {
  const r = await session.convert({ text: 'flowchart LR\n  A-->B' });
  console.log(r.path, r.sha256, r.kind, r.shapeCount);
} finally {
  await session.shutdown();
}
```

包根还导出四步管线（`Parser`、`renderContract`、`PartsAssembler`、`Squeeze`），
可用来自己拼装部件，但不承诺接口稳定：

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

## 命令行

```bash
node bin/mmd2vsdx.mjs convert 图.mmd --out 出图.vsdx     # 转换（- 表示从 stdin 读）
node bin/mmd2vsdx.mjs validate 图.mmd                    # 只解析校验
node bin/mmd2vsdx.mjs batch ./mmd --out ./out            # 批量，逐项隔离失败
node bin/mmd2vsdx.mjs inspect 出图.vsdx                   # 看部件、页面尺寸与文本
```

stdout 只有一份 JSON 回执，stderr 是人类可读摘要；退出码 0 成功、1 处理失败、2 用法错误。
装到别的工程后可以直接 `mmd2vsdx convert ...`（npm 会链接 `bin` 条目）。

## 测试

```bash
npm test          # 37 项：9 样本准则验收、母版装配、适配层、命令行
npm run typecheck
```

## 仓库结构

```
source/     实现，分层与依赖见 source/README.md（新增 service 适配层与 cli 命令行）
bin/        可执行入口 mmd2vsdx（命令行），转发到 dist/
tests/      验收测试：准则断言、适配层、命令行
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

另有一份面向接入方的 [docs/接口协议.md](docs/接口协议.md)：库 API、命令行参数、
回执结构、错误码与退出码，其他工程按它对接。

历史参考材料随 git 历史保留，原 docs/archived 区已移除。

## 状态

当前版本 `0.1.0-alpha2`，alpha3 在做本地接入：库引入与命令行两条路，
对外契约写在 `docs/接口协议.md`。管线是纯 TS：mermaid 文本到契约 A、契约 B、
OPC/ZIP 全链路；验收唯一标尺是 `docs/VSDX解压结构研究/` 的准则，9 个样本逐条断言
（`tests/spec.test.ts`），另有适配层与命令行用例，全量 37 项。克隆后
`npm install && npx playwright install chromium && npm run build && npm test`
即可复现全部验证，零外部资产。
