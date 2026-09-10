# 05 — 实现逻辑·VSDX 文档层（vsdxdoc）

> 对应需求：TS-601~610。这是业务量最大的层（≈7,690 行 C++，占业务 59%），
> 分五个子域平移：translate / docmodel / render / serialize / masters。
> 建议按 M2（翻译主干）→ M4（专用渲染器）→ M5（masters）实施。

---

## 1. translate 子域

### 1.1 CoordinateTransform（coordinateTransform.ts，对照 92 行）

数学规则（**照抄，含全部校验**）：

```
scale_ = outputScale / 96.0            // SVG 像素（96dpi）→ 页面英寸
sourceBounds：diagram.bounds + 全部 node 四角 + edge.waypoints + cluster 四角
              任一坐标非有限 → 抛错；空内容 → {0,0,96,96}
contentWidth  = (maxX-minX) * scale_;  contentHeight 同理
pageWidth  = marginLeft + max(contentWidth, 0.1) + marginRight
pageHeight = marginBottom + max(contentHeight, 0.1) + marginTop

point(x,y) = {
  x: marginLeft + (x - minX) * scale_,
  y: marginBottom + (maxY - y) * scale_   // y 翻转：SVG 向下 → 页面向上
}
```

TS 形态：`class CoordinateTransform { constructor(diagram, outputScale, margins);
point(x,y): PagePoint; pageSize(): {width,height}; }`。校验异常用
`MmdError`（或 `RangeError` 包装，保持 C++ 的 invalid_argument 语义：
**参数错误与业务错误分开**，建议自定义 `MmdArgumentError` 子类）。

### 1.2 DiagramImporter（diagramImporter.ts，三步职责分离照抄）

```
translate(diagram, options): DocumentCore
  1. resolveType(diagram, options) → CreateOptions（Auto 推导 + 校验）
  2. assembleDocumentCore(diagram, resolved)
       - Package.create() + 文档部件骨架（document.xml/pages.xml/windows.xml/docProps）
       - 装配 DocumentCore（options + 命名空间常量 + 部件 URI）
       - 母版打包：MasterLibrary.pack（若 useConnectorMaster / 图型有模具）
       - 注册 pages 关系
  3. buildPageContent(core, diagram, resolved)
       - 分支：gantt / git / pie / quadrant / sequence 专用；否则通用 nodes/edges
       - addPage / addShape / addConnector 私有助手
```

TS 门面：`VsdxTranslator.shared().translate(diagram, options): XmlParts`
（与 C++ 门面一致；内部新建 DocumentCore，**不再保留"可编辑会话"语义**——
C++ 版 DocumentCore 的 dirty 机制服务于历史 API，TS 版只走
"一次翻译 → 一次序列化"流水线，结构保留但 dirty 追踪可简化：
`DocumentCore` 持有 `parts: Map<uri, XmlNode 树>`，构建后整体序列化）。

### 1.3 docmodel（model.ts / documentCore.ts）

| C++ | TS | 差异说明 |
|---|---|---|
| ShapeModel | `interface ShapeModel` | 字段照抄（id/logicalId/text/kind/x/y/width/height/style/managed/masterId/dividers） |
| ConnectorModel | `interface ConnectorModel` | 字段照抄 |
| PageModel | `class PageModel` | **树容器语义保留**：`shapesNode/connectsNode/metadataNode` 从 `xmlNodePtr` 改为 `XmlNode`（TS 版无指针问题，节点即对象引用）；`shapes/connectors` Map；`shapeNodes` 索引在 TS 中**不再需要**（对象引用即索引）——这是去指针红利：C++ 版"节点句柄索引"整套机制消失 |
| DocumentCore | `class DocumentCore` | `package`（Package 实例）+ `options` + 各部件根节点 + `pages: PageModel[]` + `nextPageId`；`uniquePageName`/`nextPagePartUri` 照抄（循环找不冲突名） |

> **重大简化点**：C++ 的 `xmlNodePtr` 句柄 + 页面级索引（shapeNodes/
> connectorNodes/connectorConnects）是为"树外修改后按 id 刷新"服务的；
> TS 平移后对象引用即句柄，`renderManagedShape(page, shape)` 直接拿
> `shape.nodeRef`（树内引用）即可。保留 `logicalIdExists` 等查询逻辑。

---

## 2. render 子域

### 2.1 渲染架构（renderer.ts，对照 renderer.hpp/cpp）

```ts
interface Renderer {
  renderShape(page: PageModel, shape: ShapeModel, node: XmlNode): void;
  renderConnector(page: PageModel, connector: ConnectorModel,
                  node: XmlNode, beginConnect: XmlNode, endConnect: XmlNode): void; // 基类共享
  refreshConnectors(page: PageModel, shapeId: number): void;                        // 基类共享
}
class FlowchartRenderer implements Renderer { ... }
class ClassDiagramRenderer implements Renderer { ... }
class ERRenderer implements Renderer { ... }
const RendererFactory = {
  forShape(shape, diagramType): Renderer,  // dividers.length>0 → Class；ER 实体 → ER；否则 Flowchart
  forType(diagramType): Renderer,
};
```

平移要点：
1. `renderShape` 填充 ShapeSheet：`<Shape ID=...><Cell N="PinX" V=.../>...`
   五种几何（Rect/RoundRect/Diamond/Circle/Ellipse）→ Geometry 段差异
   （rx 圆角、椭圆公式等）**按 renderer.cpp 逐段照抄**。
2. 母版实例路径：`shape.masterId` 非空 → `<Shape Master="N">` + 局部覆盖
   （尺寸/文本/颜色），与本地几何路径分支共存——分支条件照抄。
3. `renderConnector`：1-D 形状 + `BeginX/BeginY/EndX/EndY` + `_WALKGLUE`
   粘附（`Connect FromSheet=.. ToSheet=.. ToPart=3`，ToPart 语义照抄：
   Connection 点索引）+ ER 多重性标记分支（fromMultiplicity/toMultiplicity →
   端点标签形状）。
4. `refreshConnectors`：移动节点后重算受影响连接线（c++ 逻辑照抄；
   TS 版因对象引用简化了句柄查找，计算不变）。

### 2.2 ConnectorBinder（connectorBinder.ts，对照 129 行）

- 端点计算：按形状类型适配端点（上节点粘菱形下点、下节点粘上点等
  三个历史修复 commit 的行为**必须保留**，见 git log b428945~2324c28）：
  - 2-D 形状 → 边界交点（按 shape kind 选边/角）
  - 1-D/生命线 → 中心垂线交点
- `_WALKGLUE`：连接线 Begin/End 粘附到目标形状的 Connection 点
  （ToPart=3），节点移动后由 Visio 重路由
- waypoints：贝塞尔采样点 → 中间顶点（MoveTo/LineTo Geometry 段）

### 2.3 专用渲染器（M4，五个文件）

| 渲染器 | C++ 行数 | 平移要点 |
|---|---|---|
| gantt | 1,490 | **最重**。Excel 序列日期↔日历（`formatDate`/`serialToTM`/`daysInMonth`，UTC 语义**照抄**）；任务条几何（列几何 `addColumnGeometry`）；section 分组；里程碑；依赖线（箭头/占位）；guidFor（**种子→GUID 生成规则照抄**，保证产物确定） |
| git | 258 | 分支线 y 布局（branchIndex→y）；commit 圆点（r/双圈 merge/深色 highlight/浅描边 reverse）；箭头（seq/branch/merge 折线近似）；`estimateTextWidth`（近似宽度估算——字符宽度表照抄）；`isDarkColor`（亮度阈值） |
| pie | 175 | 扇区 Path 计算（圆心 cx/cy + r + 起止角）；`addTextLabel`/`addSwatch`（图例布局规则照抄） |
| quadrant | 158 | 十字轴（crossX/crossY）+ 四象限标签 + 数据点（`addLine2D`/`addTextBox`） |
| sequence | 400 | 生命线（actor/object 两种头部）；消息线（实线/虚线/箭头按 Edge.style）；`addActivation`（激活条）；`addFragment`（loop/alt/opt 片段框）；`nearestLifelineConn`（最近生命线判定） |

> 每个渲染器平移纪律：**函数级对照**（C++ 静态函数 → 模块私有函数，
> 保持同名便于 diff），常量（颜色/线宽/字体/间距）命名照抄；
> 完成一个渲染器立即跑对应样本结构校验（07 gantt / 08 git / 12 pie /
> 13 quadrant / 15 sequence），再进下一个。

### 2.4 renderManaged（render_managed.ts）

- `renderManagedShape`：managed 形状（ShapeModel.managed=true，来自
  提取层"特殊形状"）渲染路径照抄
- `refreshConnectors` 入口照抄

---

## 3. serialize 子域

### 3.1 XmlPartsBuilder（xmlPartsBuilder.ts）

`DocumentCore → XmlParts`：按固定顺序输出部件（**顺序照抄 documentparts.cpp
与 xmlpartsbuilder.cpp**，利于产物 diff）：

```
[Content_Types].xml  → 由 opcpkg ContentTypes 生成（不是 XmlParts 成员）
_rels/.rels          → 由 Package 生成
docProps/app.xml, core.xml, custom.xml
visio/document.xml
visio/pages/pages.xml + pageN.xml
visio/masters/masters.xml + masterN.xml（若打包母版）
visio/windows.xml
```

### 3.2 DocumentParts（documentParts.ts）

文档级部件的构建逻辑照抄：
- document.xml：`<Document>` 根 + 命名空间 + `<Windows>` + `<Pages>`
  关系 + `<DocumentSettings>`（含样式合并结果）
- pages.xml：页面清单（ID/Name/NameU/ViewScale/ViewCenterX/Y）
- windows.xml：窗口布局（照抄，含 window 类型/状态）
- docProps：app.xml（Application/Company…）、core.xml（dc:title 等）、
  custom.xml（按 C++ 版实际输出为准——可能为空部件，**照抄是否存在**）

### 3.3 Validator（validator.ts）

输出前校验（对照 validator.cpp）：每部件可解析、关键节点存在
（Document/Pages/Page/Shapes）、ID 唯一、rels 目标存在。校验失败抛错
（错误消息带部件 URI）。

---

## 4. masters 子域（M5）

### 4.1 资源生成（gen-stencils.ts，替代 extract_stencil.py + stencilresources.cpp）

**现状**：`scripts/extract_stencil.py` 读 `resources/visio/*.vssx|vstx`
（8 份官方模具）→ 生成 stencilresources.cpp（28,009 行，gzip base64 数组）。

**TS 方案**（两种，推荐 A）：

| 方案 | 做法 | 权衡 |
|---|---|---|
| **A. 生成 TS 资产（推荐）** | 脚本输出 `stencilData.ts`：`export const STENCILS: Record<string, { masters: Record<string,string(gzipBase64)>, mastersXml: string, stylesXml: string }>` | 与现状一致（构建期嵌入）；文件大（~2MB）但一次加载；分发红线：**生成物不随 npm 包**，`npm run gen:stencils` 由用户本机跑 |
| B. 运行时读 .vssx | 包内带 .vssx 文件（或用户提供路径），运行时解包 | 免生成步骤；但 .vssx 分发合规问题与现状相同且更显性 |

> 与 C++ 版结构对齐：`LoadedStencil{ name, masters: StencilMaster[],
> mastersXml, contents: Map<fileName, xml>, stylesXml }`。gzip base64 解码用
> `zlib.gunzipSync(Buffer.from(b64,'base64'))`，**与 C++ 生成物字节兼容**
> （同一 gzip 数据，无再压缩差异问题）。

### 4.2 MasterLibrary（masterLibrary.ts，对照 1,487 行）

```
class MasterLibrary {
  static shared(): MasterLibrary;
  load(name): LoadedStencil;                    // 懒解压缓存（cache_ Map）
  names(): string[]; has(name): boolean;
  selectForType(type): StencilSelection;        // 图型 → 模具 + NameU 子集（表见 04 §1.3）
  resolveDiagramType(requested, diagrams): DiagramType;
  masterNameForShape(type, kind): string;       // 形状→母版 NameU 映射表照抄
  masterChildShapeIds(nameU): number[];         // 子形状 ID 缓存（childCache_）
  pack(package, selection, options): Map<nameU, masterId>;  // 见下
  mergeStyles(documentRoot, stylesXml): void;   // StyleSheets/Colors/FaceNames 合并
  masterIdFor(nameU): number; setMasterIds(map);
  applyInstanceOverrides(shapeNode, nameU, width, height): void;  // 见下
}
```

**pack 流程**（照抄）：
1. 解压选中母版（gzip → XML）
2. **Master ID 重写**：从 100 起重新编号（原文 `<Master ID="N">` → 新 ID；
   内部引用一致性——Shape 的 Master 引用、rels、masters.xml 全部联动）
3. 重建 `masters.xml` / `masters.xml.rels` / ContentTypes 条目
4. 返回 `NameU → 新 Master ID` 映射（渲染层 `masterIdFor` 查询）

**applyInstanceOverrides**（OLE 快速打开路径兼容，照抄）：
- 母版 TxtPin 六件套（TxtWidth/TxtHeight/TxtPinX/TxtPinY/TxtLocPinX/TxtLocPinY）
  与 User/Control/Scratch/Geometry Section 克隆为页内覆盖
- `V` 按 width/height 求值（单位照母版 U），`F` 保留母版公式（自包含）
- 找不到母版 → no-op

### 4.3 母版选择表（selectForType 的 NameU 子集）

> 实施时从 masterlibrary.cpp 的 `selectForType` 逐图型抄录 NameU 列表
> （如 flowchart → 流程形状集）。这是**数据表**，TS 版以常量表形式保存
> 并加注释来源行号，便于 C++ 版更新时同步。

---

## 5. 本层验证策略

| 阶段 | 验证 |
|---|---|
| M2（主干） | testtranslate 平移：fixture Diagram → XmlParts（部件清单 + 关键单元格数值断言）；坐标变换正反例（y 翻转/缩放/边距/空图默认 96×96） |
| M4（专用） | 样本 07/08/12/13/15 结构校验器比对：与 C++ 版产物**部件清单一致 + 关键 ShapeSheet 数值等价**（≤1e-9 相对差） |
| M5（masters） | testmasters 平移：pack 后 Master ID 从 100 起连续、rels 完整、样式合并结果；产物用 Visio 实测打开（人工验收项） |
| 全程 | roundtrip：TS 产物 → Package.open → 再生成 → 结构等价（testroundtrip 平移） |

**结构校验器**（scripts/compare-vsdx.ts）：对标 compare_gantt.py——
解包两个 .vsdx，按部件逐 XML 树比较：节点名/属性名集合、数值属性
（数值等价）、文本内容（精确）；输出差异报告。此工具同时是
"M2 起每个阶段的金标准闸门"。
