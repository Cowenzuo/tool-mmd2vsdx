# sequence 图 .vsdx 内部结构分析（图型专篇）

> 素材：`docs/VSDX解压结构研究/标准研究模板-手动创建vsdx并解压/sequence/`，Visio 手工绘制的时序图，非本工程产物。
> 定位：图型专篇第四篇。通用格式知识见
> [通用visio结构分析.md](通用visio结构分析.md) 第〇至五章。
> 本篇要义：时序图把"时间"编码成连接点行，公式密度在本系列图型中位居前列。

## 1. 案例与包全景

### 1.1 文件定位

素材是一张手工时序图：三个参与者对象1、参与者、对象2 竖排生命线，
若干激活条，两根片段框，四条消息：消息、返回、自关联、异步消息。
消息在生命线的特定时间点上进出，时间点用连接点行表达。

### 1.2 实例内容

母版 11 枚，MasterType 出现两个新值：

| ID | NameU | 文件 | 顶层类型 | MasterType | 说明 |
| --- | --- | --- | --- | --- | --- |
| 7 | Object lifeline | master3.xml | Group 4 子形状 | 2 | 对象生命线 |
| 8 | Actor lifeline | master4.xml | Group 4 子形状 | 2 | 参与者生命线 |
| 9 | Loop fragment | master5.xml | Group 2 子形状 | 2 | 循环片段 |
| 10 | Activation | master6.xml | Shape | 1 | 激活条 |
| 11 | Optional fragment | master7.xml | Group 2 子形状 | 2 | 可选片段 |
| 12 | Message | master8.xml | Shape | 29 | 消息 |
| 13 | Return Message | master9.xml | Shape | 29 | 返回消息 |
| 14 | Self Message | master10.xml | Shape | 29 | 自消息 |
| 16 | Asynchronous Message | master11.xml | Shape | 29 | 异步消息 |

页面 15 个顶层形状，连子形状共 31 个：生命线 3、激活 6、片段 2、消息 4。
Connects 20 条记录，数量为素材家族之最。

### 1.3 字段解释

| 项 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| 生命线 Master | 7 / 8 | 对象与参与者 | 两者同构，子形状不同（头像 vs 图标） |
| 激活 Master | 10 | Activation | 1-D 条状，MasterType=1 |
| 消息 Master | 12/13/14/16 | 四类消息 | MasterType=29，差异在箭头与线型 |
| 片段 Master | 9 / 11 | Loop/Optional | Group 两子形状 |

### 1.4 字段扩展

- MasterType 新档：1 号激活条、29 号消息族。加上 2 普通、34 成员、
  541 连接线族，一张素材内出现三档以上是常态；
- 母版 ID 出现空洞：消息族 12/13/14/16，15 空缺，与 5.5.4 的"删除
  痕迹"同款。

### 1.5 补充注解

- document.xml 7 样式、ColorEntry 2；pages.xml 带 Trigger/Layer/
  XRulerOrigin，1548 字节，与 ER 同构；
- 消息四类母版并非逐字节相同：Message 6204B、Return 6124B、Self 5173B、
  Async 5234B，差异集中在箭头与线型，见第 4 章。

## 2. 时间点连接行

### 2.1 文件定位

时序图的灵魂：生命线的连接点不是四个边中点，而是沿线的**时间刻度点**。
Object lifeline 母版带 100 行连接点，每行对应一个时间格，消息粘到
"第几个时间格"上。这条机制把时序图的语义直接写进了连接行。

### 2.2 实例内容

生命线连接行骨架，见 master3.xml，前两行与末行：

```xml
<Row T='Connection' IX='0'>
  <Cell N='X' V='0.3543307086614173' U='MM' F='Controls.Row_1'/>
  <Cell N='Y' V='-0.25' U='MM'
        F='IF(Controls.Row_1.Y&lt;-6.35MM,-6.35MM,Controls.Row_1.Y)'/>
  …
</Row>
<Row T='Connection' IX='1'>
  <Cell N='X' V='0.3543307086614173' U='MM' F='Controls.Row_1'/>
  <Cell N='Y' V='-0.5' U='MM'
        F='IF(Controls.Row_1.Y&lt;-12.7MM,-12.7MM,
             Controls.Row_1.Y+MODULUS(ABS(Controls.Row_1.Y),6.35))'/>
  …
</Row>
<Row T='Connection' IX='99'>
  <Cell N='X' V='0.3543307086614173' U='MM' F='Controls.Row_1'/>
  <Cell N='Y' V='0'
        F='IF(Controls.Row_1.Y&lt;-635MM,-635MM,
             Controls.Row_1.Y+MODULUS(ABS(Controls.Row_1.Y),6.35))'/>
  …
</Row>
```

页面三条生命线对象1 #1、参与者 #6、对象2 #11，每条线 100 连接行，
在实例侧只写实际用到的行的 Y 缓存。激活条母版 master6.xml 同样带
100 个时间点连接行，顶部另有 BeginX/EndX 的 1-D 行为。

### 2.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| 连接行数 | 100 | 时间格库 | X1 到 X100，ToPart 100 到 199 |
| X 公式 | Controls.Row_1 | 行的横向位置 | 生命线拖动句柄的列坐标 |
| Y 公式 | IF/MODULUS 组合 | 时间格定位 | 6.35mm 步长，拖过边界的兜底 |
| Controls.Row_1 | 生命线的拖动点 | 时间原点 | 移动句柄整条线的时间点随动 |

页面实例的消息粘附示例：消息 27 从激活 19 的 X1 到生命线 1 的 X4；
自消息 30 从激活 25 的 X5 回 X9；ToPart 一路取到 122 即 X23，
ToPart=100+行 IX 的规律在本素材扩展到高行号，121 与 122 成对出现，
表示自己到自己。

### 2.4 字段扩展

- Xn=IX(n-1) 约定在这里推到 100 行规模：X23=行 IX=22，ToPart=122；
- 时间格 6.35mm 是 0.25 英寸，与 Visio 的 0.25in 网格步长一致；步长
  是不是可配置，见第 5 章 s-1；
- 激活条的 100 行与生命线同构，激活消息可以从激活条上的时间点进出，
  消息直接粘激活的现象见第 3 章。

### 2.5 补充注解

- 100 行是母版的默认规模，页面实例只保留用到的行缓存，未用行由
  继承链补充。解析器读时间点时要按母版行数而非实例行数初始化；
- Control.Row_1 在生命线里承担"时间原点"角色，与 class/ER 容器里
  "行宽控制点"同名不同义，按母版找语义。

## 3. 激活与消息

### 3.1 文件定位

激活条是 1-D 的形状，Type=Shape、含 BeginX/EndX，在生命线上标出
消息持续区间。消息是另一族 1-D 形状，从激活或生命线的时间点出发，
到目标时间点结束。消息四类母版的差异在箭头与线型上，全部是直线。

### 3.2 实例内容

消息四类的视觉编码：

| Master | EndArrow | LinePattern | 几何行 | 说明 |
| --- | --- | --- | --- | --- |
| Message | 4 | 1 | 6 行 | 实线开放箭头 |
| Return Message | 3 | **2** | 6 行 | 虚线返回箭头 |
| Self Message | 4 | 1 | 6 行 | 实线自勾 |
| Asynchronous Message | 3 | 1 | 6 行 | 实线异步箭头 |

激活条 master6.xml：Shape，BeginX/EndX 齐备，LockHeight=1，102 连接行
即 100 时间点加两端。

### 3.3 字段解释

- 消息的 LinePattern=2 编码"返回"，可见线型语义在这一族里直接承担
  角色区分，与 class 关系的虚/实同思路；
- EndArrow 3/4 的枚举沿用规范版 5.5.3.3 的待核项；
- 消息的粘附：Connects 记录里 FromCell=BeginX/EndX、ToCell 是生命线或
  激活的 Connections.Xn，行号由语义层计算后写入，见第 5 章 s-2。

### 3.4 字段扩展

- 本样例的消息全部粘在 1 到 23 号时间点区间，实际帧内时间语义由
  mermaid 布局决定，Visio 侧只是"第几格"；
- 自消息把起点终点都放在同一激活条上，是时间点行从自己出发回到
  自己的形态。

### 3.5 补充注解

- 激活条没有 Group 段，不是容器；它是"1-D + 时间点行"的复合；
- 消息几何行 6 行、两块 Geometry 段，线与箭头块，与关系类形状的
  写法一致。

## 4. 片段

### 4.1 文件定位

Loop fragment 与 Optional fragment 把一段消息包成组合框。两个母版都是
Group 2 子形状，母版文件 170 cell 级，是序列图的三层结构里最轻的一层。

### 4.2 实例内容

- Loop 片段 #16：Master=9，Group，两块几何；
- Optional 片段 #22：Master=11，Group，同构；
- 页面上片段包住若干消息，构成 alt 语义。

### 4.3 字段解释

- 片段子形状 = 标签块与框体两部分；标签文字直接写在子形状上；
- 片段本身不参与粘附，Connects 记录里没有片段条目，它只是框。

### 4.4 字段扩展

- 片段类型 Loop/Optional/Alt/Par 等，在模板里各自是独立母版，
  母版 ID 与 NameU 一次注册一个类型；本素材只用了前两种；
- 与 mermaid sequence 的 alt/loop 语法对应，语义映射待核，见第 5 章
  s-3。

### 4.5 补充注解

- 片段的 Group 子形状在页级是小形态，字段全 F=Inh，与 class 的
  发现一致；
- 片段若参与绘制，如框架线框住消息，解析器需要计算包围盒，属于
  渲染层问题，与包结构无关。

## 5. 观察点与待核清单

### 5.1 文件定位

sequence 专篇观察点编号 s-1 起。

### 5.2 实例内容

| 编号 | 主题 | 证据 | 状态 |
| --- | --- | --- | --- |
| s-1 | 时间格步长可配置性 | 6.35mm 步长来自公式常量 | 待核 |
| s-2 | 消息行号语义 | 消息粘附行号由布局层算好写入 | 待核 |
| s-3 | 片段类型语义 | Loop/Optional 两枚母版与 mermaid 语法对照 | 待核 |
| s-4 | 激活条 1-D 形态 | Shape 带 BeginX/EndX/LockHeight | 已确认 |
| s-5 | 生命线 100 行规模 | 母版 100 行 6.35mm 步长 | 已确认 |

### 5.3 字段解释

- s-1 关系到自产 sample 的步长选择；s-2 关系到消息端点计算；
- s-3 是跨工具语义表的一部分，建议与其他图型一起建表。

### 5.4 字段扩展

- 本组观察点中 s-4、s-5 与 ToPart=100+IX 规律升级为"任意行数"，
  规范版 5.5.3.4 与 W-11 可加注序列图扩展，待回填。

### 5.5 补充注解

- 本篇要点回顾：时序图 = 生命线时间点行 + 1-D 激活/消息 + 片段框；
  与 basic-N 的连接线家族相比，消息族母版不公用 Dynamic connector，
  四类消息各自成版。
