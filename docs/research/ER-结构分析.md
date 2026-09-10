# ER 图 .vsdx 内部结构分析（图型专篇）

> 素材：`docs/research/标准研究模板-手动创建vsdx并解压/ER/`，Visio 手工绘制的 ER 图，非本工程产物。
> 定位：图型专篇第二篇。通用格式知识在
> [通用visio结构分析.md](通用visio结构分析.md) 第〇至五章，容器机制的
> 基础概念见 [class-结构分析.md](class-结构分析.md) 第 2、3 章，本篇只讲
> ER 图自己的差异。体例同规范版第〇章五步法。

## 1. 案例与包全景

### 1.1 文件定位

素材是一张手工 ER 图：三枚实体盒，每枚含主键属性行与普通属性行，另有
两条关系线。实体、属性、关系三层结构，产权概念与 class 的类图同源，
容器机制一致，差别在角色母版。

### 1.2 实例内容

包结构同 basic-N，母版 7 枚，文件名 master1.xml 到 master7.xml：

| ID | NameU | 文件 | 顶层类型 | 特征 |
| --- | --- | --- | --- | --- |
| 2 | Rectangle | master1.xml | Shape | 基础矩形 |
| 4 | Dynamic connector | master2.xml | Shape | 基础连接线 |
| 7 | Entity | master3.xml | **Group** | 实体容器，3 子形状 |
| 8 | Primary Key Attribute | master4.xml | **Group** | 主键属性行，2 子形状 |
| 9 | Primary Key Separator | master5.xml | Shape | 主键与普通属性分隔线 |
| 10 | Attribute | master6.xml | **Group** | 普通属性行，2 子形状 |
| 11 | Relationship | master7.xml | **Group** | 关系线，4 子形状 |

页面 17 个顶层形状，连子形状共 52 个：3 实体 + 3 主键行 + 3 主键分隔 +
6 属性行 + 2 关系线。Connects 四条记录。

### 1.3 字段解释

| 项 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| 实体 Master | 7 | Entity 容器 | 与 class 的类盒同构，User 行不同 |
| 属性行 Master | 8 / 10 | 主键/普通属性 | 角色区分在 User 行，不是外观 |
| 分隔线 Master | 9 | Primary Key Separator | 主键区与普通区的分界 |
| 关系 Master | 11 | Relationship | 关系线专用，非 Dynamic connector |
| MasterType | 2 / 541 | 母版标志 | 实体行取 2，关系取 541 |

### 1.4 字段扩展

与 class 的对照：容器与成员机制完全同构，成员行是 Group 角色换掉。
主键属性行与普通属性行是两个母版，视觉差异靠 User.PrimaryKey 与
子形状排版表达。关系线母版的公式策略与 class 的关系母版一致。

### 1.5 补充注解

- 三枚实体全部带 Trigger 页画布，同 class，页画布 1548 字节，XRulerOrigin
  与 Layer 段齐全；
- document.xml 的样式表与 class 相同 7 枚，ColorEntry 6 条，无自定义样式；
  gantt 才有 pr 家族；
- 素材特征小结：ER 是"class 的容器机制 + 数据库语义行"的组合，没有引入
  新的包结构知识，新知识全在角色母版的 User 行与公式。

## 2. 实体容器

### 2.1 文件定位

实体盒是列表容器，角色名 Entity。它借 class 篇讲过的类盒机制，把成员
类型换成数据库语义：主键属性、普通属性、分隔线三类列表项。

### 2.2 实例内容

实体母版骨架见 `docs/research/标准研究模板-手动创建vsdx并解压/ER/visio/masters/master3.xml`。Container
相关 User 行与 class 同款，有 msvSDContainerResize、msvSDListAlignment、
msvSDListDirection，又多出分类与列表项声明：

```xml
<Section N='User'>
  <Row N='msvStructureType'><Cell N='Value' V='List' U='STR'/></Row>
  <Row N='msvShapeCategories'><Cell N='Value' V='Database;DbEntity' U='STR'/></Row>
  <Row N='msvSDContainerResize'><Cell N='Value' V='2'/></Row>
  <Row N='msvSDListAlignment'><Cell N='Value' V='0'/></Row>
  <Row N='msvSDListDirection'><Cell N='Value' V='2'/></Row>
  <Row N='msvSDListItemMaster1'><Cell N='Value' V='254'
        F='USE("Primary Key Attribute")'/></Row>
  <Row N='msvSDListItemMaster2'><Cell N='Value' V='254'
        F='USE("Primary Key Separator")'/></Row>
  <Row N='msvSDListItemMaster3'><Cell N='Value' V='254'
        F='USE("Attribute")'/></Row>
  <Row N='msvSDListItemMaster4'><Cell N='Value' V='254'
        F='USE("Attribute")'/></Row>
  <Row N='msvSDListRequiredCategories'><Cell N='Value' V='DbListItem' U='STR'/></Row>
</Section>
```

Connection 行四枚，IX0 左边、IX1 右边、IX2 下边、IX3 上边中点，实例行
只带 Y 缓存。Control Row_1 与 class 同款，Prompt 为调整列表大小。

### 2.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| msvShapeCategories | Database;DbEntity | 形状分类 | 数据库家族标识 |
| msvSDListItemMaster1/2 | USE("Primary Key Attribute") | 列表项母版注册 | 容器声明成员母版，254 是引用占位 |
| msvSDContainerResize | 2 | 容器尺寸调整 | 列表容器标准配置 |
| msvSDListDirection | 2 | 列表方向 | 0/2 等取值语义待核 |

实体实例的 User 段只有 WidthMin 覆盖，其余走母版。

### 2.4 字段扩展

- 实体删除或加行时，容器按 msvSDListItemMaster 注册的两枚成员母版生成
  行。成员类型变化只需改注册行，容器形状本身不用改；
- 实体的连接点行与 class 同款四行布局，Xn=IX(n-1) 约定不变，见
  class-结构分析.md 2.4 与规范版 W-11。

### 2.5 补充注解

- USE() 引用母版按 NameU 找，与页面的 Master 属性同语义：列表项母版
  注册是"按名引用"的直接证据；
- 254 是 Visio 内部"未初始化引用"的惯用占位值，见 5.4.3 的字段表。

## 3. 属性行与分隔线

### 3.1 文件定位

属性行是 ER 的"业务行"，角色有三：主键属性、普通属性、分隔线。前两者
是 Group 成员行，后者是单形状。属性行的宽高、背景都走 class 篇讲过的
容器公式链。

### 3.2 实例内容

主键属性母版骨架见 `docs/research/标准研究模板-手动创建vsdx并解压/ER/visio/masters/master4.xml`：

```xml
<Shape ID='5' Type='Group' LineStyle='3' FillStyle='3' TextStyle='3'>
  <Section N='User'>
    <Row N='msvShapeCategories'><Cell N='Value' V='Database;DbAttribute;DbListItem'
          U='STR'/></Row>
    <Row N='AttributeName'><Cell N='Value' V='属性名称' U='STR'
          F='SHAPETEXT(TheText)'/></Row>
    <Row N='PrimaryKey'><Cell N='Value' V='1' U='BOOL'/></Row>
    <Row N='ForeignKey'><Cell N='Value' V='0' U='BOOL'/></Row>
    <Row N='Required'><Cell N='Value' V='0' U='BOOL'/></Row>
    <Row N='ContainerMargin'><Cell N='Value' V='0'
          F='IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)'/></Row>
  </Section>
  <Shapes>…属性文字子形状…</Shapes>
</Shape>
```

普通属性见 master6.xml，与主键属性同构，差异只有 PrimaryKey=0。

### 3.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| AttributeName | SHAPETEXT(TheText) | 属性名=行文本 | 属性名与显示文本联动 |
| PrimaryKey / ForeignKey | BOOL | 主键/外键标记 | 主键行与非主键行的角色区分 |
| Required | BOOL | 必填标记 | 业务语义，渲染待核 |
| 连接点行 | 2 行 | 左右中点 | 关系线可钉在属性行上 |
| 子形状 | 2 枚 | 文字与装饰 | 属性行的组结构 |

分隔线母版见 master5.xml，是 Shape，几何只有一行 LineTo，User 行与
属性行同构，带容器回指公式，LinePattern 取 23，见规范版 5.2 的离散
线型体系。

### 3.4 字段扩展

- 主键行与普通行不是同母版两状态，是两枚母版。模板作者可以给主键行
  加下划线、加粗等外观而不影响普通属性行；
- 主键分隔线把主键区与普通属性区切开，mermaid ER 语法里没有对应
  概念，这是 Visio 数据库模具的视觉惯例。

### 3.5 补充注解

- 本素材的关系线端点有两条钉在属性行上：43 的 End 到 37 号普通属性行、
  48 的 Begin 到 5 号主键属性行，说明属性行的左右中点连接行被关系
  线实际使用。关系钉到行还是钉到实体，是布局选择的差异，见第 5 章
  e-2；
- 属性行连接点行只有左右两行，意味着上下边粘附在属性行上不成立，
  解析器做粘附落位时要按行数容错。

## 4. 关系线

### 4.1 文件定位

ER 关系比 class 关系简单：只有一枚 Relationship 母版，语义差别靠
User 行与子形状，不区分依赖/继承/实现等三族。它是 Group 1-D 形状，
线内自带控制点与子形状。

### 4.2 实例内容

关系母版骨架见 `docs/research/标准研究模板-手动创建vsdx并解压/ER/visio/masters/master7.xml`。关键点：

```xml
<Shape ID='5' Type='Group' LineStyle='7' FillStyle='7' TextStyle='7'>
  <Cell N='LinePattern' V='1'/>
  <Cell N='BeginArrow' V='0'/>  <Cell N='EndArrow' V='0'/>
  <Section N='User'>
    <Row N='msvShapeCategories'><Cell N='Value' V='Database;DbRelationship'
          U='STR'/></Row>
    <Row N='RelationshipName'><Cell N='Value' V='' U='STR'
          F='SHAPETEXT(TheText)'/></Row>
    <Row N='Identifying'><Cell N='Value' V='1'/></Row>
    <Row N='ShowMulti'><Cell N='Value' V='0'/></Row>
    <Row N='DXBegin'><Cell N='Value' V='2.220446049250313E-16' U='DL'
          F='(PinX-LocPinX+Connections.X1)-BeginX'/></Row>
  </Section>
  <Shapes>…4 枚子形状：关系文字、装饰…</Shapes>
</Shape>
```

页面两条关系线 43、48 的端点全部 PAR 行号粘附：43 从实体 1 下边中点
到 37 号属性行左边中点；48 从 5 号主键属性行右边中点到实体 15 左边
中点。

### 4.3 字段解释

| 字段 | 内容 | 含义 | 用途说明 |
| --- | --- | --- | --- |
| LinePattern/EndArrow | 1 / 0 | 实线无箭头 | 关系端点由子形状画，不用箭头 cell |
| msvShapeCategories | DbRelationship | 分类 | 关系家族标识 |
| RelationshipName | SHAPETEXT(TheText) | 关系名 | 与行文本联动 |
| Identifying | 1 | 识别关系 | 区分识别/非识别关系，含 mermaid 语义 |
| ShowMulti | 0 | 显示多重性 | 1 时关系线显示 1-N 标注 |
| DXBegin/DYBegin | 坐标补偿公式 | 端点微调 | 子形状偏移补偿，公式随端点联动 |

### 4.4 字段扩展

- ER 关系线用 Group 而不是纯 Shape：子形状承载关系名与多重性标注，
  线与标注一体移动；这与 class 的关系形状同一个设计思路；
- 关系的 Identifying/ShowMulti 与 mermaid ER 的 |o|、}o{ 等语法语义
  对应关系待核，见第 5 章 e-3。

### 4.5 补充注解

- 本素材关系线无文本，master 默认 RelationshipName 为空，TextPosition
  控制点仍存在，说明控制行是 1-D 形状惯例，与有没有文字无关；
- 关系线的 Connections 行只有两枚，即左右端点，端点以外的粘附不提供。

## 5. 观察点与待核清单

### 5.1 文件定位

ER 专篇观察点编号 e-1 起，只收 ER 专属疑点。

### 5.2 实例内容

| 编号 | 主题 | 证据 | 状态 |
| --- | --- | --- | --- |
| e-1 | 属性行挂接关系线 | 关系 43/48 端点钉在属性行上 | 已确认 |
| e-2 | 属性行只有左右连接行 | master4/6 连接点 2 行 | 已确认 |
| e-3 | Identifying/ShowMulti 语法映射 | 与 mermaid ER 语法对应关系 | 待核 |
| e-4 | msvSDListItemMaster 语义 | USE("…") 注册行 | 待核源码 |
| e-5 | 关系子形状的页级实例 | 母版 4 子形状，页级未展开 | 待核 |

### 5.3 字段解释

- e-2 关系到解析器的粘附容错：属性行只能从左右粘，上下粘附会落空；
- e-3 关系到语义层：Visio 的 Identifying 对应 mermaid ER 的识别关系
  语法，跨工具语义映射要建立对照表；
- e-5 与 class 的 k-6 同款：Group 子形状在页级的实例化规则没搞清楚
  之前，渲染自定义形状要按母版内容兜底。

### 5.4 字段扩展

本篇无新增待核项回填规范版 W 清单；e-1 到 e-5 都留在本篇。

### 5.5 补充注解

- 素材结论边界：ER 的容器机制全部沿用 class 篇，本篇只记录差异；
- 自产 ER 样本以本工程 04-er-1.vsdx 为对照，另行成文。
