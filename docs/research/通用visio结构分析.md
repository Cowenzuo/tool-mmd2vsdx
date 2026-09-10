# 通用 Visio 结构分析（规范版）

> 把一份 .vsdx 解压开，从包结构到每个部件的内部 XML，逐层讲清这份文件格式。
> 全部结论基于 `docs/research/` 下的真实解压素材，见 research README。
> 疑点不臆断，标注待核。
> 对照存档：旧体例全文（`通用visio结构分析-旧版.md`）随 git 历史保留（原 docs/archived 区已移除）。

## 第〇章 阅读体例

### 0.1 文档目标与素材

- 目标：建立"Visio 文件 → 目录结构 → 部件 XML → 字段语义"的完整认知；
- 素材：`docs/research/basic-N/…` 真实图纸解压包，正文按完整路径引用；
  `docs/research/c4-1/` 为本工程自产样本（第六章案例），仅作对照；
- 来源标注：实例出处统一标为 `素材 basic-N`、`官方参照` 或 `自产样本`；
- 取证符号：🔍 实测原文 · 📚 微软规范/SDK · ❓ 推断待核；
- 行文：正文遵循 `docs/文档写作规范.md` 的叙事约束。

### 0.2 五步分析法

**每个"讲文件/讲 XML 结构"的小节固定五个子节，编号占层 X.Y.Z：**

| 步 | 子节名 | 内容要求 |
| --- | --- | --- |
| 1 | X.Y.1 文件定位 | 通俗话语解释它是什么；在包树中的位置；在引用链里的角色（谁指向它、它指向谁） |
| 2 | X.Y.2 实例内容 | 贴 XML：短小整贴；长文件（如 document.xml）引用素材路径、正文贴结构骨架；中长文件可缩写重复行，**缩内容不缩结构，凡删的段在字段解释里都找得回** |
| 3 | X.Y.3 字段解释 | 统一四列表：**字段 \| 内容 \| 含义 \| 用途说明**（字段=属性/Cell/元素名；内容=本例取值或形态；含义=它表示什么语义；用途说明=影响什么、谁消费） |
| 4 | X.Y.4 字段扩展 | 该字段值的其它可能性：完整枚举、位掩码读法（引 5.1.4）、是否可选/缺省行为、值是否为全局标准（如样式索引仅文档内有效） |
| 5 | X.Y.5 补充注解 | 放不进前四步的一切：易错点、跨章关联、特殊写法、待核观察点 |

**不豁免原则**：概念性小节讲机制不讲文件，比如引用链分层、位掩码读法。
它们同样保留五子节标题；无法填写的步骤写见补充注解，内容归入第 5 步。

### 0.3 编号与章节树

编号规则：`第X章` 是一个主题区；`X.Y` 是一个文件或子主题；
`X.Y.Z` 是五步，编号固定；必要时 `X.Y.Z.W` 继续下钻。

| 章 | 内容 | 状态 |
| --- | --- | --- |
| 第〇章 | 阅读体例（本页） | ✅ |
| 第一章 | 解压后的一级结构 | ✅ |
| 第二章 | [Content_Types].xml（类型登记表） | ✅（对照旧版 §2 已并入） |
| 第三章 | _rels/.rels（关系表） | ✅（对照旧版 §3 已并入） |
| 第四章 | docProps（文档属性四件） | ✅（对照旧版 §4 已并入） |
| 第五章 | visio 区（windows/document/各 _rels/masters/pages） | ✅（对照旧版 §5 已并入；5.6 为 Group/容器机制索引） |
| 第六章 | 图型案例（c4-1 自产样本已落章；class 等图型另立专篇，见 class-结构分析.md） | ✅（C4 首案，待核清单见 6.5） |

## 第一章 解压后的一级结构

### 1.1 文件定位

一份 `.vsdx` 文件本质是一个规范 zip。把扩展名改成 `.zip` 再解压，得到若干部件
文件，包括 XML、关系表、图片和属性。这些文件按固定布局摆放，"什么文件放
什么目录"是规范的一部分。看懂一级结构，就等于拿到整份文件的地图。

引用链角色：包根 `_rels/.rels` 是入口，指向主文档与三份属性。主文档经自己的
关系表再指向母版区、页面区和窗口。详见第 3 章与第 5 章。

### 1.2 实例内容

素材：`basic-1/` 的完整解压树

```
basic-1/（规范 zip 解压）
├── [Content_Types].xml     （类型登记表，第 2 章）
├── _rels/.rels             （包级关系表，第 3 章）
├── docProps/
│   ├── core.xml            （核心属性：标题/作者/时间）
│   ├── app.xml             （应用属性：生成软件/统计）
│   ├── custom.xml          （自定义属性）
│   └── thumbnail.emf       （封面图，Visio 保存时生成）
└── visio/
    ├── document.xml        （文档主体：设置/样式/字体/文档形状表）
    ├── windows.xml         （窗口布局）
    ├── masters/
    │   ├── masters.xml     （母版目录）
    │   ├── master1.xml     （母版内容：形状定义）
    │   └── _rels/masters.xml.rels
    ├── pages/
    │   ├── pages.xml       （页目录）
    │   ├── page1.xml       （页内容：形状与连线）
    │   └── _rels/pages.xml.rels、page1.xml.rels
    └── _rels/document.xml.rels
```

完整文件内容见素材目录；各部件逐文件的拆解从第 2 章开始。

### 1.3 字段解释

一级结构以"目录/文件"为字段，统一四列：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| `[Content_Types].xml` | 登记表 | 每个文件应被解析为什么类型 | 解析器打开包时最先读它（第 2 章） |
| `_rels/.rels` | 包级关系表 | 顶层部件间的引用关系 | 入口导航：找到主文档与属性（第 3 章） |
| `docProps/` | 三份 XML + 封面 | 文档属性档案 | 文件管理器/搜索/文档库读取；不影响渲染（第 4 章） |
| `visio/document.xml` | 文档主体 | 样式/字体/颜色/全局设置/文档形状表 | 全图纸的样式与行为底座（5.2） |
| `visio/windows.xml` | 窗口布局 | 界面记忆 | 还原上次打开现场；不影响内容（5.1） |
| `visio/masters/` | 目录+内容文件 | 形状模板库 | 页面形状按 Master= 引用（5.4） |
| `visio/pages/` | 目录+页内容 | 页面区 | 图纸"正片"：形状与连线（5.5） |

### 1.4 字段扩展

- 文件数量可变部分：`masterN.xml` 随母版数增减，`pageN.xml` 随页数增减，
  `thumbnail.emf` 可有可无；其余骨架文件恒定；
- 可能出现的额外部件：其它封面格式等，依保存方而定；
- 目录名与文件名是固定约定，解析器按名寻找，不应改动。

### 1.5 补充注解

- 解压小技巧：直接改扩展名为 `.zip` 或用 `tar -xf` 均可解压；
- basic-1 与 basic-2 的差异是"有没有连接线和图层"，当作对照实验使用，
  见 research README；
- ❓ 待核：不同版本 Visio 是否会写额外 docProps 部件，后续素材扩充时留意。

## 第二章 [Content_Types].xml

### 2.1 文件定位

`[Content_Types].xml` 是整份包的类型登记表，回答一个问题：包里每个文件应被
解析成什么类型。两份 XML 可以长得一模一样，身份却不同，靠的就是这张表：
`master1.xml` 是母版定义，`page1.xml` 是页面内容。

文件躺在包根目录，名字自带方括号，这是 OPC 规范写死的固定名。任何打开
`.vsdx` 的程序都会最先读它，读完才知道后续每个部件该怎么处理。

登记内容跟随包的实际内容走：包里有什么文件，表里就有什么条目。Visio 负责
写，解析器负责读，两边都按这张表的约定行事。

### 2.2 实例内容

素材 `basic-1/`，全文见 `docs/research/basic-1/[Content_Types].xml`：

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="emf" ContentType="image/x-emf"/>
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
    <Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>
    <Override PartName="/visio/masters/master1.xml" ContentType="application/vnd.ms-visio.master+xml"/>
    <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>
    <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
    <Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
    <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
</Types>
```

对照素材 `basic-2/`：只多了一行 Override，登记第二个母版文件
`/visio/masters/master2.xml`，类型同为 `…master+xml`。两包其余条目逐字一致，
正好演示"表随包内容增减"的规律。

### 2.3 字段解释

先看根元素与两种登记方式，字段统一四列。

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| `<Types>` | 全部登记条目的容器 | 类型表本体 | 解析器读到的第一层 |
| xmlns | openxmlformats 的 content-types 命名空间 | 本文件归属的 OPC 类型体系 | 解析器据此识别文件协议 |
| `<Default>` | Extension + ContentType | 按后缀批量登记 | 一类文件登记一次，不必逐个点名 |
| `<Override>` | PartName + ContentType | 对单个部件点名登记 | 精确到文件，优先级高于 Default |

Default 与 Override 逐行拆开：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Default Extension | emf | 匹配 .emf 后缀 | 封面 thumbnail.emf 由此归为图片 |
| 其 ContentType | image/x-emf | EMF 图元文件类型 | 见 4.4 |
| Default Extension | rels | 匹配 .rels 后缀 | 全包关系表统一归它，见第 3 章 |
| 其 ContentType | …package.relationships+xml | OPC 关系表类型 | 固定值，规范写死 |
| Default Extension | xml | 匹配 .xml 后缀 | 兜底条目，普通 XML 都按它处理 |
| 其 ContentType | application/xml | 通用 XML 类型 | 未被 Override 点名的 xml 落这里 |
| Override /visio/document.xml | …drawing.main+xml | 绘图主文件 | 与包根 .rels 的 document 关系呼应，见 5.2 |
| Override /visio/masters/masters.xml | …masters+xml | 母版目录 | 见 5.4 |
| Override /visio/masters/master1.xml | …master+xml | 单份母版内容 | 母版数量变化时此行列数随之增减 |
| Override /visio/pages/pages.xml | …pages+xml | 页目录 | 见 5.5 |
| Override /visio/pages/page1.xml | …page+xml | 单页内容 | 页数量变化时此行列数随之增减 |
| Override /visio/windows.xml | …windows+xml | 窗口布局 | 见 5.1 |
| Override /docProps/core.xml | …package.core-properties+xml | 核心属性 | 见 4.1 |
| Override /docProps/app.xml | …extended-properties+xml | 应用属性 | 见 4.2 |
| Override /docProps/custom.xml | …custom-properties+xml | 自定义属性 | 见 4.3 |

表中 ContentType 一列省略了前缀：Visio 家族为 `application/vnd.ms-visio.`，
core/app/custom 三件分别是 `application/vnd.openxmlformats-package.` 与
`application/vnd.openxmlformats-officedocument.`。

### 2.4 字段扩展

Default 与 Override 的分工值得展开。Default 按后缀认领，同一种后缀只允许一条。
Override 按绝对路径认领，比 Default 更具体，两者同时命中时以 Override 为准。
三个 Default 里 xml 是兜底：普通 XML 部件即使漏登记，也能按 application/xml
读出内容。

类型字符串是 MIME 标签，由规范固定。Visio 家族用 vnd.ms-visio 前缀，细分
drawing.main、masters、master、pages、page、windows 六类，后跟 +xml。
属性三件走 openxmlformats 通用前缀，docx/xlsx 家族用同一套，跨应用通用。

条目变化规律只有两条。母版或页面数量变化，Override 行跟着增减。包里出现新
种类的文件，补一条 Default 或 Override。标签写错或漏写，解析器就无法正确分类
部件，常见表现是部件被忽略或整包打不开，容错程度看打开方实现。手工改这张表
没有收益，不要动。

### 2.5 补充注解

- 文件名自带方括号，且大小写混排，[Content_Types].xml 是固定名，zip 工具和
  shell 都把它当普通文件名处理；
- XML 声明里的 standalone="yes" 表示本文件不依赖外部定义；
- 这份文件与 docx/xlsx 包同属 OPC 机制，机制通用，类型串各自成族；
- ❓ 待核：无缩略图的包里，emf 的 Default 行是否整行消失。两份素材都带
  缩略图，暂无反面样本，素材扩充时留意。

## 第三章 _rels/.rels

### 3.1 文件定位

关系表回答另一个问题：文件之间谁引用谁。Content_Types 讲每个文件是什么类型，
关系表讲每个文件从哪里被找到。

包根目录下的 `_rels/.rels` 管理顶层结构。它登记主文档、三份属性和封面图这些
顶层部件之间的引用。解析器从这张表起步，先找到主文档，再顺着各级关系表逐层
深入，最后才到达页面与母版。

本章只拆包根这一张表。各张关系表机制相同，后面各章出现 .rels 文件时只讲
差异。分层引用的全貌见 3.5 的链图。

### 3.2 实例内容

素材 `basic-1/`，全文见 `docs/research/basic-1/_rels/.rels`；`basic-2/` 与之
逐字一致。

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

### 3.3 字段解释

每条 Relationship 有三个属性，字段统一四列。

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Id | rId1…rId5 | 本文件内的引用别名 | 本文件内唯一即可，编号与顺序无意义 |
| Type | 关系类型 URI | 这条关系是干什么的 | 解析器按字符串精确匹配语义 |
| Target | 相对路径 | 指向哪个部件 | 相对本 .rels 所在目录解析 |

五行合起来看：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| rId1 Type | …visio/2010/relationships/document | Visio 专有：主文档 | 全包最重要的一条，见 5.2 |
| rId2 Type | …metadata/thumbnail | OPC 通用：封面 | 供文件管理器预览 |
| rId3 Type | …metadata/core-properties | OPC 通用：核心属性 | 指向 docProps/core.xml |
| rId4 Type | …extended-properties | Office 通用：应用属性 | 指向 docProps/app.xml |
| rId5 Type | …custom-properties | Office 通用：自定义属性 | 指向 docProps/custom.xml |

### 3.4 字段扩展

Type 值按前缀分三个命名空间，归属一眼可辨。

| 前缀 | 归属 | 本例条目 |
| --- | --- | --- |
| schemas.microsoft.com/visio/2010/relationships/ | Visio 专有 | document |
| schemas.openxmlformats.org/package/2006/relationships/ | OPC 包通用 | core-properties、thumbnail |
| schemas.openxmlformats.org/officeDocument/2006/relationships/ | Office 通用 | extended-properties、custom-properties |

Target 是相对路径，基准是关系表所在目录。包根表的 Target 不带前缀：visio/
document.xml、docProps 三件，都从包根数起。子目录里的关系表则常写上跳，
5.5 节 page1.xml.rels 的 `../masters/master1.xml` 就是例子。

Id 只是别名，顺序由 Visio 自由分配，本素材 rId1 到 rId5 乱序排列即是证据。
解析器只认"引用点写的是哪个 Id"，不依赖 Id 的数值含义。Target 指向的文件
缺失时，该关系成为断链，处理方式看打开方的容错策略。

Type 的 URI 不是网址。没有任何程序会访问它，点击打不开是正常的。它的作用是
让解析器按字符串精确相等来判定关系语义：包根表里 Type 等于
`…visio/2010/relationships/document` 的那一条，就是主文档。所以 Type 必须
照规范原样书写，不能为空、不能改乱，前缀混淆会让解析器认不出关系。主文档
那一条失效时，Visio 会判定文件损坏，这是全包最不能动的关系。

### 3.5 补充注解

- 引用链是分层的，全貌如下。包根表只管顶层，不直接管页面与母版，它们由主
  文档的关系表继续往下指：

```
_rels/.rels（包根）
  └─ document ─────────────────► visio/document.xml
                                    └─ visio/_rels/document.xml.rels（5.3）
                                         ├─ masters ► masters/masters.xml（5.4）
                                         │              └─ masters/_rels/masters.xml.rels
                                         │                   ├─ master1.xml
                                         │                   └─ master2.xml …
                                         ├─ pages ► pages/pages.xml（5.5）
                                         │              └─ pages/_rels/pages.xml.rels
                                         │                   └─ page1.xml …
                                         └─ windows ► windows.xml（5.1）
```

- 解析器打开一份 vsdx 的路径就是这条链：读包根 .rels，找到主文档；读主文档
  的 .rels，找到母版目录、页目录和窗口；目录内部再用各自的 rels 指向具体
  内容文件；渲染时页面形状按 Master 属性回头取母版。每一段引用都靠一张
  .rels，目录与内容因此可以分开存、单独换；
- Content_Types 与 .rels 的分工常被混淆：前者是类型清单，后者是引用清单，
  一张表解决一个问题，缺一不可；
- rId1…rId5 乱序出现说明编号无规律可循，写解析器时不能假设 Id 与内容的
  对应关系。

## 第四章 docProps

### 4.1 core.xml

#### 4.1.1 文件定位

core.xml 存核心属性：标题、作者、时间这类档案。它由 OPC 包级规范定义，
Word、Excel、Visio 用同一套字段，只是值不同。

文件躺在 `docProps/` 下，由包根 .rels 的 core-properties 关系指向。文件管理器
在列表里显示的作者、标题、修改时间，很多就读自这里。渲染图纸内容完全用不上
它。

#### 4.1.2 实例内容

素材 `basic-1/`，全文见 `docs/research/basic-1/docProps/core.xml`。正文把
命名空间声明折成一行，元素一个不少：

```xml
<cp:coreProperties xmlns:cp="…/package/2006/metadata/core-properties"
    xmlns:dc="…purl.org/dc/elements/1.1/" xmlns:dcterms="…purl.org/dc/terms/"
    xmlns:dcmitype="…purl.org/dc/dcmitype/" xmlns:xsi="…w3.org/2001/XMLSchema-instance">
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

#### 4.1.3 字段解释

逐个数据元展开，字段统一四列。

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| dc:title | 空 | 文档标题 | 文件管理器"标题"列 |
| dc:subject | 空 | 主题 | 属性对话框显示 |
| dc:creator | 示例用户 | 作者 | 素材原文是系统账户名，本文统一匿名 |
| cp:keywords | 空 | 关键词 | 搜索索引用 |
| dc:description | 空 | 备注 | 属性对话框显示 |
| cp:lastPrinted | 2026-09-04T08:40:03Z | 最后一次打印时间 | 打印时刷新 |
| dcterms:created | 2026-09-04T08:40:03Z | 创建时间 | 保存时写入 |
| dcterms:modified | 2026-09-04T08:41:46Z | 最后修改时间 | 每次保存刷新 |
| cp:category | 空 | 分类 | 文档库分组用 |
| dc:language | zh-CN | 文档语言 | 语言相关特性参考 |

#### 4.1.4 字段扩展

dc: 与 dcterms: 是 Dublin Core 标准前缀，cp: 是 OPC 扩展前缀，元素名由规范
固定，跨应用通用。空值也照写元素，这是本家族文件的惯例，删掉空元素并不会
省下什么。

三个时间元素值得分开记。lastPrinted 不带 xsi:type，打印过才写入。created 与
modified 带 `xsi:type="dcterms:W3CDTF"`，说明时间格式是 W3CDTF，后缀 Z 表示
UTC。本素材里 created 与 modified 差一分四十三秒，对应一次编辑加保存。

规范允许的字段不止这些。creator 之外还有 contributor、coverage、identifier
等可选元素，Visio 平时不写。本例十元素已覆盖常见档案面。

#### 4.1.5 补充注解

- 根元素带五个命名空间：cp、dc、dcterms、dcmitype、xsi，各自管前缀或类型
  标注；
- dc:creator 取自系统账户名。素材为本地手工绘制，作者是真实账户名，正文
  示例统一写"示例用户"，素材文件保持原样；
- dcmitype 命名空间本文件没用到，只是 Visio 照规范声明。

### 4.2 app.xml

#### 4.2.1 文件定位

app.xml 存应用属性：哪个软件生成、文档结构统计这类信息。字段由各 Office
应用自己定义，Word 写 Word 的，Visio 写 Visio 的。

文件躺在 `docProps/` 下，由包根 .rels 的 extended-properties 关系指向。
属性对话框里的页数、母版数统计就来自它，文件管理器不打开文件也能显示。

#### 4.2.2 实例内容

素材 `basic-1/`，全文见 `docs/research/basic-1/docProps/app.xml`。正文把
两个 vector 的内部逐项压成一行示意，其余照实：

```xml
<Properties xmlns="…/extended-properties" xmlns:vt="…/docPropsVTypes">
    <Template></Template>
    <Application>Microsoft Visio</Application>
    <ScaleCrop>false</ScaleCrop>
    <HeadingPairs>
        <vt:vector size="4" baseType="variant">…页、1、主控形状、1…</vt:vector>
    </HeadingPairs>
    <TitlesOfParts>
        <vt:vector size="2" baseType="lpstr">…页-1、矩形…</vt:vector>
    </TitlesOfParts>
    <Manager></Manager>
    <Company></Company>
    <LinksUpToDate>false</LinksUpToDate>
    <SharedDoc>false</SharedDoc>
    <HyperlinkBase></HyperlinkBase>
    <HyperlinksChanged>false</HyperlinksChanged>
    <AppVersion>16.0000</AppVersion>
</Properties>
```

HeadingPairs 的真实结构是四个 vt:variant，两两一组：先类别名，后数量。
TitlesOfParts 是名字列表，与类别一一对应。详见 4.2.4。

#### 4.2.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Template | 空 | 基于哪个模板新建 | 空表示无模板信息 |
| Application | Microsoft Visio | 生成软件名 | 属性对话框显示来源 |
| ScaleCrop | false | 缩略图是否强制按比例缩放裁剪 | 影响 4.4 封面显示 |
| HeadingPairs | 页、1、主控形状、1 | 结构统计前半：类别与数量配对 | size=4 表示两对 |
| TitlesOfParts | 页-1、矩形 | 结构统计后半：各类别的名字 | 与 HeadingPairs 合读 |
| Manager | 空 | 负责人 | 档案字段，用户可填 |
| Company | 空 | 公司 | 档案字段 |
| LinksUpToDate | false | 文档内链接是否最新 | 超链接相关 |
| SharedDoc | false | 是否共享协作文档 | 协同状态标记 |
| HyperlinkBase | 空 | 相对超链接的基准路径 | 常为空 |
| HyperlinksChanged | false | 超链接是否被手工改过 | 与 LinksUpToDate 配套 |
| AppVersion | 16.0000 | 应用主版本 | 16 表示 Office 2016 及以后的家族 |

#### 4.2.4 字段扩展

HeadingPairs 与 TitlesOfParts 是一对统计。前半每个条目由类别名加数量组成，
本例是页 1 份、主控形状 1 份。后半按类别顺序列出名字，本例是页-1 和矩形。
两条规则可以验证：后半条目总数等于前半数量之和，前半 size 是条目数的两倍。
统计由 Visio 保存时刷新，数值与包内 pages 目录和 masters 目录的实际数量对应，
改图纸后再保存即可看到变化。basic-3 是现成例子：主控形状 2 枚，TitlesOfParts
依次列出 页-1、矩形、动态连接线，后半名字用的是显示名。

Application 不是枚举，是写死的产品名，第三方工具写自己的名字也合法。
AppVersion 的主号 16 对应 Office 2016 之后的版本线，补丁级信息不在这里。

#### 4.2.5 补充注解

- 前半用变体数组（vt:variant 装 lpstr 与 i4），后半用字符串数组，类型不同
  是规范如此；
- ScaleCrop、LinksUpToDate 这类布尔元素只存 false/true 字符串；
- 本素材属性多数为空，说明这些档案字段只有在用户填写后才会有内容。

### 4.3 custom.xml

#### 4.3.1 文件定位

custom.xml 存自定义属性，是应用和第三方放"自己的键值对"的地方。core 字段
固定不可加，app 字段随应用定也不可私加，要存额外信息就写到这里，名字随意。

文件躺在 `docProps/` 下，由包根 .rels 的 custom-properties 关系指向。
Visio 自己把一批运行状态记在这里，见 4.3.3 的条目表。

#### 4.3.2 实例内容

素材 `basic-1/`，全文见 `docs/research/basic-1/docProps/custom.xml`：

```xml
<Properties xmlns="…/custom-properties" xmlns:vt="…/docPropsVTypes">
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="_VPID_ALTERNATENAMES">
        <vt:lpwstr></vt:lpwstr>
    </property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="BuildNumberCreated">
        <vt:i4>1073762150</vt:i4>
    </property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="4" name="BuildNumberEdited">
        <vt:i4>1073762150</vt:i4>
    </property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="5" name="IsMetric">
        <vt:bool>true</vt:bool>
    </property>
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="6" name="TimeEdited">
        <vt:filetime>2026-09-04T08:41:11Z</vt:filetime>
    </property>
</Properties>
```

#### 4.3.3 字段解释

先看每条 property 的固定壳：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| fmtid | {D5CDD505-…} | 属性格式标识 GUID | Office 文档固定值，本素材五条全同 |
| pid | 2…6 | 条目序号 | 从 2 起递增，1 保留给容器 |
| name | 键名 | 属性名 | 读写双方按名约定 |
| 值元素 | vt:lpwstr / i4 / bool / filetime | 值及类型 | 解析器按元素名读类型 |

再按条目看本例内容，这些是 Visio 自己记录的状态：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| name=_VPID_ALTERNATENAMES | 空文本 | Office 保留的别名占位条目 | 别名机制用，不必关心 |
| name=BuildNumberCreated | 1073762150 | 创建时应用的构建号 | 精确到补丁级的版本信息 |
| name=BuildNumberEdited | 1073762150 | 最后编辑时应用的构建号 | 与上一项同号说明同一版本完成创建与编辑 |
| name=IsMetric | true | 单位制标记 | true 表示公制，影响标尺与网格默认单位 |
| name=TimeEdited | 2026-09-04T08:41:11Z | 应用侧记录的编辑时间 | 与 core 的 modified 双轨并存 |

#### 4.3.4 字段扩展

fmtid 五条完全相同，它是 Office 用户自定义属性的格式标识，跨所有 Office
文档通用。pid 从 2 起是因为 1 被容器占用。name 与值完全自由，第三方写自己
的键值对就靠这里。

值元素按类型选择：文本用 lpwstr，整数用 i4，布尔用 bool，时间用 filetime。
完整类型表见 OPC 的 docPropsVTypes 命名空间定义。

#### 4.3.5 补充注解

- TimeEdited 与 core.xml 的 modified 相差三十五秒，两条记录各自维护、不保证
  一致，看时间时别混用；
- 属性名以下划线开头是 Visio 内部条目的命名习惯，用户自定义通常用普通名字；
- 自定义属性的增删改在 Visio 属性对话框里操作，第三方程序也直接读写本文件。

### 4.4 thumbnail.emf

#### 4.4.1 文件定位

thumbnail.emf 是封面图，Visio 保存时把预览画面渲染进去，文件管理器用它显示
图标预览。文件躺在 `docProps/` 下，由包根 .rels 的 thumbnail 关系指向，类型
由 2.2 的 Default emf 登记。

它不属于图纸内容。渲染器解析页面时完全不碰它，删掉它图纸照常打开，只是
预览缺图。

#### 4.4.2 实例内容

它是二进制 EMF 文件，没法贴文本，素材全文见
`docs/research/basic-1/docProps/thumbnail.emf`。正文只做头部取证，用脚本按
EMF 头布局读前 44 字节：

```
文件长度：4576 字节
偏移 0  iType      = 1          EMR_HEADER，标准 EMF 头
偏移 4  nSize      = 108        头记录大小
偏移 8  rclBounds  = 0,0,417,146  内容包围盒
偏移 24 rclFrame   = -7,-7,5626,1968  物理包围盒
偏移 40 signature  = 0x464D4520 " EMF"
```

#### 4.4.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| iType | 1 | 记录类型 | 1 是 EMR_HEADER，说明是标准 EMF 而非其它图元格式 |
| nSize | 108 | 头记录字节数 | 解析器跳过头记录用 |
| rclBounds | 0,0,417,146 | 绘制内容的设备包围盒 | 预览缩放时的内容范围参考 |
| rclFrame | -7,-7,5626,1968 | 内容在物理空间的包围盒 | 单位 0.01mm，换算约 56.3×19.7mm |
| signature | 0x464D4520 | ASCII 的 " EMF" | EMF 格式签名，识别格式的硬指标 |

#### 4.4.4 字段扩展

封面部件整体可选。缺失时文件正常打开，Visio 再保存会重新生成一张。生成策略
由 document.xml 里 DocumentSheet 的三个 cell 控制：LockPreview 决定改动后
是否自动重生成，PreviewQuality 决定画质档位，PreviewScope 决定含哪些页，
见 5.2.3.5。

rclFrame 的取值值得留意。本素材换算后约 56×20mm，远小于 A4 页面尺寸，
说明缩略图截取的不是整页，具体按什么范围截取待核。素材扩充时找一张带完整
页面封面的图纸对照。

#### 4.4.5 补充注解

- EMF 是矢量图元文件，画面由绘图指令组成，放大不糊，这是 Visio 选它做封面
  的原因；
- 封面只服务预览，解析图纸内容不需要它，两类工具各取所需；
- 旧版分析里 20460 字节的取证来自早期素材，已弃用。basic-1 与 basic-3 的
  封面为 4576B 与 14840B，rclFrame 换算约 56×20mm 与 93×133mm，都与页面
  尺寸不一致，截取规则待核。

## 第五章 visio 区

本章按文件角色拆开 visio/ 目录：windows.xml 是界面记忆，document.xml 是
全图纸的默认值与行为底座，document.xml.rels 是主文档的出口，masters 区与
pages 区分别放形状模板和图纸正片。素材以 basic-1 为主线，basic-2 提供
连接线与图层的对照。

### 5.1 windows.xml

#### 5.1.1 文件定位

windows.xml 是界面记忆文件。它记录上次关闭 Visio 时的窗口现场：主绘图窗口
的位置尺寸、视图缩放与中心、标尺网格等显示开关、粘附吸附设置、停靠了哪些
模具坞窗。下次打开时尽力还原。

它不参与渲染，也不影响文档内容，删掉或写错只损失现场记忆。文件由主文档的
关系表指向，见 5.3。

#### 5.1.2 实例内容

素材 `basic-1/`，全文见 `docs/research/basic-1/visio/windows.xml`。首行的
XML 声明省略，结构原样：

```xml
<Windows ClientWidth='2560' ClientHeight='1315'
    xmlns='http://schemas.microsoft.com/office/visio/2012/main'
    xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'>
    <Window ID='0' WindowType='Drawing' WindowState='1073741824' WindowLeft='-9' WindowTop='-38' WindowWidth='2578' WindowHeight='1362' ContainerType='Page' Page='0' ViewScale='1' ViewCenterX='2.2596784055742' ViewCenterY='8.362040415546'>
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
    <Window ID='1' WindowType='Stencil' WindowState='67109889' WindowLeft='-351' WindowTop='-10' WindowWidth='342' WindowHeight='1045' Document='C:\Program Files\Microsoft Office\root\Office16\visio content\2052\BASIC_M.vssx' ParentWindow='0'>
        <StencilGroup>10</StencilGroup>
        <StencilGroupPos>1</StencilGroupPos>
    </Window>
</Windows>
```

#### 5.1.3 字段解释

字段统一四列。先是根元素：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ClientWidth | 2560 | 保存时客户区宽度 | 像素，还原窗口大小用 |
| ClientHeight | 1315 | 保存时客户区高度 | 同上 |
| xmlns | visio 2012 主命名空间 | 与 document.xml 同一套 | 解析器识别协议 |

第一个 Window 是主绘图窗口，WindowType='Drawing'：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 0 | 窗口编号 | 其它窗口用 ParentWindow 指向它 |
| WindowType | Drawing | 窗口种类 | Drawing=绘图画布 |
| WindowState | 1073741824 | 状态位掩码 | 最大化等状态的组合，读法见 5.1.4 |
| WindowLeft/Top | -9 / -38 | 窗口左上角 | 负值表示探出屏幕边缘，多屏常见 |
| WindowWidth/Height | 2578 / 1362 | 窗口尺寸 | 像素 |
| ContainerType | Page | 容纳的内容类型 | 本例容纳页面 |
| Page | 0 | 容纳哪一页 | 指向 pages.xml 里的页 ID |
| ViewScale | 1 | 视图缩放比例 | 还原浏览倍率 |
| ViewCenterX | 2.2596784055742 | 视图中心横坐标 | 页面坐标英寸 |
| ViewCenterY | 8.362040415546 | 视图中心纵坐标 | 同上 |

它的子元素是显示与交互开关：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ShowRulers | 1 | 标尺显示 | 1=开 0=关 |
| ShowGrid | 0 | 网格显示 | 本素材关闭 |
| ShowPageBreaks | 1 | 分页虚线显示 | 打印预览辅助 |
| ShowGuides | 1 | 参考线显示 | 拖参考线时依赖 |
| ShowConnectionPoints | 1 | 连接点显示 | 粘附操作时的点位可见性 |
| GlueSettings | 9 | 粘附开关位掩码 | 读法见 5.1.4 |
| SnapSettings | 65847 | 吸附开关位掩码 | 同上 |
| SnapExtensions | 34 | 吸附扩展位掩码 | 同上 |
| SnapAngles | 空 | 自定义吸附角度列表 | 空表示无自定义 |
| DynamicGridEnabled | 1 | 动态网格 | 拖拽时的辅助网格 |
| TabSplitterPos | 0.5 | 标签分隔条位置 | 比例值 |

第二个 Window 是模具坞窗，WindowType='Stencil'：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| WindowState | 67109889 | 停靠状态位掩码 | 读法见 5.1.4 |
| WindowLeft/Top/Width/Height | -351 / -10 / 342 / 1045 | 坞窗位置尺寸 | 像素 |
| Document | C:\Program Files\…\BASIC_M.vssx | 外部模具文件路径 | 绝对路径字符串，不是包内引用 |
| ParentWindow | 0 | 停靠归属 | 挂在绘图窗口 0 上 |
| StencilGroup | 10 | 坞窗组号 | 多模具叠放分组 |
| StencilGroupPos | 1 | 组内位置 | 标签次序 |

#### 5.1.4 字段扩展

这一节展开位掩码读法，DocumentSettings 等处的同类字段共用。

这类字段的一个开关不是一个 0/1，而是一组开关打包在一个整数里：每个开关占
一个二进制位，位 n 的权值是 2^n。一组开关只占一个字段，整体保存与比较都
方便。判断某位是否开启要用位与，不是比大小：

```
value & 8       非 0 表示位 3 开启
```

本素材四个位掩码拆开如下：

| 字段 | 十进制 | 二进制/十六进制 | 置位 |
| --- | --- | --- | --- |
| GlueSettings | 9 | 0b1001 | 位 0 + 位 3 |
| SnapExtensions | 34 | 0b100010 | 位 1 + 位 5 |
| SnapSettings | 65847 | 0x10137 | 位 0/1/2/4/5/8/16 |
| WindowState（绘图窗） | 1073741824 | 0x40000000 | 位 30 |
| WindowState（坞窗） | 67109889 | 0x04000401 | 位 0/10/26 |

GlueSettings 的各位含义是文档公开的：位 0 粘形状几何，位 1 粘参考线，位 2 粘
手柄，位 3 粘顶点，位 4 粘连接点，位 5 粘页面。于是 9 = 1 + 8 表示"粘几何 +
粘顶点"两项开启。SnapSettings 的项更多，吸附到标尺、网格、参考线、几何、
顶点、连接点等各占一位，完整位义见 Visio ShapeSheet 文档的 GlueSettings 与
SnapSettings cell（📚）。

结论：这些数值由界面勾选后程序算好写入，人不该手工改。直接改 65847 无法
知道动了哪些开关。

#### 5.1.5 补充注解

- 这份文件是记忆不是内容。删除它图纸照常打开，渲染不读它；
- Stencil 窗口的 Document 是外部路径。文件还在就还原坞窗，找不到就跳过，
  属"尽力还原"语义；
- 视图还原靠 ViewScale 加 ViewCenterX/Y 加各显示开关，三者配合；
- 位掩码数值与 document.xml 里 DocumentSettings 的同名子元素一致
  （9 / 65847 / 34 / 空 / 1），是同一批界面设置的双份落盘，见 5.2.3.1；
- ❓ 待核：WindowState 各状态位与"最大化/激活/停靠"的精确对应表，规范里
  没有直接给出可读枚举，需要实测多窗口状态对照。

### 5.2 document.xml

#### 5.2.1 文件定位

document.xml 是主文档，全图纸的默认值与行为底座。颜色表、字体表、样式表、
文档级设置、文档形状表都住在这里。页面上的形状不带显式属性时，就从这里的
样式与设置拿默认。

它由包根 .rels 的 document 关系指向，自身又经 5.3 的关系表通向母版区、
页面区和窗口。解析顺序是固定的：先读 document.xml 的全局默认，再进页面区
读具体形状。

#### 5.2.2 实例内容

素材 `basic-1/`，完整文件 806 行，见 `docs/research/basic-1/visio/document.xml`。
正文不整贴，按五个顶层子元素做骨架：

```
<VisioDocument xmlns=…visio/2012/main xmlns:r=…relationships>
├── DocumentSettings    文档级设置：默认样式引用、粘附吸附开关（5.2.3.1）
├── Colors              颜色表：ColorEntry 列表（5.2.3.2）
├── FaceNames           字体表：文档用到的字体声明（5.2.3.3）
├── StyleSheets         样式表集合：每种样式一组默认 Cell（5.2.3.4）
└── DocumentSheet       文档形状表：NameU=TheDoc，文档级行为与数据（5.2.3.5）
</VisioDocument>
```

五个子元素顺序固定：设置、颜色、字体、样式、文档形状表。顺序即解析顺序，
照抄时不要重排。

#### 5.2.3 字段解释

先给顶层五个元素定位，字段统一四列：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| DocumentSettings | 5 属性 + 9 子开关 | 文档级默认与行为 | 新建形状、新建参考线时的落点 |
| Colors | ColorEntry 列表 | 颜色表 | cell 用索引或直接写色值时取色 |
| FaceNames | FaceName 列表 | 字体声明 | 渲染端字体匹配与回退 |
| StyleSheets | StyleSheet 列表 | 样式表集合 | 形状按索引引用默认值包 |
| DocumentSheet | TheDoc 的 Cell 与 Section | 文档自身形状表 | 文档级行为 cell，如预览策略 |

五个子元素逐个下钻。

##### 5.2.3.1 DocumentSettings

素材原文：

```xml
<DocumentSettings TopPage='0' DefaultTextStyle='3' DefaultLineStyle='3' DefaultFillStyle='3' DefaultGuideStyle='4'>
    <GlueSettings>9</GlueSettings>
    <SnapSettings>65847</SnapSettings>
    <SnapExtensions>34</SnapExtensions>
    <SnapAngles/>
    <DynamicGridEnabled>1</DynamicGridEnabled>
    <ProtectStyles>0</ProtectStyles>
    <ProtectShapes>0</ProtectShapes>
    <ProtectMasters>0</ProtectMasters>
    <ProtectBkgnds>0</ProtectBkgnds>
</DocumentSettings>
```

属性：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| TopPage | 0 | 打开时显示第几页 | 页 ID，无 Window 时才生效 |
| DefaultTextStyle | 3 | 新建形状的默认文本样式 | 索引指向 5.2.3.4 的样式表 |
| DefaultLineStyle | 3 | 默认线样式 | 同上 |
| DefaultFillStyle | 3 | 默认填充样式 | 同上 |
| DefaultGuideStyle | 4 | 新建参考线的默认样式 | 4 指向 Guide 样式 |

子开关：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| GlueSettings | 9 | 粘附位掩码 | 读法见 5.1.4，与 windows.xml 同值 |
| SnapSettings | 65847 | 吸附位掩码 | 同上 |
| SnapExtensions | 34 | 吸附扩展位掩码 | 同上 |
| SnapAngles | 空 | 自定义吸附角度 | 空表示无 |
| DynamicGridEnabled | 1 | 动态网格 | 同 windows.xml 语义 |
| ProtectStyles | 0 | 锁定样式表 | 1=用户不能改样式 |
| ProtectShapes | 0 | 锁定形状 | 1=形状结构受保护 |
| ProtectMasters | 0 | 锁定母版 | 1=母版受保护 |
| ProtectBkgnds | 0 | 锁定背景页 | 1=背景受保护 |

##### 5.2.3.2 Colors

素材原文：

```xml
<Colors>
    <ColorEntry IX='24' RGB='#7F7F7F'/>
</Colors>
```

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| IX | 24 | 颜色条目索引 | 表内编号，cell 用数字引用它 |
| RGB | #7F7F7F | 颜色值 | 灰色 |

Visio 保存时按实际用色精简颜色表，本例只用到一条灰。basic-2 多一条
IX=25 的白色，见 5.2.4。样式里的 LineColor 直接写 '#7f7f7f' 字符串，说明
cell 可以绕过索引表直接给色值。

##### 5.2.3.3 FaceNames

素材原文：

```xml
<FaceNames>
    <FaceName NameU='SimSun' UnicodeRanges='515 680460288 6 0' CharSets='262145 0' Panose='2 1 6 0 3 1 1 1 1 1' Flags='421'/>
</FaceNames>
```

一个 FaceName 就是声明一种字体，五个属性从五个维度描述它：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| NameU | SimSun | 字体标识名 | 本例宋体，渲染端按名字向系统请求 |
| UnicodeRanges | 515 680460288 6 0 | Unicode 区块覆盖位图 | 4 个 32 位整数共 128 位，每位一个区块 |
| CharSets | 262145 0 | 字符集覆盖位图 | 2 个 32 位整数共 64 位，每位一种字符集 |
| Panose | 2 1 6 0 3 1 1 1 1 1 | 外观分类 | 10 个字节描述字体长相 |
| Flags | 421 | 字体属性位标志 | 位集合 |

两个位图拆开读。UnicodeRanges 每一段是一个位图，某位为 1 表示字体含对应
区块的字形。本例四段的置位：

| 段 | 十进制 | 十六进制 | 置位 | 区块方向 |
| --- | --- | --- | --- | --- |
| 1 | 515 | 0x203 | 位 0/1/9 | 基本拉丁及周边 |
| 2 | 680460288 | 0x288F0000 | 位 16-19/23/27/29 | CJK 系列区块 |
| 3 | 6 | 0x6 | 位 1/2 | 扩展区块若干 |
| 4 | 0 | 0x0 | 无 | — |

CharSets 同理，262145 = 0x40001，置位 0 与 18，覆盖常用单字节集与中文字符集
位。渲染端拿这两份位图判断"这字体有没有我要的字形"，决定可用还是回退。

Panose 是字体外观分类标准：首字节家族类型，第二字节衬线样式，第三字节字重，
后续字节依次描述其它外观维度。本例整体描述"宋体这类带衬线的正文汉字字体"。
字体缺失时渲染端按它找外观最接近的替代品。

Flags 的位义以 Visio 规范 FaceName 定义为准，本例 421 = 0x1A5，置位
0/2/5/7/8，具体语义未逐位考证。

##### 5.2.3.4 StyleSheets

样式 = 一组默认 Cell。线、填充、文本的默认值打包成一个 StyleSheet，形状用
索引引用。素材 basic-1 有六张，带连接线的 basic-2/3/4 在此基础上多一张：

| ID | NameU | Name | 自身引用 | Cell 数 | Section | 特征 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | No Style | 无样式 | 无 | 258 | 5 | 全套默认，值全部写实 |
| 1 | Text Only | 纯文本 | Line/Fill/Text → 3 | 47 | 1 | 段落节 |
| 2 | None | 无 | Line/Fill/Text → 3 | 48 | 0 | 无线无填充 |
| 3 | Normal | 正常 | Line/Fill/Text → 6 | 14 | 0 | 文档默认样式指向它 |
| 4 | Guide | 参考线 | Line/Fill/Text → 3 | 86 | 1 | 参考线外观 |
| 6 | Theme | 主题 | Line/Fill/Text → 0 | 83 | 3 | 主题承载，值多为 Themed |
| 7 | Connector（basic-2/3/4 均有） | 连接线 | Line/Fill/Text → 3 | 未数 | 有 Character | 连接线样式 |

两个要点要分开记。其一，样式表之间可以互相继承：StyleSheet 自己带
LineStyle/FillStyle/TextStyle 属性，表示"我的默认值引用另一张样式"。Normal
引用 6，Theme 引用 0，No Style 谁都不引用，所以它写全套实值。cell 里的
F='Inh' 就是继承标记，F='THEMEVAL()' 是主题钩子，表示这个默认值交给主题
驱动。其二，编号惯例：ID 0-6 这组在 Visio 模板里恒定，5 惯例空缺，7 起名字
不固定。basic-2/3/4 的 7 号都是 Connector，内容逐字节相同，其它模板可能是
别的名字，索引只在这份文档内有效，详见 5.2.4。

ID=0 的 258 个 Cell 按族分，正好展示样式的覆盖面：开关族管线/填充/文本属性
是否开放，线族管线宽线色箭头，填充族管前景背景阴影，文本块族管边距对齐，
锁定族管编辑限制。样式 Cell 与形状 Cell 同名同义：样式是默认值包，形状不写
就继承。

##### 5.2.3.5 DocumentSheet

素材原文：

```xml
<DocumentSheet NameU='TheDoc' IsCustomNameU='1' Name='TheDoc' IsCustomName='1'
               LineStyle='0' FillStyle='0' TextStyle='0'>
    <Cell N='OutputFormat' V='0'/>
    <Cell N='LockPreview' V='0'/>
    <Cell N='AddMarkup' V='0'/>
    <Cell N='ViewMarkup' V='0'/>
    <Cell N='DocLockReplace' V='0' U='BOOL'/>
    <Cell N='NoCoauth' V='0' U='BOOL'/>
    <Cell N='DocLockDuplicatePage' V='0' U='BOOL'/>
    <Cell N='PreviewQuality' V='0'/>
    <Cell N='PreviewScope' V='0'/>
    <Cell N='DocLangID' V='zh-CN'/>
    <Section N='User'>
        <Row N='msvNoAutoConnect'>
            <Cell N='Value' V='1'/>
            <Cell N='Prompt' V='' F='No Formula'/>
        </Row>
    </Section>
</DocumentSheet>
```

文档自己有一张形状表，结构同形状与页面画布，名字固定 TheDoc。它没有可见
几何，专门放文档级行为与数据。逐个 cell：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| OutputFormat | 0 | 输出目标 | 打印/屏幕等形态 |
| LockPreview | 0 | 预览是否锁定 | 0=改动后自动重生成缩略图 |
| AddMarkup | 0 | 是否审阅模式 | 1=改动写批注覆盖页 |
| ViewMarkup | 0 | 是否显示批注 | AddMarkup 与插批注会置 1 |
| DocLockReplace | 0 BOOL | 禁止整体替换文档 | 模板分发防篡改用 |
| NoCoauth | 0 BOOL | 禁止协同编辑 | 含宏或敏感内容时用 |
| DocLockDuplicatePage | 0 BOOL | 禁止复制页 | 页保护 |
| PreviewQuality | 0 | 缩略图画质档 | 影响 4.4 的体积与清晰度 |
| PreviewScope | 0 | 缩略图含哪些页 | 0=仅首页 |
| DocLangID | zh-CN | 文档语言 | 拼写等语言特性按它 |

实测值几乎全是 0，是新文档的出厂状态。前四行里的 LockPreview、
PreviewQuality、PreviewScope 直接控制 4.4 的封面生成策略，AddMarkup 与
ViewMarkup 管批注机制（📚 见 Visio SDK 的 DocumentSheet 文档）。

Section User 是开放扩展点，行名 msv 前缀是 Visio 内部命名惯例。本例一行
msvNoAutoConnect 值为 1，关闭该文档的自动连接行为。

#### 5.2.4 字段扩展

样式索引只在文档内有效。DefaultTextStyle=3 表示"指向本文档 StyleSheets 里
的 3 号"，恰好是 Normal，4 号恰好是 Guide，这只是模板同源惯例。换一份模板，
Normal 可能编在别的号上，7 号以上尤其不固定：basic-1 根本没有 7 号，
basic-2 与 basic-3 的 7 号都是 Connector。写解析器时只能按文档内查表，
不能假设任何 ID 的全局含义。

样式表集合本身会变。用户新建自定义样式，Visio 会追加新 StyleSheet，ID 从
8 起递增。程序也可以动态增删。删掉基底会让既有索引悬空，Visio 默认不动它们。

Colors 与 FaceNames 都按实际用量精简。basic-1 只有一条灰，basic-2 与
basic-3 各多一条白，连接线样式用到了白色默认。字体同理，文档用什么字就
声明什么，三份素材都只声明宋体。cell 里直接写 '#7f7f7f' 颜色字符串的用法
不经过索引表。

DocumentSettings 的属性与开关可选性：五个属性与四个 Protect 开关在本例全出，
规范层面它们均可省略，省略时解析器取默认。现代 Visio 不再写旧式的
CustomMenusFile 之类定制元素。

#### 5.2.5 补充注解

- 顺序即协议：五个顶层子元素的位置由规范固定，产物生成时不要重排；
- 根元素两个命名空间：visio/2012/main 主命名空间与 r 关系命名空间，后者在
  5.3 的关系文件里才真正用到；
- 本文件是"样式默认"的家。页面形状与母版形状上的样式引用、实例覆盖 cell
  都以它为准，对照 5.4 与 5.5 一起读；
- 样式 Cell 与形状 Cell 同名同义，5.4.2 母版内的 LineStyle='3' 等引用即
  指向本文件；
- cell 带 V 与 F 两个面：V 是值，F 是公式。F 存在时语义在公式里；
  F='Inh' 表示继承引用的样式，F='THEMEVAL(…)' 表示主题驱动，
  F='No Formula' 表示无公式，V 就是最终值；
- 样式表内部 cell 的书写顺序不是严格协议：basic-2 与 basic-3 的
  document.xml 同为 32981 字节、cell 集合一致，只有某张 StyleSheet 里两段
  cell 的先后互换。固定的是文档结构层级，不是样式内的罗列次序；
- FaceNames 的 Flags 位义、WindowState 状态位义两处留了待核，等官方定义
  或更多样本补全。

### 5.3 document.xml.rels

#### 5.3.1 文件定位

主文档是整份图纸的枢纽：向下接母版区与页面区，平级接窗口布局。这一张关系表
登记这三个去向。机制与包根 .rels 相同，见第 3 章。

文件躺在 `visio/_rels/` 下，Target 相对 document.xml 所在目录解析。

#### 5.3.2 实例内容

素材 `basic-1/`，全文见 `docs/research/basic-1/visio/_rels/document.xml.rels`，
basic-2 与之逐字一致。XML 声明行省略：

```xml
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId3" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>
    <Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>
    <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="masters/masters.xml"/>
</Relationships>
```

#### 5.3.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| rId1 Type | …visio/2010/relationships/masters | Visio 专有：母版目录 | 复数关系指向目录文件 |
| rId1 Target | masters/masters.xml | 母版目录 | 相对 visio/ 目录 |
| rId2 Type | …relationships/pages | Visio 专有：页目录 | 复数关系指向目录文件 |
| rId2 Target | pages/pages.xml | 页目录 | 相对 visio/ 目录 |
| rId3 Type | …relationships/windows | Visio 专有：窗口 | 单数，指向单文件 |
| rId3 Target | windows.xml | 窗口布局 | 平级，不带目录前缀 |

#### 5.3.4 字段扩展

单复数规律在这张表最清楚：指向"目录"的关系用复数 masters 与 pages，目标
是目录文件 masters.xml 与 pages.xml；指向"单份内容"的关系用单数 master 与
page，出现在各区的目录关系表里，见 5.4.3.5 与 5.5.3.5。Type 名词与目标层级
一一对应，写解析器时可据此分派。

Target 的写法跟着相对位置走。document.xml 在 visio/ 下，所以目录目标带
子目录前缀 pages/pages.xml，平级目标不带前缀 windows.xml。

rId 又是乱序的，3、2、1，再次验证编号只是别名。两张素材的这张表逐字一致，
说明主文档的三个去向不随图纸内容变化。

#### 5.3.5 补充注解

- 整条引用链的完整走法见 3.5 的链图：包根 .rels 到主文档，主文档到三个区，
  各区目录再往下走；
- 母版数或页数为零的文档，这张表是否仍保留对应关系行，两份素材都是齐全
  形态，零值形态待核。

### 5.4 masters 区

#### 5.4.1 文件定位

masters 区放形状模板库，页面形状盖的"印章"都出自这里。区里三类文件分工：

```
visio/masters/
├── masters.xml             母版目录：每条目一份档案加一个 Rel 挂接
├── _rels/masters.xml.rels  目录关系表：rId → masterN.xml
├── master1.xml             母版内容：MasterContents 里的形状定义
├── master2.xml             （basic-2 的连接线母版）
└── …                       母版数等于模板数
```

引用链是：主文档经 5.3 的 masters 关系到达目录；目录里每个 Master 条目用
Rel r:id 指向关系表；关系表把 rId 翻译成 masterN.xml。页面方向则反过来：
页内形状写 Master="ID"，按目录里的编号取模板，见 5.5.3.2。

数量规律在两份素材里直接可见：basic-1 一枚矩形母版，basic-2 两枚，加一枚
动态连接线母版。masters.xml、关系表、masterN.xml 三处随之同步增减。

#### 5.4.2 实例内容

目录文件以 basic-1 为准，见 `docs/research/basic-1/visio/masters/masters.xml`。
Icon 的 base64 文本长，正文省略，结构与条目属性一个不少。下面三段代码的
XML 声明行都省略：

```xml
<Masters xmlns=…visio/2012/main xmlns:r=…relationships>
    <Master ID='2' NameU='Rectangle' IsCustomNameU='1' Name='矩形' IsCustomName='1'
            Prompt='拖到绘图页上。' IconSize='1' AlignName='2' MatchByName='0'
            IconUpdate='1' UniqueID='{08840884-0002-0000-8E40-00608CF305B2}'
            BaseID='{265F9737-E810-4325-8E7F-292854638452}' PatternFlags='0'
            Hidden='0' MasterType='2'>
        <PageSheet LineStyle='0' FillStyle='0' TextStyle='0'>
            <Cell N='PageWidth' V='3.937007874015748' U='MM'/>
            <Cell N='PageHeight' V='3.937007874015748' U='MM'/>
            …其余画布 cell，见 5.4.3.2…
            <Cell N='ShapeKeywords' V='基本,形状,几何图形,多边形,矩形,右,角,四边'/>
        </PageSheet>
        <Icon> …base64 位图… </Icon>
        <Rel r:id='rId1'/>
    </Master>
</Masters>
```

目录关系表用 basic-2 的，全文见
`docs/research/basic-2/visio/masters/_rels/masters.xml.rels`，两行顺序故意
乱写，条目数与母版数相等：

```xml
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId2" Type="…visio/2010/relationships/master" Target="master2.xml"/>
    <Relationship Id="rId1" Type="…visio/2010/relationships/master" Target="master1.xml"/>
</Relationships>
```

basic-1 只有一行 rId1 指向 master1.xml，见
`docs/research/basic-1/visio/masters/_rels/masters.xml.rels`。

母版内容文件以矩形为例，素材 `basic-1/` 全文 109 行，见
`docs/research/basic-1/visio/masters/master1.xml`，骨架如下：

```xml
<MasterContents xmlns=…visio/2012/main …>
    <Shapes>
        <Shape ID='5' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3'>
            …变换与行为 Cell：Pin/LocPin/Width/Height/Angle/EventDblClick 等…
            <Section N='Connection'>…5 行连接点…</Section>
            <Section N='User'>…visVersion=15…</Section>
            <Section N='Character'>…Size=0.1389PT…</Section>
            <Section N='Geometry' IX='0'>…矩形轮廓 5 行…</Section>
        </Shape>
    </Shapes>
</MasterContents>
```

basic-2 多一份连接线母版内容，文件名为 master2.xml，素材见
`docs/research/basic-2/visio/masters/master2.xml`，形态与矩形母版差异较大，
5.4.3.4 单独对照。

#### 5.4.3 字段解释

字段统一四列，母版区按三个文件拆成四组下钻。

##### 5.4.3.1 masters.xml 目录条目字段

以 basic-1 的矩形条目取值：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 2 | 本文档母版表内编号 | 页面形状 Master="N" 引用的就是它 |
| NameU | Rectangle | 程序标识名 | 唯一、不随语言变，跨文档找母版按它 |
| Name | 矩形 | 显示名 | 本地化名字，界面显示 |
| IsCustomNameU | 1 | 程序名是否自定义 | 1=用户改过名 |
| IsCustomName | 1 | 显示名是否自定义 | 同上 |
| Prompt | 拖到绘图页上。 | 拖拽提示 | 把母版拖到页面时的提示文案 |
| IconSize | 1 | 图标尺寸档 | 模具窗格图标 |
| AlignName | 2 | 名字对齐方式 | 图标下方文字排版 |
| MatchByName | 0 | 是否按名匹配 | 1=拖入时按 NameU 找同型 |
| IconUpdate | 1 | 图标自动更新 | 1=形状变化后重绘图标 |
| UniqueID | {0884…B2} | 母版唯一 ID | GUID，跨文档识别与溯源 |
| BaseID | {265F…52} | 源标识 | 标注基础形状来源 |
| PatternFlags | 0 | 图案标志 | 内部使用 |
| Hidden | 0 | 是否隐藏 | 1=不出现在模具窗格 |
| MasterType | 2 | 母版标志组合 | 数值随保存上下文变化，见 5.4.4 |
| Rel r:id | rId1 | 内容挂接 | 经目录关系表到 masterN.xml |

##### 5.4.3.2 条目 PageSheet 画布字段

目录条目自带一张 PageSheet，是母版画布设置：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| PageWidth/PageHeight | 3.937007874015748 U=MM | 画布 100×100mm | 母版以 mm 为设计网格 |
| PageScale/DrawingScale | 0.03937007874015748 U=MM | 比例 1mm=1 单位 | 画布刻度 |
| ShdwOffsetX/Y | ±0.1181102362204724 | 默认阴影偏移 | 阴影落位 |
| DrawingSizeType | 0 | 画布尺寸方式 | 矩形为 0 |
| DrawingScaleType | 0 | 刻度方式 | 默认 |
| InhibitSnap | 0 | 禁止吸附 | 0=允许 |
| PageLockReplace/PageLockDuplicate | 0 BOOL | 页锁定开关 | 保护画布 |
| UIVisibility | 0 | UI 可见性 | 内部 |
| ShdwType/ObliqueAngle/ScaleFactor | 0/0/1 | 阴影类型/斜角/比例 | 阴影默认 |
| DrawingResizeType | 1 | 画布自动调整 | 母版尺寸变化时行为 |
| ShapeKeywords | 基本,形状,几何图形,… | 搜索关键词 | 本地化，搜索形状用 |

##### 5.4.3.3 master1.xml 母版内容字段

根元素 MasterContents 装 Shapes，里面一个 Shape 就是模板形状。头部：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 5 | 母版内部形状编号 | 自成体系，与页面形状 ID 不相干 |
| Type | Shape | 形状类型 | 常规形状 |
| LineStyle/FillStyle/TextStyle | 3 | 样式引用 | 指向 document.xml 的 3 号 Normal |

变换与行为 Cell：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| PinX/PinY | 1.968503954842335 U=MM | 占位中心 | 100mm 画布的中心位置 |
| Width/Height | 1.5748 / 1.1811 U=MM | 40×30mm 占位几何 | 实例落地后由页面值接管 |
| LocPinX/LocPinY | F=Width*0.5 / Height*0.5 | 锚点在中心 | 公式化，随尺寸联动 |
| Angle/FlipX/FlipY | 0 | 不旋转不翻转 | 默认姿态 |
| ResizeMode | 0 | 尺寸调整模式 | 默认 |
| EventDblClick | F=OPENTEXTWIN() | 双击进文本编辑 | 官方母版行为 |
| HelpTopic | Vis_Sba.chm!#45752 | 帮助锚点 | 官方形状自带元数据 |
| Copyright | Copyright (c) 2012 Microsoft Corporation | 版权串 | 同上 |
| ShapeSplit | 1 | 允许被其它线拆分 | 被连接线穿过时自动分段 |
| LineWeight | F=THEMEVAL("LineWeight",0.24PT) | 线宽默认 | 主题可覆盖 |
| QuickStyleType | 2 | 快速样式分类 | UI 分组用 |

没有填充色 cell，填充交给样式与主题默认，母版不写死颜色。

Section Connection 是粘附协议的母版侧定义，五行为矩形备好粘附点库：

| IX | 位置公式 | 方向 | 位置 |
| --- | --- | --- | --- |
| 0 | Width*0.5, Height*0 | (0,1) | 下边中点 |
| 1 | Width*1, Height*0.5 | (-1,0) | 右边中点 |
| 2 | Width*0.5, Height*1 | (0,-1) | 上边中点 |
| 3 | Width*0, Height*0.5 | (1,0) | 左边中点 |
| 4 | Width*0.5, Height*0.5 | (0,1) | 中心 |

每行另带 Type、AutoGen、Prompt 三个 cell，F='No Formula' 固化。

表格按母版局部系理解：原点在形状左下、Y 向上，方向列是粘附线进入形状的
指向。行号约定要单独记一条：粘附公式与 Connects 记录里的 Connections.Xn
对应行 IX=n-1，即 X1 是 IX=0 下边中点、X2 是 IX=1 右边中点、X3 是 IX=2
上边中点、X4 是 IX=3 左边中点，与 Geometry 行 Xn=IX=n 的规则不同。这个
约定来自四份素材的端口对位，见 5.5.3.3 与 5.5.3.4。❓ 官方出处待核，
观测点入 6.5 的 W-10。

连接点行由母版提供。各素材的页面实例 XML 里都没有 Connection 段，粘附
公式仍直接引用 Sheet.N!Connections.Xn：行数据沿母版继承链解析可得，
见 5.5.3.3。

User 与 Character 两段：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Section User / visVersion | 15 | 官方母版版本标记 | 形状库版本追踪 |
| Section Character / Size | 0.1388888888888889 U=PT | 默认字号约 10pt | 文字最终由实例给 |

Section Geometry 画矩形轮廓，五行首尾相接，最后一行显式回到起点：

| 行 | 类型 | 坐标公式 | 说明 |
| --- | --- | --- | --- |
| IX=1 | MoveTo | Width*0, Height*0 | 起点左下 |
| IX=2 | LineTo | Width*1, Height*0 | 底边 |
| IX=3 | LineTo | Width*1, Height*1 | 右边 |
| IX=4 | LineTo | Width*0, Height*1 | 顶边 |
| IX=5 | LineTo | Geometry1.X1, Geometry1.Y1 | 显式闭合 |

行首五个开关 NoFill/NoLine/NoShow/NoSnap/NoQuickDrag 全为 0，可填充可描边
可见。坐标的 U=MM 只是显示单位，内部一律英寸制。

##### 5.4.3.4 master2.xml 连接线母版字段

连接线母版是 1-D 形状，与矩形母版的差异本身就是最好的字段课：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| LineStyle/FillStyle/TextStyle | 7 | 样式引用 | 指向 document.xml 的 7 号 Connector |
| OriginalID | 0 | 母版形状来源标记 | 连接线母版 Shape 自带此属性，矩形母版没有；❓ 语义待核，见 6.5 W-10 |
| PinX/PinY | F=GUARD((BeginX+EndX)/2) | 中心钉在两端的中间 | 起终点一变，中心自动跟随 |
| Width/Height | F=GUARD(EndX-BeginX) 等 | 尺寸由两端公式算出 | Width、Height 均可负，负值代表端点顺序反向 |
| BeginX/BeginY/EndX/EndY | 1.1811 / 2.3622 / 2.3622 / 1.1811 | 默认起终点 | 30×30mm 的默认对角段 |
| Angle/FlipX/FlipY | F=GUARD(0DA) 等 | 姿态锁定 | 端点式形状不该被整体旋转 |
| LockHeight/LockCalcWH | 1 | 尺寸锁定 | 尺寸归公式管 |
| GlueType | 2 | 粘附类型 | 1-D 形状两端粘附 |
| ObjType | 2 | 对象类型 | 与页面矩形实例的取值不同，见 5.5.3.3 |
| DynFeedback | 2 | 拖拽动态反馈 | 拖动时的预览行为 |
| NoLiveDynamics | 1 | 关闭实时动态 | 路由过程中不实时重排 |
| ShapeSplittable | 1 | 可被拆分 | 与 ShapeSplit 配套 |
| LayerMember | 0 | 归属图层 | 挂在 0 号图层，见 5.5.3.1 |
| TxtPinX/TxtPinY | F=SETATREF(Controls.TextPosition) | 文本锚点跟随控制点 | 文本位置句柄拖动时联动 |
| TxtWidth/TxtHeight | F=MAX(TEXTWIDTH(TheText),5*Char.Size) 等 | 文本块尺寸自适应 | 文字换行与高度按内容算 |
| HelpTopic/Copyright | Vis_SE.chm!#20000 / 中文版权 | 帮助与版权 | 官方连接线形状自带 |

Section Control 放文本位置控制点，行名 TextPosition：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| X/Y | 0 / -1.181102362204724 | 控制点位置 | 文本句柄所在 |
| XDyn/YDyn | 0 / -1.181102362204724 | 动态位置 | F 指向自身，供 SETATREF 写回 |
| XCon | F=IF(OR(STRSAME(SHAPETEXT(TheText),""),HideText),5,0) | 可见性公式 | 无文字时不显示句柄 |
| CanGlue | 0 | 可粘附 | 该句柄不接受粘附 |
| Prompt | Reposition Text | 句柄提示 | 悬停文案 |

Geometry 只有三段，画默认对角线段，NoFill=1 只描线不填充。1-D 母版没有
Connection 段，它的"粘附点"就是两个端点本身。

##### 5.4.3.5 masters.xml.rels 关系表字段

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Id | rId1、rId2 | 本文件内别名 | 被目录条目的 Rel r:id 引用 |
| Type | …relationships/master | Visio 专有：单份母版 | 单数，与条数无关 |
| Target | masterN.xml | 内容文件 | 相对 masters/ 目录，不带前缀 |

条目数恒等于母版数，rId1…rIdN 与 master1.xml…masterN.xml 一一对应。

#### 5.4.4 字段扩展

文件名与母版 ID 没有绑定关系。master1.xml 这个文件名装的是 ID=2 的矩形，
文件名只是关系表的落点。ID 是打包时的文档内编号，同一枚母版换个文档可能
重排。官方模具里出现过 ID=100 起的大号，见第六章的图型案例计划。

NameU 与 Name 的分工在条目上最清楚：NameU 是稳定程序标识，Name 是本地化
显示名。连接线条目 MatchByName=1 而矩形为 0，表示连接线按名匹配；
IconUpdate=0 表示它的图标不随形状自动更新。

MasterType 不是固定枚举。basic-2 里动态连接线条目取 0，basic-3 与 basic-4
里同一枚母版（master2.xml 逐字节相同）取 541，541 = 0x21D，置位 0/2/3/4/9，
看着像保存时按行为算出的标志组合；矩形条目四份素材恒为 2。完整位义待核。

Master 条目的 PageSheet 里，连接线与矩形的画布设置不同：DrawingSizeType
取 4 对 0，DrawingResizeType 取 0 对 1。连接线条目还多带一个 Section Layer，
声明"连接线"图层行，页面画布里也有一份同名行，成对出现，见 5.5.3.1。

两份素材的样式引用差异值得连起来看：矩形母版引用 3 号 Normal，连接线母版
引用 7 号 Connector。basic-1 没有 7 号样式也没有连接线母版，basic-2 两者
一起出现，样式表跟着内容走。

母版内容文件的 Shape ID 是独立编号域。矩形母版内部 ID=5，页面实例 ID 从 1
开始，两套编号互不相干，见 5.5.3.2。

basic-3 入库时再次验证母版稳定性：master1.xml 与 master2.xml 和 basic-2
逐字节相同，变的只有目录条目里的 MasterType。母版内容从模具库导出后保持
稳定，目录档案按每次保存的上下文重算。

#### 5.4.5 补充注解

- 母版与实例的分工小结：母版给几何轮廓、连接点、双击行为、元数据和默认
  字号；实例给页面位置尺寸、文本与覆盖 cell。本例矩形母版没有 Text 元素，
  是纯印章，文字由盖印时写上去；
- 目录与内容之间靠 Rel r:id 桥接，不靠文件名猜。basic-2 的关系表 rId2 排在
  rId1 前面，顺序无意义再次现身；
- 母版画布与页面画布的 PageSheet cell 同名同义，对照 5.5.3.1 一起读；
- 连接线文本句柄的机制闭环：母版 TxtPinX/Y 用 SETATREF 写回 Control 行，
  控制行用 XCon 公式决定句柄是否显示，页面实例再带一份 Control 行复刻，
  见 5.5.3.3。

### 5.5 pages 区

#### 5.5.1 文件定位

pages 区是图纸正片。目录管"有几页、多大"，内容管"页上画了什么"：

```
visio/pages/
├── pages.xml             页目录：每页一条档案加 Rel 挂接，PageSheet 管画布
├── _rels/pages.xml.rels  目录关系表：rId → pageN.xml
├── page1.xml             页内容：PageContents 里的 Shapes 与 Connects
├── _rels/page1.xml.rels  页的关系表：声明本页用到的母版
└── …                     每页一组
```

引用链：主文档经 5.3 的 pages 关系到目录；页条目用 Rel r:id 经目录关系表到
pageN.xml。页内容里形状的 Master="ID" 再反向引用母版区。两页以上的文档，
每页一份 pageN.xml 加自己的 _rels。

#### 5.5.2 实例内容

页目录以 basic-1 为准，全文见 `docs/research/basic-1/visio/pages/pages.xml`：

```xml
<Pages xmlns=…visio/2012/main xmlns:r=…relationships>
    <Page ID='0' NameU='Page-1' Name='页-1' ViewScale='1' ViewCenterX='2.2596784055742' ViewCenterY='8.362040415546'>
        <PageSheet LineStyle='0' FillStyle='0' TextStyle='0'>
            <Cell N='PageWidth' V='8.26771653543307'/>
            <Cell N='PageHeight' V='11.69291338582677'/>
            <Cell N='ShdwOffsetX' V='0.1181102362204724'/>
            <Cell N='ShdwOffsetY' V='-0.1181102362204724'/>
            <Cell N='PageScale' V='0.03937007874015748' U='MM'/>
            <Cell N='DrawingScale' V='0.03937007874015748' U='MM'/>
            <Cell N='DrawingSizeType' V='0'/>
            <Cell N='DrawingScaleType' V='0'/>
            <Cell N='InhibitSnap' V='0'/>
            <Cell N='PageLockReplace' V='0' U='BOOL'/>
            <Cell N='PageLockDuplicate' V='0' U='BOOL'/>
            <Cell N='UIVisibility' V='0'/>
            <Cell N='ShdwType' V='0'/>
            <Cell N='ShdwObliqueAngle' V='0'/>
            <Cell N='ShdwScaleFactor' V='1'/>
            <Cell N='DrawingResizeType' V='1'/>
            <Cell N='PageShapeSplit' V='1'/>
        </PageSheet>
        <Rel r:id='rId1'/>
    </Page>
</Pages>
```

basic-2 的 pages.xml 同名同构，PageSheet 里多一个 Section Layer，图层行与
连接线母版带的那份一致，见 5.5.3.1。

页内容先看 basic-1 的矩形页，全文 26 行见
`docs/research/basic-1/visio/pages/page1.xml`：

```xml
<PageContents xmlns=…visio/2012/main …>
    <Shapes>
        <Shape ID='1' NameU='Rectangle' Name='矩形' Type='Shape' Master='2'>
            <Cell N='PinX' V='2.266439705236128'/>
            <Cell N='PinY' V='8.35816150639786'/>
            <Text>AAA
            </Text>
        </Shape>
        <Shape ID='2' Type='Shape' Master='2'>
            <Cell N='PinX' V='4.136518445393608'/>
            <Cell N='PinY' V='8.35816150639786'/>
            <Cell N='LineWeight' V='0.01388888888888889' U='PT'/>
            <Section N='Character'>
                <Row IX='0'>
                    <Cell N='Size' V='0.5' U='PT'/>
                </Row>
            </Section>
            <Text>
                <cp IX='0'/>
BBB
            </Text>
        </Shape>
    </Shapes>
</PageContents>
```

basic-2 的页内容加了一根动态连接线，素材全文见
`docs/research/basic-2/visio/pages/page1.xml`。正文把三个形状逐 cell 列骨架，
数值按素材原样截断展示，完整精度以素材为准，XML 声明行省略：

```xml
<PageContents …>
    <Shapes>
        <Shape ID='1' NameU='Rectangle' Name='矩形' Type='Shape' Master='2'>
            <Cell N='PinX' V='2.165354365386392'/>  <Cell N='PinY' V='7.741008905209998'/>
            <Cell N='ObjType' V='1'/>  <Text>AAA…</Text>
        </Shape>
        <Shape ID='2' Type='Shape' Master='2'>
            <Cell N='PinX' V='6.102362338481369'/>  <Cell N='PinY' V='7.741008905209998'/>
            <Cell N='ObjType' V='1'/>  <Text>BBBBBBBBB…</Text>
        </Shape>
        <Shape ID='3' NameU='Dynamic connector' Name='动态连接线' Type='Shape' Master='4'>
            <Cell N='PinX' V='4.133858351933879' U='MM' F='Inh'/>
            <Cell N='Width' V='2.362204823488677' U='MM' F='GUARD(EndX-BeginX)'/>
            <Cell N='Height' V='0.1968503937007874' F='GUARD(0.19685039370079DL)'/>
            <Cell N='BeginX' V='2.952755940189541' U='MM' F='PAR(PNT(Sheet.1!Connections.X2,Sheet.1!Connections.Y2))'/>
            <Cell N='BeginY' V='7.741008905209998' U='MM' F='PAR(PNT(Sheet.1!Connections.X2,Sheet.1!Connections.Y2))'/>
            <Cell N='EndX' V='5.314960763678219' U='MM' F='PAR(PNT(Sheet.2!Connections.X4,Sheet.2!Connections.Y4))'/>
            <Cell N='EndY' V='7.741008905209998' U='MM' F='PAR(PNT(Sheet.2!Connections.X4,Sheet.2!Connections.Y4))'/>
            <Cell N='LayerMember' V='0'/>
            <Cell N='BegTrigger' V='2' F='_XFTRIGGER(Sheet.1!EventXFMod)'/>
            <Cell N='EndTrigger' V='2' F='_XFTRIGGER(Sheet.2!EventXFMod)'/>
            <Cell N='EndArrow' V='13'/>
            <Section N='Control'>…TextPosition 行，同母版复刻…</Section>
            <Section N='Geometry' IX='0'>
                <Row T='MoveTo' IX='1'><Cell N='Y' V='0.09842519685039353'/></Row>
                <Row T='LineTo' IX='2'><Cell N='X' V='2.362204823488677'/><Cell N='Y' V='0.09842519685039353'/></Row>
                <Row T='LineTo' IX='3' Del='1'/>
            </Section>
        </Shape>
    </Shapes>
    <Connects>
        <Connect FromSheet='3' FromCell='EndX' FromPart='12' ToSheet='2' ToCell='Connections.X4' ToPart='103'/>
        <Connect FromSheet='3' FromCell='BeginX' FromPart='9' ToSheet='1' ToCell='Connections.X2' ToPart='101'/>
    </Connects>
</PageContents>
```

两张关系表全文。目录关系表见
`docs/research/basic-1/visio/pages/_rels/pages.xml.rels`：

```xml
<Relationships xmlns="…/package/2006/relationships">
    <Relationship Id="rId1" Type="…visio/2010/relationships/page" Target="page1.xml"/>
</Relationships>
```

页的关系表用 basic-2 的，两条恰好对应本页用到的两枚母版，见
`docs/research/basic-2/visio/pages/_rels/page1.xml.rels`：

```xml
<Relationships xmlns="…/package/2006/relationships">
    <Relationship Id="rId2" Type="…visio/2010/relationships/master" Target="../masters/master2.xml"/>
    <Relationship Id="rId1" Type="…visio/2010/relationships/master" Target="../masters/master1.xml"/>
</Relationships>
```

basic-1 的 page1.xml.rels 只有一行，指向 ../masters/master1.xml。

#### 5.5.3 字段解释

字段统一四列，页面区按四个文件拆成五组下钻。

##### 5.5.3.1 pages.xml 页条目与页画布字段

Page 条目属性：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 0 | 本文档页表内编号 | TopPage 与 Window.Page 引用它 |
| NameU | Page-1 | 程序标识名 | 唯一 |
| Name | 页-1 | 显示名 | 本地化 |
| ViewScale | 1 | 默认视图缩放 | 打开该页时的视图记忆 |
| ViewCenterX/Y | 2.2596784055742 / 8.362040415546 | 默认视图中心 | 与 windows.xml 的 Window 同值双写 |
| Rel r:id | rId1 | 内容挂接 | 经目录关系表到 pageN.xml |

PageSheet 页画布：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| PageWidth/PageHeight | 8.26771653543307 / 11.69291338582677 | 页面尺寸 | A4 竖版，英寸内部值 |
| PageScale/DrawingScale | 0.03937007874015748 U=MM | 刻度比例 | 1mm 一个绘图单位 |
| ShdwOffsetX/Y | ±0.1181102362204724 | 阴影默认偏移 | 形状阴影落位 |
| DrawingSizeType/DrawingScaleType | 0 | 尺寸与刻度方式 | 默认 |
| InhibitSnap | 0 | 禁止吸附 | 0=允许 |
| PageLockReplace/PageLockDuplicate | 0 BOOL | 页锁定 | 与母版画布同语义 |
| UIVisibility | 0 | UI 可见性 | 内部 |
| ShdwType/ObliqueAngle/ScaleFactor | 0/0/1 | 阴影默认 | — |
| DrawingResizeType | 1 | 画布自动扩展 | 形状越界时行为 |
| PageShapeSplit | 1 | 页上允许拆分 | 连接线穿形状自动分段的总开关 |

basic-2 页画布里的 Section Layer 是图层声明的页面侧副本：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Row Name | 连接线 | 图层显示名 | 图层窗格里显示 |
| NameUniv | Connector | 图层通用名 | 改名后仍按它识别 |
| Color | 255 | 图层颜色 | 按图层着色用，取值对应色板，具体映射待核 |
| Visible | 1 | 可见开关 | 按层整组显隐 |
| Print | 1 | 可打印开关 | 按层控制打印 |
| Active | 0 | 当前激活层 | 新形状默认落入的层 |
| Lock | 0 | 锁定 | 1=该层不可编辑 |
| Snap/Glue | 1 | 吸附/粘附开关 | 该层形状是否参与 |
| Status | 0 | 状态位 | 内部标记，语义待核 |
| ColorTrans | 0 | 颜色透明度 | 0=不透明 |

##### 5.5.3.2 page1.xml 普通形状实例字段

矩形实例两条，字段逐项：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 1、2… | 页内形状编号 | 页内唯一；分配后不回填，见 5.5.4 |
| NameU/Name | Rectangle / 矩形（形状 1） | 名称 | 形状 2 未写名称属性，说明可省略 |
| Type | Shape | 形状类型 | 常规形状 |
| Master | 2 | 母版引用 | 指向 5.4.3.1 目录里的矩形母版 |
| PinX/PinY | 页面坐标 | 实例位置 | 覆盖母版占位几何 |
| LineWeight | 0.01388888888888889 U=PT | 线宽覆盖 | 直接 Cell 覆盖写法 |
| Character / Size | 0.5 U=PT | 字号覆盖 | Section 内覆盖写法 |
| Text | AAA / <cp IX='0'/>BBB | 实例文本 | 两种形态见下 |

实例与母版的关系是覆盖：形状只写自己不同的 cell，其余从母版继承。两种覆盖
写法都出现了：LineWeight 是直接 Cell 覆盖，Character.Size 是 Section 内行
覆盖。basic-2 的矩形实例另写 ObjType=1，与连接线的取值不同，枚举含义待核。

Text 的两种形态：AAA 是纯文本最小写法；BBB 前面带 <cp IX='0'/>，cp 是 run
的边界锚点，文本按 run 分段才能挂不同的字符格式。两种形态在 basic-1 的同一
页内并存。basic-2 的两根矩形文字都是纯文本写法，不带 cp。

##### 5.5.3.3 page1.xml 连接线实例字段

动态连接线实例把母版的公式实例化，逐项看：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 3 | 页内编号 | 与矩形 1、2 连续 |
| Master | 4 | 母版引用 | 指向目录里的动态连接线 |
| PinX/PinY | F='Inh' | 位置继承 | 由宽度高度公式间接决定 |
| Width/Height | F=GUARD(EndX-BeginX) 等 | 尺寸随端点 | 固定 DL 尺寸的维度随走向切换，另一维可负 |
| BeginX/BeginY | F=PAR(PNT(Sheet.1!Connections.X2,…Y2)) | 起点钉在目标连接点 | 矩形 1 的 X2 号连接点，行 IX=1 右边中点 |
| EndX/EndY | F=PAR(PNT(Sheet.2!Connections.X4,…Y4)) | 终点钉在目标连接点 | 矩形 2 的 X4 号连接点，行 IX=3 左边中点 |
| BegTrigger | F=_XFTRIGGER(Sheet.1!EventXFMod) | 起点触发器 | 目标形状变换时重算起点 |
| EndTrigger | F=_XFTRIGGER(Sheet.2!EventXFMod) | 终点触发器 | 同上作用于终点 |
| EndArrow | 13 | 端点箭头样式 | 按线样式枚举解释 |
| ShapeRouteStyle | 5 | 路由样式覆盖 | basic-3 的部分实例带此 cell |
| ConFixedCode | 5 | 连接线固定方式 | basic-3 的走线粘附实例带此 cell |
| LayerMember | 0 | 归属图层 | 本页 0 号连接线层 |
| Control / TextPosition | 控制点行 | 文本句柄复刻 | 与母版配套，见 5.4.3.4；basic-4 实例多带 XCon 单元，V=0 F='Inh' |
| Text | 标签文字 | 连接线文本 | basic-4 首见：实例带 Text 元素；basic-2/3 连接线无文本 |
| TxtWidth/TxtHeight/TxtLocPinX/Y | F='Inh' | 文本块尺寸缓存 | 有文本时写缓存，无文本时整组省略 |

PAR(PNT(...)) 是粘附的公式机制。PAR 在引用单元格的当前实例上求值，PNT 把
两个坐标打包成点。BeginX 引用的是矩形 1 形状表里 Connections.X2 行的 X 与
Y，按 5.4.3.3 的行号约定 X2 是行 IX=1 右边中点，于是线的起点钉在矩形 1 的
右边中点，矩形移动时坐标自动更新，不用重写缓存。

_XFTRIGGER 是触发器：它订阅目标形状的 EventXFMod 变换事件，目标一动，
本端立即重算。两端一钉、几何一拉，连接线就成了活的。

basic-3 出现第二种粘附：走线粘附。shape 6 的 EndX 公式是
_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)，不再 PAR 到某个连接点，
Connects 里对应记录 ToCell='PinX'、ToPart='3'，端点粘在目标形状本体上，
随目标移动沿边重新布点。两种粘附可以在同一页并存。

basic-4 补上两块拼图。第一块是连接线文本。实例 Text 元素直接写标签文字，
文本格式与块尺寸走母版继承：TxtPinX/Y 经 SETATREF 写回 TextPosition 句柄，
TxtWidth/TxtHeight 按内容自适应，实例只写 F='Inh' 的缓存。标签默认居中时
TextPosition 行的 X/Y 缓存就是走线几何中点；标签被拖走后 X/Y 写新位置，
XDyn/YDyn 及其余 cell 一律 F='Inh' 继承。第二块是走线方向。固定 DL 尺寸
那一维随走向切换：横向走线固定 Height、Width 随端点，竖向走线反过来，
另一维 GUARD(EndX-BeginX) 或 GUARD(EndY-BeginY) 可负，负值表示起终点
顺序反向。basic-4 的竖向连接线 Height=-0.5413，斜向连接线 Width=-1.0827，
都是这个约定。

Geometry 只有三段，第三行 Del='1'：

| 行 | 内容 | 说明 |
| --- | --- | --- |
| IX=1 MoveTo | Y=0.09842519685039353 | 起点段，X 未写 |
| IX=2 LineTo | X、Y 同值 | 画到终点段 |
| IX=3 LineTo | Del='1' | 删除占位行，不参与绘制 |

Del=1 的行保留行号不删体，几何行号体系保持稳定，编辑与引用都安全。

basic-3 的连接线实例几何更精简：有的只有两行 LineTo，行号从 IX=2 起，
MoveTo 行整个省掉；行内坐标 cell 也按需省略，有的行只写 Y。1-D 形状的
几何书写高度按需，行号体系保证结构稳定。

##### 5.5.3.4 Connects 粘附记录字段

页尾 Connects 段把 1-D 形状的粘附关系落成清单，每条一行：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| FromSheet | 3、5、6、11 | 粘附发起方 | 页内连接线实例 |
| FromCell | BeginX / EndX | 发起端 cell | 起点或终点 |
| FromPart | 9 / 12 | 端点角色编码 | 9 恒配 BeginX，12 恒配 EndX |
| ToSheet | 被粘的形状 | 粘附目标 | 矩形等 |
| ToCell | Connections.Xn / PinX | 目标落点 | 连接点行或形状本体 |
| ToPart | 100~103 / 3 | 目标角色编码 | 经验规律见下，官方出处待核 |

basic-2 加 basic-3 加 basic-4 共十三条记录，规律清晰：钉在连接点行上的
记录，ToCell 写 Connections.Xn，ToPart 与行 IX 对应，值=100+IX：X1 取 100、
X2 取 101、X3 取 102、X4 取 103，与形状公式引用的行完全一致。basic-3 另有
一条不钉连接点的：ToCell 写 PinX，ToPart 为 3，配合走线粘附公式
_WALKGLUE，见 5.5.3.3。

行号规模在专篇里扩展：sequence 的生命线把连接行建到 100 枚时间格，
Xn 一路取到 X23、ToPart 取到 122，规律不变，见
[sequence-结构分析.md](sequence-结构分析.md) 第 2 章；gantt 的任务条
使用命名连接行 LeftSide.X/RightSide.X，ToCell 不再是 Connections.Xn，
见 [gantt-结构分析.md](gantt-结构分析.md) 第 4 章，语义入 W-12。

Connects 是清单式记录，即使形状里的公式丢了，解析器也能靠它知道谁粘谁。
数值的官方出处仍待核，经验规律以本组素材为准。

##### 5.5.3.5 页面区关系表字段

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| pages.xml.rels 的 Type | …relationships/page | 目录到页内容 | 单数 page，N 页 N 行 |
| pages.xml.rels 的 Target | page1.xml | 页内容文件 | 相对 pages/ 目录 |
| page1.xml.rels 的 Type | …relationships/master | 页到母版 | 单数 master，每枚用到的母版一行 |
| page1.xml.rels 的 Target | ../masters/masterN.xml | 母版内容文件 | 上跳一级进兄弟区 |

页的关系表让解析器预知"这页会用到哪些母版文件"，渲染前即可定位依赖。
basic-1 一页用一枚母版就一行，basic-2 一页用两枚就两行。

#### 5.5.4 字段扩展

多页文档的规律可以类推：每页一条 Page 条目、一份 pageN.xml、目录关系表一行，
页文件数量与内容同步增减。页条目 ID 从 0 起编号，页内容里的形状 ID 从 1 起
独立编号，两套编号域别混。

形状编号分配后不回填。basic-3 的页里 8、9 空缺，从 7 直接跳到 10，是删除
过的形状留下的痕迹。复制产生的实例名自动带序号，比如 Rectangle.4、
Rectangle.7，与手工命名并存。

页面画布与母版画布的 PageSheet cell 几乎同名单值，A4 页宽高在 pages.xml
里是英寸内部值 8.2677 × 11.6929，U 未标但仍按内部英寸制。

页面尺寸不必是模板默认。basic-3 把页拉宽到 16.0354 × 11.6929 英寸，约
407 × 297mm，页画布还多出 XRulerOrigin 与 XGridOrigin 两个 cell，取值
7.7677…。PageSheet 的 cell 集合按需增减，不是固定全集。

ViewScale 与 ViewCenterX/Y 在 pages.xml 与 windows.xml 双写同值，一处是页的
默认视图，一处是窗口现场，改图纸时两者不必强求一致。basic-3 的 1.016 与
9.9286… 在两处同样一致，第三份素材验证这条规律。

形状实例覆盖是分层的：样式默认在 document.xml，见 5.2；母版默认在
masterN.xml，见 5.4；实例覆盖写在 pageN.xml，三层从下往上叠。矩形实例覆盖
LineWeight 与 Character.Size 就是第三层的例子。连接线实例在此基础上还有
公式层：PAR(PNT(...)) 把端点钉到别的形状表上。

#### 5.5.5 补充注解

- 图层机制串起来看：页面画布 Layer 行声明图层，形状 LayerMember 挂层，
  Visible/Print 等行开关按层批量控制。连接线母版把"连接线"图层行带在身边，
  落页时页面画布出现同名行，两处成对；
- 连接线的"活"来自公式：两端 PAR 钉连接点、触发器随目标刷新、几何随两端
  自动伸缩，坐标缓存只作显示值；
- 页面实例形状里没有完整几何时不要慌：几何在母版里，实例只带覆盖与位置；
- Connects 的 ToPart 官方出处、Layer 行的 Status 与 Color 映射、
  ObjType 枚举仍待核。ToPart 经验规律见 5.5.3.4：连接点行从 100 起随行号
  连续（X1=100），PinX 走线粘附取 3；
- basic-3 交叉验证小结：粘附记录规律一致，页面实例不带 Connection 段，
  连接线几何行可按需精简，MasterType 随保存变化，母版内容文件跨包稳定，
  详见 5.4.4、5.5.3.3 与 5.5.3.4；
- basic-4 再验证：行号约定 Connections.Xn=行 IX=n-1 在四份素材的端口对位
  全部命中，见 5.4.3.3；连接线标签文字与文本句柄的两种形态见 5.5.3.3；
  连接线母版 Shape 带 OriginalID='0' 而矩形母版没有，语义待核；
- 本章拆完，第一章的树状图已经全部落地：第二到五章与第〇章体例闭环。
  旧版对照全文随 git 历史保留（原 docs/archived 区已移除）。

### 5.6 Group 形状与容器机制（索引）

#### 5.6.1 文件定位

前五节讲的形状都是扁平 Shape：自身一套几何，连接线独立成 1-D 形状。
class 素材引入两种更强的结构：Group 形状，形状体内嵌套子形状；列表
容器，成员行是页级独立形状但由公式挂进容器。这两种机制都是行为层
知识，详解在专篇 [class-结构分析.md](class-结构分析.md)，本节只做
索引，记录它们在规范版里的位置和边界。

#### 5.6.2 实例内容

- Group：Type='Group'，母版内容里出现嵌套 `<Shapes>`；class 的类盒、
  关系线、注记都是这种形态；
- 容器：类盒带 Container 行集与 Controls.ROW_1，成员行是 Master=8 的
  页级形状，User 公式用 LISTSHEETREF() 回指容器；
- Trigger：class 素材 pages.xml 的 PageSheet 里出现
  `<Trigger N='RecalcColor'><RefBy T='Page' ID='0'/></Trigger>`，页面区
  第一个 Trigger 元素；
- 详解全文见 `class-结构分析.md` 第 2、3 章。

#### 5.6.3 字段解释

索引只列关键字段与去向：

| 字段 | 值 | 去向 |
| --- | --- | --- |
| ShapePlaceStyle | 15 | 类盒布局标志，专篇 2.3 |
| User.msvSDContainerMargin | 0.03937 | 容器内边距，专篇 3.3 |
| User.WidthMin / EntityName | 0.882 DL / Owner | 专篇 2.3 |
| Controls.ROW_1 | BOUND 公式 | 行宽控制点，专篇 3.3 |
| Relationships | SUM(DEPENDSON(SheetRef)) | 成员清单，专篇 3.3 |
| ShapeFixedCode | 1 | 成员锁定，专篇 3.3 |
| GlueType | 8 | 成员粘附类型，专篇 3.3 |
| EllipticalArcTo | 圆角行 | 前几份素材未出现的几何行，专篇 2.3 |
| Actions 段 | 右键动作集 | class 母版首见，专篇 5.2 k-4 |
| Trigger / RecalcColor | 页面级触发 | 本素材首次出现，语义待核 |

#### 5.6.4 字段扩展

- 类系列母版的连接点行是四行布局：IX0 左边、IX1 右边、IX2 下边、IX3
  上边中点。Xn=IX(n-1) 的命名约定不变，行到位置的映射随母版各异，
  解析器必须逐母版读连接点行，见 6.5 的 W-11；
- Group 的 LocPin 取 (0,0)，与矩形的中心锚不同，坐标换算要按母版几何
  重新对位，见专篇 5.2 k-2。

#### 5.6.5 补充注解

- 本节只做索引不做展开，通用格式层的增量知识以专篇为准；
- 图型专篇系列与规范版分工：规范版管格式层，专篇管图型行为层。class、
  ER、gantt、sequence 四篇已建，各篇专题可回填本节的观察点。

## 第六章 图型案例（C4 自产样本）

> 前五章的素材全部由 Visio 手工绘制。本章换一个写作者：本工程自己转出的
> C4 图，解压包入库为 `docs/research/c4-1/`。用它是做双面照镜。正面：拿
> 第二到五章的规律对照第二类产物，分清哪些是格式固有约定，哪些只是
> Visio 保存器的习惯。反面：把本工程的写入特征记下来，后续解析任意
> vsdx 时有一份对照。
> 素材声明：c4-1 是自产样本，不是 Visio 产物。通用规律仍以手工素材为准，
> 本章结论只在这份样本上成立，标注待核的条目等真机核验。
> 旧 01-C4 剖析已按计划删除，其内容在本章有处置对照表，见 6.5.4。

### 6.1 案例素材与包全景

#### 6.1.1 文件定位

案例是一张 C4 系统上下文图。mermaid 源稿全文见
`resources/test-examples/mmd-input/02-c4-1.mmd`：

```text
C4Context
    title 系统上下文
    Person(user, "用户")
    System(sys, "核心系统")
    System_Ext(ext, "外部系统")
    Rel(user, sys, "使用")
    Rel(sys, ext, "调用")
```

标题叫系统上下文。三个形状是 Person 用户、System 核心系统、System_Ext
外部系统。两条关系是用户使用核心系统，核心系统调用外部系统。页面上一共
六个形状，数量对得上，见 6.2。

产物样本在 `resources/test-examples/vsdx-output/02-c4-1.vsdx`。解压后
入库为 `docs/research/c4-1/`，共 21 个部件。素材类别是自产样本，与手工
素材的约定不同，划分见 research README。

#### 6.1.2 实例内容

```
c4-1/（02-c4-1.vsdx 解压，21 部件）
├── [Content_Types].xml         16 个 Override + rels/xml 两个 Default（第 2 章）
├── _rels/.rels                 rId1→document，rId2-4→docProps（第 3 章）
├── docProps/
│   ├── app.xml                 Application=mmd2vsdx，AppVersion=2.0
│   ├── core.xml                dc:title / dc:creator = mmd2vsdx
│   └── custom.xml              6 个自定义属性，全文见 6.4.2
├── visio/
│   ├── document.xml            文档主体，4 个顶层元素（6.4）
│   ├── windows.xml             绘图窗口 + 模具窗口（6.4）
│   ├── masters/
│   │   ├── masters.xml         9 条母版档案，ID 100–108（6.3）
│   │   ├── master1.xml …       master1/3/4/9/14/15/16/36.xml 八份内容
│   │   └── _rels/masters.xml.rels  9 条关系（6.3）
│   ├── pages/
│   │   ├── pages.xml           1 页，PageSheet 英寸制（6.2）
│   │   ├── page1.xml           6 形状 + 4 条 Connects（6.2）
│   │   └── _rels/pages.xml.rels  目录到页内容
│   └── _rels/document.xml.rels   masters/pages/windows 三向
```

rId 拓扑与前五章一致：包级 .rels 指向主文档与三份属性；主文档经
document.xml.rels 指向 masters、pages、windows；masters.xml 经目录关系表
指向母版内容；pages.xml 经目录关系表指向页内容。一切引用都走关系表间接
层，第 3 章与 5.3 的规律在这里原样成立。

#### 6.1.3 字段解释

部件清单按角色分六组，字段统一四列：

| 部件 | 大小 | 角色 | 前章对应 |
| --- | --- | --- | --- |
| `[Content_Types].xml` | 1931B | 类型登记表 | 第 2 章 |
| `_rels/.rels` | 718B | 包级关系表 | 第 3 章 |
| `docProps/` 三件 | 227+285+989B | 属性档案 | 第 4 章 |
| `visio/document.xml` | 31759B | 样式与颜色基座 | 5.2 |
| `visio/windows.xml` | 872B | 窗口现场 | 5.1 |
| `visio/masters/` 十件 | 目录 20925B + 8 份内容 3–14.5KB + 关系表 | 母版库 | 5.4 |
| `visio/pages/` 三件 | 814B + 20552B + 267B | 页面区 | 5.5 |
| `visio/_rels/document.xml.rels` | 512B | 主文档关系表 | 5.3 |

#### 6.1.4 字段扩展

与手工素材做部件级对照，差异集中在写作者可自由裁量的部分，骨架恒定：

| 部件 | c4-1 自产 | basic-2 手工 |
| --- | --- | --- |
| 母版内容文件 | 8 份 | 2 份（basic-1 为 1 份） |
| `page1.xml.rels` | 无 | 有 |
| `docProps/thumbnail.emf` | 无 | 有 |
| docProps 内容 | 最小填写 | Visio 全字段 |
| 目录骨架九件 | 恒有 | 恒有 |

哪个可变哪个恒定，与第一章 1.4 的规律一致。基本骨架是登记表、.rels、
主文档、窗口、两支目录、两份页文件、三张关系表，两方都写；可变部件是
母版数量、页面级关系表和缩略图。

#### 6.1.5 补充注解

- 素材出处的三级标注：basic-N 是 Visio 手工绘制，c4-1 是自产样本，
  官方参照样本随 git 历史保留，正文统一按 0.1 的来源标注写；
- 部件字节数随保存上下文浮动，本表只记本例值，不当作常量；
- 本章所有"自产写法"都是这一个写入者的写法，不是 Visio 格式要求。
  哪些是格式要求，第二到五章已经用三份手工素材验证过。

### 6.2 页面区（对照 5.5）

#### 6.2.1 文件定位

页面区四件差一件：pages.xml、page1.xml、pages.xml.rels 都有，
page1.xml.rels 没有。手工素材里页级关系表声明本页用到的母版文件，见
5.5.3.5。本样本省略它，页面形状的 Master= 引用照样写，见 6.2.5 的 W-4。

引用链与 5.5.1 相同，页内容里的形状照旧经 Master= 引用母版区。

#### 6.2.2 实例内容

pages.xml 全文很短，直接贴，见素材
`docs/research/c4-1/visio/pages/pages.xml`：

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Pages xmlns="…visio/2012/main" xmlns:r="…officeDocument/2006/relationships">
  <Page ID="0" NameU="c4" Name="c4" ViewScale="1"
        ViewCenterX="4.9166666666666661" ViewCenterY="1.90625">
    <PageSheet LineStyle="0" FillStyle="0" TextStyle="0">
      <Cell N="PageWidth" V="9.8333333333333321" U="IN"/>
      <Cell N="PageHeight" V="3.8125" U="IN"/>
      <Cell N="PageScale" V="1" U="IN"/>
      <Cell N="DrawingScale" V="1" U="IN"/>
      <Cell N="DrawingSizeType" V="0"/>
      <Cell N="DrawingScaleType" V="0"/>
      <Cell N="InhibitSnap" V="0"/>
      <Cell N="UIVisibility" V="0"/>
      <Cell N="DrawingResizeType" V="1"/>
      <Cell N="PlaceStyle" V="2"/>
      <Cell N="RouteStyle" V="1"/>
      <Cell N="PageShapeSplit" V="1"/>
    </PageSheet>
    <Rel r:id="rId1"/>
  </Page>
</Pages>
```

page1.xml 是单行文件，正文贴骨架。六个形状在 Shapes 段，末尾 Connects
段四条记录。节点形状全同构，以形状 1 为代表；连接线两条同构，以形状 5
为代表：

```xml
<PageContents …>
  <Shapes>
    <Shape ID='1' Type='Shape' NameU='Mermaid Shape' Name='Mermaid Shape'
           LineStyle='3' FillStyle='3' TextStyle='3' Master='100'>
      <Cell N='PinX' V='1.625' U='IN'/>  <Cell N='PinY' V='1.0572916666666665' U='IN'/>
      <Cell N='Width' V='2.25' U='IN'/>  <Cell N='Height' V='1.1145833333333333' U='IN'/>
      <Cell N='LocPinX' V='1.125' U='IN' F='Width*0.5'/>
      <Cell N='LocPinY' V='0.55729166666666663' U='IN' F='Height*0.5'/>
      <Cell N='Angle' V='0' U='DEG'/>  <Cell N='FlipX' V='0'/>  <Cell N='FlipY' V='0'/>
      <Cell N='LineWeight' V='0.0069444444444444441' U='PT'/>
      <Cell N='LineColor' V='#000000'/>  <Cell N='LinePattern' V='1'/>
      <Cell N='FillForegnd' V='#FFFFFF'/>  <Cell N='FillBkgnd' V='#FFFFFF'/>
      <Cell N='FillPattern' V='1'/>  <Cell N='EventXFMod' V='0'/>
      <Section N='Character'>
        <Row IX='0'><Cell N='Color' V='#000000'/>
                    <Cell N='Size' V='0.16666666666666666' U='PT'/></Row>
      </Section>
      <Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='1'/></Row></Section>
      <Section N='User'>
        <Row N='MermaidId'><Cell N='Value' V='用户' U='STR'/></Row>
        <Row N='visVersion'><Cell N='Value' V='15'/>
                            <Cell N='Prompt' V='' F='No Formula'/></Row>
      </Section>
      <Section N='Connection'>
        <Row T='Connection' IX='0'><Cell N='X' V='1.125' U='IN' F='Width*0.5'/>
          <Cell N='Y' V='0' U='IN' F='Height*0'/> …DirX/DirY/Type/AutoGen/Prompt…</Row>
        <Row T='Connection' IX='1'><Cell N='X' V='2.25' U='IN' F='Width*1'/>
          <Cell N='Y' V='0.5572916666666666' U='IN' F='Height*0.5'/> …</Row>
        <Row T='Connection' IX='2'><Cell N='X' V='1.125' U='IN' F='Width*0.5'/>
          <Cell N='Y' V='1.114583333333333' U='IN' F='Height*1'/> …</Row>
        <Row T='Connection' IX='3'><Cell N='X' V='0' U='IN' F='Width*0'/>
          <Cell N='Y' V='0.5572916666666666' U='IN' F='Height*0.5'/> …</Row>
        <Row T='Connection' IX='4'><Cell N='X' V='1.125' U='IN' F='Width*0.5'/>
          <Cell N='Y' V='0.5572916666666666' U='IN' F='Height*0.5'/> …</Row>
      </Section>
      <Section N='Geometry' IX='0'>
        <Cell N='NoFill' V='0'/>  <Cell N='NoLine' V='0'/>  <Cell N='NoShow' V='0'/>
        <Cell N='NoSnap' V='0' F='No Formula'/>  <Cell N='NoQuickDrag' V='0' F='No Formula'/>
        <Row T='MoveTo' IX='1'><Cell N='X' V='0' U='MM' F='Width*0'/>
                               <Cell N='Y' V='0' U='MM' F='Height*0'/></Row>
        <Row T='LineTo' IX='2'><Cell N='X' V='2.25' U='MM' F='Width*1'/>
                               <Cell N='Y' V='0' U='MM' F='Height*0'/></Row>
        <Row T='LineTo' IX='3'><Cell N='X' V='2.25' U='MM' F='Width*1'/>
                               <Cell N='Y' V='1.114583333333333' U='MM' F='Height*1'/></Row>
        <Row T='LineTo' IX='4'><Cell N='X' V='0' U='MM' F='Width*0'/>
                               <Cell N='Y' V='1.114583333333333' U='MM' F='Height*1'/></Row>
        <Row T='LineTo' IX='5'><Cell N='X' V='0' U='MM' F='Geometry1.X1'/>
                               <Cell N='Y' V='0' U='MM' F='Geometry1.Y1'/></Row>
      </Section>
      <Text><cp IX='0'/>&lt;&lt;person&gt;&gt;
      用户</Text>
    </Shape>
    <Shape ID='5' NameU='Dynamic connector' Name='Dynamic connector'
           Type='Shape' Master='108'>
      <Cell N='PinX' V='3.270833333333333' F='GUARD((BeginX+EndX)/2)'/>
      <Cell N='Width' V='1.0416666666666661' F='GUARD(EndX-BeginX)'/>
      <Cell N='Height' V='0.24479166666666674' F='GUARD(EndY-BeginY)'/>
      <Cell N='BeginX' V='2.75' F='PAR(PNT(Sheet.1!Connections.X2,Sheet.1!Connections.Y2))'/>
      <Cell N='BeginY' V='1.0572916666666665' F='PAR(PNT(Sheet.1!Connections.X2,Sheet.1!Connections.Y2))'/>
      <Cell N='EndX' V='3.7916666666666661' F='PAR(PNT(Sheet.2!Connections.X1,Sheet.2!Connections.Y1))'/>
      <Cell N='EndY' V='1.3020833333333333' F='PAR(PNT(Sheet.2!Connections.X1,Sheet.2!Connections.Y1))'/>
      <Cell N='GlueType' V='2'/>  <Cell N='DynFeedback' V='2'/>  <Cell N='ObjType' V='2'/>
      <Cell N='NoLiveDynamics' V='1'/>  <Cell N='ShapeSplittable' V='1'/>
      <Cell N='LockHeight' V='1'/>  <Cell N='LockCalcWH' V='1'/>  <Cell N='NoAlignBox' V='1'/>
      <Cell N='ShapeRouteStyle' V='1'/>  <Cell N='ConLineRouteExt' V='1'/>  <Cell N='ConFixedCode' V='6'/>
      <Cell N='LayerMember' V='0'/>  <Cell N='EventXFMod' V='0'/>
      <Cell N='LineWeight' V='0.0069444444444444441' U='PT'/>
      <Cell N='LineColor' V='#000000'/>  <Cell N='LinePattern' V='1'/>
      <Cell N='BeginArrow' V='0'/>  <Cell N='EndArrow' V='4'/>
      <Cell N='BeginArrowSize' V='2' F='THEMEVAL("ConnectorBeginSize")'/>
      <Cell N='EndArrowSize' V='2' F='THEMEVAL("ConnectorEndSize")'/>
      <Cell N='TxtPinX' V='0.52083333333333304' F='SETATREF(Controls.TextPosition)'/>
      <Cell N='TxtPinY' V='0.24479166666666674' F='SETATREF(Controls.TextPosition.Y)'/>
      <Cell N='TxtWidth' V='0.5' F='GUARD(0.5)'/>
      <Cell N='TxtHeight' V='0.20005152587890621' F='GUARD(0.2000515258789062)'/>
      <Cell N='TxtLocPinX' V='0.25' F='TxtWidth*0.5'/>
      <Cell N='TxtLocPinY' V='0.1000257629394531' F='TxtHeight*0.5'/>
      <Cell N='TxtAngle' V='0'/>
      <Section N='Control'>
        <Row N='TextPosition'>
          <Cell N='X' V='0.52083333333333304' F='(Geometry1.X2+Geometry1.X3)/2'/>
          <Cell N='Y' V='0.24479166666666674' F='(Geometry1.Y2+Geometry1.Y3)/2'/>
          <Cell N='XDyn' V='0.27083333333333304' F='Controls.TextPosition'/>
          <Cell N='YDyn' V='0.14476590372721365' F='Controls.TextPosition.Y'/>
          <Cell N='XCon' V='5' F='IF(OR(STRSAME(SHAPETEXT(TheText),""),HideText),5,0)'/>
          <Cell N='YCon' V='0'/>  <Cell N='CanGlue' V='0'/>  <Cell N='Prompt' V='Reposition Text'/>
        </Row>
      </Section>
      <Section N='Character'><Row IX='0'><Cell N='Color' V='#000000'/></Row></Section>
      <Section N='User'>
        <Row N='MermaidId'><Cell N='Value' V='edge-1' U='STR'/></Row>
      </Section>
      <Section N='Geometry' IX='0'>
        <Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>
        <Row T='LineTo' IX='2'><Cell N='X' V='0'/><Cell N='Y' V='0.24479166666666674'/></Row>
        <Row T='LineTo' IX='3'><Cell N='X' V='1.0416666666666661'/><Cell N='Y' V='0.24479166666666674'/></Row>
        <Row T='LineTo' IX='4' Del='1'/>
      </Section>
      <Text><cp IX='0'/>使用</Text>
    </Shape>
    <Shape ID='6' …>…</Shape>
  </Shapes>
  <Connects>
    <Connect FromSheet='5' FromCell='EndX' FromPart='12' ToSheet='2' ToCell='Connections.X1' ToPart='100'/>
    <Connect FromSheet='5' FromCell='BeginX' FromPart='9' ToSheet='1' ToCell='Connections.X2' ToPart='101'/>
    <Connect FromSheet='6' FromCell='BeginX' FromPart='9' ToSheet='2' ToCell='Connections.X2' ToPart='101'/>
    <Connect FromSheet='6' FromCell='EndX' FromPart='12' ToSheet='3' ToCell='Connections.X1' ToPart='100'/>
  </Connects>
</PageContents>
```

骨架里省略号处的内容按素材补全，缩内容不缩结构，凡删的段在字段解释里
都找得回。Shape 2 是核心系统，Shape 3 是外部系统，Shape 4 是标题，三枚
与形状 1 同构，只差位置尺寸文本和 MermaidId。Shape 6 与形状 5 同构，差
在 Height 用 `GUARD(0.2DL)` 而形状 5 用 `GUARD(EndY-BeginY)`，几何只有两
段。

#### 6.2.3 字段解释

##### 6.2.3.1 pages.xml 页条目与页画布（对照 5.5.3.1）

Page 条目属性与手工素材取值相同，字段逐项：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 0 | 本文档页表内编号 | TopPage 与 Window.Page 引用它 |
| NameU / Name | c4 | 程序名与显示名 | 页名来自 mermaid 类型，非手工的 Page-1 |
| ViewScale | 1 | 默认视图缩放 | 打开该页时的视图记忆 |
| ViewCenterX/Y | 4.916666… / 1.90625 | 默认视图中心 | 恰为页宽高之半，手绘样本里是手工摆放值 |
| Rel r:id | rId1 | 内容挂接 | 经目录关系表到 page1.xml |

PageSheet 画布字段与 5.5.3.1 的差异本身最值得看：

| 字段 | 内容 | 含义 | 与手工样本的差异 |
| --- | --- | --- | --- |
| PageWidth/PageHeight | 9.8333… / 3.8125 U=IN | 页面尺寸 | 英寸制；手工 A4 用 MM 显示单位，内部值仍英寸 |
| PageScale/DrawingScale | 1 U=IN | 刻度比例 | 1 绘图单位 1 英寸；手工为 1mm |
| DrawingSizeType/DrawingScaleType | 0 | 尺寸与刻度方式 | 相同 |
| InhibitSnap | 0 | 禁止吸附 | 相同 |
| UIVisibility | 0 | UI 可见性 | 相同 |
| DrawingResizeType | 1 | 画布自动扩展 | 相同 |
| PlaceStyle / RouteStyle | 2 / 1 | 放置与路由方式 | 手工 basic-1/2 未写，basic-3 亦未写，本样本有 |
| PageShapeSplit | 1 | 允许拆分 | 相同 |
| ShdwOffsetX/Y、ShdwType 等 | 无 | 阴影默认 | 手工样本有，自产样本不写 |
| PageLockReplace/PageLockDuplicate | 无 | 页锁定 | 手工样本有，自产样本不写 |
| Section Layer | 无 | 图层声明 | 手工 basic-2/3 有，自产样本无 |

#### 6.2.3.2 节点实例字段（对照 5.5.3.2）

节点实例字段逐项，取值以形状 1 为准，另外三个形状同构：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 1、2、3、4 | 页内形状编号 | 1–6 连续无跳号 |
| Type | Shape | 形状类型 | 常规形状 |
| NameU/Name | Mermaid Shape | 名称 | 恒同，mermaid 语义存在 User 段 |
| LineStyle/FillStyle/TextStyle | 3 | 样式索引三件套 | 手工实例不写，依赖母版；自产实例显式写 |
| Master | 100 | 母版引用 | 全部节点和标题都用矩形母版 |
| PinX/PinY | 页面英寸坐标 | 实例位置 | U=IN |
| Width/Height | 英寸值 | 实例尺寸 | 与母版占位几何无关 |
| LocPinX/LocPinY | F=Width*0.5 / Height*0.5 | 本地锚 | 与 5.5.3.2 一致，公式化 |
| Angle/FlipX/FlipY | 0 | 姿态 | 默认 |
| LineWeight | 0.0069444444444444441 U=PT | 线宽 | 0.5pt 的英寸制写法 |
| LineColor/LinePattern | #000000 / 1 | 描边 | 字面量写死，不依赖色板索引 |
| FillForegnd/FillBkgnd/FillPattern | #FFFFFF / 1 | 填充 | 同上 |
| Character Row / Color、Size | #000000 / 0.16666666666666666 U=PT | 文本格式 | 12pt 的英寸制写法，字号直接写实例 |
| Paragraph Row / HorzAlign | 1 | 段落对齐 | 居中 |
| User / MermaidId | 用户、核心系统、外部系统、系统上下文 | 原始标签 | U=STR；旧剖析 O-4 已确认入章 |
| User / visVersion | 15 | 版本标记 | 同 5.4.3.3，实例也带一份 |
| Section Connection | 5 行 | 粘附点 | 实例携带母版同构五行的完整覆盖 |
| Section Geometry | 5 行闭合 | 几何轮廓 | 实例携带完整几何，U=MM 作显示单位 |
| Text | cp + 两行文本 | 实例文本 | 字面换行分隔 marker 与标签，见 6.5 W-5 |

节点实例里没有 ObjType。手工 basic-2 的矩形实例带 ObjType=1，自产样本
不写，类别的枚举认领问题仍在 5.5.3.2 的待核项里。

##### 6.2.3.3 连接线实例字段（对照 5.5.3.3）

连接线实例把 1-D 形状的全部 cell 写在实例里，字段逐项：

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| ID | 5、6 | 页内编号 | 与节点连续 |
| Master | 108 | 母版引用 | 指向 Dynamic connector 条目 |
| 样式索引三件套 | 无 | 样式引用 | 与节点不同，本实例不写 |
| PinX/PinY | F=GUARD((BeginX+EndX)/2) | 中心跟随端点 | 手绘样本是 F='Inh'，机制同 |
| Width/Height | F=GUARD(EndX-BeginX) 等 | 尺寸随端点 | 形状 6 的 Height 另写 GUARD(0.2DL) |
| LocPinX/LocPinY/Angle/FlipX/FlipY | 全 GUARD | 锚与姿态锁定 | 1-D 形状惯例 |
| BeginX/BeginY | F=PAR(PNT(Sheet.1!Connections.X2,…Y2)) | 起点钉连接点 | 引用目标形状表的连接点行 |
| EndX/EndY | F=PAR(PNT(Sheet.2!Connections.X1,…Y1)) | 终点钉连接点 | 同上 |
| GlueType/DynFeedback | 2 | 粘附与动态反馈 | 与 5.4.3.4 母版取值相同 |
| ObjType | 2 | 对象类型 | 与节点实例的取值不同，枚举仍待核 |
| NoLiveDynamics/ShapeSplittable | 1 | 动态与拆分 | 同 5.4.3.4 |
| LockHeight/LockCalcWH/NoAlignBox | 1 | 锁定 | 尺寸归公式管 |
| ShapeRouteStyle/ConLineRouteExt | 1 | 路由样式 | 与 basic-3 的取 5 实例不同，枚举待核 |
| ConFixedCode | 6 | 连接固定方式 | basic-3 走线粘附实例取 5，取值差异待核 |
| LayerMember | 0 | 归属图层 | 页面无 Layer 段时该值无意义，见 6.2.5 |
| EventXFMod | 0 | 变换事件缓存 | 触发器缺失时的兜底值，见 6.2.4 |
| LineWeight/LineColor/LinePattern | 0.00694…PT / #000000 / 1 | 描边样式 | 字面量 |
| BeginArrow/EndArrow | 0 / 4 | 端点箭头 | 手工 basic-2 的 EndArrow 取 13，枚举待核 |
| BeginArrowSize/EndArrowSize | 2 F=THEMEVAL(…) | 箭头尺寸 | 主题可覆盖 |
| TxtPinX/Y | F=SETATREF(Controls.TextPosition) | 文本锚点跟随句柄 | 与 5.4.3.4 母版机制一字不差 |
| TxtWidth/TxtHeight | F=GUARD(0.5) 等 | 文本块尺寸 | 手绘是 MAX(TEXTWIDTH(TheText),…) 自适应，写法不同 |
| Control / TextPosition | 行公式 | 文本句柄 | 与母版同构，八个 cell 齐全 |
| Character Row / Color | #000000 | 文本颜色 | 无 Size，字号走母版 10pt |
| User / MermaidId | edge-1、edge-2 | 边标识 | 供回查 |
| Section Geometry | 三段 + Del 占位 | 折线路径 | 形状 5 是 L 形三段，形状 6 只两段，Del 行保留 |

##### 6.2.3.4 Connects 粘附记录（对照 5.5.3.4）

四条记录原文见 6.2.2。规律与 5.5.3.4 完全一致，再验一遍：

| 字段 | 内容 | 含义 | 验证结果 |
| --- | --- | --- | --- |
| FromCell/FromPart | BeginX=9，EndX=12 | 端点角色 | 恒配对，与手绘一致 |
| ToCell | Connections.X2 / Connections.X1 | 目标落点 | 与形状公式引用行一致 |
| ToPart | 101 / 100 | 目标角色 | 100+连接点行号规律再次命中，X1=100、X2=101 |

#### 6.2.4 字段扩展

- 页面实例两种合法写法并存：手工样本走最小式，只写位置和覆盖；自产样本
  走自足式，几何、连接点、样式、文本格式全部写全。解析器必须两者都认，
  规则是写了就覆盖、没写就继承，与 5.5.4 的三层叠加结论一致；
- 自足式的意义：即使母版内容与预期不符，页面形状仍能独立表达自己。
  c4-1 正好提供了这样的观察机会，见 W-1；
- 连接线没有触发器 cell。_XFTRIGGER 是目标形状变换时主动重算的优化，
  不写它公式依赖仍然成立，重算时目标 cell 的依赖会间接拉动本端。机制
  差异的实际影响待真机核，见 W-9；
- 文本块与句柄的公式链完整复刻母版：TxtPin SETATREF 写回 Controls 行，
  Controls 行 XCon 决定句柄显隐。页内实例不需要母版也自洽，这是 5.5.3.3
  说的 1-D 形状惯例；
- 连接线几何行没有 F 公式也没有 U，坐标是形状局部英寸字面量。几何行号
  体系与 5.5.3.3 一致，Del 占位行保留不删。

#### 6.2.5 补充注解

- 缺 page1.xml.rels 的连锁反应：5.5.3.5 说解析器可凭页级关系表预知本页
  用到哪些母版文件。c4-1 没有这文件，依赖预知的路径在此失效。解析器要
  把预知当可选优化，不能硬依赖；Visio 开卷时是否会补写该文件待真机核，
  见 W-4；
- LayerMember=0 而无图层声明。手工样本页面画布有连接线图层行，本样本
  整条 Layer 段缺失，连接线实例仍写 LayerMember=0。无图层时该值没有可
  挂的对象，语义待核，见 6.2.3.1；
- 连接线公式与缓存端口不一致，这是本样本最值得追的一个观察点：
  BeginX 的 F 引用 X2，按 5.4.3.3 的行号约定 X2 是行 IX=1 右边中点，与
  Begin 缓存一致；EndX 的 F 引用 X1，X1 是行 IX=0 下边中点，与 End 缓存
  落在目标形状左缘中点不符，单边不一致。Connects 记录的 ToCell 与公式
  一致。开卷时 RecalcDocument 触发重算，端点按公式重新落位，显示可能与
  缓存不符，待真机核，见 W-2；
- 文本两行结构：marker 行加标签行，字面换行分隔，没有 Visio 的 <pp>
  段落元素。旧剖析 O-1、O-2 沿承于此，见 W-5。

### 6.3 母版区（对照 5.4）

#### 6.3.1 文件定位

母版区结构同 5.4.1：目录 masters.xml、关系表 masters.xml.rels、内容文件
masterN.xml。本样本的特别之处有二。一是目录 9 条而内容文件只有 8 份，
两条目录条目共享一个文件。二是条目的 ID 从 100 起连续，这正是 5.4.4
说过的"官方模具里出现过 ID=100 起的大号"，在本样本直接落地。

#### 6.3.2 实例内容

目录条目列表，字段以素材为准：

| ID | NameU | 名称 | Rel | 内容文件 | 本图使用 |
| --- | --- | --- | --- | --- | --- |
| 100 | Rectangle | 矩形 | rId1 | master1.xml | 4 节点 + 标题 |
| 101 | Rounded Rectangle | 圆角矩形 | rId36 | master36.xml | 备用 |
| 102 | Circle | 圆形 | rId3 | master3.xml | 备用 |
| 103 | Ellipse | 椭圆形 | rId4 | master4.xml | 备用 |
| 104 | Diamond | 菱形 | rId16 | master16.xml | 备用 |
| 105 | Parallelogram | 平行四边形 | rId14 | master14.xml | 备用 |
| 106 | Trapezoid | 梯形 | rId15 | master15.xml | 备用 |
| 107 | Hexagon | 六边形 | rId9 | master9.xml | 备用 |
| 108 | Dynamic connector | 动态连接线 | rId2 | master15.xml | 2 连接线 |

两条连接线共用一个文件，与 106 同址，见 6.3.4 的 W-1。

master1.xml 内容与 5.4.3.3 同构，骨架全文见
`docs/research/c4-1/visio/masters/master1.xml`，结构如下：

```xml
<MasterContents xmlns=…xml:space='preserve'>
  <Shapes>
    <Shape ID='5' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3'>
      …变换与行为 Cell：Pin 1.9685 / Width 1.5748 / Height 1.1811 /
        LocPin / ShapeSplit=1 / EventDblClick=OPENTEXTWIN() /
        HelpTopic=Vis_Sba.chm!#45752 / Copyright 2012 /
        LineWeight=THEMEVAL("LineWeight",0.24PT) / QuickStyleType=2…
      <Section N='Connection'>…5 行连接点…</Section>
      <Section N='User'>…visVersion=15…</Section>
      <Section N='Character'>…Size=0.1388888888888889 PT…</Section>
      <Section N='Geometry' IX='0'>…矩形轮廓 5 行…</Section>
    </Shape>
  </Shapes>
</MasterContents>
```

这份母版与 basic-1 的 master1.xml 逐 cell 比对，值序列完全相同，差别只在
一行式书写、双引号、部分 cell 带不带显示单位。母版内容跨包稳定这条规律
在自产样本上再验一遍，见 6.3.5。

#### 6.3.3 字段解释

目录条目的字段与 5.4.3.1 相同，差异集中在连接线条目，逐项对照：

| 字段 | 本样本连接线条目 | 手绘 basic-2 连接线条目 | 说明 |
| --- | --- | --- | --- |
| ID | 108 | 4 | 打包重排，从 100 起 |
| MasterType | 541 | 0 | 同一资产两种取值，5.4.4 的非枚举结论再验证 |
| MatchByName | 0 | 1 | 按名匹配开关，写法不一 |
| IconUpdate | 0 | 0 | 相同 |
| Hidden | 1 | 0 | 手绘为可见，自产样本隐藏 |
| Prompt | 此连接线工具会自动… | 官方文案 | 同源文案 |
| UniqueID/BaseID | {2879478F-…} / {F7290A45-…} | 官方 GUID | 资产溯源链完整 |

母版内容文件字段与 5.4.3.3 一致，矩形母版不重复展开。重点看差异：

| 字段 | 内容 | 说明 |
| --- | --- | --- |
| 母版内容与 basic-1 同值 | Pin 1.968503954842335 等逐 cell 相同 | 与 5.4.4 的稳定性结论一致 |
| 书写形态 | 一行式、无缩进、部分 cell 无 U | Visio 保存后重排为缩进式加 U 标注 |
| Connection 行 | Type/AutoGen/Prompt 带 F='No Formula' | 与手绘相同 |
| 几何行 | MoveTo + 4×LineTo，最后一行显式闭合 | 与手绘相同 |

#### 6.3.4 字段扩展

- 文件名与 ID 解耦的证据链补全：ID 100–108 连续，文件 1/3/4/9/14/15/16/36
  跳跃。文件名来自官方模具资产的关系表落点，ID 是打包重排的文档内编号，
  两者互不相干，与 5.4.4 一致；
- 九枚母版只用到两枚。Rectangle 用于全部节点和标题，Dynamic connector 用于
  两条关系。其余七枚是整套 basic 形状资产按需全量带，资产与用量的比例
  关系进源码对号；
- W-1 疑点：Dynamic connector 条目 Rel rId2 与 Trapezoid 条目 Rel rId15
  指向同一份 master15.xml，且该文件内容是梯形母版，有 Controls.Row_1 公式
  和 40×30mm 占位几何。包内没有 master2.xml，手绘素材里连接线母版文件名
  正是这个。连接线实例的 1-D cell 全部自带，即使母版内容不匹配，页面形状
  仍能表达自身。这是打包映射缺陷还是资产复用，待 src 侧核对，见 6.5 的
  W-1；
- 与手工素材同款现象：连接线条目在目录里的物理顺序被重排到末尾，ID 重写，
  Rel 保留原 rId。目录缺省条目按 wanted 序重排的推断在 5.4.4 成立，这里
  数据一致。

#### 6.3.5 补充注解

- 母版内容文件的同值比对方法：把两份 master1.xml 的全部 N=V 对提取出来
  逐序比较，结果全同。留给读者的取证手段是比对值序列，不比对字节；
- master15.xml 内容为梯形而连接线条目指向它，用 5.4.2 的引用链读法毫不
  费力就能发现：目录的 Rel r:id 到关系表，关系表把 rId2 翻成 master15.xml。
  引用链的价值在这里展示：不靠文件名猜身份；
- 连接线母版条目 Hidden=1，与手绘的 Hidden=0 相反。模具窗格隐藏的语义
  即"不显示在模具里"，本工具把连接线作为内部资产处理，见 W-1 关联的
  资产映射问题；
- c4-1 的 master 内容文件没有经过 Visio 保存器处理，是资产原样副本。这
  与 5.4.4 说"母版内容从模具库导出后保持稳定"互相印证，只是路径相反：
  手工样本是保存器写出的版本，自产样本是资产本体。

### 6.4 文档与属性部件（对照 5.1-5.3 与第 4 章）

#### 6.4.1 文件定位

本小节覆盖四个部件：document.xml 是样式基座，windows.xml 是窗口现场，
docProps 三件是属性档案，[Content_Types].xml 是登记表。结构与第 2 章、
第 4 章、5.1、5.2 相同，这里只记录自产写法与差异。

#### 6.4.2 实例内容

document.xml 顶层只有四个元素，全文见
`docs/research/c4-1/visio/document.xml`：

```xml
<VisioDocument xmlns=…>
  <DocumentSettings TopPage='0' DefaultTextStyle='3' DefaultLineStyle='3'
                    DefaultFillStyle='3' DefaultGuideStyle='4'>
    <GlueSettings>9</GlueSettings>
    <SnapSettings>295</SnapSettings>
    <SnapExtensions>34</SnapExtensions>
    <SnapAngles/>
    <DynamicGridEnabled>1</DynamicGridEnabled>
    <ProtectStyles>0</ProtectStyles>
    <ProtectShapes>0</ProtectShapes>
    <ProtectMasters>0</ProtectMasters>
    <ProtectBkgnds>0</ProtectBkgnds>
  </DocumentSettings>
  <StyleSheets>…7 条，见下…</StyleSheets>
  <Colors>…44 条 ColorEntry…</Colors>
  <FaceNames>…1 条 Calibri…</FaceNames>
</VisioDocument>
```

样式表七条，ID 与引用关系：

| ID | NameU | 三引用 | 特征 |
| --- | --- | --- | --- |
| 0 | No Style | — | 全量默认值，含 Font=SimSun、Size=0.1667，四段 Section |
| 1 | Text Only | 3/3/3 | 大部分 cell 值为 Themed |
| 2 | None | 3/3/3 | LinePattern=0、FillPattern=0，无描边无填充 |
| 3 | Normal | 6/6/6 | 只写文本边距与垂直对齐 |
| 4 | Guide | 3/3/3 | 参考线专用，#7f7f7f、NonPrinting=1、可穿透 |
| 6 | Theme | 0/0/0 | 全部 Themed，主题索引 65534 |
| 7 | Basic | 0/0/0 | 具体默认值，LinePattern=0、FillForegnd=0 |

颜色表 44 条 ColorEntry，IX 从 24 到 67。首条 #7F7F7F，末条 #006F9D。
字体表只一条 Calibri，四字段齐全，见 5.2.4。

docProps 三件全文都很短，直接贴：

```xml
<!-- app.xml -->
<Properties xmlns="…extended-properties">
  <Application>mmd2vsdx</Application><AppVersion>2.0</AppVersion>
</Properties>

<!-- core.xml -->
<cp:coreProperties xmlns:cp="…core-properties" xmlns:dc="…elements/1.1/">
  <dc:title>mmd2vsdx</dc:title><dc:creator>mmd2vsdx</dc:creator>
</cp:coreProperties>

<!-- custom.xml -->
<Properties xmlns="…custom-properties" xmlns:vt="…docPropsVTypes">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2"
            name="_VPID_ALTERNATENAMES"><vt:lpwstr/></property>
  <property fmtid="…" pid="3" name="BuildNumberCreated"><vt:i4>1179401801</vt:i4></property>
  <property fmtid="…" pid="4" name="BuildNumberEdited"><vt:i4>1179401801</vt:i4></property>
  <property fmtid="…" pid="5" name="IsMetric"><vt:bool>false</vt:bool></property>
  <property fmtid="…" pid="6" name="TimeEdited"><vt:filetime>2026-07-27T00:00:00Z</vt:filetime></property>
  <property fmtid="…" pid="7" name="RecalcDocument"><vt:bool>true</vt:bool></property>
</Properties>
```

windows.xml 两个窗口，全文见素材
`docs/research/c4-1/visio/windows.xml`：

```xml
<Windows …>
  <Window ID='0' WindowType='Drawing' ContainerType='Page' Page='0' ViewScale='1'>
    <ShowRulers>1</ShowRulers><ShowGrid>0</ShowGrid><ShowPageBreaks>1</ShowPageBreaks>
    <ShowGuides>1</ShowGuides><ShowConnectionPoints>1</ShowConnectionPoints>
    <GlueSettings>9</GlueSettings><SnapSettings>295</SnapSettings>
    <DynamicGridEnabled>1</DynamicGridEnabled>
  </Window>
  <Window ID='1' WindowType='Stencil' WindowState='1025'
          WindowLeft='-351' WindowTop='-10' WindowWidth='342' WindowHeight='1045'
          Document='C:\Program Files\Microsoft Office\root\Office16\visio content\2052\BASIC_M.VSSX'
          ParentWindow='0'>
    <StencilGroup>10</StencilGroup><StencilGroupPos>1</StencilGroupPos>
  </Window>
</Windows>
```

[Content_Types].xml 两个 Default 加 16 个 Override。Default 登记 rels 与
xml，Override 覆盖 16 个部件：docProps 三件、主文档、母版区九件、页面区
两件、窗口一件。四张关系表走 rels Default，无需登记。

#### 6.4.3 字段解释

- 样式链在本样本走一遍完整跳转：形状 LineStyle=3 指向 Normal，Normal 的
  三引用指向 6 号 Theme，Theme 的 cell 值全部为 Themed，由主题表注入。
  样式索引只在文档内有效的规则在 5.2 已讲，这里补的是"索引本身还能再
  跳一层"的活例；
- No Style 不是空壳。0 号样式写了全套默认值，包括近 300 个 cell 和四个
  Section。它的角色是默认基线，不是缺失；
- None 与 Text Only 的区别写在填充与描边开关上：None 把 LinePattern 和
  FillPattern 关闭，Text Only 保持 Themed 但关闭渐变等效果；
- Colors 段 44 条是主题色槽，IX 24 到 67。手绘 basic-1 只写一条，是保存
  时压缩。形状上的 LineColor=#000000 是字面量颜色，不查色板，所以色板
  多少条不影响渲染；
- FaceNames 只一条 Calibri。字体声明最小化，多字体时追加，与 5.2.4 一致；
- custom.xml 六条属性逐项：_VPID_ALTERNATENAMES 留空是官方槽位占位；
  BuildNumberCreated/Edited 写固定值 1179401801，与生成时间无关；
  IsMetric=false 对应页面 IN 单位的公制标志；TimeEdited 写死
  2026-07-27，见 W-7；RecalcDocument=true 请求开卷重算，手工样本的公式
  缓存语义在 5.5.3.3 已讲，这里闭合；
- app.xml 与 core.xml 只写 Application、AppVersion、title、creator 四个
  字段，与 roadmap P-3 记录的差异表一致；
- windows.xml 的 Stencil 窗口指向本机模具绝对路径，见 W-6。绘图窗口
  不带 ClientWidth、WindowState、ViewCenter、TabSplitter 等现场字段，
  手绘样本是完整的窗口现场。

#### 6.4.4 字段扩展

与手工 basic-1 的 document.xml 逐项对照：

| 项 | c4-1 自产 | basic-1 手工 | 说明 |
| --- | --- | --- | --- |
| 顶层元素 | 4 个 | 5 个 | 自产无 DocumentSheet |
| StyleSheets | 7 条 | 6 条 | 自产多 Basic，5.2.5 的 6~7 基底 |
| Colors | 44 条 | 1 条 | 压缩与否，色板是存储不是语义 |
| FaceNames | Calibri | SimSun | 字体声明跟随使用 |
| DocumentSettings 子元素 | 9 个 | 8 个 | 自产多一个空 SnapAngles |
| docProps | 最小填写 | 全字段 | roadmap P-3 表 |

没有 DocumentSheet 的取舍：文档形状表是"文档级形状"的宿主，没用到就不
写。5.2.6 展开过它的形态，本样本给出的是省略形态，打开行为以工程既有
验收为准。

#### 6.4.5 补充注解

- 无 thumbnail.emf 部件与 roadmap P-1 的预览图议题衔接：结构上缩略图是
  可选部件，本剖析的部件清单可作为扩展基点；
- [Content_Types] 与部件一一对应，21 个部件 16 个 Override 加 4 张关系表
  加登记表自身，无死角无冗余；
- windows.xml 的 Stencil 窗口写本机安装路径，C:\Program Files 下的
  BASIC_M.VSSX。跨机器打开时 Visio 对缺失模具窗口如何处理，见 W-6；
- document.xml 顶层元素顺序与 5.2 一致：DocumentSettings、StyleSheets、
  Colors、FaceNames。手绘样本把 DocumentSheet 排在 FaceNames 后，顺序
  规律可对照。

### 6.5 观察点与待核清单

#### 6.5.1 文件定位

本章收集的疑点集中登记，编号 W-1 到 W-9，供素材扩充、源码核对、真机
验证时逐项消化。旧 01-C4 剖析的六个观察点处置对照放在 6.5.4。

#### 6.5.2 实例内容

| 编号 | 主题 | 证据 | 状态 |
| --- | --- | --- | --- |
| W-1 | 连接线母版文件指向 | rId2 与 rId15 同指 master15.xml，内容为梯形 | 待核 |
| W-2 | 连接线公式与缓存端口 | Begin 侧一致；End 侧 F 引用 X1=下边中点而缓存落在左缘中点 | 待真机核 |
| W-3 | 枚举值差异 | EndArrow=4、ConFixedCode=6、ShapeRouteStyle=1 | 待核 |
| W-4 | 缺 page1.xml.rels | 页面形状 Master= 引用完整 | 待核 |
| W-5 | 文本写法 | 字面换行 + marker 原样入文本 | 待真机核 |
| W-6 | windows.xml 本地路径 | Stencil 写本机 BASIC_M.VSSX 绝对路径 | 待核 |
| W-7 | TimeEdited 固定值 | 2026-07-27 与生成时间不符 | 待核源码 |
| W-8 | 页面实例自足式 | 节点写全几何、连接点、样式，连接线 1-D 全在实例 | 已确认 |
| W-9 | 无 BegTrigger/EndTrigger | 连接线实例没有触发器 cell | 待核机制影响 |
| W-10 | Xn 行号约定与 OriginalID | Xn=行 IX=n-1 为四份素材实证；连接线母版 Shape 带 OriginalID='0'，矩形母版无 | 待核官方出处 |
| W-11 | Xn 约定对自定义行布局的适用边界 | Xn=IX(n-1) 命名约定不变；行到位置的映射随母版而异，类系列为左/右/下/上四中间点 | 待核官方出处，详见 class-结构分析.md |
| W-12 | 命名连接行寻址 | gantt 任务条 Connections.LeftSide.X/RightSide.X，ToPart 仍取 100/101 | 待核，详见 gantt-结构分析.md |

#### 6.5.3 字段解释

- W-1 的根源在 6.3.4，结论路径是引用链读法，审计时用 5.4.2 的 Rel 桥接
  规则顺藤摸瓜；
- W-2 的重点是开卷重算。RecalcDocument=true 已经请求 Visio 在打开时重算，
  公式引用的连接点行会把端点重新落位，缓存只是保存态显示值，见 5.5.3.3；
- W-3 的枚举对照 5.5.3.3 与 5.5.3.4 的待核条目，取值变化不影响结构解析，
  影响的是渲染外观；
- W-4 的承受面在解析器，依赖预知路径要改成可选优化；
- W-5 的观感问题与真机验证绑定，属于 0.1 说的待核条目；
- W-6 的跨机表现与 W-7 的固定时间戳都属于写入特征，源码对号时一并看；
- W-8 与 W-9 是对自产写法的确认性观察，不构成疑点，写进本章是保留证据；
- W-10 的两条都出自 basic-4 比对：Xn 行号约定由四份素材的端口对位推出，
  OriginalID 只在连接线母版出现，等官方文档对照确认。

#### 6.5.4 字段扩展

旧 01-C4 剖析的处理对照表。旧文件已按计划删除，全文在 git 历史
a5cec55 处可查，本表是它的去向：

| 旧编号 | 旧结论 | 处置 |
| --- | --- | --- |
| O-1 | 文本换行用字面 \n | 并入 W-5 |
| O-2 | mermaid marker 原样写入 | 并入 W-5 |
| O-3 | 几何行 V 为英寸值 U 标 MM | 已确认，见 6.2.3.2 |
| O-4 | MermaidId 存原始标识 | 已确认，见 6.2.3.2 |
| O-5 | RecalcDocument + visVersion=15 | 已确认，见 6.4.3 |
| O-6 | 无 thumbnail 部件 | 已确认，见 6.4.5 |

旧剖析里 ToPart 100/101 读成起点侧与终点侧。basic-2、basic-3 入库后
5.5.3.4 的经验规律修正为 100 加连接点行号，本样本的 Connects 数据再次
验证修正后的规律，旧读法作废。旧剖析的结构性结论，包全景、rId 拓扑、
九枚母版 ID 100-108、六形状四 Connects，在本样本全部复核一致。

#### 6.5.5 补充注解

- 后续图型案例的扩充顺序建议：class 的母版资产与组合形状，ER 的双键
  语法，甘特的公式驱动子形状体系，sequence 的生命周期线。素材原则与
  前面相同，每类图手工最简样本加自产产物对照；
- 待核清单汇总入口：各章补充注解的 ❓ 条目汇总在 research README 待办，
  本章 W-1……W-9 并入其中；
- 本章结论边界再申明一遍：c4-1 是自产样本，对照结论只代表这个写入者。
  Visio 打开后的实际行为以真机验收为准。
