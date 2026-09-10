# gantt 图 .vsdx 内部结构分析（图型专篇）

> ⚠ **归档（2026-09）**：gantt 图型已从本工程移除支持（保留 block/class/er/flowchart/
> sequence 五类）。本篇与 `标准研究模板-手动创建vsdx并解压/gantt/` 素材仅作研究证据保留，
> 不再驱动实现。

> 素材：`docs/research/标准研究模板-手动创建vsdx并解压/gantt/`，Visio 手工绘制的甘特图，非本工程产物。
> 定位：图型专篇第三篇。通用格式知识见
> [通用visio结构分析.md](通用visio结构分析.md) 第〇至五章，容器机制基础
> 见 [class-结构分析.md](class-结构分析.md) 第 2、3 章。
> 本篇体量控制：gantt 是公式驱动最深的图型，本篇先建立结构地图与机制
> 要点，公式级逐 cell 解剖留待后续。
> 目录名 gantt 为规范拼写，源仓库曾用 gannt，已改名。

## 1. 案例与包全景

### 1.1 文件定位

素材是一张手工甘特图：任务时间表带。六行任务，两级标尺，表头六列，
是 ID、任务名称、开始时间、完成、持续时间与空白列。与其它素材不同，
gantt 的一切都由专用母版搭建：框架、列、行、任务条、文本条目、里程碑、
非工作时间、连接线。全页 65 个顶层形状，连子形状共 113 个，母版 12 枚，
样式表 31 枚。

### 1.2 实例内容

母版清单：

| ID | NameU | 文件 | 顶层类型 | Hidden | 说明 |
| --- | --- | --- | --- | --- | --- |
| 7 | Gantt Chart frame | master3.xml | Shape | 0 | 图表框架，行数/列数/起止日期 |
| 8 | Column | master4.xml | Shape | 0 | 表头列 |
| 9 | Sec scale cell | master5.xml | Shape | **1** | 次级标尺格 |
| 10 | Non working time | master6.xml | Shape | **1** | 非工作时间格 |
| 11 | Pri scale cell | master7.xml | Shape | **1** | 初级标尺格 |
| 12 | Row | master8.xml | Shape | 0 | 任务行 |
| 13 | Task bar | master9.xml | **Group** 8 子形状 | 0 | 任务条 |
| 14 | Text Entry | master10.xml | Shape | **1** | 文本条目 |
| 15 | Milestone | master11.xml | **Group** 8 子形状 | 0 | 里程碑 |
| 16 | Link lines | master12.xml | Shape | 0 | 任务连线 |
| 2/4 | Rectangle / Dynamic connector | master1/2.xml | Shape | 0 | 基础两件 |

页面结构：1 框架 + 6 列，ID/任务名称/开始时间/完成/持续时间/空白列 +
次级标尺 1 + 初级标尺 14 + 行 6 枚，行号 1 到 6 + 任务条 5 + 文本条目 28 +
里程碑 1 + 非工作时间 2 + 连接线 1 枚 ID=113。

### 1.3 字段解释

| 项 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| 框架 Master | 7 | Gantt Chart frame | 承载行列参数 |
| 标尺 Master | 9 / 11 | 次级/初级标尺格 | Hidden=1，内部资产 |
| 行 Master | 8 | Row | 任务行载体 |
| 任务条/里程碑 | 13 / 15 | 大型 Group 母版 | 8 子形状，1301 与 1265 个 cell |
| 文本条目 Master | 14 | Text Entry | Hidden=1，带 Field 段 |
| 连接线 Master | 16 | Link lines | MasterType=1，见 4.4 |

### 1.4 字段扩展

与其它素材的差别一眼可见：样式表 31 枚，其中 24 枚以 pr 前缀为名，
是 gantt 自带的样式家族；页面没有单根连接线家族，任务间联系用
Link lines。

### 1.5 补充注解

- PageSheet 9539 字节，远大于其它素材，Trigger/Layer/XRulerOrigin 齐全，
  页级 cell 更多，展开见第 3 章；
- document.xml ColorEntry 11 条，FaceName SimSun；
- gantt 是"尺寸放大的 basic"：结构骨架与新素材一致，差异集中在样式表
  家族与任务条大型母版。

## 2. 样式表家族

### 2.1 文件定位

gantt 素材把文档样式表用到了极限：基础 7 枚加 24 枚 pr 前缀样式。
pr 家族每枚管一类角色：标尺、时间条、文字、符号、非工作时间、连线。
形状的 LineStyle/FillStyle/TextStyle 指向 pr 样式，pr 样式之间还有
自己的引用链。

### 2.2 实例内容

31 枚样式表，ID 8 起全部是 pr 家族：

| ID | NameU | Line/Fill/Text 引用 | 角色 |
| --- | --- | --- | --- |
| 8 | pr Frame Line | →6 | 框架线 |
| 9 | pr Background Fill | →6 | 背景填充 |
| 10 | pr Grid Line | →6 | 网格线 |
| 11 | pr Column Header Fill | →12 | 表头填充 |
| 12 | pr Normal | →6 | 常规角色 |
| 13 | pr Column Header Text | →12 | 表头文字 |
| 14 | pr Secondary Scale Line | →10 | 次级标尺线 |
| 15 | pr Secondary Scale Fill | →11 | 次级标尺填充 |
| 16 | pr Secondary Scale Text | →13 | 次级标尺文字 |
| 17 | pr Non Working Fill | →12 | 非工作时间填充 |
| 18 | pr Primary Scale Line | →10 | 初级标尺线 |
| 19 | pr Primary Scale Fill | →11 | 初级标尺填充 |
| 20 | pr Primary Scale Text | →13 | 初级标尺文字 |
| 21 | pr Timebar Inside Text | →22 | 条内文字 |
| 22 | pr Timebar Text | →12 | 条上文字 |
| 23 | pr Symbols Line | →6 | 符号线 |
| 24 | pr Milestone Symbol Fill | →6 | 里程碑填充 |
| 25 | pr Timebar Line | →10 | 时间条线 |
| 26 | pr Timebar Fill | →6 | 时间条填充 |
| 27 | pr Percent Complete Fill | →12 | 完成度填充 |
| 28 | pr Start Symbols Fill | →6 | 起始符号 |
| 29 | pr End Symbols Fill | →6 | 结束符号 |
| 30 | pr Task Text | →12 | 任务文字 |
| 31 | pr Link Line | →12 | 连线 |

### 2.3 字段解释

- 继承链分两簇：一簇指向 6 号 Theme 兜底，覆盖 Frame、Grid、Timebar；
  一簇指向 12 号 pr Normal，覆盖表头、文字；
- pr 样式之间也互相引用，比如 13 号 pr Column Header Text 的三引用指向
  12 号 pr Normal，线、填充、文本全部外包给基底样式；
- 数值集中在一个小基底里，gantt 换主题只动基底样式就行。

### 2.4 字段扩展

- 这是 5.2 的"样式索引只在本文档内有效"的最完整实证：pr 家族的 ID
  与名字都是文档私有的，换一份图 ID 8 到 31 可能是完全别的样式；
- 样式家族的名字与 ID 序列在 Visio 甘特模板里稳定，判断素材是否甘特
  图可以先看样式表 NameU 的 pr 前缀。

### 2.5 补充注解

- 自产 gantt 样本若想对齐这套观感，必须整套 pr 家族一起写，7 枚基底
  不够，形态差异会直接暴露；
- pr 家族的完整 cell 逐枚展开见后续选题，本篇只给地图。

## 3. 框架、标尺与行

### 3.1 文件定位

框架带：Gantt Chart frame 是封面，Column 是表头列，Pri/Sec scale cell 是
两级标尺格，Row 是任务行。这一层形状都不复杂，标尺格与文本条目带
Field 段是新的。

### 3.2 实例内容

- 框架 #1：Master=7，User 段与几何三行，承载行列参数的图形；
- 列 #2-7：Master=8，两块 Geometry，标题格与表头样式，文本 ID/任务
  名称/开始时间/完成/持续时间/最后空白列；
- 次级标尺 #8：Master=9，Field 段加 User/Paragraph/Geometry；
- 初级标尺 #10-24：Master=11，同一母版共 14 枚实例，Field 段提供日期
  文本；
- 行 #25/39/53/67/81/104：Master=12，两段几何，行号 1 到 6。

### 3.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Field 段 | 标尺格与文本条目 | 数据字段段 | 提供日期/编号等计算值，标准 Visio 字段机制 |
| User 段列 | 行列参数 | 结构参数 | 与容器机制的 User 行家族衔接 |
| 列几何 | 两块 | 标题与内容 | 列头与列体分开画 |

### 3.4 字段扩展

- 初级标尺 14 个实例共用一个母版，说明标尺格是"纯数据行"，文字来源
  Field 而不是 Text；
- 行号 1/2/3 是 Text 内容还是 Field 计算，见第 5 章 g-3。

### 3.5 补充注解

- 列的名称与顺序是模板惯例，mermaid gantt 的行列对应关系待对照；
- 标尺 Field 段的字段引用链，如 AXISFORMAT 等函数，是 gantt 公式密集的
  第一站，解剖留待后续。

## 4. 任务条、里程碑与连接线

### 4.1 文件定位

这一层是 gantt 的核心资产：Task bar 与 Milestone 都是大型 Group 母版，
8 枚子形状，1301 与 1265 个 cell，内含时间条、进度填充、起始符号、文字等。
任务条带专用连接点行，命名行代替编号行。

### 4.2 实例内容

任务条实例 #26/40/54/68/82 共 5 枚：Master=13，User/Control/**Property**/
Connection 四段，Connection 行是命名行。连接记录原文：

```xml
<Connect FromSheet='113' FromCell='EndX' FromPart='12' ToSheet='82'
         ToCell='Connections.LeftSide.X' ToPart='100'/>
<Connect FromSheet='113' FromCell='BeginX' FromPart='9' ToSheet='54'
         ToCell='Connections.RightSide.X' ToPart='101'/>
```

里程碑 #95：Master=15，Group 8 子形状，与任务条同层级。
文本条目 #35-38、49-52、63-66、77-80、91-94、105-112 共 28 枚：Master=14，
Field/User/Character/Geometry，部分带 Actions 段。
非工作时间 #9/17：Master=10，空白格。
连接线 #113：Master=16，MasterType=1，1-D 形状。

### 4.3 字段解释

| 项 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Property 段 | 任务条 | 属性段 | gantt 专有，语义待核 |
| Connection 命名行 | LeftSide.X / RightSide.X | 粘附库 | 命名行代替 Xn 编号行 |
| 子形状 8 枚 | 任务条内部件 | 时间条/符号/文字 | 视觉全部由子形状画 |
| Field 段 | 文本条目 | 数据字段 | 条目文字来源 |
| MasterType | Link lines 取 1 | 母版标志 | 新取值，与 2/34/541/29 并列 |

### 4.4 字段扩展

- 命名连接行是 Xn 外的第二套粘附寻址：Connections.LeftSide.X 直接按
  行名引用。ToPart 仍取 100/101；命名行的行号和 ToPart 关系待核，
  见第 5 章 g-1；
- Link lines 的 MasterType=1 是 Message 族之外的新取值，标识"线条类
  母版"的又一形态。

### 4.5 补充注解

- 任务条连接点在左右两侧：LeftSide 与 RightSide，语义与本工程
  renderer 的任务条粘附算法对得上，见源码段位图；
- 里程碑是菱形符号，形状结构与任务条同集团，解剖共用；
- 全页只有一条连接线，说明 gantt 的"关系"是弱关系，主线是行与列。

## 5. 观察点与待核清单

### 5.1 文件定位

gantt 专篇观察点编号 g-1 起，只收 gantt 专属疑点。

### 5.2 实例内容

| 编号 | 主题 | 证据 | 状态 |
| --- | --- | --- | --- |
| g-1 | 命名连接行与 ToPart | LeftSide/RightSide 取 100/101 | 待核 |
| g-2 | Property 段语义 | 任务条专有段 | 待核 |
| g-3 | 行号数据来源 | Row 文本 1/2/3 来自 Text 还是 Field | 待核 |
| g-4 | pr 家族引用链 | 24 枚样式两簇继承 | 已确认 |
| g-5 | 标尺 Field 公式 | 日期字段引用链 | 待核 |
| g-6 | 任务条公式体系 | 8 子形状 1301 个 cell | 待续（另行解剖） |

### 5.3 字段解释

- g-1 若成立，粘附寻址存在第三套写法：命名行不与 IX 对应，ToPart
  仍按 100 起，规则与 Xn 不同；
- g-4 的继承簇理解清楚后，本工程自产 gantt 的样式决策可直接照抄；
- g-6 是体量问题，等待专门的公式解剖任务。

### 5.4 字段扩展

本篇观察点如 g-1、g-2 通过验证后将回填规范版 W 清单与 5.6 索引；
先留在本篇。

### 5.5 补充注解

- gantt 素材的页面布局与母版清单可作为工程自产的对照样板；
- 后续公式解剖建议从 Field 段的 AXISFORMAT 入手，它是 gantt 日期
  链条的第一环。
