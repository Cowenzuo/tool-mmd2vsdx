# 使用指南（构建 / 打包 / 三种调用场景）

> 适用于当前仓库（private 包，未发 npm）。三种消费方式共用同一构建产物 `dist/`
> （tsc 编译 + extract 资产复制；官方模具资产**不随包**，见 §〇·一 供应机制），入口三态：
> CLI（`dist/cli.js`）、库 API（`dist/app/application.js`）、HTTP（serve）。

## 〇、构建与首次准备

```bash
npm install                 # 装依赖（mermaid + playwright）
npx playwright install chromium   # 首次必做：渲染需 Chromium（≈120MB 缓存）
npm run build               # 产出 dist/（含 .js/.d.ts/类型 + snapshot/extract 复制）
# 门禁自检（可选）
npm run typecheck && npm test && npm run check:arch
```

产物与运行依赖：
- `dist/` 自包含（可整体拷贝到任意 Node ≥22.2.0 环境，但需同目录 `node_modules`
  含 playwright/mermaid，或随包一起装）；
- 运行期 Chromium 首次 launch 约 1s（预热后 ~100ms/图）；
- `resources/visio/*.vssx`（官方模具原件）只用于开发期再生成，运行不需要；
  **官方模具资产不随包分发**——运行期按 §〇·一 的供应机制自动获取。

## 〇·一、母版资产供给（官方模具不随包）

转换需要 8 类官方 Visio 模具（基础形状/流程/类/时序/ER/甘特/时间线/日历）的
提取数据。为规避微软模具再分发许可风险，**npm 包内不携带任何模具资产**，
运行时按以下优先级自动获取：

| 优先级 | 来源 | 适用 |
| --- | --- | --- |
| 1 | `--stencil-asset <file>`（库 API：`configureStencils({assetFile})`） | 预生成资产 JSON（`assets/stencils/stencil-data.json` 形态，646KB）——**私自分发形态 B**：开发机用 `node scripts/gen-stencils.mjs` 生成后，把该文件单独交给目标机（不经公开渠道），对方零依赖可用 |
| 2 | `--stencil-dir <dir>`（库 API：`configureStencils({stencilDir})`） | 官方模具目录（含 .vssx/.vstx 原件）——**私自分发形态 A**：直接给模具目录，现场提取（内部按内容指纹识别 8 类，目录里其它无关模具自动忽略） |
| 3 | 缺省自动 | **首次转换自动搜寻本机 Visio** 安装目录（Windows 常见布局），现场提取；结果缓存到 `%LOCALAPPDATA%\mmd2vsdx\stencil-data.json`（按模具文件指纹失效），二次启动免提取 |
| 4 | `--no-stencil-search` | 显式关闭自动搜寻（配合前两者使用） |

行为说明：
- 找不到任何来源时转换报错（`ok=false` / exit 1），错误信息带引导
  （`[assets] …请用 --stencil-dir / --stencil-asset 导入或安装 Visio 后重试`）；
- 纯本地内容模式（`useConnectorMaster=false`，不经官方模具）**不需要**资产，不触发获取；
- 库 API 幂等：`await application.configureStencils({ assetFile: '…' })` 可在进程内
  随时切换来源；未配置时 `convertText` 自动按缺省（第 3 项）懒加载一次；
- serve 模式同规则（启动时可用旗标配置，或让每个请求懒加载）。

私自分发快速上手（形态 B，最省事）：
```bash
# 分发侧（你有模具/或本仓库 assets 已生成）
node scripts/gen-stencils.mjs <visio_dir> my-stencil-data.json   # 生成资产文件
# 接收侧（目标工程/服务器，无 Visio 也可）
mmd2vsdx --stencil-asset my-stencil-data.json in.mmd out/
```

## 一、手动调用（文件 / 目录批量）

```bash
# 单个文件：out.vsdx 以 .vsdx 结尾=目标文件，否则视为目录写 <stem>.vsdx
node dist/cli.js "方案.mmd" "输出目录"
node dist/cli.js "方案.mmd" "输出目录\方案.vsdx"

# 目录批量（串行，首错即止；输出名=输入名换扩展名，字典序）
node dist/cli.js --dir "D:\图纸\mmd" "D:\图纸\vsdx"

# 容错批量（256 文件级实测：逐文件 try/catch + 进度 + _report.json 明细）
node scripts/batch-convert.mjs "D:\图纸\mmd" "D:\图纸\vsdx" "D:\图纸\vsdx\_report.json"
# _report.json = { total, ok, failed, totalMs, results:[{file,status,ms,size|message}] }

# 本地安装为全局命令（任意目录可用 mmd2vsdx）
npm link                      # 之后: mmd2vsdx a.mmd out/ ; mmd2vsdx --dir ...
# 或直接: npx --no-install mmd2vsdx a.mmd out/
```

退出码：`0` 成功 / `1` 转换失败（错误信息带 `[phase]` 前缀）/ `2` 用法错误。
转换结束进程必然退出（已修复 chromium 句柄悬挂）。

## 二、工具调用（另一个 Node 项目 import）

### 2.1 安装为依赖

```bash
# 方式 A：本地路径依赖（推荐开发期；文件级共享，改代码即生效）
npm install "file:D:\_dev\tool-mmd2vsdx"   # 或 package.json: "mmd2vsdx": "file:../tool-mmd2vsdx"
# 注意：file: 安装不自动构建——先在本仓库 npm run build，或安装后于 node_modules\mmd2vsdx 下再 build
# 方式 B：git 依赖（prepare 脚本会自动 npm run build）
npm install "github:你的账号/tool-mmd2vsdx"   # 需仓库有远程；prepare 钩子已配
# 方式 C：npm link（本机开发，双向实时）
cd D:\_dev\tool-mmd2vsdx && npm link
cd 你的项目 && npm link mmd2vsdx
```

`package.json` 已声明 `main/types/bin`：`import { ... } from 'mmd2vsdx'` 有完整 TS 类型；
深层入口也开放：`import 'mmd2vsdx/dist/vsdxdoc/vsdxTranslator.js'`（未设 exports 锁）。
`private: true` 阻止误发布 npm（stencil 资产分发红线，见 docs/architecture/03 §G-9）。

### 2.2 高层 API（推荐——一个调用完成"文本→vsdx"）

```ts
import { application } from 'mmd2vsdx';        // ESM；Node ≥22.2

// 文本 → base64（内存态，无落盘）
const r = await application.convertText('flowchart LR\n  A-->B');
if (!r.ok) { console.error(r.error); return; }   // error 带 [convert] 前缀
// r = { ok, vsdxBase64, diagramType, pageCount }

// 文件 → 文件
const out = await application.convertFile('in.mmd', 'outDir');   // 返回实际路径

// 目录 → 目录（串行；输出数组 = 输入字典序）
const outs = await application.convertDir('inDir', 'outDir');

// 进程收尾（长驻进程用完必调：关 chromium，否则句柄悬挂）
await application.shutdown();
```

ConvertResult / 错误模型：
- 失败不抛异常：`ok=false + error`（`MmdError` 4 码：NodeNotFound/JsonParseError/
  SubprocessCrashed/MermaidError，可 `isMmdError(e)` 分支）；
- 参数类错误抛 `TypeError/RangeError`（如输出路径非法）。

### 2.3 中层 API（要中间产物/自定义选项时）

```ts
import { translator } from 'mmd2vsdx/dist/mmdtransform/translator.js';
import { translate } from 'mmd2vsdx/dist/vsdxdoc/vsdxTranslator.js';
import { OpcPackager } from 'mmd2vsdx/dist/opcpkg/opcpackager.js';
import type { Diagram, CreateOptions } from 'mmd2vsdx/dist/core/types.js'; // vsdx.ts 中

// 1) 文本 → Diagram IR（浏览器渲染一次）
const diagram: Diagram = await translator.translate('flowchart LR\n  A-->B');
// 2) IR → XmlParts（可注入 outputScale/边距/useConnectorMaster 等 CreateOptions）
const parts = translate(diagram, { outputScale: 96, useConnectorMaster: true });
// 3) XmlParts → 打包（写 .vsdx 或转 base64）
OpcPackager.pack(parts, 'out.vsdx');
```

复用与生命周期要点（长驻服务）：
- `application`/`translator` 是进程内单例；Chromium 惰性启动、渲染串行（同页面不可
  并发）——并发请求由 serve 或你自己的队列排队；
- 崩溃自愈已内置（页面/浏览器级重建一次）；`shutdown()` 幂等，之后需重启进程复用；
- 不要多份 import 同一 dist 以"并行"——串行是协议（一个 chromium 实例）；
  要并行吞吐请起多进程（如 serve 多实例不同端口）。

### 2.4 只转换少量文本的轻量替代

```ts
import { translator } from 'mmd2vsdx/dist/mmdtransform/translator.js';
const diagram = await translator.translate(text);      // 不落盘、不起 HTTP
// 之后 diagram 自行处置（如只取 bounds/diagramType 统计）
await translator.shutdown();
```

## 三、AI / 自动化工具调用

两种落地形态，协议都已就绪：

### 3.1 命令行形态（agent 的 shell/工具调用）

- 命令即 `mmd2vsdx`（npm link 后）或 `node dist/cli.js`；
- 可解析输出：stdout `ok  <路径>`，stderr `error: [phase] ...`；退出码 0/1/2；
- 示例（给 agent 的 tool schema 描述）：
  ```
  功能：Mermaid 文本/文件转 Visio .vsdx
  命令：mmd2vsdx <in.mmd> [out.vsdx|目录] | mmd2vsdx --dir <in> <out>
  注意：输出目录不存在会自动创建；文件名同名换 .vsdx；中文路径安全。
  ```

### 3.2 HTTP 形态（serve，为工具调用设计的 JSON 协议）

```bash
node dist/cli.js --serve --port 12138
# 启动后 stdout: {"status":"ready","port":12138}；GET /health 可探活
```

```bash
# 转换（业务失败 = 200 + status:error；协议错误 = 4xx）
curl -s -X POST http://127.0.0.1:12138/convert \
  -H 'Content-Type: application/json' \
  --data-binary '{"text":"flowchart LR\n A-->B"}' \
  -o out.json
# out.json: {"status":"ok","vsdx":"<base64>","diagramType":"flowchart","pageCount":1}
# 解码: node -e "fs.writeFileSync('out.vsdx', Buffer.from(JSON.parse(fs.readFileSync('out.json')).vsdx,'base64'))"
```

- 串行队列 + 排队上限 32（满则 503 `server busy`）；请求体 ≤1MB（超限 413）；
- SIGINT/SIGTERM 干净退出（关 chromium、关服务）；
- 只监听 127.0.0.1——对外服务请置于反向代理/鉴权之后（本服务无鉴权）。

### 3.3 供大模型"工具描述"的推荐形态（OpenAI/MCP 风格）

LLM 工具调用两种选一：
- **轻量**：直接调 3.1 CLI（一次性进程，无常驻），代价是每次冷启动 chromium ~1s；
- **长会话**：3.2 serve 常驻 + 一次预热请求（任意小图），之后每次 ~100ms；
  工具描述：`type=function name=convert_mmd_to_vsdx description="Mermaid 文本转 Visio VSDX，返回 vsdx 文件路径或 base64"`，参数 `{text: string, outDir?: string}`——内部实现即 2.2 高层 API 三行。
- 若需要标准 MCP server（`convert_mmd`/`convert_dir`/`health` 工具），可用
  `@modelcontextprotocol/sdk` 包一层薄壳（本仓库未内置，属可选后续）。

## 四、分发形态对照

| 场景 | 形态 | 前置 |
| --- | --- | --- |
| 本机手动 | 仓库内 `npm run build` + `node dist/cli.js` | playwright chromium；资产自动搜本机 Visio |
| 交付他人（目录拷贝） | 拷贝 dist + node_modules（或 `npm ci --omit=dev` 后同目录） | 对方装 chromium；资产 = 本机 Visio 自动搜寻，或随交付私下分发 `--stencil-asset` 文件 |
| 另一 Node 项目 | file:/git 依赖或 npm link（见 2.1） | 无（chromium 报错提示安装；资产自动搜寻/`configureStencils` 显式导入） |
| AI/自动化 | CLI 子进程 或 serve HTTP 常驻 | 同上 |
| 未来公开 npm | `private:true` 可移除（files 白名单 dist/README/LICENSE 已就绪）——**模具资产剥离已完成**（G-9 落地）：公开包零模具数据，用户侧走本机搜寻或私下分发 asset | 合规审查 |

Chromium 缺失时的处理：渲染器会抛带指引的错误（消息含 `npx playwright install`）；
库调用方可在 `ok=false` 时提示用户执行安装。母版资产缺失同理（`[assets]` 引导见 §〇·一）。
