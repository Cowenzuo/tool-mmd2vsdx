# class 图 .vsdx 内部结构分析（图型专篇）

> 素材：`docs/research/标准研究模板-手动创建vsdx并解压/class/`，Visio 手工绘制的 UML 类图，非本工程产物。
> 定位：本篇是图型专篇第一篇。通用格式知识在
> [通用visio结构分析.md](通用visio结构分析.md) 第〇至五章，本篇只讲 class
> 图自己的行为层机制：Group 形状体系、容器与成员公式、关系形状。
> 体例同规范版第〇章五步法，编号与正文引用均以规范版为准。
> 素材来源标注与全文约定见 research README 与规范版 0.1。

## 1. 案例与包全景

### 1.1 文件定位

素材是一张手工绘制的 UML 类图。五个盒：类 Owner、匿名类、接口、枚举、
一枚复制的枚举.60。盒内是成员行与分隔符。三条关系线：依赖、接口实现、
继承。

它与 basic-N 的差别在形状体系：basic-N 全是扁平 Shape 加连接线，这份素材
的盒与关系线全部是 **Group 形状**，成员行是靠公式挂进容器的页级形状。
class 是第一种"复合形状"素材。

### 1.2 实例内容

包结构同 basic-N 家族，26 部件。多了的是母版区：11 枚母版，文件名
master1.xml 到 master11.xml 顺序连续，ID 与文件名完全脱钩：

| ID | NameU | 文件 | 顶层形状类型 | 特征 |
| --- | --- | --- | --- | --- |
| 2 | Rectangle | master1.xml | Shape | 与 basic-N 的矩形母版相同 |
| 4 | Dynamic connector | master2.xml | Shape | 与 basic-N 的连接线母版相同 |
| 7 | Class | master3.xml | **Group** | 圆角盒，4 连接点行，Container 行集 |
| 8 | Member | master4.xml | Shape | 容器成员行，公式回指容器 |
| 9 | Separator | master5.xml | Shape | 属性与操作之间的分隔线 |
| 10 | Interface | master6.xml | **Group** | 同 Class 布局 |
| 11 | Dependency | master7.xml | **Group** | 虚线关系，含箭头子形状 |
| 12 | Note | master8.xml | **Group** | 便签，含折角子形状，本图未使用 |
| 13 | Interface Realization | master9.xml | **Group** | 与 master7.xml 逐字节相同 |
| 14 | Enumeration | master10.xml | **Group** | 同 Class 布局 |
| 15 | Inheritance | master11.xml | **Group** | 实线关系，实心三角子形状 |

页面 27 个形状：5 盒 + 14 成员行 + 5 分隔符 + 3 关系线。形状 ID 1 到 67，
大段跳号。成员行与分隔符是页级形状，独立于盒的 XML 之外。

### 1.3 字段解释

| 项 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| 盒的 Master | 7 / 10 / 14 | 类 / 接口 / 枚举 母版 | 三种盒同构，只差目录条目 |
| 成员 Master | 8 | Member 母版 | 每枚成员行一个实例 |
| 分隔符 Master | 9 | Separator 母版 | 每枚分隔一行 |
| 关系中 Master | 11 / 13 / 15 | 依赖/接口实现/继承 | 类图不用 Dynamic connector |
| MasterType | 2/34/541 | 母版标志 | 三档同现：盒 2、成员 34、关系 541 |
| 页面 ID | 1–67 跳号 | 形状编号域 | 组内子形状与页级成员混编 |
| document.xml | 7 样式 + DocumentSheet + ColorEntry 4 条 | 样式基座 | 与 basic-N 同源，色板 4 条 |

### 1.4 字段扩展

与 basic-N 的差异集中于形状体系，逐项对照：

| 机制 | basic-N | class |
| --- | --- | --- |
| 形状类型 | Shape | **Group** 大量出现（盒、关系、注记） |
| 盒的构成 | 单一几何 | 母版内容嵌套子形状（外盒 + 标题等） |
| 业务行 | 无 | 页级成员形状，公式回指容器 |
| 连接点行 | 矩形标准五行 | 类系列四行，行布局随母版 |
| 关系线 | Dynamic connector | 专用关系母版（虚线/实心三角） |

母版内容共享的新现象：master7.xml 与 master9.xml 逐字节相同，依赖与接口
实现两个条目的差别只在目录条目里。素材家族里第一次见到同一份内容挂两个
条目。

### 1.5 补充注解

- Note 母版入库但页面未用，是备用资产，整套 UML 模具按需带入；
- 复制命名再添一例：Enumeration.60、Member.65、Separator.66，见 5.5.4 的
  复制自动命名规则；
- 页画布与 basic-3/4 同构，带 XRulerOrigin/XGridOrigin 与 Layer 段，另多一个
  Trigger 元素，见 5.6.2 的说明索引。

## 2. Group 形状体系

### 2.1 文件定位

Group 是"包含子形状的形状"。页面上它画成一个整体，内部可以是一组装饰
子形状。普通 Shape 的几何、文本都写在自身；Group 的几何与外观看似同构，
但容器语义是新的：子形状各自独立存在，有的作为母版内容的一部分被实例
继承，有的作为页级成员由公式关联。

class 的盒与关系线母版全部是 Group。之前所有素材的母版顶层 Shape 都是
Type='Shape'，这里第一次出现 Type='Group'。

### 2.2 实例内容

以 Class 母版为例，骨架见
`docs/research/标准研究模板-手动创建vsdx并解压/class/visio/masters/master3.xml`：

```xml
<MasterContents …>
  <Shapes>
    <Shape ID='5' Type='Group' LineStyle='3' FillStyle='3' TextStyle='3'>
      <Cell N='PinX' V='1.968503910725511' U='MM'/>
      <Cell N='Width' V='2.559055118110236' U='MM'/>
      <Cell N='Height' V='1.054271653543307' U='MM'/>
      <Cell N='LocPinX' V='0'/>  <Cell N='LocPinY' V='0'/>
      <Cell N='ObjType' V='1'/>  <Cell N='ShapeSplit' V='1'/>
      <Cell N='ShapePlaceStyle' V='15'/>  <Cell N='NoObjHandles' V='1'/>
      <Cell N='LockWidth' V='1'/>  <Cell N='LockHeight' V='1'/>  <Cell N='LockRotate' V='1'/>
      <Cell N='EventDblClick' V='0'/>  <Cell N='EventDrop' V='0'/>
      <Section N='User'>…WidthMin、EntityName、MSVSDCONTAINERMARGIN 等…</Section>
      <Section N='Actions'>…右键动作…</Section>
      <Section N='Control'>
        <Row N='Row_1'>
          <Cell N='X' V='2.559055118110236' U='MM'
                F='BOUND(65MM*DropOnPageScale,0,User.Test,25MM,2540MM,NOT(User.Test),
                     User.WidthMin+User.msvSDContainerMargin*2,2540MM)'/>
          <Cell N='Y' V='0.5271358267716536' U='MM' F='Height*0.5'/>
          <Cell N='XDyn' V='2.559055118110236' U='MM' F='Controls.Row_1'/>
          <Cell N='YDyn' V='0.5271358267716536' U='MM' F='Controls.Row_1.Y'/>
          <Cell N='XCon' V='2'/>  <Cell N='YCon' V='1'/>
          <Cell N='CanGlue' V='0'/>  <Cell N='Prompt' V='调整列表大小'/>
        </Row>
      </Section>
      <Section N='Connection'>
        <Row T='Connection' IX='0'><Cell N='X' V='0' U='MM' F='Width*0'/>
          <Cell N='Y' V='0.5271358267716536' U='MM' F='Height*0.5'/> …</Row>
        <Row T='Connection' IX='1'><Cell N='X' V='2.559055118110236' U='MM' F='Width*1'/>
          <Cell N='Y' V='0.5271358267716536' U='MM' F='Height*0.5'/> …</Row>
        <Row T='Connection' IX='2'><Cell N='X' V='1.279527559055118' U='MM' F='Width*0.5'/>
          <Cell N='Y' V='0' U='MM' F='Height*0'/> …</Row>
        <Row T='Connection' IX='3'><Cell N='X' V='1.279527559055118' U='MM' F='Width*0.5'/>
          <Cell N='Y' V='1.054271653543307' U='MM' F='Height*1'/> …</Row>
      </Section>
      <Section N='Geometry' IX='0'>…MoveTo/LineTo/EllipticalArcTo 圆角轮廓…</Section>
      <Shapes>
        <Shape ID='6' Type='Shape'>…标题行子形状…</Shape>
        <Shape ID='7' Type='Shape'>…</Shape>
        <Shape ID='8' Type='Shape'>…</Shape>
        <Shape ID='9' Type='Shape'>…</Shape>
      </Shapes>
    </Shape>
  </Shapes>
</MasterContents>
```

页面实例以组 1 为例，见
`docs/research/标准研究模板-手动创建vsdx并解压/class/visio/pages/page1.xml`。实例只写覆盖与关系：
Pin/W/H 覆盖、LocPin F=Inh、`Relationships=0 F=SUM(DEPENDSON(2,Sheet.6!SheetRef(),…)`
声明成员、Connection 行只带 Y 缓存 F=Inh、Geometry 行 Y-only F=Inh、
嵌套子形状以最小形态出现，如 ID=3 只带 PinY F=Inh 与 User Value F=Inh。

### 2.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| Type | Group | 形状类型 | 容器形状，子形状挂在本体内 |
| LocPinX/Y | 0 | 本地锚在 Pin 上 | 与矩形的中心锚不同，坐标换算规则随之不同 |
| ObjType | 1 | 对象类型 | 容器类形状的取值 |
| ShapePlaceStyle | 15 | 放置样式 | 布局引擎识别，类盒专用的标志位 |
| NoObjHandles | 1 | 隐藏对象句柄 | 容器整体操作，子形状不暴露 |
| LockWidth/Height/Rotate | 1 | 锁定 | 成员行驱动尺寸，禁手动缩放旋转 |
| User.WidthMin | 0.882 DL | 最小宽度 | 成员公式与 BOUND 使用 |
| User.EntityName | Owner U=STR | 实体名 | 类的业务名，F=Inh 由实例给 |
| User.msvSDContainerMargin | 0.03937 | 容器内边距 | 成员公式回指的边距 |
| Control Row_1 | BOUND 公式 | 行宽控制点 | Prompt 调整列表大小，成员宽度读它 |
| Actions 段 | 右键动作集 | 交互动作 | 本素材首次出现 |
| Connection 行 | 4 行 | 粘附库 | 布局见 2.4 |
| Geometry | 含 EllipticalArcTo | 圆角轮廓 | 前几份素材只有直线与 Del 占位 |

### 2.4 字段扩展

类系列母版的连接点行布局与矩形不同。矩形标准五行是下边、右边、上边、
左边、中心；类系列四行，规范版读者可对照矩形的行号约定：

| IX | 位置公式 | 位置 |
| --- | --- | --- |
| 0 | Width*0, Height*0.5 | 左边中点 |
| 1 | Width*1, Height*0.5 | 右边中点 |
| 2 | Width*0.5, Height*0 | 下边中点 |
| 3 | Width*0.5, Height*1 | 上边中点 |

Xn 命名约定不变：Connections.Xn 对应行 IX=n-1。关系线的三处引用全部按
这个规则落在盒的四个中点，实证见 4.4。行→位置的映射是母版自己的布局，
不能把矩形的行表搬到别的母版上用，规范版 6.5 的 W-11 记的就是这个边界。

### 2.5 补充注解

- 组的几何局部坐标系与矩形不同：LocPin 在 Pin 上，实例 Geometry 行的
  缓存值如 Y=1.6181 大于母版 Height 的 1.0543，说明局部原点不在盒底，
  盒的偏移定义在母版几何行里。换算公式待真机核对，见第 5 章 k-2；
- 嵌套子形状在页面的实例化形态是最小的：只有覆盖 cell，其余 F=Inh 走
  母版。子形状本体不带 Master 属性，随母版内容走；
- Group 的成员清单用 Relationships=SUM(DEPENDSON(SheetRef)) 维护，见 3.3。

## 3. 容器与成员公式

### 3.1 文件定位

这是本图最深的机制：Visio 的列表容器。容器是 Group 盒，成员是页级
独立形状，两者不嵌套，靠公式互相回指。类盒上半是标题，下半是成员列表，
成员行由容器自动排列。成员之后还有分隔符，把属性区与操作区分开。

### 3.2 实例内容

成员行实例骨架，取 ID=6 Master=8 作例：

```xml
<Shape ID='6' Type='Shape' Master='8' NameU='Member' Name='成员'>
  <Cell N='PinX' V='2.944882002845933'/>
  <Cell N='Width' V='2.480314960629921'
        F='IFERROR(LISTSHEETREF()!Controls.ROW_1-User.ContainerMargin*2,…)'/>
  <Cell N='LocPinX' V='1.240157480314961' F='Inh'/>
  <Cell N='Relationships' V='0'
        F='SUM(DEPENDSON(5,Sheet.1!SheetRef()))'/>
  <Cell N='ShapeFixedCode' V='1'/>
  <Cell N='TxtWidth' V='2.480314960629921' F='Inh'/>
  <Section N='User'>
    <Row N='成员名'><Cell N='Value' V='-func1' F='Inh'/></Row>
    <Row N='ContainerMargin'><Cell N='Value' V='0.03937007874015748'
        F='IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'/></Row>
    <Row N='WidthMin'><Cell N='Value' V='0'
        F='IFERROR(IF(LISTSHEETREF()!User.WIDTHMIN&lt;TEXTWIDTH(TheText),…))'/></Row>
    <Row N='BACKGRND'><Cell N='Value' V='#f2f2f2'
        F='IFERROR(LISTSHEETREF()!User.BACKGRND,FillForegnd)'/></Row>
    <Row N='BACKGRNDLINE'><Cell N='Value' V='0'
        F='IFERROR(LISTSHEETREF()!User.BACKGRNDLINE,LineColor)'/></Row>
  </Section>
  <Text><cp IX='0'/>-func1</Text>
</Shape>
```

容器的成员清单在盒上：`Relationships=0 F=SUM(DEPENDSON(2,Sheet.6!SheetRef(),…)`。
分隔符是 Master=9 的形状，布局与成员同框，无文本，几何只有两行。

### 3.3 字段解释

公式家族逐项：

| 名字 | 内容 | 含义 |
| --- | --- | --- |
| LISTSHEETREF() | 容器引用 | 成员回指宿主容器，列表容器专用函数 |
| Controls.ROW_1 | 容器的行宽控制点 | 成员宽度按它计算 |
| MSVSDCONTAINERMARGIN | 0.03937 | 容器内边距，大小写混写、两处引用 |
| WIDTHMIN | 常量或公式 | 容器最小宽度，BOUND 下限 |
| BACKGRND / BACKGRNDLINE | #f2f2f2 / 0 | 成员背景与分隔线颜色，取容器的 |
| DEPENDSON(SheetRef) | 成员或容器侧引用表 | 成员清单：容器有它、成员单向回指 |
| ShapeFixedCode | 1 | 移动锁定，成员随容器排布 |
| GlueType | 8 | 成员粘附类型，对应容器成员的挂接 |

### 3.4 字段扩展

- 容器行宽与最小宽度构成 BOUND 公式的上下限：25MM 到 2540MM，随
  DropOnPageScale 缩放。行宽控制点出现在盒的右缘，拖动调整；
- 成员与容器的相对位置由布局引擎维持。成员实例只写 Pin 的缓存，位置
  语义与容器对齐，重排行为待真机核，见第 5 章 k-3；
- 多容器同页，成员公式各自回指宿主；容器的 DEPENDSON 列表与成员数量
  一一对应，Excel 单元格引用式的双向关系在这里初见；
- 复制容器产生整套后缀名：容器.60、成员.65、分隔符.66，复制时连成员
  清单一起复制。

### 3.5 补充注解

- MSVSD 前缀是 Visio 内部契约命名，官方出处见 Visio SDK 的容器扩展
  文档，📚 待核；
- Actions 段是右键动作集，与容器、用户模型相关，本素材首次出现，动作
  语义待核，见第 5 章 k-4；
- 容器盒的 ObjType=1 与矩形实例相同，但 ShapePlaceStyle=15 是类盒专用，
  解析器按 ShapePlaceStyle 识别布局行为，不能只看 ObjType。

## 4. 关系形状

### 4.1 文件定位

类图关系的表达与 basic-N 完全不同：不用 Dynamic connector，改用专用
关系母版。三枚关系母版都是 Group：本体是一条线段，含起点终点公式，
子形状是箭头或三角。依赖用虚线，继承用实心三角，UML 语义直接编码在
母版里。

### 4.2 实例内容

关系母版以 Dependency 为例，见 master7.xml，骨架：

```xml
<MasterContents …>
  <Shapes>
    <Shape ID='5' Type='Group' LineStyle='7' FillStyle='7' TextStyle='7'>
      <Cell N='Width' V='0.984251968503937'/>  <Cell N='Height' V='-0.984251968503937'/>
      <Cell N='BeginX' V='1.527608241738727'/>  …默认端点…
      <Cell N='GlueType' V='2'/>  <Cell N='ObjType' V='2'/>
      <Cell N='BegTrigger' V='1'/>  <Cell N='EndTrigger' V='1'/>
      <Cell N='NoLiveDynamics' V='1'/>  <Cell N='ShapeSplittable' V='1'/>
      <Cell N='LinePattern' V='2'/>  <Cell N='BeginArrow' V='0'/>  <Cell N='EndArrow' V='12'/>
      <Cell N='HelpTopic' V='Vis_PRXY.chm!#60855'/>
      <Section N='Control'>…TextPosition 行，同 5.4.3.4…</Section>
      <Section N='Connection'>…2 行…</Section>
      <Section N='Geometry' IX='0'>…MoveTo/LineTo 线段…</Section>
      <Shapes>…4 枚子形状：箭头、装饰…</Shapes>
    </Shape>
  </Shapes>
</MasterContents>
```

三个页级关系实例的端点与粘附方式见下表，ID=35 依赖、42 接口实现、
55 继承：

| 形状 | 文本 | Begin | End |
| --- | --- | --- | --- |
| 35 依赖 | 依赖 | PAR(PNT(Sheet.1!Connections.X3,…)) 类 1 下边中点 | PAR(PNT(Sheet.19!Connections.X4,…)) 匿名类上边中点 |
| 42 接口实现 | 接口实现 | PAR(PNT(Sheet.1!Connections.X2,…)) 类 1 右边中点 | PAR(PNT(Sheet.27!Connections.X1,…)) 接口左边中点 |
| 55 继承 | 继承 | PAR(PNT(Sheet.60!Connections.X4,…)) 枚举.60 上边中点 | **WALKGLUE(EndTrigger,BegTrigger,WalkPreference)** 到枚举 47 本体 |

Connects 六条记录见素材原文，全部与公式行一致，ToPart=100+行 IX。

### 4.3 字段解释

三枚关系母版的差异集中在视觉语义上：

| 字段 | 依赖 master7 | 继承 master11 | 说明 |
| --- | --- | --- | --- |
| LinePattern | 2 | 1 | 虚线对实线的编码 |
| EndArrow | 12 | 14 | 开放箭头对实心三角 |
| HelpTopic | !#60855 | !#60851 | 官方形状标识 |
| 子形状数 | 4 | 5 | 继承多一枚三角 |
| 文件字节 | 15967 | 15990 | 依赖与接口实现同文件 |

1-D 行为组与 Dynamic connector 同款：GlueType=2、DynFeedback=2、ObjType=2、
NoLiveDynamics=1、ShapeSplittable=1、LockHeight/LockCalcWH=1。区别在
BegTrigger/EndTrigger 取 1 而连接线取 2，语义待核，见第 5 章 k-5。

### 4.4 字段扩展

- 端点粘附两种方式并存且各就各位：PAR 行号粘附落在盒的四个中点，
  WALKGLUE 落目标本体，Connects 里 ToCell='PinX'、ToPart='3'。这与
  basic-3 的发现一致，类图把两套粘附放在同页；
- master7.xml 与 master9.xml 逐字节相同。依赖与接口实现共用内容文件，
  类别身份全在目录条目，解析时不能按文件内容猜测语义；
- 关系线的几何只有两行 MoveTo/LineTo，与 5.5.3.3 的几何精简规律
  一致；标签文本挂在关系上，与 basic-4 的标签机制同款。

### 4.5 补充注解

- 关系子形状在页级实例中的存在形态待核，见第 5 章 k-6。母版内容里箭头
  是嵌套形状，实例侧未观察到对应子形状，视觉可能由母版几何完成；
- EndArrow=12/14 与 LinePattern=2/1 的枚举语义沿用 5.5.3.3 的待核项，
  本素材提供第一组关系专用取值；
- 类图关系用专用母版而不是 Dynamic connector，对本工程的意义：生成
  class 图时要么做专用母版，要么接受用连接线母版表达的观感差异。

## 5. 观察点与待核清单

### 5.1 文件定位

本篇的观察点编号 k-1 起，只收 class 图专属疑点；通用疑点继续用规范版
6.5 的 W 清单。清单来源：本章各节的发现与素材比对。

### 5.2 实例内容

| 编号 | 主题 | 证据 | 状态 |
| --- | --- | --- | --- |
| k-1 | 组连接点行布局 | 类系列四行左/右/下/上中点，与矩形五行不同 | 已确认，引用注意 W-11 |
| k-2 | 组几何局部系 | 实例 Geometry 缓存 Y=1.6181 大于 Height=1.0543 | 待核 |
| k-3 | 成员自动排布 | 成员 Pin 缓存与容器的相对关系 | 待真机核 |
| k-4 | Actions 段语义 | 类盒母版自带右键动作集，本素材首次出现 | 待核 |
| k-5 | BegTrigger/EndTrigger=1 | 关系母版取 1，动态连接线取 2 | 待核 |
| k-6 | 关系子形状的实例形态 | 母版 4-5 枚子形状，页级实例未见 | 待核 |
| k-7 | 依赖与接口实现共文件 | master7.xml 与 master9.xml 逐字节相同 | 已确认 |
| k-8 | LinePattern/EndArrow 枚举 | 2/12、1/14 两组取值 | 待核，入 W 清单 |

### 5.3 字段解释

- k-1 与规范版 W-11 互为印证：Xn=IX(n-1) 命名约定不变，行→位置映射随
  母版走，解析器必须按母版逐枚读连接点行，不能引用矩形的行表；
- k-2 决定 Group 局部坐标换算：LocPin=(0,0) 意味着几何原点在 Pin 上，
  但盒偏移藏在母版几何行里；换算错误会让所有端点错位；
- k-3 决定成员能否正确随容器重排，涉及列表容器的重算行为，真机验证
  项目；
- k-5 和 k-8 是编码语义问题，不影响结构解析，影响渲染观感。

### 5.4 字段扩展

与规范版 W 清单的衔接：W-11 已在规范版登记，即 Xn 约定对自定义行布局的
适用边界。List 容器公式家族、Actions 段、关系子形状语义暂不进入 W
清单，留在本篇备忘，待真机与 SDK 对照后决定是否回填规范版。

### 5.5 补充注解

- 本篇是图型专篇模板：ER、gantt、sequence 将各立一篇，格式与本期相同；
- class 素材自身结论边界：类图体系是 Visio 专业模具与容器机制的产物，
  自产样本的 class 输出以本工程 03-class-1.vsdx 对照后另行成文；
- 后续待办：master3/6/10 的 Actions 段与 User 行名全量展开；关系子形状
  对位；成员排布的真机验证。
