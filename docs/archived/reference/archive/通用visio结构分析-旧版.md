# 通用 Visio 结构分析

一份 `.vsdx` 文件本质上是一个规范 zip。把它解压开，内部结构如下。

## 第一章 解压后的一级结构

以一份由 Visio 保存、带缩略图和多个母版的图纸为例：

```
xxx.vsdx（规范 zip）
│
├── [Content_Types].xml     ← 包内文件的类型登记表（第二章详述）
│
├── _rels/
│   └── .rels               ← 包级关系表：包内几个主要文件之间的引用关系
│
├── docProps/               ← 文档属性（档案信息，与画面内容无关）
│   ├── core.xml            ←   核心属性：标题、作者等
│   ├── app.xml             ←   应用属性：生成软件、版本
│   ├── custom.xml          ←   自定义属性
│   └── thumbnail.emf       ←   封面图（文件管理器/预览用）
│
└── visio/                  ← 图纸内容
    ├── document.xml        ← 文档主体：样式表、字体、配色、全局设置
    ├── windows.xml         ← 窗口布局
    │
    ├── pages/              ← 页面区
    │   ├── pages.xml       ←   页目录：每页的名称与纸张大小
    │   ├── page1.xml       ←   第 1 页内容：形状与连线
    │   └── _rels/          ←   页面部件的关系表
    │
    └── masters/            ← 母版区（形状模板库）
        ├── masters.xml     ←   母版目录：母版 ID 与名称
        ├── master1.xml     ←   母版内容（如"矩形"的形状定义）
        └── …               ←   每个母版一个文件
```

要点：

- 图纸内容拆成多个部件文件，互相之间通过 `.rels` 关系表引用，而非直接内嵌；
- 这是 Office 系文件（docx/xlsx/vsdx）的通用设计，便于部件复用与替换；
- 内容随图纸变化的部分：`masterN.xml` 数量（母版数）、`pageN.xml` 数量（页数）、
  是否带 `thumbnail.emf`（本工具生成的暂不带，Visio 打开保存后会补上）。

## 第二章 Content_Types.xml

### 2.1 作用

`[Content_Types].xml` 登记包内每个文件应被解析为什么类型。解析器打开包时先读
它，才能知道 `master1.xml` 是母版定义、`page1.xml` 是页面内容——两者都是 XML
文本，但身份不同。

这份登记跟随包的实际内容：包里有什么文件，表里就有什么条目。

### 2.2 实例（Visio 保存的图纸）

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <!-- Default：按文件后缀登记类型 -->
    <Default Extension="emf"  ContentType="image/x-emf"/>
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml"  ContentType="application/xml"/>
    <!-- Override：逐一点名特殊部件 -->
    <Override PartName="/visio/document.xml"     ContentType="application/vnd.ms-visio.drawing.main+xml"/>
    <Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>
    <Override PartName="/visio/masters/master1.xml" ContentType="application/vnd.ms-visio.master+xml"/>
    <Override PartName="/visio/pages/pages.xml"  ContentType="application/vnd.ms-visio.pages+xml"/>
    <Override PartName="/visio/pages/page1.xml"  ContentType="application/vnd.ms-visio.page+xml"/>
    <Override PartName="/visio/windows.xml"      ContentType="application/vnd.ms-visio.windows+xml"/>
    <Override PartName="/docProps/core.xml"      ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml"       ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
    <Override PartName="/docProps/custom.xml"    ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
</Types>
```

逐行说明：

| 条目 | 说明 |
| --- | --- |
| `Default emf` | 后缀 `.emf` 的文件为图片（此处指封面图） |
| `Default rels` | 后缀 `.rels` 的文件为关系表 |
| `Default xml` | 其余 `.xml` 文件按普通 XML 处理 |
| `Override /visio/document.xml` | 绘图主文件 |
| `Override masters.xml` | 母版目录 |
| `Override master1.xml` | 单份母版内容（每多一个母版多一行） |
| `Override pages.xml` | 页目录 |
| `Override page1.xml` | 单页内容（每多一页多一行） |
| `Override windows.xml` | 窗口布局 |
| `Override core.xml / app.xml / custom.xml` | 三份文档属性文件 |

### 2.3 规律

- 图纸的**骨架部件固定**：主文件、页目录、母版目录、窗口、三份属性文件
  在任何 vsdx 中都存在，因此这些 Override 行不变；
- 变化的只有两处：母版/页面的**数量**（随包内部件增减条目），以及包内出现
  其它扩展名文件（如封面图 `.emf`）时补充对应的 Default；
- 类型值（`application/...`、`image/...`）是 MIME 类型标签；解析能力由打开方
  （Visio 等）内置，本文件只负责给每个文件贴上正确的类型标签。

## 第三章 _rels/.rels —— 关系表

### 3.1 作用

Content_Types 回答"每个文件是什么类型"，关系表回答"**文件之间谁引用谁**"。
包内每个部件旁边都有 `_rels/<部件名>.rels`；包根目录的 `_rels/.rels` 管理
顶层结构——主文档、属性文件、封面图之间的引用。解析器从它开始，才能顺着
引用逐级找到其它部件。

### 3.2 实例（Visio 保存的图纸，包根 _rels/.rels）

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.emf"/>
    <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>
    <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>
    <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
```

每条关系三个属性：

| 属性 | 含义 |
| --- | --- |
| `Id` | 本文件内的引用别名（rId1、rId2…）；**顺序与编号无意义**，只是别名 |
| `Type` | 关系类型 URI，说明"这条关系是干什么的"（见下） |
| `Target` | 指向的部件路径，**相对本文件所在目录**（这里即包根） |

各行含义：

| Id | Type 判断依据 | 指向 | 说明 |
| --- | --- | --- | --- |
| rId1 | `.../visio/2010/relationships/document`（Visio 专有） | `visio/document.xml` | **绘图主文件**——包内最重要的一条 |
| rId2 | `.../package/2006/relationships/metadata/thumbnail`（OPC 通用） | `docProps/thumbnail.emf` | 封面图 |
| rId3 | `.../metadata/core-properties` | `docProps/core.xml` | 核心属性（标题/作者） |
| rId4 | `.../officeDocument/2006/relationships/extended-properties`（Office 通用） | `docProps/app.xml` | 应用属性 |
| rId5 | `.../custom-properties` | `docProps/custom.xml` | 自定义属性 |

Type 前缀即关系归属：

- `schemas.microsoft.com/visio/2010/relationships/` — Visio 专有关系
  （document / masters / pages / windows 等）；
- `schemas.openxmlformats.org/package/2006/relationships/` — OPC 包通用关系
  （core-properties、thumbnail 等）；
- `schemas.openxmlformats.org/officeDocument/2006/relationships/` — Office 通用
  关系（extended/custom-properties 等）。

### 3.3 关系是分层的

包根 `.rels` 只指到主文档与属性，不直接管页面、母版——它们由主文档自己的
关系表继续往下指：

```
_rels/.rels（包根）
  └─ rId: document ───────────► visio/document.xml
                                  └─ visio/_rels/document.xml.rels
                                       ├─ rId: masters ► masters/masters.xml
                                       │                    └─ masters/_rels/masters.xml.rels
                                       │                         └─ master1.xml, master2.xml …
                                       ├─ rId: pages ► pages/pages.xml
                                       │              └─ pages/_rels/pages.xml.rels
                                       │                   └─ page1.xml …
                                       └─ rId: windows ► windows.xml
```

解析器打开一份 vsdx 的路径就是沿这条链走：读包根 `.rels` → 找到主文档 →
读它的 `.rels` → 找到页面与母版 → 渲染时按页面形状的 `Master=` 引用取用母版。

### 3.4 Type 是匹配键，不是网址

Type 值是 URI 形式的**字符串常量**，不是可访问的网址——没有任何程序会去访问它，
点击打不开是正常的。它的作用是让解析器按**字符串精确相等**判定关系语义：
例如包根 `.rels` 中 `Type` 等于
`http://schemas.microsoft.com/visio/2010/relationships/document` 的那一条，
就是主文档。因此：

- Type **必须固定**，由规范定义，解析器代码按写死的期望值匹配；
- Type **不能为空或改乱**——解析器将无法识别该关系（主文档那条若失效，
  文件打不开）；三个前缀（Visio/OPC/Office）是三个命名空间，解析器只匹配
  自己关心的条目，其余忽略。

## 第四章 docProps —— 文档属性

docProps 存放文件的属性信息，与画面内容无关，供文件管理器、搜索、文档库等
读取。共四件：三份 XML（core / app / custom）+ 一份二进制封面（thumbnail.emf）。

### 4.1 core.xml —— 核心属性

```xml
<cp:coreProperties …dc:、dcterms:、cp: 等五个命名空间…>
    <dc:title></dc:title>
    <dc:subject></dc:subject>
    <dc:creator>示例用户</dc:creator>
    <cp:keywords></cp:keywords>
    <dc:description></dc:description>
    <cp:lastPrinted>2026-09-04T08:40:03Z</cp:lastPrinted>
    <dcterms:created xsi:type="dcterms:W3CDTF">2026-09-04T08:40:03Z</dcterms:created>
    <dcterms:modified xsi:type="dcterms:W3CDTF">2026-09-04T08:41:46Z</dcterms:modified>
    <cp:category></cp:category>
    <dc:language>zh-CN</dc:language>
</cp:coreProperties>
```

逐数据元：

| 元素 | 内容 | 说明 |
| --- | --- | --- |
| `dc:title` | 空 | 文档标题（资源管理器/文档库显示的"标题"列） |
| `dc:subject` | 空 | 主题 |
| `dc:creator` | 示例用户 | 作者，取自系统账户名 |
| `cp:keywords` | 空 | 关键词（搜索用） |
| `dc:description` | 空 | 备注/说明 |
| `cp:lastPrinted` | 时间 | 最后一次打印时间 |
| `dcterms:created` | 时间 | 创建时间（W3CDTF/UTC，`xsi:type` 标注格式） |
| `dcterms:modified` | 时间 | 最后修改时间 |
| `cp:category` | 空 | 分类 |
| `dc:language` | zh-CN | 文档语言 |

要点：`dc:`/`dcterms:` 是 Dublin Core 标准前缀，`cp:` 是 OPC 扩展——字段集由
规范固定、跨应用通用（Word/Excel/Visio 同款）；**空值也照写元素**；创建/修改
时间由应用保存时更新。

### 4.2 app.xml —— 应用属性

```xml
<Properties xmlns="…/officeDocument/2006/extended-properties" xmlns:vt="…/docPropsVTypes">
    <Template></Template>
    <Application>Microsoft Visio</Application>
    <ScaleCrop>false</ScaleCrop>
    <HeadingPairs><vt:vector size="4" baseType="variant">…页×1、主控形状×1…</vt:vector></HeadingPairs>
    <TitlesOfParts><vt:vector size="2" baseType="lpstr">…页-1、矩形…</vt:vector></TitlesOfParts>
    <Manager></Manager>
    <Company></Company>
    <LinksUpToDate>false</LinksUpToDate>
    <SharedDoc>false</SharedDoc>
    <HyperlinkBase></HyperlinkBase>
    <HyperlinksChanged>false</HyperlinksChanged>
    <AppVersion>16.0000</AppVersion>
</Properties>
```

逐数据元：

| 元素 | 内容 | 说明 |
| --- | --- | --- |
| `Template` | 空 | 基于哪个模板新建（空=无） |
| `Application` | Microsoft Visio | 生成软件名 |
| `ScaleCrop` | false | 缩略图是否强制按比例缩放裁剪 |
| `HeadingPairs` | 页×1、主控形状×1 | 文档结构统计前半：**类别—数量**配对（vt:vector 变体数组） |
| `TitlesOfParts` | 页-1、矩形 | 文档结构统计后半：**按类别列出名字**，与 HeadingPairs 合读 |
| `Manager` | 空 | 负责人（档案字段，用户可填） |
| `Company` | 空 | 公司（档案字段） |
| `LinksUpToDate` | false | 文档内链接是否已更新到最新 |
| `SharedDoc` | false | 是否共享协作文档 |
| `HyperlinkBase` | 空 | 相对超链接的基准路径 |
| `HyperlinksChanged` | false | 超链接是否被手工改动过 |
| `AppVersion` | 16.0000 | 应用主版本（16 = Office 2016 及以后家族） |

要点：字段由**应用自己定义**（各 Office 应用写各自的栏目），作用是"软件身份 +
内容统计"——`HeadingPairs`/`TitlesOfParts` 让属性对话框、文档库不打开文件就能
显示页数、母版数等。

### 4.3 custom.xml —— 自定义属性

```xml
<Properties xmlns="…/officeDocument/2006/custom-properties" xmlns:vt="…/docPropsVTypes">
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="_VPID_ALTERNATENAMES">
        <vt:lpwstr></vt:lpwstr></property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="BuildNumberCreated">
        <vt:i4>1073762150</vt:i4></property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="4" name="BuildNumberEdited">
        <vt:i4>1073762150</vt:i4></property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="5" name="IsMetric">
        <vt:bool>true</vt:bool></property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="6" name="TimeEdited">
        <vt:filetime>2026-09-04T08:41:11Z</vt:filetime></property>
</Properties>
```

条目机制（每个 `<property>` 的固定壳）：

| 属性 | 内容 | 说明 |
| --- | --- | --- |
| `fmtid` | `{D5CDD505-…}` | 固定 GUID：Office 文档属性格式标识，所有 Office 文档相同 |
| `pid` | 2 起递增 | 条目序号（1 保留给容器） |
| `name` | 任意键名 | 属性名，读写方按名约定 |
| 值元素 | `vt:lpwstr`/`vt:i4`/`vt:bool`/`vt:filetime` | 按值类型选择：文本/整数/布尔/文件时间 |

本例条目（Visio 自己记录的运行状态）：

| name | 值 | 说明 |
| --- | --- | --- |
| `_VPID_ALTERNATENAMES` | 空 | Office 保留占位条目（别名机制用） |
| `BuildNumberCreated` | 1073762150 | 创建时应用的内部构建号（精确到补丁级） |
| `BuildNumberEdited` | 1073762150 | 最后编辑时应用的构建号 |
| `IsMetric` | true | 单位制：true=公制（影响标尺/网格默认单位） |
| `TimeEdited` | 时间 | 应用侧记录的编辑时间（与 core 的 modified 双轨） |

要点：这是**自由扩展区**——core 字段标准固定不可加、app 字段随应用定也不可
私加，应用/第三方要存"自己的键值对"就写在这里，任意 name 均可。

### 4.4 thumbnail.emf —— 封面图（二进制）

不是 XML，无法贴文本解析。它是 **EMF（增强型图元文件）**——一种矢量绘图格式，
由 Visio 保存时把首页渲染进去，供文件管理器/预览显示。文件头取证：

```
size: 20460 B
signature: 0x464D4520  = " EMF"（ASCII）
rclBounds: 94 × 69      （逻辑范围，设备单位）
rclFrame:  1267 × 927   （物理尺寸，0.01mm → 12.67 × 9.27 cm，即页面大小）
```

- 用矢量格式（而非 png/jpeg）保存缩略图，缩放不损失；
- 该部件非必需：缺失时文件可正常打开，Visio 保存时会补生成。

## 第五章 visio —— 图纸内容部件

visio/ 目录下的部件承载图纸本体。按打开解析的顺序逐个研究：
document.xml（文档主体）、pages/（页面）、masters/（母版）、windows.xml（窗口布局）。

### 5.1 windows.xml —— 窗口布局

#### 5.1.1 作用

windows.xml 是**界面记忆文件**：记录上次关闭时 Visio 的窗口布局——主绘图窗口的
位置尺寸、视图缩放与中心、标尺/网格等开关、粘附/吸附设置、以及停靠了哪些模具
窗口。下次打开时尽量还原现场。它**不影响文档内容与渲染**，纯属使用体验；
由 document.xml.rels 中的 windows 关系引用。

#### 5.1.2 实例（Visio 保存的图纸）

```xml
<Windows ClientWidth='2560' ClientHeight='1315' …xmlns…>
    <Window ID='0' WindowType='Drawing' WindowState='1073741824'
            WindowLeft='-9' WindowTop='-38' WindowWidth='2578' WindowHeight='1362'
            ContainerType='Page' Page='0' ViewScale='1'
            ViewCenterX='2.2596784055742' ViewCenterY='8.362040415546'>
        <ShowRulers>1</ShowRulers>
        <ShowGrid>0</ShowGrid>
        <ShowPageBreaks>1</ShowPageBreaks>
        <ShowGuides>1</ShowGuides>
        <ShowConnectionPoints>1</ShowConnectionPoints>
        <GlueSettings>9</GlueSettings>
        <SnapSettings>65847</SnapSettings>
        <SnapExtensions>34</SnapExtensions>
        <SnapAngles/>
        <DynamicGridEnabled>1</DynamicGridEnabled>
        <TabSplitterPos>0.5</TabSplitterPos>
    </Window>
    <Window ID='1' WindowType='Stencil' WindowState='67109889'
            WindowLeft='-351' WindowTop='-10' WindowWidth='342' WindowHeight='1045'
            Document='C:\Program Files\…\BASIC_M.vssx' ParentWindow='0'>
        <StencilGroup>10</StencilGroup>
        <StencilGroupPos>1</StencilGroupPos>
    </Window>
</Windows>
```

#### 5.1.3 逐数据元

根元素：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| `ClientWidth` / `ClientHeight` | 2560 × 1315 | 保存时 Visio 窗口客户区尺寸（像素），用于还原窗口大小 |

`WindowType='Drawing'`（主绘图窗口）的属性：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| `ID` | 0 | 窗口编号（其它窗口用 ParentWindow 引用它） |
| `WindowType` | Drawing | 窗口种类：Drawing=绘图画布 / Stencil=模具坞窗 / 还有 Page/Sheet 等 |
| `WindowState` | 1073741824 | 窗口状态位掩码（最大化/激活等组合，内部维护，不手读） |
| `WindowLeft/Top/Width/Height` | -9/-38/2578/1362 | 窗口在屏幕的位置尺寸（像素；负值=窗口探出屏幕边缘，多屏常见） |
| `ContainerType` / `Page` | Page / 0 | 该窗口容纳的内容：页面 0（引用 pages.xml 的 Page ID） |
| `ViewScale` / `ViewCenterX/Y` | 1 / 页面坐标 | 视图缩放与中心（英寸），还原上次的浏览位置 |

子元素（显示与交互开关）：

| 元素 | 值 | 说明 |
| --- | --- | --- |
| `ShowRulers` / `ShowGrid` / `ShowPageBreaks` | 1 / 0 / 1 | 标尺/网格/分页虚线 显示开关 |
| `ShowGuides` / `ShowConnectionPoints` | 1 / 1 | 参考线/连接点 显示开关 |
| `GlueSettings` | 9 | 粘附（glue）开关位掩码（读法见 5.1.4） |
| `SnapSettings` | 65847 | 吸附（snap）开关位掩码（读法见 5.1.4） |
| `SnapExtensions` | 34 | 吸附扩展位掩码 |
| `SnapAngles` | 空 | 自定义吸附角度列表（空=无自定义） |
| `DynamicGridEnabled` | 1 | 动态网格开关 |
| `TabSplitterPos` | 0.5 | 窗口标签分隔条位置（比例） |

`WindowType='Stencil'`（模具坞窗）的属性：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| `WindowState` | 67109889 | 停靠状态位掩码 |
| `WindowLeft/Top/Width/Height` | -351/-10/342/1045 | 坞窗位置尺寸 |
| `Document` | `C:\…\BASIC_M.vssx` | 该坞窗显示的**外部模具文件路径**（绝对路径字符串） |
| `ParentWindow` | 0 | 停靠归属：父窗口为绘图窗口 0 |
| `StencilGroup` / `StencilGroupPos` | 10 / 1 | 模具坞窗组：组号与组内位置（多模具叠放时标签次序） |

#### 5.1.4 位掩码字段怎么读（GlueSettings/SnapSettings/WindowState 等）

这类字段的"开关"不是单个 0/1，而是一**组**开关：每个开关占整数的一个二进制位
（位 n 的权值 = 2^n），一个整数打包整组。好处：一组开关只占一个字段，便于
整体保存与比较。判断某个开关是否开启，用**位与**运算，而不是比大小：

```js
value & 8      // 非 0 → 位 3（权值 8）的开关开着
```

以 5.1.2 实例中的三个值为例，拆成二进制：

| 字段 | 十进制 | 二进制（置位） | 开了哪些位 |
| --- | --- | --- | --- |
| `GlueSettings` | 9 | `0b1001` | 位 0（1）+ 位 3（8） |
| `SnapExtensions` | 34 | `0b100010` | 位 1（2）+ 位 5（32） |
| `SnapSettings` | 65847 | `0b…0110111` | 位 0/1/2/4/5/8/16 |
| `WindowState` | 1073741824 | `0x40000000` | 仅位 30（单一状态标志） |

Visio 给 `GlueSettings` 的各位定义（位义表，文档级与窗口级同义）：

| 位 | 权值 | 含义 |
| --- | --- | --- |
| 0 | 1 | 粘附到形状几何 |
| 1 | 2 | 粘附到参考线 |
| 2 | 4 | 粘附到手柄 |
| 3 | 8 | 粘附到顶点 |
| 4 | 16 | 粘附到连接点 |
| 5 | 32 | 粘附到页面 |

所以 `9 = 1 + 8` = "粘到形状几何 + 粘到顶点"开启。`SnapSettings` 的项更多
（吸附到标尺/网格/参考线/几何/顶点/连接点等十余项），同样每项一位，完整位义
见 Visio ShapeSheet 文档（GlueSettings/SnapSettings cell）。

结论：这些数值是 Visio 界面勾选后由程序算好写入的，**人不宜手工改**——
直接改 65847 无法知道动了哪些开关。

#### 5.1.5 要点

- 这份文件是**记忆而非内容**：删掉或写错都不影响图纸本身（渲染不读它）；
- 数值多为**位掩码**（WindowState/Glue/Snap 系，读法见 5.1.4）——Visio 内部
  维护，人不宜手工改；
- Stencil 窗口的 `Document` 是**外部路径**，不是包内引用：文件在/路径有效就还原
  坞窗，找不到就跳过——属"尽力还原"语义；
- 视图还原靠 `ViewScale` + `ViewCenterX/Y`（页面坐标）+ 各显示开关。

### 5.2 document.xml —— 文档主体

> 剖析对象：`docs/research/document.xml`（标准 Visio 保存的完整文档主体，42KB；
> 经 `Content_Types` 标记为 drawing.main，由包根 .rels 引用）。

#### 5.2.1 顶层结构总览

`<VisioDocument>` 的顶层子元素按固定顺序出现，共五个：

```
VisioDocument（xmlns=visio 主命名空间 + xmlns:r=关系命名空间）
├── DocumentSettings   文档级设置（默认样式引用 + 粘附/吸附/保护开关）
├── Colors             颜色表（ColorEntry 列表，供 cell 按索引取色）
├── FaceNames          字体表（文档用到的字体声明）
├── StyleSheets        样式表集合（每种"样式"=一组默认 Cell，形状按索引引用）
└── DocumentSheet      文档自身的形状表（NameU=TheDoc，放文档级行为与数据）
```

顺序即解析顺序：设置 → 颜色 → 字体 → 样式 → 文档形状表。各节之下可继续深入
（见 5.2.2 起的逐元素小节；每个元素内部如需再分，按 5.2.x.y 继续下钻）。

#### 5.2.2 DocumentSettings —— 文档级设置

```xml
<DocumentSettings TopPage="0" DefaultTextStyle="3" DefaultLineStyle="3"
                  DefaultFillStyle="3" DefaultGuideStyle="4">
```

属性：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| `TopPage` | 0 | 打开时显示第几页（页 ID） |
| `DefaultTextStyle` / `DefaultLineStyle` / `DefaultFillStyle` | 3 | 新建形状默认套用的 文本/线/填充 样式索引（3=Normal） |
| `DefaultGuideStyle` | 4 | 参考线的默认样式索引（4=Guide） |

子元素（9 个，与 windows.xml 窗口内同名设置同源）：

| 元素 | 值 | 说明 |
| --- | --- | --- |
| `GlueSettings` | 9 | 粘附开关位掩码（读法见 5.1.4） |
| `SnapSettings` | 65847 | 吸附开关位掩码（读法见 5.1.4） |
| `SnapExtensions` | 34 | 吸附扩展位掩码（读法见 5.1.4） |
| `SnapAngles` | 空 | 自定义吸附角度（空=无） |
| `DynamicGridEnabled` | 1 | 动态网格开关 |
| `ProtectStyles` / `ProtectShapes` / `ProtectMasters` / `ProtectBkgnds` | 0 | 文档保护：样式/形状/母版/背景 是否锁定 |

> 这里的默认样式属性（3、3、3、4）与 StyleSheets 的 ID 一一对应——形状不带
> 显式样式时即落到文档默认。

补充（规范结论）：

- 属性全集即上述 5 项，**没有更多**（无"默认连接线样式"之类——连接线也是
  形状，同样套 Text/Line/Fill 三默认）；全部可选（Optional int）；
- 语义：用户下次用绘图工具新建形状/参考线时，形状从指定 StyleSheet 继承对应
  样式（DefaultGuideStyle 专指新建参考线）；
- `TopPage` 只在文档无 Window 元素时生效——有 Window 时以其 `Page` 属性为准；
- 子元素除 9 个开关外，可选 `CustomMenusFile/CustomToolbarsFile/AttachedToolbars`
  （旧版菜单/工具栏定制，现代基本不写）；
- **索引值无全局标准**：属性名与语义由规范定义，但 `3=Normal/4=Guide` 仅是
  指向本文档 StyleSheets 的索引，随样式表布局而定（实测各样本一致属同源惯例）。

#### 5.2.3 Colors —— 颜色表

```xml
<Colors>
    <ColorEntry IX="24" RGB="#7F7F7F"/>
</Colors>
```

- `ColorEntry` 一项一色：`IX`=索引号（cell 中 `V="5"` 一类颜色引用即查此表），
  `RGB`=颜色值；
- 本样本仅 1 条（#7F7F7F，灰）——Visio 保存时会按实际用色精简颜色表；
  形状直接给 `#RRGGBB` 的 cell 不依赖此表。

#### 5.2.4 FaceNames —— 字体表

```xml
<FaceNames>
    <FaceName NameU="SimSun" UnicodeRanges="515 680460288 6 0"
              CharSets="262145 0" Panose="2 1 6 0 3 1 1 1 1 1" Flags="421"/>
</FaceNames>
```

- 文档实际使用过的字体在此声明（本例：SimSun 宋体）；
- 一条 `FaceName` = 一种字体；属性从五个维度描述它：名字、Unicode 覆盖、
  字符集、Panose 外观分类、标志位——供渲染端做字体匹配与回退。

五个字段逐个展开（取值即本例 SimSun）：

**`NameU`** —— 字体名

```
NameU="SimSun"
```

字体标识名（本例宋体）。渲染端按名字向系统请求字体；名字对不上时再用下面
四个字段找"最像的替代字体"。

**`UnicodeRanges`** —— Unicode 区块覆盖位图（4 个 32 位整数 = 128 位）

```
UnicodeRanges="515 680460288 6 0"
```

- 每个 32 位整数是一段位图，4 段共 128 位；**每位对应一个 Unicode 区块**
  （Windows 字体 OS/2 表 ulUnicodeRange 的位图约定），某位=1 表示字体含该区块
  字形。渲染端据此快速判断"这字体有没有我要的字形"，决定是否可用/回退。
- 本例拆解（十六进制 + 置位）：

| 段 | 值 | 十六进制 | 置位 | 大致区块含义 |
| --- | --- | --- | --- | --- |
| 1 | 515 | `0x203` | bit 0/1/9 | 基本拉丁、拉丁-1 补充及周边 |
| 2 | 680460288 | `0x288F0000` | bit 16/17/18/19/23/27/29 | CJK 系列区块（汉字字形集中在这里） |
| 3 | 6 | `0x6` | bit 1/2 | 扩展区块若干 |
| 4 | 0 | `0x0` | 无 | — |

（宋体覆盖拉丁 + CJK 字形，正是这份位图要表达的信息。）

**`CharSets`** —— 字符集覆盖位图（2 个 32 位整数 = 64 位）

```
CharSets="262145 0"
```

- 同样是位图：**每位对应一种字符集**（ANSI、GB2312、BIG5、DEFAULT 等），
  表示字体支持的代码页/字符集。本例 `262145 = 0x40001` = bit 0 + bit 18：
  常用单字节集 + 高位中文相关字符集位（宋体同时服务 ANSI 与中文环境）。
- 用途同 UnicodeRanges：匹配/回退的另一个判断维度。

**`Panose`** —— 外观分类（10 个字节）

```
Panose="2 1 6 0 3 1 1 1 1 1"
```

- Panose 是一套**字体外观分类标准**：10 个数字依次描述——家族类型、衬线样式、
  字重、比例、对比度、笔画差异、臂式、字母形态、中线位置、字高（各字节含义
  按 Panose 规范定义）。
- 本例：`2`=家族类型（衬线系文本字体）、`1`=衬线样式（无衬线细节/旧式）、
  `6`=字重（中等等级）——整体描述"宋体这类带衬线的正文汉字字体"的外观特征。
- 用途：渲染端在字体缺失时，按 Panose 找外观最接近的替代字体（而不是随便换
  一个风格迥异的）。

**`Flags`** —— 字体属性标志位

```
Flags="421"   = 0x1A5 → bit 0/2/5/7/8
```

- 位标志集合，描述字体的属性（如是否为嵌入字体、来源、替换许可等）；
- 本例置位 5 个（421 = 0x1A5）。完整位义以 Visio 规范（FaceName 定义）为准，
  渲染端按位判断字体处理方式。


#### 5.2.5 StyleSheets —— 样式表集合

样式 = 一组**默认 Cell**（线/填充/文本/锁定的全套默认值），供形状按索引引用；
形状上的 `LineStyle="3"`、`FillStyle="3"` 即此表 ID。

| ID | NameU | Name | 说明 |
| --- | --- | --- | --- |
| 0 | No Style | 无样式 | 全套默认（258 Cell + 5 Section：Character/Paragraph/Tabs/LineGradient/FillGradient） |
| 1 | Text Only | 纯文本 | 文本专用（47 Cell + Character 节） |
| 2 | None | 无 | 无任何外观（48 Cell） |
| 3 | Normal | 正常 | 常规（13 Cell）——文档默认样式指向它 |
| 4 | Guide | 参考线 | 参考线样式（86 Cell + 1 Section） |
| 6 | Theme | 主题 | 主题承载（83 Cell + 3 Section） |

上表即 Visio 模板的**编号惯例**；两个要点：

- ID=5 惯例空缺不用；
- **ID=7 及以上的名字不固定**——实测三份文档各不相同：官方参照（sequence/gantt）
  的 ID=7 是 `Connector`（连接线），另一些模板里是 `Basic`（基本），标准版
  （docs/research/document.xml）则完全没有 ID=7。

因此默认样式属性（DefaultTextStyle 等）的**值域不是枚举**：可取本文档样式表
中的任意 ID（也可指向不存在 ID）；`3=Normal、4=Guide` 只是模板同源惯例，
形状上写 `LineStyle="7"` 在这份文档是"连接线"、在另一份可能是"基本"——
样式表跟着文档走，索引仅文档内有效。

**数量规律**：样式表集合 = 模板基底 + 追加项。

- 模板基底 = ID 0–6 这套（0 No Style / 1 Text Only / 2 None / 3 Normal /
  4 Guide / 6 Theme；ID=5 空缺），外加**可有可无的 ID=7**（有则名字随文档：
  Connector 或 Basic 等）——所以"最基础默认"的文档一般就是 6~7 个；
- 用户自定义样式（在 Visio 中新建并套用）会**追加新 StyleSheet**（ID 从 8
  起递增）；带预设的模板也可能预置额外样式；
- 程序（ShapeSheet API）可动态增删样式表——集合不是固定不变的，
  但删除基底会导致既有索引悬空，Visio 默认不动它们。

以 ID=0 为例，其 Cell 按族分类：

| 族 | Cell | 说明 |
| --- | --- | --- |
| 开关 | `EnableLineProps/FillProps/TextProps/HideForApply` | 该样式是否开放线/填充/文本属性、是否隐藏于列表 |
| 线 | `LineWeight/LineColor/LinePattern/Rounding/LineCap/BeginArrow/EndArrow/…Trans/CompoundType` | 线宽色型、箭头、透明度 |
| 填充 | `FillForegnd/FillBkgnd/FillPattern/Shdw*` | 前景/背景/阴影系列 |
| 文本块 | `LeftMargin…BottomMargin/VerticalAlign/TextBkgnd/TextBkgndTrans/DefaultTabStop/TextDirection` | 文本块边距/对齐/背景 |
| 锁定 | `LockWidth/Height/MoveX/…/ThemeColors` | 形状编辑锁定位 |

（样式 Cell 与形状 Cell 同名同义——样式是"默认值包"，形状不写则继承。）

#### 5.2.6 DocumentSheet —— 文档形状表

```xml
<DocumentSheet NameU="TheDoc" IsCustomNameU="1" Name="TheDoc" IsCustomName="1"
               LineStyle="0" FillStyle="0" TextStyle="0">…</DocumentSheet>
```

**它是什么**：文档自身也有一张"形状表"——结构与 Shape/PageSheet 同构
（属性里同样带 LineStyle/FillStyle/TextStyle 样式引用，体内是 Cell + Section）。
它没有可见几何，专门承载**文档级的行为 cell 与数据**；NameU 固定为 `TheDoc`。

**样式引用**：`LineStyle/FillStyle/TextStyle=0`——文档自身套用 No Style（0），
即文档级默认不含任何外观含义（它没有形状要画）。

**逐 Cell（取值 = 实测标准版与官方参照，两份完全一致）**：

| Cell | 实测值 | 单位 | 取值意义（0/1 或枚举） | 作用与影响 |
| --- | --- | --- | --- | --- |
| `OutputFormat` | 0 | — | 0=默认输出目标（自动） | 文档面向的输出形态（打印/屏幕等）；枚举见官方 OutputFormat cell |
| `LockPreview` | 0 | — | 0=预览未锁定：改动后保存会**自动重生成缩略图**；1=锁定：缩略图保持现状不再更新 | 想固定预览内容（如封面示意）时置 1；可用 `GUARD(TRUE)` 防程序改 |
| `PreviewQuality` | 0 | — | 0=默认质量 | 生成缩略图的画质档位（影响 4.4 thumbnail.emf 体积/清晰度） |
| `PreviewScope` | 0 | — | **0=仅首页** / 1=无预览 / 2=全部页（官方枚举：visDocPreviewScope1stPage/None/AllPages） | 决定缩略图含哪些页 |
| `AddMarkup` | 0 | — | **0=非审阅**（默认）：改动直接作用于原图页；**1=审阅中**：改动写到批注覆盖页、原图不动 | 对应"审阅"选项卡的 Track Markup 开关；可用 `=GUARD(FALSE)` 禁用它 |
| `ViewMarkup` | 0 | — | **0=不显示批注**（默认）；**1=显示批注** | 对应"视图"菜单的 Markup 开关；AddMarkup=1 时强制为 1；插入批注也会置 1 |
| `DocLockReplace` | 0 | BOOL | 0=允许替换文档内容；1=锁定禁止 | 保护文档不被整体替换（如模板分发时防篡改） |
| `DocLockDuplicatePage` | 0 | BOOL | 0=允许复制页；1=锁定禁止 | 禁止用户复制本文件的页 |
| `NoCoauth` | 0 | BOOL | 0=允许协同编辑；1=禁止 | 关闭共同编辑（如含宏/敏感内容时） |
| `DocLangID` | zh-CN | — | 语言标签 | 文档语言（拼写检查等语言特性按它） |

> 注：实测值全是 0/zh-CN = **默认关闭态**——即新文档的"出厂设置"；
> 前四行（LockPreview/PreviewQuality/PreviewScope）直接控制 4.4 的 thumbnail.emf
> 生成策略；AddMarkup/ViewMarkup 控制批注机制（ViewMarkup 定义见
> [Visio SDK](https://learn.microsoft.com/zh-cn/previous-versions/office/developer/office-2010/ff765359(v=office.14))，
> PreviewScope 枚举见 [PreviewScope Cell](https://learn.microsoft.com/ko-kr/previous-versions/office/developer/office-2007/ms406462(v=office.12))）。

**Section User**：文档级 User 行（语义同形状内 User 段——具名行存文档自己的
数据或公式）。实测内容：

```xml
<Section N="User">
    <Row N="msvNoAutoConnect">
        <Cell N="Value" V="1"/>
        <Cell N="Prompt" V="" F="No Formula"/>
    </Row>
</Section>
```

- 行名 `msvNoAutoConnect`——`msv` 前缀是 Visio 私有行的命名惯例；
- 值 1：关闭该文档的自动连接行为（Visio 内部开关）；
- User 段本身是开放扩展点：其它程序可在此加自己的具名行。

### 5.3 document.xml 的关系表（_rels）

第三章讲过包根的 `_rels/.rels`；每个"目录级"部件旁也有一张自己的
`_rels/<部件名>.rels`（document / pages / masters 各一张，各自躺在本部件的
`_rels/` 目录里）。机制与包根相同（Type/Target/相对路径，见 3.2/3.3），
区别只在服务对象与内容。document.xml 的表见 5.3.1；masters 区与页面区的表
分别在 5.4.1 / 对应页面小节讲解。

#### 5.3.1 document.xml.rels —— 主文档的关系表

```xml
<Relationships xmlns="…/package/2006/relationships">
    <Relationship Id="rId3" Type="http://schemas.microsoft.com/visio/2010/relationships/windows"
                  Target="windows.xml"/>
    <Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/pages"
                  Target="pages/pages.xml"/>
    <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/masters"
                  Target="masters/masters.xml"/>
</Relationships>
```

位置在 `visio/_rels/document.xml.rels`。

**它解决什么**：主文档是整份图纸的枢纽——它向下接母版区与页面区、平级接窗口
布局。这张表登记这三个去向：

| Id | Type | Target | 说明 |
| --- | --- | --- | --- |
| rId1 | `…/relationships/masters`（复数） | `masters/masters.xml` | 母版**目录** |
| rId2 | `…/relationships/pages`（复数） | `pages/pages.xml` | 页面**目录** |
| rId3 | `…/relationships/windows` | `windows.xml` | 窗口布局 |

要点：

- 全部 Type 为 Visio 专有前缀；Target 相对 document.xml 所在目录（visio/），
  所以子目录目标带前缀（`pages/pages.xml`）、平级目标不带（`windows.xml`）；
- **单复数规律**：指向"目录"用复数关系（`masters`/`pages`，目标为
  masters.xml/pages.xml），指向"单份内容"用单数关系（`master`/`page`，
  见 5.4.1 与页面区）——Type 名词与目标层级一一对应；
- 打开时这条链完整走法：包根 `.rels` → document.xml → 本表 →
  masters.xml / pages.xml / windows.xml，再各自沿自己的 rels 继续深入；
- rId 顺序乱写（3/2/1）再次说明编号只是别名。

### 5.4 masters —— 母版区

```
visio/masters/
├── masters.xml             母版目录：每条目 = 母版 ID + 名称 + Rel r:id
├── _rels/masters.xml.rels  目录的关系表：rId → masterN.xml（5.4.1）
├── master1.xml             母版内容：形状定义（每个母版一个文件）
├── master2.xml
└── …                       母版数 = 本图用到的形状模板数
```

主文档经 5.3.1 的 `masters` 关系到达目录，再经目录与目录关系表下到各母版内容。

#### 5.4.1 masters.xml.rels —— 母版目录的关系表

极简文档（仅 1 个母版）时只有一条：

```xml
<Relationships xmlns="…/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/master"
                  Target="master1.xml"/>
</Relationships>
```

**真实文档不止一个母版**——每个母版一条关系，rId1…rIdN 逐条列出（实测
官方样本 5 个母版的关系表，顺序同样乱写）：

```xml
<Relationships xmlns="…/package/2006/relationships">
    <Relationship Id="rId3" Type="…/relationships/master" Target="master3.xml"/>
    <Relationship Id="rId2" Type="…/relationships/master" Target="master2.xml"/>
    <Relationship Id="rId1" Type="…/relationships/master" Target="master1.xml"/>
    <Relationship Id="rId5" Type="…/relationships/master" Target="master5.xml"/>
    <Relationship Id="rId4" Type="…/relationships/master" Target="master4.xml"/>
</Relationships>
```

**它解决什么**：masters.xml（母版目录）只列"有哪些母版"，每个母版条目的内容
在独立的 masterN.xml 里——这张关系表把两者接起来。masters.xml 里的条目这样
指向它：

```xml
<Master ID="100" …>
    …
    <Rel r:id="rId1"/>
</Master>
```

引用链完整走法：

```
masters.xml 的 <Master><Rel r:id="rId1"/>      ← 说"我的内容走 rId1"
    ↓ 查本部件旁的关系表
masters/_rels/masters.xml.rels 的 rId1          ← 说"rId1 = master1.xml"
    ↓
visio/masters/master1.xml                       ← 实际母版内容
```

逐数据元：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| `Id` | rIdN | 本文件内别名——被 masters.xml 的 `Rel r:id` 引用（顺序/编号无意义） |
| `Type` | `…/visio/2010/relationships/master` | Visio 专有：单份母版关系（恒为单数，无论几条） |
| `Target` | masterN.xml | 相对本 rels 所在目录（masters/），故不带路径前缀 |

要点：

- **条目数 = 母版数**：N 个母版 = N 条关系（rId1…rIdN），一一对应
  master1.xml…masterN.xml；Type 恒为单数 `master`——单复数区分的是
  "目录 vs 单份内容"，与条数无关；
- 与包根 .rels 的差异只是**位置与内容**：它在 masters/ 子目录里、只服务
  masters.xml → masterN.xml 这一段引用链（分层引用，见 3.3 的链图）。

#### 5.4.2 master1.xml —— 母版内容文件（矩形母版实例）

**文件角色**：一个母版一个文件，根元素 `MasterContents`——里面装的是这份
母版的**形状定义模板**（长什么样、有哪些连接点、双击行为等）。页面里的实例
通过 `Master="ID"` 引用它：母版定义 + 实例覆盖 = 最终形状。

整体骨架（本例矩形母版；完整 XML 较长，按段拆解）：

```xml
<MasterContents …>
    <Shapes>
        <Shape ID="5" Type="Shape" LineStyle="3" FillStyle="3" TextStyle="3">
            …变换/行为 Cell…
            <Section N="Connection">…5 行连接点…</Section>
            <Section N="User"><Row N="visVersion">…</Row></Section>
            <Section N="Character"><Row IX="0">…字号…</Row></Section>
            <Section N="Geometry" IX="0">…矩形轮廓 5 行…</Section>
        </Shape>
    </Shapes>
</MasterContents>
```

**Shape 头部属性**：`ID=5`（母版内部形状 ID，自成体系）、`Type=Shape`、
`LineStyle/FillStyle/TextStyle=3`——样式引用同样指向 document.xml 的
StyleSheets（5.2.5），与页面形状同一套语义。

**变换与行为 Cell（逐项）**：

| Cell | 值/公式 | 说明 |
| --- | --- | --- |
| `PinX/PinY/Width/Height` | V=1.9685…/1.5748…，U=MM | 母版默认占位几何（40×30mm 矩形）；页面实例接管后以英寸值覆盖 |
| `LocPinX/LocPinY` | F=`Width*0.5` / `Height*0.5` | 锚点=中心（公式化，随尺寸联动） |
| `Angle/FlipX/FlipY` | 0 | 无旋转翻转 |
| `ResizeMode` | 0 | 尺寸调整模式默认 |
| `EventDblClick` | F=`OPENTEXTWIN()` | **双击进文本编辑**——官方母版行为（公式型行为 cell） |
| `HelpTopic` | Vis_Sba.chm!#45752 | 帮助文档锚点（官方形状自带元数据） |
| `Copyright` | Copyright (c) 2012… | 微软版权串（官方形状自带） |
| `ShapeSplit` | 1 | 允许被其它线拆分 |
| `LineWeight` | F=`THEMEVAL("LineWeight",0.24PT)` | 线宽默认 0.24pt，**可由主题覆盖**（THEMEVAL=主题钩子） |
| `QuickStyleType` | 2 | 快速样式分类（UI 样式分组用） |

注意：**没有 Fill 颜色 cell**——填充色交给样式/主题默认，母版不写死。

**Section Connection —— 连接点（5 行）**：粘附协议的"母版侧定义"：

| IX | 位置公式 | Dir | 位置 |
| --- | --- | --- | --- |
| 0 | (W×0.5, H×0) | (0,1) | 上边中点 |
| 1 | (W×1, H×0.5) | (-1,0) | 右边中点 |
| 2 | (W×0.5, H×1) | (0,-1) | 下边中点 |
| 3 | (W×0, H×0.5) | (1,0) | 左边中点 |
| 4 | (W×0.5, H×0.5) | (0,1) | 中心 |

每行另带 `Type=0`/`AutoGen=0`/`Prompt=""`（`F="No Formula"` 固化）。
页面实例里同样有一份 Connection 行（坐标按实例尺寸的 V 缓存 + 同款公式）——
母版这 5 点是"粘附点库"的模板来源。

**Section User / Character**：

| 段 | 内容 | 说明 |
| --- | --- | --- |
| User | `visVersion`=15 | 官方母版的版本标记 |
| Character | `Size`=0.1389 PT（≈10pt） | 母版默认字号（文字最终由实例提供） |

**Section Geometry —— 形状轮廓（本例矩形 5 行）**：

| 行 | 类型 | 坐标（公式） | 说明 |
| --- | --- | --- | --- |
| IX=1 | MoveTo | (0,0) = (W×0, H×0) | 起点（左下） |
| IX=2 | LineTo | (W×1, H×0) | 底边 |
| IX=3 | LineTo | (W×1, H×1) | 右边 |
| IX=4 | LineTo | (W×0, H×1) | 顶边 |
| IX=5 | LineTo | (`Geometry1.X1`, `Geometry1.Y1`) | **显式闭合**回到起点 |

行首属性：`NoFill/NoLine/NoShow/NoSnap/NoQuickDrag=0`（可填充可描边可见）。
坐标 X/Y 的 U=MM 只是显示单位，V 数值按内部英寸制（同 5.2 观察到的惯例）。

**母版与实例的分工小结**：

- 母版定义：几何轮廓、连接点、行为（双击）、元数据（帮助/版权）、默认字号；
- 实例提供：页面位置与尺寸（Pin/W/H 覆盖）、文本与文本格式、V 缓存；
- 本例母版**没有 Text 元素**——纯"印章"，文字由盖印时写上去。

#### 5.4.3 masters.xml —— 母版目录

**文件角色**：母版区的"目录页"。每一条 `<Master>` 描述一枚母版的**档案**
（编号、名字、图标、提示、关键词…），并挂接到 5.4.1 的关系表 → 5.4.2 的内容
文件。页面上的形状按 `Master="ID"` 引用这里的编号。结构骨架（矩形母版条目）：

```xml
<Masters>
    <Master ID="2" NameU="Rectangle" Name="矩形" Prompt="拖到绘图页上。"
            IconSize="1" AlignName="2" MatchByName="0" IconUpdate="1"
            UniqueID="{08840884-…-8E40-00608CF305B2}" BaseID="{265F9737-…}"
            PatternFlags="0" Hidden="0" MasterType="2">
        <PageSheet>…母版画布设置…</PageSheet>
        <Icon>…ICO 图标（base64）…</Icon>
        <Rel r:id="rId1"/>
    </Master>
</Masters>
```

**条目属性（逐项）**：

| 属性 | 本例值 | 说明 |
| --- | --- | --- |
| `ID` | 2 | 母版在**本文档母版表内**的编号——页面形状 `Master="N"` 引用的就是它（打包进不同文档时可重排；本文档内唯一） |
| `NameU` | Rectangle | 程序标识名（唯一、不随语言变；跨文档找母版按它） |
| `Name` | 矩形 | 显示名（本地化） |
| `Prompt` | 拖到绘图页上。 | 拖拽到页面时的提示文案 |
| `IconSize` | 1 | 图标尺寸档 |
| `AlignName` | 2 | 图标下名字对齐方式 |
| `MatchByName` | 0 | 是否按 NameU 匹配（vs 按 ID） |
| `IconUpdate` | 1 | 母版形状变化时是否自动更新图标 |
| `UniqueID` | {0884…} | 母版唯一 ID（GUID，跨文档识别/形状实例回链用） |
| `BaseID` | {265F…} | 源标识（标识"从哪个基础形状来的"，用于形状库联动） |
| `PatternFlags` / `Hidden` | 0 / 0 | 图案标志 / 是否隐藏（1=不出现在模具窗格） |
| `MasterType` | 2 | 母版类型枚举（单形状/组/…，按 Visio 枚举） |

**PageSheet —— 母版自带的画布设置**：

| Cell | 值 | 说明 |
| --- | --- | --- |
| `PageWidth/PageHeight` | 3.937 U=MM | 母版画布 100×100mm（V=内部英寸值，显示 MM） |
| `PageScale/DrawingScale` | 0.03937 U=MM | 内部 1mm=1 单位（母版以 mm 为设计网格） |
| `ShdwOffsetX/Y` | ±0.118 | 默认阴影偏移 |
| `InhibitSnap` | 0 | 允许吸附 |
| `PageLockReplace` / `PageLockDuplicate` | 0 (BOOL) | 母版页锁定开关 |
| `UIVisibility` | 0 | UI 可见性 |
| `ShdwType/ObliqueAngle/ScaleFactor` | 0/0/1 | 阴影类型/斜角/比例 |
| `DrawingResizeType` | 1 | 画布自动调整 |
| `ShapeKeywords` | 基本,形状,几何图形,…,矩形,… | 搜索关键词（本地化，供"搜索形状"用） |

**Icon**：ICO 图标（base64 编码的 32×32 位图）——模具坞窗与形状搜索列表里
显示的小图标。母版外观变化且 `IconUpdate=1` 时自动重绘。

**Rel**：`r:id="rId1"` → 5.4.1 的关系表 → 5.4.2 的 masterN.xml 内容文件。
至此母版区闭环：**目录条目（档案+ID）→ 关系表 → 内容文件（形状定义）**。

**要点**：

- `ID` 是文档内编号，页面 `Master="N"` 与它对应——打包进图纸时编号域会重排
  （官方模具内通常小号起；实际图纸内以打包后为准，见 01-C4 剖析中 ID=100 起）；
- `NameU` 是稳定的程序标识，`Name` 是可本地化显示名；
- `UniqueID` 让同一母版在不同文档/版本间可被识别（形状实例与母版的溯源）。

### 5.5 pages —— 页面区

```
visio/pages/
├── pages.xml             页目录：每页一条（ID/名字/画布设置），Rel 指内容
├── _rels/pages.xml.rels  目录关系表：rId → pageN.xml（5.5.2）
├── page1.xml             页内容：PageContents 里的 Shapes/Connects（5.5.3）
├── _rels/page1.xml.rels  页自己的关系表：声明本页用到的母版（5.5.4）
└── …                     每页一组（pageN.xml + 自己的 _rels）
```

主文档经 5.3.1 的 `pages` 关系到达目录；每个页面条目（含画布与元数据）与
页内容（形状与连线）分离——目录管"有几页、多大"，内容管"页上画了什么"。

#### 5.5.1 pages.xml —— 页目录

```xml
<Pages>
    <Page ID="0" NameU="Page-1" Name="页-1" ViewScale="1"
          ViewCenterX="2.2596784055742" ViewCenterY="8.362040415546">
        <PageSheet LineStyle="0" FillStyle="0" TextStyle="0">…画布设置…</PageSheet>
        <Rel r:id="rId1"/>
    </Page>
</Pages>
```

结构上与 5.4.3 的母版目录条目**同构**（档案属性 + 自带 Sheet + Rel）。

条目属性：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| `ID` | 0 | 页面在本文档内的编号（打开时 TopPage/Window.Page 引用它） |
| `NameU` / `Name` | Page-1 / 页-1 | 程序标识 / 显示名 |
| `ViewScale` / `ViewCenterX/Y` | 1 / 页面坐标 | 打开该页时的默认视图位置（记忆还原，同 windows.xml 语义） |
| `Rel` | rId1 | → pages.xml.rels → pageN.xml |

PageSheet —— 页面画布（与 5.4.3 母版 PageSheet 同构，实测 A4 竖版）：

| Cell | 值 | 说明 |
| --- | --- | --- |
| `PageWidth/PageHeight` | 8.2677 / 11.6929（in） | A4 竖版（210×297mm） |
| `PageScale/DrawingScale` | 0.03937 U=MM | 刻度比例（内部 1mm 单位） |
| `ShdwOffsetX/Y` | ±0.118 | 阴影默认偏移 |
| `InhibitSnap` | 0 | 允许吸附 |
| `PageLockReplace/PageLockDuplicate` | 0 (BOOL) | 页锁定开关（同母版页语义） |
| `UIVisibility` | 0 | UI 可见性 |
| `ShdwType/ObliqueAngle/ScaleFactor` | 0/0/1 | 阴影默认 |
| `DrawingResizeType` | 1 | 绘图自动扩展 |
| `PageShapeSplit` | 1 | 页上允许形状拆分 |

#### 5.5.2 pages.xml.rels —— 目录关系表

```xml
<Relationships …>
    <Relationship Id="rId1" Type="…/visio/2010/relationships/page"
                  Target="page1.xml"/>
</Relationships>
```

与 5.4.1 完全同构：Type 恒为单数 `page`（指向单份页内容）；**N 页 = N 条**
（rId1…rIdN → page1.xml…pageN.xml）。

#### 5.5.3 page1.xml —— 页内容

```xml
<PageContents …>
    <Shapes>
        <Shape ID="1" NameU="Rectangle" Name="矩形" Type="Shape" Master="2">
            <Cell N="PinX" V="2.2664…"/>
            <Cell N="PinY" V="8.3581…"/>
            <Text>AAA
            </Text>
        </Shape>
        <Shape ID="2" Type="Shape" Master="2">
            <Cell N="PinX" V="4.1365…"/>
            <Cell N="PinY" V="8.3581…"/>
            <Cell N="LineWeight" V="0.0139" U="PT"/>          ← 实例局部覆盖
            <Section N="Character"><Row IX="0">
                <Cell N="Size" V="0.5" U="PT"/>              ← 实例局部覆盖
            </Row></Section>
            <Text><cp IX="0"/>BBB
            </Text>
        </Shape>
    </Shapes>
</PageContents>
```

- 根 `PageContents`；`Shapes` 直接子元素即本页的形状（复杂页还有 `Connects`
  段做粘附接线，见 01-C4 剖析）；
- 每个 `Shape` 挂 `Master="2"`——引用 5.4.3 目录里 ID=2 的矩形母版；实例只带
  少量覆盖 cell（本例：PinX/PinY 定位），其余全继承母版（5.4.2）；
- 实测本页还演示了两种实例覆盖写法：直接 Cell 覆盖（LineWeight）与
  Section 内覆盖（Character.Size）；
- 文本形态两种都出现：纯文本（AAA）与 `<cp IX="0"/>` + 文本（BBB）——
  前者为手工最小写法，后者带格式 run 锚点（本工具统一写后者形态）。

#### 5.5.4 page1.xml.rels —— 页的母版引用声明

```xml
<Relationships …>
    <Relationship Id="rId1" Type="…/visio/2010/relationships/master"
                  Target="../masters/master1.xml"/>
</Relationships>
```

- 页内容引用了哪些母版，要在这里**登记一条**（Type=单数 `master`）；
- `Target` 用了 `../masters/…`——**上跳一级再进入**：相对本 rels 所在目录
  （pages/_rels/）指向兄弟区 masters/，正好演示 Target 相对路径可跨目录；
- 解析器据此可预知"这页会用到哪些母版文件"（渲染前即可定位依赖）。




