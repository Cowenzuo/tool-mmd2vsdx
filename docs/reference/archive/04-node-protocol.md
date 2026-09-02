# Node 子进程协议（js-glue）

本文档描述 `js-glue/glue.mjs` 与 C++ 引擎之间的通信协议：mermaid 文本
如何经 Playwright + Chromium 渲染，再以结构化 JSON 交回 C++ 侧生成 VSDX。

## 1. 管线位置

```
mermaid 文本
   │  (stdin 每行一个 JSON 请求)
   ▼
node glue.mjs --server        ← 持久 Node 子进程（Chromium 只启动一次）
   │  (stdout 每行一个 JSON 响应)
   ▼
C++ NodeProcess（nodeprocess.cpp）→ jsonparser → Diagram IR → VSDX
```

## 2. 启动方式

| 模式 | 命令 | 用途 |
|---|---|---|
| Server | `node glue.mjs --server` | 生产路径：stdin→stdout 持久进程，Chromium 复用 |
| CLI | `node glue.mjs "graph TB; A-->B"` | 一次性调试，stdout 输出美化 JSON |

## 3. Server 协议

### 3.1 生命周期

1. C++ 侧 `mermaidc::initialize()` 启动 `node glue.mjs --server`。
2. 子进程 stdout 输出首行 `{"status":"ready"}` 表示就绪。
3. 之后每次请求：stdin 写入一行 JSON `{"text":"<mermaid 源码>"}`。
4. 每条请求对应一行 stdout 响应（逐行同步，无序号）。
5. 退出：C++ 侧关闭 stdin（EOF），子进程 `readline` 结束并关闭浏览器。

### 3.2 请求

```json
{"text": "graph TB; A-->B"}
```

### 3.3 响应

成功：

```json
{
  "status": "ok",
  "svg": "<清洗后的 SVG 字符串>",
  "nodes": [ { "id": "A", "label": "A", "shape": "rect",
               "x": 0, "y": 0, "width": 120, "height": 40,
               "styleClass": "", "parentId": "", "dividers": [] } ],
  "edges": [ { "from": "A", "to": "B", "label": "",
               "style": "normal", "arrowHead": "arrow", "arrowTail": "none",
               "waypoints": [ { "x": 60, "y": 40 }, { "x": 60, "y": 80 } ] } ],
  "clusters": [],
  "diagramType": "flowchart",
  "direction": "TB",
  "boundingBox": { "minX": 0, "minY": 0, "maxX": 120, "maxY": 120 }
}
```

失败：

```json
{ "status": "error", "message": "Syntax error in text" }
```

## 4. 字段说明

### 4.1 顶层

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | `ok` / `error` / `ready` |
| `svg` | string | 清洗后 SVG（供 VSDX 参考/诊断） |
| `nodes` | array | 节点列表（见下） |
| `edges` | array | 连线列表（见下） |
| `clusters` | array | 子图/容器（如 flowchart 子图） |
| `diagramType` | string | 从 `aria-roledescription` 推断，如 `flowchart`/`class`/`er`/`sequence`/`state`/`c4` |
| `direction` | string | `TB` 或 `LR`（由节点坐标范围推断） |
| `boundingBox` | object | 全图包围盒 `{minX,minY,maxX,maxY}` |

### 4.2 节点 `nodes[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 规范化 ID（去掉 mermaid 追加的数字后缀 `-0`） |
| `label` | string | 文本标签；类图多行成员用 `\n` 连接 |
| `shape` | string | 形状类别：`rect`/`diamond`/`ellipse`/`roundRect` 等 |
| `x`/`y` | number | 节点中心坐标（SVG 坐标系，px） |
| `width`/`height` | number | 节点尺寸（px） |
| `styleClass` | string | 附加样式类 |
| `parentId` | string | 所属容器节点 ID（无则空串） |
| `dividers` | array | 类图等分栏（表头/分隔线）位置 |

### 4.3 连线 `edges[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `from`/`to` | string | 端点节点 ID |
| `label` | string | 连线文本 |
| `style` | string | `normal`/`dashed`/`dotted` 等 |
| `arrowHead`/`arrowTail` | string | 箭头类型（`none`/`arrow`/`open`/`vee` 等） |
| `waypoints` | array | 折线路径点 `[{x,y},...]` |
| `fromMultiplicity`/`toMultiplicity` | string | ER 图端点多重性（`ONE`/`MANY` 等，仅 ER） |

## 5. C++ 侧定位 glue.mjs 的顺序

`src/mermaidc.cpp::findScriptPath()`：

1. 环境变量 `MERMAIDC_GLUE_PATH`（运行时覆盖，最高优先）。
2. **编译期路径 `MERMAIDC_GLUE_RELPATH`**（CMake 注入
   `${CMAKE_SOURCE_DIR}/js-glue/glue.mjs`，见 `src/CMakeLists.txt`）。
3. 可执行文件同目录相对：`glue.mjs` / `js-glue/glue.mjs` /
   `../js-glue/glue.mjs` / `../../js-glue/glue.mjs`。
4. 当前工作目录相对（回退）。

前两级命中后，exe 在任意工作目录都能正常运行，无需手动设环境变量。

## 6. 依赖与注意事项

- 需 Node.js（`node.exe` 在 PATH，或用 `MERMAIDC_NODE_PATH` 指定）。
- `glue.mjs` 运行时从 CDN 加载 mermaid@10（`jsdelivr`），需联网。
- 首次启动有 Chromium 预热（`graph TB; A-->B`），`ready` 在预热后发出。
- `jsonparser.hpp` 消费本协议输出，字段变更需同步（测试 `testengine`/`testnodeprocess` 覆盖）。
