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

## 前置条件

- Node 22.2 以上；
- 渲染 mermaid 要 Chromium，在**源仓库**装一次即可，浏览器缓存在用户目录，全机共用：

```bash
npx playwright install chromium
```

## 方式一：作为库引入

### 1. 装进你的工程

包没有发布到 npm（`private: true`），三种装法按场景选：

| 装法 | 命令 | 说明 |
| --- | --- | --- |
| 目录依赖（开发期推荐） | `npm install D:/_dev/tool-mmd2vsdx` | npm 建的是**目录联接**，秒装、依赖不重复安装、改源码立即生效；先在源仓库 `npm install && npm run build` |
| 本地 tarball（交付或隔离） | 源仓库 `npm run build && npm pack`，目标工程 `npm install ./mmd2vsdx-0.1.0-alpha3.tgz` | tarball 自带 `dist` 与 `bin`（实测约 184KB），装完即用，不受源仓库后续改动影响 |
| git 依赖 | `npm install git+https://github.com/Cowenzuo/tool-mmd2vsdx.git` | 安装时会跑 `prepare` 自动构建，需要网络与 npm |

### 2. 调用

```ts
import { ServiceSession } from 'mmd2vsdx/service';

const session = new ServiceSession({ outputDir: 'D:/work/vsdx' });
try {
  const r = await session.convert({ text: 'flowchart LR\n  A-->B' });
  console.log(r.path, r.sha256, r.kind, r.shapeCount);
} finally {
  await session.shutdown();   // 长驻进程退出前必调：关掉 Chromium
}
```

进程内复用同一个浏览器；`convertMany`、`validate`、`inspect` 的入参与回执见
[docs/接口协议.md](docs/接口协议.md)。

### 3. 只要契约与部件（不承诺稳定）

包根与 `dist/` 下的四步管线可以用来自行拼装，接口不稳定，升级可能变：

```ts
import { Parser } from 'mmd2vsdx/dist/parser/index.js';
import { renderContract } from 'mmd2vsdx';                          // 包根即 convert
import { PartsAssembler } from 'mmd2vsdx/dist/xml-parts/index.js';
import { Squeeze } from 'mmd2vsdx/dist/squeeze/index.js';

const a = await new Parser().convertText('flowchart LR\n  A-->B');  // 契约 A
const b = renderContract(a);                                        // 契约 B
const pack = new PartsAssembler().assemble(b.parts);                // 完整包
const bytes = new Squeeze().pack(pack);                             // .vsdx 字节
```

## 方式二：命令行

### 1. 三种启动方式

```bash
# ① 在源仓库里直接跑（改完源码 npm run build 后即可）
npm install && npx playwright install chromium && npm run build
node bin/mmd2vsdx.mjs convert 图.mmd --out 出图.vsdx

# ② 装进你的工程，用 npx 调（npm 会把 bin 链接到 node_modules/.bin）
npm install D:/_dev/tool-mmd2vsdx
npx mmd2vsdx convert 图.mmd --out 出图.vsdx

# ③ 装成全局命令
npm install -g D:/_dev/tool-mmd2vsdx
mmd2vsdx convert 图.mmd --out 出图.vsdx
```

### 2. 子命令

| 命令 | 作用 | 例子 |
| --- | --- | --- |
| `convert <文件\|->` | 转成 `.vsdx` 并落盘 | `mmd2vsdx convert 图.mmd --out 出图.vsdx` |
| `validate <文件\|->` | 只解析校验，不落盘 | `mmd2vsdx validate 图.mmd` |
| `batch <目录\|文件...>` | 批量转换，逐项隔离失败 | `mmd2vsdx batch ./mmd --out ./out` |
| `inspect <文件.vsdx>` | 看部件、页面尺寸与文本 | `mmd2vsdx inspect 出图.vsdx` |

通用开关：`--out <路径>` 指定输出，`--overwrite` 允许覆盖既有产物，`-h` 看帮助；
输入写 `-` 表示从 stdin 读。

### 3. 输出约定

- **stdout 只有一份 JSON**：成功 `{"ok":true,...回执}`，失败 `{"ok":false,"error":{...}}`；
- **stderr 是一行人类可读摘要**，不要拿去做解析；
- **退出码**：0 成功、1 处理失败（批量中任一项失败也是 1）、2 用法错误；
- **输出目录三级回退**：`--out` → 环境变量 `MMD2VSDX_OUTPUT_DIR` → 当前工作目录下 `vsdx-output/`；
  写入限制在这两个根目录内，默认不覆盖既有文件。

```bash
# 拿哈希做下游校验
mmd2vsdx convert 图.mmd --out 出图.vsdx | jq -r .sha256
```

```ts
// 在 Node 里当子进程用（跨语言同理：读 stdout 的那份 JSON）
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const { stdout } = await run(
  process.execPath,
  ['node_modules/mmd2vsdx/bin/mmd2vsdx.mjs', 'validate', '-'],
  { input: 'flowchart LR\n  A-->B' },
);
const receipt = JSON.parse(stdout);
if (!receipt.ok) throw new Error(`${receipt.error.code}: ${receipt.error.message}`);
```

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
