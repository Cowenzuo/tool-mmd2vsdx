# mermaid-c 规格说明书 (定版 v4)

> 版本: 1.1.0 | 日期: 2026-07-27
>
> 状态: 已定版。VSDX 实现以本文档为验收依据。
>
> 实现映射（2026-08-05 重构后）：本文档描述功能行为，与代码行为一致。
> 内部实现位置：VSDX 层位于 `src/vsdx/`（api/model/render/masters/io），
> Mermaid→IR 管线位于 `src/parse/`（`MermaidParser`/`NodeJsProcess`）与 `src/app/`（`Mermaid`）。

---

## 1. 概述

**mermaid-c** 是一个 C++ 库，负责将 Mermaid 文本转换为可编辑的 Visio VSDX 文档。系统继续复用现有 Node.js + headless Chromium 管线获取带坐标的图结构（IR），本版本新增不依赖 Microsoft Visio COM 接口的 VSDX 创建和写回能力
（读取已有 .vsdx 仅用于测试与产出物校对，主流程始终为 mermaid 文本 → 重新生成）。

本版本冻结 Mermaid → SVG → IR 的能力边界，不优化解析、测量和布局质量；工作重点是正确实现 VSDX 的 OPC 包结构、ShapeSheet 语义、页面、母版、几何、文本和连接关系。

### 1.1 核心架构

```
Mermaid 文本
    → 现有 Node.js / Chromium 渲染与提取管线（本期冻结）
    → Diagram IR（像素坐标、节点、边、路径点）
    → VSDX 文档模型
            ├── OPC 包：Content Types、Parts、Relationships
            ├── Visio 文档：Document、Pages、Masters
            └── ShapeSheet：Cells、Sections、Rows、Text、Connects
    → ZIP 写入
    → 可由桌面 Visio 打开、编辑、移动和重新保存的 .vsdx

已有 VSDX
    → OPC 包读取
    → 按 Relationships 定位 Visio 部件
    → 对受支持对象进行局部修改
    → 未识别部件和 XML 原样保留
    → 写回 .vsdx
```

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **原生可编辑** | 输出节点、文本和连接线必须是 Visio ShapeSheet 对象，不以整图图片代替 |
| **不依赖 COM** | 直接读写 ZIP、OPC Relationships 和 Visio XML，不要求安装或启动 Visio |
| **关系驱动** | 读取已有文件时通过 `.rels` 定位部件，不假定部件始终处于固定 URI |
| **保真写回** | 编辑已有文件时，只修改受支持字段，未知部件、关系和 XML 必须保留 |
| **公式与缓存一致** | ShapeSheet 的 `F` 公式、`V` 缓存值、`Connect` 记录和 Geometry 必须描述同一状态 |
| **聚焦本期** | Mermaid 渲染与 IR 提取暂不优化，只修复阻塞 VSDX 正确写入的问题 |

### 1.3 本版本边界

| 范围 | 本版本处理方式 |
|------|----------------|
| Mermaid → SVG → IR | 保持现状，仅修复直接阻塞 VSDX 写入的缺陷 |
| 新建 VSDX | 支持多页、基础节点、文本、样式、连接线和路径点 |
| 编辑已有 VSDX | 支持加载、局部修改、保留未知内容并写回 |
| Visio COM 自动化 | 不使用 |
| 组合形状、图片/OLE、数据连接 | 不新增创作能力；读取写回时必须保留 |
| 动态主题、富文本创作 | 本期不创作；已有内容不被无关修改破坏 |

### 1.4 Mermaid → IR 基线流程（冻结）

```
C++ parse(text)
  → NodeProcess::send(text)
    → stdin 写入 mermaidText + "\n"
  → stdout 读取一行 JSON
  → 浏览器内 (Chromium 持久存活):
      1. mermaid.render(text) → 全管线 (parse + getBBox + dagreLayout + SVG)
      2. SVG DOM 提取: .node / .edgePaths / .edgeLabels
      3. 坐标还原: translate(左上角) + getBBox(w,h)/2 → 真实中心
      4. 贝塞尔曲线采样 (C→8等分, Q→6等分)
      5. direction 从 aria-roledescription 提取
  → JSON 反序列化 → Diagram
```

---

## 2. VSDX 核心功能

### 2.1 OPC 包读取

系统必须能够打开现有 `.vsdx` 文件并建立包内索引：

- 读取 ZIP 中的所有部件，不将包解压到工作目录。
- 解析 `[Content_Types].xml` 的 Default 与 Override 声明。
- 解析包级和部件级 `.rels`，按源部件解析相对 Target URI。
- 检查内部 Relationship 的目标部件是否存在；外部 Relationship 只记录，不主动访问。
- 通过 Relationship Type 定位 Document、Pages、Page、Masters、Master、Theme、Windows 和属性部件，不依赖固定文件名。
- 保存未识别部件及其原始字节，用于无损写回。
- 拒绝绝对路径、`..` 越界路径、重复部件名和其他可能造成 ZIP 路径穿越的条目。

### 2.2 新建 VSDX

系统必须能够从一个或多个 `Diagram` 创建新的 `.vsdx`：

- 每个 `Diagram` 对应一个 Visio 页面，输入顺序即页面顺序。
- 输出必须包含完整且相互一致的 Content Types、Relationships、页面索引和页面内容。
- 页面名称来自 `Diagram::diagramType` 或调用方提供的名称，并在文档内保持唯一。
- 零页面输入必须明确报错，不得生成含悬空 `page1.xml` 引用的包。
- 所有 Shape ID 在所属页面内唯一；Page ID、Master ID 和 Relationship ID 在各自作用域内唯一。
- ZIP CRC-32、中央目录、部件大小和压缩方式必须符合 ZIP/OPC 规范。

### 2.3 编辑与写回

系统必须提供对已有 VSDX 的受控编辑能力：

- 枚举页面及页面中的顶层形状和连接线。
- 按页面 ID、形状 ID 或调用方保存的逻辑 ID 定位对象。
- 修改受支持形状的文本、位置、尺寸、基础线条与填充样式。
- 新增和删除受支持的形状与连接线，并同步更新相关 ID、公式和 `Connect` 记录。
- 未被修改的 ZIP 部件必须按原始字节写回；被修改的 XML 部件必须保留未知元素、属性和命名空间。
- 删除对象时必须清理由本库管理的悬空引用；遇到未知引用时不得静默破坏文件。
- 修改位置、尺寸或连接关系后，在 `docProps/custom.xml` 中写入唯一的 `RecalcDocument=true` 属性。

### 2.4 页面与坐标

- IR 输入坐标单位为 CSS 像素，基准为 96 px/in。
- 默认输出缩放为 1.0；额外视觉缩放必须是显式配置，不得隐藏在单位换算函数中。
- SVG 使用左上原点、Y 轴向下；Visio 页面使用左下原点、Y 轴向上。
- 转换必须使用 `Diagram::bounds`、页面边距和实际页面高度，不使用固定常量翻转 Y 坐标。
- 页面宽高根据内容包围盒、缩放和边距计算，并保证所有形状及路径点位于页面可见区域。
- 数值序列化使用不受系统区域设置影响的小数点，并保留足够精度以稳定往返。

### 2.5 形状、文本与样式

| IR 能力 | VSDX 输出要求 |
|---------|---------------|
| `Rect` | 可调整大小的矩形 Geometry |
| `RoundRect` | 可调整大小的圆角矩形 Geometry |
| `Diamond` | 可调整大小的菱形 Geometry |
| `Circle` | 宽高相等的椭圆 Geometry |
| `Ellipse` | 可独立调整宽高的椭圆 Geometry |
| `label` | UTF-8 纯文本，保留换行并正确 XML 转义 |
| `fillColor` | 映射到固定 RGB `FillForegnd`，本期不创作动态主题 |
| `lineColor` | 映射到固定 RGB `LineColor` |
| `lineWidth` | 明确单位后映射到 `LineWeight` |

新建 2D 形状不依赖母版，必须具有与 Geometry 一致的 `PinX`、`PinY`、`Width`、`Height`、`LocPinX` 和 `LocPinY`，并自带完整且可缩放的 Geometry 和 Connection section。新建连接线引用包内**最小 Dynamic connector 母版**（`MasterType=541`），因为 Visio 的「更改连接线类型（直线/曲线/直角）」UI 只对具有该母版身份的形状开放；连接线实例自带头部（Begin/End、路由、样式）cells。编辑已有文件时保留其原有母版关系，只对目标实例写局部覆盖。

本期只创作纯文本和统一字符样式。读取已有富文本时，除非调用方明确替换整段文本，否则必须保留 `cp`、`pp`、`tp`、`fld` 及其引用的格式行。

### 2.6 连接线

- 每条边必须输出一个独立的一维 Shape，而不是页面装饰线。
- `BeginX/BeginY`、`EndX/EndY` 的 `V` 缓存、`F` 公式和 Geometry 端点必须一致。
- 起点和终点必须根据相对位置或首尾路径点选择合适的连接点，不能固定为左右两侧。
- 每个粘附端点必须在页面 `Connects` 中具有对应 `Connect` 记录。
- `FromSheet` 指向连接线，`ToSheet` 指向被连接节点；`FromCell`、`ToCell`、`FromPart`、`ToPart` 必须匹配实际端点和连接点。
- `waypoints` 按页面坐标转换为连接线局部 Geometry；本期允许用折线近似已采样的曲线，但不得丢弃路径点。
- `EdgeStyle` 映射实线、虚线和粗线；`ArrowType` 分别映射起点和终点箭头。
- 连接线标签写入连接线 Text，并具有独立文本块位置。
- 移动节点并由 Visio 重算后，连接线端点必须保持粘附。

### 2.7 命名空间与兼容性

- 新建桌面 VSDX 使用样本文件采用的 `http://schemas.microsoft.com/office/visio/2012/main` 命名空间。
- 读取器按命名空间 URI 和元素本地名匹配，不依赖 XML 前缀。
- 编辑已有文件时保留其原始命名空间，不进行无关的全文件命名空间迁移。
- `theme`、`windows`、缩略图和扩展属性按实际 Relationship 决定是否存在，不硬编码为必需部件。
- 新建文件使用固定样式时可以不创建 Theme 部件；若创建 Theme，则必须是完整有效的 DrawingML Theme。

---

## 3. VSDX 数据与 API 边界

本期公开 API 以文档对象为边界，具体类名在技术方案阶段确定，但必须表达以下能力：

```cpp
// 概念 API，非最终签名
VsdxDocument createVsdx(const std::vector<Diagram>& diagrams);
VsdxDocument openVsdx(const std::filesystem::path& path);

document.pages();
document.addPage(...);
document.findShape(pageId, shapeId);
document.addShape(...);
document.addConnector(...);
document.removeShape(...);
document.save(path);
```

约束：

- `Diagram` 仍是 Mermaid 提取结果，不承载 OPC、母版或 ShapeSheet 细节。
- VSDX 文档模型使用稳定的逻辑 ID，并在保存阶段分配合法的 Visio 数字 ID。
- 读取已有文档时，模型允许保留未解析的 XML/二进制部件，不要求将整个 VSDX 完全反序列化。
- 旧的 `writeVsdx(path, Diagram)` 便利接口可以保留，但必须委托给同一文档模型和包写入器。

---

## 4. 非功能性需求

| 类别 | 要求 |
|------|------|
| 语言与构建 | C++17，CMake ≥ 3.21 |
| 平台 | Windows / Linux / macOS；VSDX 创建与编辑不依赖 Visio 安装 |
| COM | 禁止依赖 Microsoft Visio COM、Office Interop 或注册表中的 Visio 自动化对象 |
| C++ 系统依赖 | `libxml2` 负责 XML DOM/Reader/Writer，`zlib` 负责 CRC-32 与 Deflate/Inflate；通过 CMake `find_package` 获取 |
| ZIP/OPC | 生成包可被标准 ZIP 读取器完整校验，所有 CRC 正确，无悬空内部关系 |
| XML | 使用结构化 XML DOM/Writer，不使用大段字符串拼接表达动态文档 |
| 保真 | 未修改部件按原始字节保留；未知 XML 不因局部编辑被删除 |
| 安全 | 不访问 External Relationship；拒绝危险 ZIP 路径和不受控资源膨胀 |
| 编码 | XML 统一按 UTF-8 处理，文本支持中文及其他 Unicode 字符 |
| 数值 | 使用经典区域设置和稳定精度，禁止因小数逗号生成非法公式或数值 |
| 错误处理 | 包损坏、关系悬空、ID 冲突、未知编辑依赖必须返回明确错误，不静默丢数据 |
| 测试 | VSDX 单元测试不依赖 Node.js；Mermaid 端到端测试与包写入测试分离 |
| 性能 | 普通单页图创建不进行磁盘解压；未修改二进制部件允许流式复制 |

---

## 5. 验收标准

### 5.1 自动化验收

- 新建单页和三页文档均能被标准 ZIP 读取器完整读取，CRC 校验通过。
- 每个内部 Relationship 均能解析到现存部件，Content Type 覆盖完整。
- XML 部件均格式良好，页面、母版、形状和关系 ID 在作用域内唯一。
- 五种节点形状的 Geometry、尺寸、位置、文本和基础样式与输入一致。
- 水平、垂直、斜向及带路径点连接线的缓存、公式、Geometry 和 `Connect` 一致。
- 多页输入不会丢页，页面名称和顺序稳定。
- 打开样本后只修改一个节点文本，未修改部件的字节摘要保持不变。
- 修改节点位置或连接关系后存在唯一 `RecalcDocument=true`。
- 空页面列表、重复逻辑 ID、悬空边端点和损坏关系均产生明确错误。

### 5.2 桌面 Visio 验收

- 启用 Visio “显示文件打开警告”后打开生成文件，无修复或内容丢失提示。
- 节点、文本和连接线可单独选择及编辑，不是整图图片。
- 移动节点后连接线端点保持粘附，保存并重新打开后位置稳定。
- 多页文档可切换页面，页面名称、顺序和内容正确。
- 编辑样本并由 Visio 重新保存后，本库仍可再次读取和写回。

---

## 6. 本版本不包含

- 优化 Mermaid 解析、SVG DOM 检测、布局算法或曲线采样质量。
- 创作组合形状、容器、泳道、图片、OLE、宏、数据连接和验证规则。
- 创作动态主题、渐变、阴影、三维效果和完整富文本排版。
- 实现完整 ShapeSheet 公式计算器；由本库负责写入自洽缓存，并通过 `RecalcDocument` 请求 Visio 重算。
- 保证第三方非 Visio 软件对全部高级 ShapeSheet 行为作出相同解释。

---

## 7. 设计决策

| # | 议题 | 决策 | 影响 |
|---|------|------|------|
| 7.1 | ZIP/XML 依赖 | 使用系统 `libxml2 + zlib` | libxml2 处理 XML；项目实现受限 ZIP32 容器，CRC/Deflate 委托 zlib |
| 7.2 | 新建形状策略 | 2D 形状使用本地 Geometry；连接线使用最小 Dynamic connector 母版 | 2D 形状自包含；连接线获得 Visio 线型切换能力（依赖母版身份，经桌面 Visio 对比实验确认）；编辑已有文件时仍保留原母版关系 |
| 7.3 | 连接线路由 | 初始 Geometry 遵循 Mermaid waypoints，节点移动后允许 Visio 重路由 | 初始布局保真，同时保留原生粘附与交互能力 |
| 7.4 | 编辑 API | 提供最小公开文档对象 API | 暴露 Document、Page、Shape、Connector 的必要增删改查及保存能力 |
| 7.5 | 未知引用 | 删除操作遇到未知引用时拒绝并报告来源 | 禁止为了完成删除而静默破坏扩展数据 |
| 7.6 | 坐标基准 | 96 px/in，额外缩放显式配置 | 修复当前隐藏的 2 倍缩放并保证可预测换算 |
| 7.7 | 新建样式 | 使用固定 RGB，不创建动态 Theme | 降低本期包结构复杂度；编辑时保留已有 Theme |
| 7.8 | 重算 | 几何或连接修改后写入 `RecalcDocument=true` | 请求桌面 Visio 更新依赖公式和路由缓存 |
| 7.9 | ZIP Profile | 支持 ZIP32 的 Store/Deflate，拒绝加密、ZIP64、多磁盘与未知压缩方法 | 覆盖普通 VSDX，并让不支持的包显式失败而非误解析 |

---

## 8. Mermaid → IR 冻结基线（历史定版内容）

### 8.1 图表类型支持（按优先级）

| 优先级 | 图表类型 | 第一期 | 布局引擎 | 说明 |
|--------|---------|--------|---------|------|
| P0 | Flowchart (流程图) | ✅ | dagre (Sugiyama) | 最常用，数据流最清晰 |
| P1 | Class Diagram (类图) | ❌ | dagre | 解析方式不同，布局相同 |
| P1 | State Diagram (状态图) | ❌ | dagre | 同上 |
| P1 | ER Diagram | ❌ | dagre | 同上 |
| P2 | Sequence Diagram (时序图) | ❌ | 自研 | 布局逻辑与 dagre 无关 |
| P2 | Gantt (甘特图) | ❌ | 自研 | 同上 |
| P2 | Pie (饼图) | ❌ | 自研 | 同上 |

### 8.2 Flowchart 支持范围（第一期）

复用 mermaid.js v10.x 的 flowchart-v2 解析器与渲染管线。

**节点 (第一期可检测的形状):** 矩形 `[]`、圆角矩形 `()`、菱形 `{}`、圆形 `(())`、椭圆

**节点 (mermaid 支持但第一期无法自动区分的形状):** 圆柱 `[()]`、梯形 `/  \`、六边形 `{{}}` 等——这些在 SVG 中使用 `path` 元素表达，难以自动分类，均 fallback 为 `rect`

**子图:** `subgraph ... end` 通过 `Node::parentId` 表达层级关系。**第一期暂不实现**子图检测（glue 输出 parentId 恒为空串），字段保留供后续扩展

**连线:** 实线/虚线/粗线 × 箭头/无箭头/圆点，带文字连线

**方向:** TB / BT / LR / RL

### 8.3 输出 IR 结构

```cpp
namespace mermaidc {

enum class NodeShape {
    Rect,           // A[text]      -- rect 元素
    RoundRect,      // A(text)      -- rx > 0 的 rect
    Diamond,        // A{text}      -- polygon 元素
    Circle,         // A((text))    -- circle 元素
    Ellipse,        //              -- ellipse 元素
};

enum class EdgeStyle {
    Normal,         // --- 或 -->
    Dotted,         // -.- 或 -.-> 
    Thick,          // === 或 ==>
};

enum class ArrowType {
    None,           // 无箭头
    Arrow,          // 三角箭头
    Circle,         // 圆点箭头
};

struct Point {
    double x, y;
};

struct Node {
    std::string id;
    std::string label;
    NodeShape   shape;
    double      x, y;       // 布局后的真实中心坐标 (translate + w/2, h/2)
    double      width, height;
    std::string styleClass; // classDef 对应的类名
    std::string parentId;   // 子图父节点 ID，空串=顶层
};

struct Edge {
    std::string from;
    std::string to;
    std::string label;
    EdgeStyle   style;
    ArrowType   arrowHead = ArrowType::Arrow;
    ArrowType   arrowTail = ArrowType::None;
    std::vector<Point> waypoints; // 贝塞尔曲线采样点
};

struct BoundingBox {
    double minX = 0, minY = 0, maxX = 0, maxY = 0;
    [[nodiscard]] double width()  const { return maxX - minX; }
    [[nodiscard]] double height() const { return maxY - minY; }
};

struct Diagram {
    std::vector<Node> nodes;
    std::vector<Edge> edges;
    std::string      diagramType;  // "flowchart"
    std::string      direction;    // "TB", "LR", ...
    BoundingBox      bounds;
};

// ---- Public API ----

/// 解析 mermaid 文本，返回带坐标的图结构
/// @throws mermaidc::Error 解析/布局失败时
Diagram parse(std::string_view text);

} // namespace mermaidc
```

---

### 8.4 原基线非功能性需求

| 类别 | 要求 |
|------|------|
| 语言标准 | C++17 |
| 构建系统 | CMake ≥ 3.21 |
| 运行时依赖 | **Node.js v22+** (系统安装) + **Chromium** (Playwright 管理, ~183MB) |
| JS 依赖 | mermaid@10 (CDN 动态加载) + playwright |
| C++ 依赖 | nlohmann/json (header-only, JSON 反序列化) |
| 平台 | Windows / Linux / macOS |
| 许可 | MIT |
| C++ 测试框架 | doctest (header-only, CMake FetchContent) |
| GUI 测试 | Qt 5.x, `tests/gui/`, 可选编译 (`-DMERMAIDC_BUILD_GUI_TESTS=ON`) |
| 性能 | 首次 ~2s (Chromium冷启动), 后续 parse < 200ms

---

### 8.5 原基线技术选型

| 模块 | 方案 | 理由 |
|------|------|------|
| JS 运行时 | Node.js 子进程 (stdin/stdout JSON) | 进程隔离，崩溃不影响主程序 |
| 浏览器引擎 | Playwright + headless Chromium | 真实 DOM，getBBox 精确文本测量，布局 100% 等价 |
| mermaid 加载 | CDN 动态 import (jsdelivr) | 版本可切换，无需本地构建 |
| 布局数据提取 | 渲染到隐藏 DOM → DOM API 提取 | 利用 mermaid 全管线，零 hack |
| JSON 库 | **nlohmann/json** | header-only，C++ 生态事实标准 |
| 错误处理 | **异常** `mermaidc::Error` | JS 侧错误通过 JSON `{"status":"error"}` 传递 |
| 日志 | **无** | 库内不输出日志，通过异常/返回值报错 |

#### 8.5.1 JS 胶水脚本

位置: `js-glue/glue.mjs`

```bash
# CLI 模式 (调试):
node glue.mjs "graph TB; A-->B"

# Server 模式 (生产): C++ 通过 stdin/stdout 通信
node glue.mjs --server
# stdin:  text\n       ← 每行一个 mermaid 文本
# stdout: JSON\n       ← 每行一个 JSON 响应 (首行为 {"status":"ready"})
```

节点坐标示例（已是真实中心坐标）:
```json
{ "id": "A", "label": "开始", "shape": "rect",
  "x": 95.5, "y": 36, "width": 47, "height": 36 }
```

---

### 8.6 原基线设计决策

| # | 议题 | 决策 | 理由 |
|---|------|------|------|
| 5.1 | JS 运行时 | **Node.js 子进程 `--server` 持久模式** | stdin/stdout 逐行通信，Chromium 只启动一次 |
| 5.2 | 布局策略 | **Playwright + headless Chromium** | mermaid 全管线，getBBox 精确，布局 100% 等价 |
| 5.3 | 通信协议 | **一行文本 → 一行 JSON**，`\n` 分隔 | 最简单可靠 |
| 5.4 | 错误处理 | **异常 `mermaidc::Error`** | JS 侧 `{"status":"error","message":"..."}` |
| 5.5 | 测试框架 | **doctest** | header-only，CMake FetchContent |
| 5.6 | Qt 测试 | **`tests/gui/`** 可选编译 | 不污染 examples |
| 5.7 | 编码 | **UTF-8 `std::string`** | mermaid 文本即 UTF-8 |
| 5.8 | 样式 | **透传 class 名** | `Node::styleClass` |
| 5.9 | 进程生命周期 | **持久子进程 + 懒初始化 Chromium** | 首次 ~2s，后续 <200ms |
| 5.10 | 图表范围 | **第一期仅 flowchart** | class/state/ER 留到 Phase 2 |
| 5.11 | 命名 | **`mermaidc` / `mermaid-c`** | 简洁一致 |

---

## 9. 参考资料

- [Node.js v22](https://nodejs.org/)
- [Playwright](https://playwright.dev/)
- [Mermaid v10](https://mermaid.js.org/) (CDN: jsdelivr)
- [nlohmann/json](https://github.com/nlohmann/json)
- [doctest](https://github.com/doctest/doctest)
- [Introduction to the Visio file format (.vsdx)](https://learn.microsoft.com/office/client-developer/visio/introduction-to-the-visio-file-formatvsdx)
- [[MS-VSDX] Visio Graphics Service VSDX File Format](https://learn.microsoft.com/openspecs/sharepoint_protocols/ms-vsdx/50c23601-c943-4ff2-b4a1-02445f52daf0)
- [Visio XML schema map](https://learn.microsoft.com/office/client-developer/visio/schema-mapvisio-xml)
- [Manipulate the Visio file format programmatically](https://learn.microsoft.com/office/client-developer/visio/how-to-manipulate-the-visio-file-format-programmatically)
