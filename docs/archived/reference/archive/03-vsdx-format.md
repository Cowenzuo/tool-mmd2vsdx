# VSDX 包结构与 ShapeSheet 剖析

> 日期: 2026-07-27
>
> 适用范围: mermaid-c 1.1 VSDX 创建与编辑

---

## 1. 文档目的

VSDX 是基于 ZIP、Open Packaging Conventions（OPC）和 Visio XML 的复合文件。正确创建或编辑 VSDX 需要同时满足三层约束：

1. ZIP 层：条目、CRC-32、压缩数据和中央目录有效。
2. OPC 层：Content Type、Part URI 和 Relationship 图一致。
3. Visio 层：Page、ShapeSheet、Geometry、Text、公式缓存和连接关系一致。

只生成格式良好的 `page1.xml` 并不足以得到可靠 VSDX。Visio 可能容错打开部分损坏文件，但容错打开不等于文件合规，也不保证移动、重算和再次保存后的稳定性。

本文结论来自：

- `docs/min.vsdx` 及其逐字节一致的解压目录 `docs/min/`。
- 较复杂的桌面 Visio 解压样本 `docs/ceshi/`。
- Microsoft Visio XML Schema 和 MS-VSDX Open Specifications。
- 对当前 `src/vsdx/vsdx_writer.cpp` 及 `output/*.vsdx` 的一致性审计。

---

## 2. 两种规范视角

### 2.1 桌面 Visio VSDX

两个样本的 Visio XML 根元素均使用：

```text
http://schemas.microsoft.com/office/visio/2012/main
```

桌面 Visio XML 参考将 `Connects/Connect` 定义为形状之间的连接记录。mermaid-c 的主要目标是桌面 Visio 可打开、可编辑和可重新保存，因此新建文件采用这一命名空间和桌面行为。

### 2.2 MS-VSDX Web Drawing Profile

MS-VSDX Open Specifications 主要描述 Visio Graphics Service 的 Web Drawing，核心类型位于：

```text
http://schemas.microsoft.com/office/visio/2011/1/core
```

该规范对 ShapeSheet、公式、继承、部件和数据类型的定义具有重要参考价值，但部分 Web 渲染规则不能直接替代桌面 Visio 语义。例如，MS-VSDX 将 `Connect_Type` 标为 Web Drawing 渲染可忽略，而桌面 Visio 需要它维持连接对象语义。

### 2.3 本项目兼容策略

- 新建文件使用 `2012/main`。
- 读取时按命名空间 URI 和本地名匹配，不依赖前缀。
- 遇到 `2011/1/core` 时允许读取受支持结构。
- 编辑已有文件时保留原命名空间，不主动迁移整个文档。
- 规范与桌面样本冲突时，以桌面 Visio无修复打开和可编辑行为作为本项目验收基准。

---

## 3. OPC 包关系图

### 3.1 典型关系

```text
Package
├── [Content_Types].xml
├── _rels/.rels
│   ├── document          -> visio/document.xml
│   ├── core-properties   -> docProps/core.xml
│   ├── extended-properties -> docProps/app.xml
│   ├── custom-properties -> docProps/custom.xml
│   └── thumbnail         -> docProps/thumbnail.emf       (可选)
└── visio/document.xml
    └── visio/_rels/document.xml.rels
        ├── pages         -> pages/pages.xml
        ├── masters       -> masters/masters.xml           (使用母版时)
        ├── windows       -> windows.xml                   (可选)
        └── theme         -> theme/theme1.xml              (可选)

visio/pages/pages.xml
└── visio/pages/_rels/pages.xml.rels
    ├── page -> page1.xml
    └── page -> pageN.xml

visio/pages/pageN.xml
└── visio/pages/_rels/pageN.xml.rels
    ├── master -> ../masters/masterN.xml                  (页面使用母版时)
    ├── image  -> ../media/imageN.*                       (可选)
    └── other related parts                               (可选)

visio/masters/masters.xml
└── visio/masters/_rels/masters.xml.rels
    └── master -> masterN.xml
```

Relationship ID 只在所属 `.rels` 文件内唯一。不能把 `rId1` 当成包级全局 ID。

### 3.2 Relationship 文件位置

源部件与关系部件的映射规则为：

```text
源: visio/document.xml
关系: visio/_rels/document.xml.rels

源: visio/pages/pages.xml
关系: visio/pages/_rels/pages.xml.rels

源: visio/pages/page1.xml
关系: visio/pages/_rels/page1.xml.rels
```

包本身的关系固定存放在 `_rels/.rels`。Target 是相对源部件目录的 URI，不是相对 ZIP 根目录的普通字符串拼接结果。

### 3.3 Relationship 读取规则

读取器必须：

1. 根据关系部件位置确定源部件。
2. 对 Internal Target 做 URI 规范化并解析 `.`、`..`。
3. 拒绝越过包根目录的 Target。
4. 验证 Internal Target 对应部件存在。
5. 记录但不访问 `TargetMode="External"` 的目标。
6. 按 Relationship Type 判断语义，不依赖 `rId` 数值或 Target 文件名。

### 3.4 Content Types

`[Content_Types].xml` 同时支持：

- `Default Extension="xml" ...`：按扩展名提供默认 MIME 类型。
- `Override PartName="/visio/pages/page1.xml" ...`：为指定 Part URI 提供精确类型。

Visio 语义部件通常需要 Override。例如：

| 部件 | Content Type |
|------|--------------|
| `visio/document.xml` | `application/vnd.ms-visio.drawing.main+xml` |
| `visio/pages/pages.xml` | `application/vnd.ms-visio.pages+xml` |
| `visio/pages/pageN.xml` | `application/vnd.ms-visio.page+xml` |
| `visio/masters/masters.xml` | `application/vnd.ms-visio.masters+xml` |
| `visio/masters/masterN.xml` | `application/vnd.ms-visio.master+xml` |
| `visio/windows.xml` | `application/vnd.ms-visio.windows+xml` |
| `visio/theme/themeN.xml` | `application/vnd.openxmlformats-officedocument.theme+xml` |

新增或删除页面、母版、图片和主题时，必须同步更新 Content Types 和对应 Relationships。

---

## 4. 各 XML 部件职责

### 4.1 `_rels/.rels`

包级入口。绘图文件至少要能从包关系定位到 Document XML Part。Core、App、Custom 和 Thumbnail 是元数据关系，不负责页面绘制。

### 4.2 `docProps/core.xml`

标题、作者、创建和修改时间等 OPC 核心属性。与 ShapeSheet 无关。

### 4.3 `docProps/app.xml`

应用程序名称、版本、页数等扩展属性。模板路径不是绘图所必需，不应复制某台机器的 Office 安装路径。

### 4.4 `docProps/custom.xml`

自定义属性。本项目需要在几何或连接变化后维护：

```xml
<property
    fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}"
    pid="唯一值"
    name="RecalcDocument">
  <vt:bool>true</vt:bool>
</property>
```

`pid` 在该文件内唯一，合法值从 2 开始。已有 `RecalcDocument` 时更新其值，不重复添加。

### 4.5 `visio/document.xml`

文档级设置和共享资源，包括：

- `DocumentSettings`：活动页、默认样式、Glue/Snap 和保护设置。
- `Colors`：旧式颜色表。
- `FaceNames`：字体表。
- `StyleSheets`：线条、填充、文本等样式继承来源。
- `DocumentSheet`：文档级 ShapeSheet 属性。

新建文件可以使用较小的固定样式集合，但所有被 `LineStyle`、`FillStyle`、`TextStyle` 或 DocumentSettings 引用的 StyleSheet ID 必须存在。

### 4.6 `visio/pages/pages.xml`

页面索引。每个 `Page` 至少包含：

- 页面 `ID`。
- `NameU` 和可选本地化 `Name`。
- `PageSheet`，其中包含 `PageWidth`、`PageHeight` 等页面属性。
- `Rel r:id`，指向 `pages.xml.rels` 中的 Page Relationship。

多页写入需要同步创建 Page 元素、Relationship、Page Part 和 Content Type Override。

### 4.7 `visio/pages/pageN.xml`

页面绘图内容，根元素为 `PageContents`，主要子元素为：

```xml
<PageContents ...>
  <Shapes>...</Shapes>
  <Connects>...</Connects>
</PageContents>
```

`Shapes` 中既可以有引用母版的实例，也可以有完全自包含的本地 Geometry 形状。`Connects` 记录桌面 Visio 中端点与目标形状的逻辑连接。

### 4.8 `visio/masters/masters.xml` 与 `masterN.xml`

`masters.xml` 是母版索引，每个 `Master` 通过 `Rel r:id` 定位对应 `masterN.xml`。Master ID 与文件序号没有强制等值关系。

`masterN.xml` 中的 `MasterContents/Shapes/Shape` 保存母版 ShapeSheet。页面 Shape 的 `Master` 属性引用 Master ID，不直接引用关系 ID。

本项目确定新建形状全部采用本地 Geometry，因此新建文件可以不包含 Masters Part。编辑已有文件时必须保留原有 Masters Part 和页面到 Master Part 的关系。

### 4.9 `visio/windows.xml`

保存窗口尺寸、缩放、活动页面、标尺和网格等 UI 状态，不决定 Shape 几何。新建文件可省略或生成最小状态；编辑时原样保留，除非明确修改活动页视图。

### 4.10 `visio/theme/themeN.xml`

DrawingML Theme。只有在使用 Theme、THEMEVAL 或 Quick Style 语义时才需要。一个仅使用固定 RGB 和固定样式的新建文件可以不创建 Theme Part。

若创建 Theme，必须包含 DrawingML 要求的完整 `clrScheme`、`fontScheme` 和 `fmtScheme`，不能只输出颜色片段。

---

## 5. 两个样本的结构差异

| 指标 | `min` | `ceshi` |
|------|-------|---------|
| ZIP 部件 | 17 | 18 |
| 页面 | 1 | 1 |
| 顶层 Shape | 3 | 43 |
| 节点 Shape | 2 | 21 |
| Connector Shape | 1 | 22 |
| `Connect` 记录 | 2 | 44 |
| 母版 | Process、Dynamic connector | Rectangle、Dynamic connector |
| 无母版 Shape | 0 | 6 |
| Theme | 无 | 有 |

### 5.1 `min` 的证明价值

两个 Process 页面实例只写了 `PinX`、`PinY`、`LayerMember`、字符大小和 Text。Width、Height、Geometry、Connection 和大部分样式来自母版。

这证明母版实例可以非常小，但也说明不能把母版内容与页面实例割裂分析。

### 5.2 `ceshi` 的证明价值

`ceshi` 同时包含：

- 引用 Rectangle 母版并显式覆盖大量继承 Cell 的节点。
- 引用 Dynamic connector 母版的连接线。
- 不引用母版、自己携带完整 Geometry 的背景矩形。
- 静态连接点 Glue 与连接到整个 Shape 的动态 Glue。
- NURBS 路径和更多连接点。

这证明本地 Geometry 是桌面 Visio 的正常能力，不是降级或图片化方案。

---

## 6. ShapeSheet 数据模型

### 6.1 层级

```text
Sheet
├── Cell                 单值属性
├── Section              表格型属性集合
│   ├── Cell             Section 级属性，常见于 Geometry
│   └── Row
│       └── Cell
├── Text                 混合文本内容
└── Shapes               Group 的子形状
```

Shape、Master Shape、StyleSheet、PageSheet 和 DocumentSheet 都使用相近的 Cell/Section/Row 表达方式。

### 6.2 `Cell` 属性

| 属性 | 含义 |
|------|------|
| `N` | 语言无关 Cell 名称，在所属作用域内标识属性 |
| `V` | 当前值；有公式时是最近一次成功计算的缓存结果 |
| `U` | 显示和公式使用的单位标识，不改变长度值以英寸归一化的事实 |
| `F` | ShapeSheet 公式，或特殊值 `Inh`、`No Formula` |
| `E` | 最近一次公式计算的错误状态，例如 `#REF!` |

必须把 `V` 当成可独立渲染的有效缓存，而不是可随意填零的占位。没有 Visio 参与时，第三方读取器可能只使用 `V`。

### 6.3 继承与本地覆盖

继承链可能包含：

```text
StyleSheet -> Master Shape -> Page Shape instance
```

页面 Shape 的 `Master` 属性引用 Master ID。本地 Cell、Section 或 Row 按名称和索引覆盖继承项。

常见特殊值：

- `F="Inh"`：公式继承自上游。
- `Del="1"`：本地删除继承的 Row、Section 或子形状。
- `MasterShape`：Group 实例中的子形状对应母版子形状 ID。

编辑已有母版实例时，应优先写局部覆盖，不应复制并重写整份母版。

### 6.4 Shape 主要属性

| 属性 | 含义 |
|------|------|
| `ID` | 页面或所属 Group 内的数字标识 |
| `Type` | `Shape`、`Group`、`Guide`、`Foreign` 等 |
| `NameU` | 语言无关名称 |
| `Name` | 本地化名称 |
| `Master` | 继承的 Master ID |
| `MasterShape` | Group 子形状继承的 Master Shape ID |
| `LineStyle` | 线条样式表 ID |
| `FillStyle` | 填充样式表 ID |
| `TextStyle` | 文本样式表 ID |

新建自包含形状可以省略 Master，但所有必需的 Geometry、连接点和样式都必须在本地或有效 StyleSheet 中得到定义。

---

## 7. 单位与坐标

### 7.1 Visio 内部单位

长度类 Cell 的数值使用英寸作为内部基准。`U` 描述显示或公式单位。例如：

```xml
<Cell N="Width" V="0.984251968503937" U="MM"/>
```

其中 `V` 是 0.9842519685 英寸，即 25 mm，而不是 0.984 mm。

类似地：

- `LineWeight V="0.0069444444" U="PT"` 表示 0.5 pt。
- `Char.Size V="0.1666666667" U="PT"` 表示 12 pt。
- 角度通常以弧度作为内部值，`U` 可以控制 UI 表示。

### 7.2 IR 到页面坐标

设：

```text
scale = outputScale / 96.0
contentWidth  = (bounds.maxX - bounds.minX) * scale
contentHeight = (bounds.maxY - bounds.minY) * scale
pageWidth  = marginLeft + contentWidth  + marginRight
pageHeight = marginBottom + contentHeight + marginTop
```

IR 点 `(x, y)` 转换为 Visio 页面点：

```text
X = marginLeft   + (x - bounds.minX) * scale
Y = marginBottom + (bounds.maxY - y) * scale
```

这样同时完成：

- CSS pixel 到 inch 的转换。
- 移除 IR 包围盒偏移。
- Y 轴翻转。
- 页面边距引入。

固定 `pageHeight - y / 常量` 无法正确处理不同图尺寸、非零 bounds 和显式缩放。

### 7.3 Shape 局部坐标

Geometry Row 中的坐标位于 Shape 局部坐标系。无旋转时可理解为：

```text
pagePoint = Pin + localPoint - LocPin
```

考虑旋转和翻转后的完整变换为：

```text
pagePoint = Pin + Rotate(Angle) * Flip(localPoint - LocPin)
```

常规二维节点使用：

```text
LocPinX = Width  * 0.5
LocPinY = Height * 0.5
PinX/PinY = 页面中的形状中心
```

---

## 8. Geometry

### 8.1 Section 与 Row

Geometry section 示例结构：

```xml
<Section N="Geometry" IX="0">
  <Cell N="NoFill" V="0"/>
  <Cell N="NoLine" V="0"/>
  <Cell N="NoShow" V="0"/>
  <Row T="MoveTo" IX="1">...</Row>
  <Row T="LineTo" IX="2">...</Row>
</Section>
```

常用 Row 类型：

| Row | 用途 |
|-----|------|
| `MoveTo` | 移动到子路径起点 |
| `LineTo` | 直线段 |
| `ArcTo` | 圆弧 |
| `EllipticalArcTo` | 椭圆弧 |
| `Ellipse` | 完整椭圆 |
| `PolylineTo` | 多段折线 |
| `NURBSTo` | NURBS 曲线 |
| `RelCubBezTo` | 相对三次贝塞尔 |
| `RelQuadBezTo` | 相对二次贝塞尔 |

### 8.2 可缩放 Geometry

新建基础形状的坐标应使用相对 Width/Height 的公式。例如矩形：

```text
MoveTo  (0, 0)
LineTo  (Width, 0)
LineTo  (Width, Height)
LineTo  (0, Height)
LineTo  (0, 0)
```

菱形：

```text
MoveTo  (Width*0.5, 0)
LineTo  (Width, Height*0.5)
LineTo  (Width*0.5, Height)
LineTo  (0, Height*0.5)
LineTo  (Width*0.5, 0)
```

Ellipse 使用 Ellipse Row；Circle 在模型层强制 Width 与 Height 相等。RoundRect 的圆角半径必须限制在短边一半以内，并使用经过样本验证的 Arc/Geometry 组合。

`V` 必须写入公式在当前 Width/Height 下的计算结果，`F` 写入相应公式。两者不能描述不同路径。

---

## 9. Text

### 9.1 混合内容

`Text` 不是普通纯字符串容器，还可以包含格式运行标记：

| 元素 | 作用 |
|------|------|
| `cp` | 字符格式行索引 |
| `pp` | 段落格式行索引 |
| `tp` | Tab 格式行索引 |
| `fld` | ShapeSheet 字段引用 |

这些元素通过 `IX` 引用 Character、Paragraph、Tabs 或 Field section 中的 Row。

### 9.2 新建文本

本期新建文本为 UTF-8 纯文本，可使用统一 Character/Paragraph 行。要求：

- `&`、`<`、`>` 等由 XML Writer 转义。
- 保留换行。
- 拒绝 XML 1.0 不允许的控制字符。
- 不使用手写字符串替换模拟 XML 序列化。

### 9.3 编辑文本

- 不修改 Text 时，完整保留原混合内容。
- 只替换某个已有文本运行时，保留周围 `cp/pp/tp/fld`。
- 明确执行“替换整段文本”时，可以重建本库管理的统一格式行，但必须清理失效索引。

---

## 10. Connection 与 Connector

### 10.1 节点连接点

节点的连接点位于：

```xml
<Section N="Connection">
  <Row T="Connection" IX="0">...</Row>
  <Row T="Connection" IX="1">...</Row>
</Section>
```

XML 行索引从 0 开始，而 ShapeSheet 引用名称表现为 1-based：

```text
IX=0 -> Connections.X1 / Connections.Y1
IX=1 -> Connections.X2 / Connections.Y2
```

本项目新建二维节点采用稳定顺序：

| IX | 名称 | 位置 |
|----|------|------|
| 0 | X1/Y1 | 左边中点 |
| 1 | X2/Y2 | 右边中点 |
| 2 | X3/Y3 | 下边中点 |
| 3 | X4/Y4 | 上边中点 |

选择连接点时使用首尾路径方向；无有效路径点时使用源节点到目标节点中心的主方向。

### 10.2 Connector 是一维 Shape

连接线至少需要维护：

- `BeginX`、`BeginY`。
- `EndX`、`EndY`。
- `Width = EndX - BeginX`。
- `Height = EndY - BeginY`。
- `PinX/PinY = (Begin + End) / 2`。
- `LocPinX/LocPinY = (Width, Height) / 2`。
- Geometry、线条样式、箭头和文本块。

Geometry 局部点以 Begin 为基准：

```text
localWaypoint = pageWaypoint - Begin
```

因此最简单的直线必须从 `(0, 0)` 到 `(Width, Height)`。写成 `(Width, 0)` 只在 BeginY 等于 EndY 时正确。

### 10.3 静态连接点 Glue

`min` 样本使用显式连接点：

```text
BeginX/BeginY F = PAR(PNT(Sheet.source!Connections.Xn,
                          Sheet.source!Connections.Yn))
EndX/EndY     F = PAR(PNT(Sheet.target!Connections.Xm,
                          Sheet.target!Connections.Ym))
```

并配套：

```text
BegTrigger = _XFTRIGGER(Sheet.source!EventXFMod)
EndTrigger = _XFTRIGGER(Sheet.target!EventXFMod)
```

`V` 必须是所选连接点当前的页面坐标。

### 10.4 页面 `Connect` 记录

每个已 Glue 的 Connector 端点对应一条记录。样本中的关键编码为：

| 含义 | FromCell | FromPart |
|------|----------|----------|
| 起点 | `BeginX` | 9 |
| 终点 | `EndX` | 12 |

显式连接点的 `ToPart` 为 `100 + Connection Row IX`：

```text
Connections.X1 -> ToPart 100
Connections.X2 -> ToPart 101
```

示意：

```xml
<Connect FromSheet="connectorId"
         FromCell="BeginX"
         FromPart="9"
         ToSheet="sourceShapeId"
         ToCell="Connections.X2"
         ToPart="101"/>
```

`FromSheet` 是连接线 Shape，`ToSheet` 是被连接节点，不能按“业务流向”反向理解。

### 10.5 动态 Glue

`ceshi` 中部分 Connector 使用 `_WALKGLUE` 并连接到目标 `PinX`、`ToPart=3`，表示由 Visio 在整个 Shape 上选择动态连接位置。

本项目的初始文件采用明确连接点以复现 Mermaid waypoints；同时写入 Connector 路由属性和 `RecalcDocument`，允许用户移动节点后由 Visio 重路由。

### 10.6 路径点

本期 IR 的曲线已被采样为 Point 序列，因此 VSDX 初始 Geometry 使用折线近似：

1. 删除相邻重复点。
2. 确保首尾点与 Glue 缓存坐标一致。
3. 将页面点转换为 Connector 局部点。
4. 首点写 MoveTo，后续点写 LineTo。
5. 路径不足两个点时退化为 Begin 到 End 的直线。

下一版本可以在 IR 保留曲线命令后映射 NURBS 或相对贝塞尔，本版本不反推原始曲线。

---

## 11. 新建文件 Profile

基于“全部本地 Geometry、固定 RGB、不创作 Theme”的设计决策，新建包至少包含：

```text
[Content_Types].xml
_rels/.rels
docProps/app.xml
docProps/core.xml
docProps/custom.xml
visio/document.xml
visio/_rels/document.xml.rels
visio/pages/pages.xml
visio/pages/_rels/pages.xml.rels
visio/pages/page1.xml ... pageN.xml
```

可选：

```text
visio/windows.xml
```

默认不创建：

```text
visio/masters/*
visio/theme/*
docProps/thumbnail.emf
visio/pages/_rels/pageN.xml.rels
```

当页面新增图片、已有母版引用或其他相关部件时，才创建对应 `pageN.xml.rels`。

---

## 12. 编辑与保真写回

### 12.1 Dirty Part 模型

打开已有包时，每个 Part 保存：

- 规范化 Part URI。
- Content Type。
- 原始未压缩字节。
- 关系集合。
- 是否已修改。
- XML Part 的按需 DOM。

保存时：

- 未修改 Part 复制原始 payload；ZIP 压缩元数据允许重新生成。
- 修改的 XML Part 由 libxml2 序列化。
- 修改 XML 时保留未知元素、属性、命名空间和 Processing Instruction。
- 不要求保留属性顺序、缩进和 ZIP 中的条目顺序，因为这些不属于语义。

### 12.2 删除安全

删除 Shape 前扫描：

- 当前 Page 的 `Connect` 记录。
- 已解析公式中的 `Sheet.<ID>!` 引用。
- 已知关系和本库管理的逻辑 ID。
- 未识别 XML 中可确定的 Shape ID 引用。

发现无法安全重写的未知引用时，拒绝删除并报告 Part URI、元素路径和引用值。

### 12.3 XML 更新原则

- 通过 URI + namespace-aware DOM 定位元素。
- 不使用正则表达式修改 XML。
- 不按固定子元素偏移定位 Cell，按 `N`、`IX`、`T` 等键定位。
- 插入元素时遵守 Schema 顺序，特别是 `Shapes` 位于 `Connects` 之前。
- 只修改目标 Cell 的 `V/U/F/E`，不无故重建整个 Shape。

---

## 13. 当前写入器审计结果

### 13.1 ZIP CRC-32 错误

审计 `output/` 下 18 个 VSDX，每个包包含 17 个条目，所有条目的存储 CRC 均与标准 CRC-32 不一致。Python `zipfile` 在读取第一个部件时即报：

```text
Bad CRC-32 for file '[Content_Types].xml'
```

对照 `docs/min.vsdx`：17 个条目 CRC 全部正确，且与 `docs/min/` 解压文件逐字节一致。

当前算法从 0 开始且没有标准最终异或，不是 ZIP 使用的 IEEE CRC-32。新 ZIP 层必须使用 zlib `crc32`，并通过独立 ZIP 读取器做互操作验证。

### 13.1.1 本项目 ZIP Profile

用户指定依赖仅包含 zlib，不包含 Minizip 或其他 ZIP 容器 API。因此项目实现受限 ZIP32 Reader/Writer：

- 读取 EOCD、Central Directory 和 Local File Header。
- 支持 Compression Method 0（Store）与 8（Deflate）。
- Deflate 使用 raw stream，即 `inflateInit2(-MAX_WBITS)` / `deflateInit2(..., -MAX_WBITS, ...)`。
- CRC-32 使用 zlib `crc32`。
- 读取以 Central Directory 中的 CRC、压缩大小和展开大小为准，可跳过 Local Header 后的数据描述符。
- 写入时在 Local Header 和 Central Directory 同时写入已知 CRC/大小，不生成数据描述符。
- 文件名使用 UTF-8，并设置 general purpose bit 11；拒绝反斜杠和危险 Part URI。
- 拒绝 encrypted、ZIP64、multi-disk、unsupported method、duplicate name 和 overlapping entry。
- 对条目数、单条目展开大小和总展开大小设定上限。

该 Profile 覆盖普通 VSDX。遇到超出 Profile 的合法 ZIP 时返回明确的 `UnsupportedZipFeature`，不进行猜测性解析。

### 13.2 连接点冲突

当前内置 Process 母版的 Connection Row 顺序是：

```text
X1 = 下边中点
X2 = 右边中点
X3 = 上边中点
X4 = 左边中点
```

写入器把目标缓存坐标设为左边中点，却把公式和 `Connect` 写为 `Connections.X1`，重算后目标会跳到下边中点。

### 13.3 Connector Geometry 不到终点

实际输出示例：

```text
Width  = -1.35417
Height = -2.28125
Geometry LineTo = (-1.35417, 0)
```

Geometry 终点应为 `(Width, Height)` 或由 waypoints 定义。当前路径与 `EndY` 不一致。

### 13.4 API 数据丢失

当前实现未写入或未使用：

- 多页输入及 Page name。
- `NodeShape` / `masterName`。
- fillColor、lineColor、lineWidth。
- Connector label 和 waypoints。
- EdgeStyle、arrowHead、arrowTail。
- Diagram bounds、显式缩放和动态页面尺寸。

### 13.5 测试缺口

现有 VSDX 测试只检查输出文件存在且大于 100 字节；Node.js 不存在时测试直接空通过。因此无效 ZIP 仍显示测试成功。

---

## 14. 包验证规则

自动验证器至少检查：

### 14.1 ZIP

- 所有条目 CRC 正确。
- 无重复 Part URI。
- 无绝对路径、反斜杠路径或越界 `..`。
- 所有 XML 条目可完整读取。

### 14.2 OPC

- 每个 Part 有可解析 Content Type。
- 每个 Internal Relationship Target 存在。
- Relationship ID 在所属关系部件内唯一。
- Content Type Override 不指向不存在的 Part。
- 页面、母版和媒体的索引、关系和实际 Part 数量一致。

### 14.3 Visio

- Page ID 和 Page name 唯一。
- Shape ID 在页面或 Group 作用域内唯一。
- Shape 引用的 Style/Master 存在。
- `Connect.FromSheet` 和 `Connect.ToSheet` 均存在。
- `ToCell` 对应实际 Connection Row。
- Connector Begin/End 缓存与所选连接点一致。
- Connector Geometry 首尾点与 Begin/End 一致。
- Geometry/Connection/Character 等 Section 的 Row IX 不重复。
- `RecalcDocument` 最多一个，类型为 bool。

### 14.4 桌面 Visio

自动检查不能替代桌面验收。测试时启用 Visio 的“显示文件打开警告”，验证：

- 无修复提示。
- Shape 和 Connector 可分别选择。
- 移动节点后 Connector 保持 Glue。
- 保存、关闭、重新打开后位置和文本稳定。
- Visio 重写后的包仍可被本库读取。

---

## 15. 参考资料

- [Introduction to the Visio file format (.vsdx)](https://learn.microsoft.com/office/client-developer/visio/introduction-to-the-visio-file-formatvsdx)
- [[MS-VSDX] Visio Graphics Service VSDX File Format](https://learn.microsoft.com/openspecs/sharepoint_protocols/ms-vsdx/50c23601-c943-4ff2-b4a1-02445f52daf0)
- [Visio XML schema map](https://learn.microsoft.com/office/client-developer/visio/schema-mapvisio-xml)
- [Manipulate the Visio file format programmatically](https://learn.microsoft.com/office/client-developer/visio/how-to-manipulate-the-visio-file-format-programmatically)
- [Cell_Type](https://learn.microsoft.com/openspecs/sharepoint_protocols/ms-vsdx/6f23bcc4-af93-4023-a380-3e78a228e166)
- [Master-to-Shape Inheritance](https://learn.microsoft.com/openspecs/sharepoint_protocols/ms-vsdx/74428617-9833-4d73-aa7f-f3a6f043a12d)
- [Connect element](https://learn.microsoft.com/office/client-developer/visio/connect-element-connects_type-complextypevisio-xml)