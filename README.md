# mmd2vsdx — Mermaid → Visio VSDX 转换器（纯 Node/TypeScript）

把 Mermaid 文本转换为**原生可编辑的 Visio VSDX** 文档，不依赖 Visio COM。

对外形态是一个**本机常驻 HTTP 服务**：POST 送 mermaid 原文，响应体就是 `.vsdx` 字节。
服务不读文件也不写文件，产物由调用方自己接收。

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
- **一种接入方式**：本机 HTTP 服务。路由、响应头、错误码与状态码见
  [docs/接口协议.md](docs/接口协议.md)。

## 前置条件

- Node 22.2 以上；
- 渲染 mermaid 要 Chromium，在**源仓库**装一次即可，浏览器缓存在用户目录，全机共用：

```bash
npx playwright install chromium
```

## 接入：本机 HTTP 服务

### 1. 起服务

```bash
npm install && npx playwright install chromium && npm run build
node bin/mmd2vsdx-server.mjs                  # 默认监听 127.0.0.1:12138
```

参数只有几个：`--port`、`--idle-browser`、`--timeout`、`--version`、`-h`，
同名环境变量 `MMD2VSDX_PORT`、`MMD2VSDX_IDLE_BROWSER`、`MMD2VSDX_TIMEOUT`。
进程常驻不退，启动后立刻在后台预热浏览器；空闲一段时间只回收 Chromium，进程留着。

### 2. 调用

请求体就是 mermaid 原文，响应体就是 `.vsdx` 字节，元数据在响应头里：

```bash
curl -sS -X POST http://127.0.0.1:12138/convert \
     -H 'Content-Type: text/plain; charset=utf-8' \
     --data-binary @图.mmd -o 图.vsdx
```

```ts
const res = await fetch('http://127.0.0.1:12138/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  body: 'flowchart LR\n  A-->B',
});
if (!res.ok) {
  const { error } = await res.json();     // 失败才是 JSON，成功是字节
  throw new Error(`${error.code}: ${error.message}`);
}
await writeFile('图.vsdx', Buffer.from(await res.arrayBuffer()));
console.log(res.headers.get('x-mmd2vsdx-sha256'), res.headers.get('x-mmd2vsdx-kind'));
```

`GET /health` 用来确认服务在不在、契约版本对不对，顺手看队列深度。

### 3. 边界

- 输入上限 256KB，产物上限 8MB，超了回 413；
- 渲染串行排队，队列满了回 429；单请求超时回 504；
- 同一段原文两次转换字节一致，可拿 `X-Mmd2Vsdx-Sha256` 比对；
- 只监听回环，没有 token；不落盘、不吃路径参数，这是安全结论的前提。

细节、错误码与变更登记都在 [docs/接口协议.md](docs/接口协议.md)。

## 开发与验证

```bash
npm install
npx playwright install chromium   # 首次必做
npm run build
npm test                          # 准则验收、母版装配、HTTP 服务契约
npm run typecheck
```

## 仓库结构

```
source/     实现，分层与依赖见 source/README.md（适配层与 HTTP 服务层）
bin/        服务启动器 mmd2vsdx-server，转发到 dist/
tests/      验收测试：准则断言、母版装配、HTTP 契约
docs/       文档，总入口 docs/README.md
resources/  mmd-input 验收源稿（入库）
```

## 文档

文档总入口是 [docs/README.md](docs/README.md)，按"回答什么问题"分四个区：

| 区 | 回答什么 |
| --- | --- |
| `docs/VSDX解压结构研究/` | Visio 产物内部长什么样，唯一验收准则 |
| `docs/VSDX处理经验/` | 踩过哪些坑、怎么验证 |
| `docs/开发过程/` | 当初为什么这么设计、现在什么状态 |
| `docs/AI开发约定/` | 提交、代码、文档的规范 |

另有一份面向接入方的 [docs/接口协议.md](docs/接口协议.md)：路由、请求与响应形态、
响应头、错误码与状态码，其他工程按它对接。

历史参考材料随 git 历史保留。

## 状态

当前版本 `0.1.0-alpha3`，契约版本 `1`。接入形态从"库引入 + 命令行"改成**本机常驻
HTTP 服务**：原生字节进出、不落盘、固定端口、常驻不退。管线本身没动，仍是纯 TS 的
四步：mermaid 文本到契约 A、契约 B、OPC/ZIP 全链路；验收唯一标尺是
`docs/VSDX解压结构研究/` 的准则，9 个样本逐条断言（`tests/spec.test.ts`）。
克隆后 `npm install && npx playwright install chromium && npm run build && npm test`
即可复现全部验证，零外部资产。
