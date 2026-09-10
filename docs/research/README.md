# docs/research —— Visio 产物内部结构研究

> 研究方法：对**真实 Visio 图纸的解压包**逐文件逐层拆解，建立
> "各类型图 → 底层文件 → 内部 XML"的实证认知库。
> 体例规范见 [通用visio结构分析.md](通用visio结构分析.md) 第〇章（五步法）。

## 研究素材（解压包目录）

每个子目录 = 一份真实 Visio 图纸的完整解压内容（原 .vsdx 手工绘制的最简样本），
供各章节引用剖析（正文引用完整路径，如 `docs/research/basic-2/visio/pages/page1.xml`）。

| 目录 | 内容概要 | 教学特征 |
| --- | --- | --- |
| `basic-1/` | 两节点（Rectangle 矩形），其一赋予字体样式 | 基础形状 + 实例局部覆盖（LineWeight/Character.Size）；document.xml 为完整标准版（样式表/字体/文档形状表齐全）；母版区 1 枚；无连接线 |
| `basic-2/` | 两节点 + 一根 Dynamic connector 连接线 | 在 basic-1 基础上增加 **1-D 连接线**完整形态：粘附公式（`PAR(PNT(…Connections.Xn))`）、`BegTrigger/EndTrigger`、`EndArrow`、Control.TextPosition、Geometry 含 Del 占位行、页面 Connects 记录（ToPart 101/103）；母版区 2 枚，Dynamic connector 母版 PageSheet 含 **Layer 图层段**（图层系统入门） |
| `basic-3/` | 常规流程图：5 节点 + 4 根连接线 | 交叉验证素材：粘附编码规律浮现（连接点行 ToPart 从 100 起随行号连续，PinX 走线粘附 `_WALKGLUE` 取 3）；形状 ID 跳号与复制自动命名（Rectangle.4 等）；同款连接线母版 MasterType 0↔541 随保存变（标志位非枚举）；宽版自定义页（约 407×297mm）带 XRulerOrigin 等画布 cell；样式表内部 cell 顺序批次间可重排；页面实例不带 Connection 段（行数据走母版） |
| `basic-4/` | 三矩形 + 两根**带标签文字的连接线**（一颗默认居中、一颗标签被拖动） | 连接线文本证据：实例带 Text 元素，文本格式与块尺寸走母版继承（F=Inh 缓存）；TextPosition 手柄默认居中=走线几何中点，拖动后 X/Y 写新位置；竖向走线（Width 固定 5mm、Height 负）；Width/Height 均可负；Connects 用满 X1/X3/X4（ToPart 100/102/103）；Rectangle.4 复制命名；MasterType=541 第三例（0/541/541）；连接线母版 Shape 带 OriginalID='0' 而矩形母版无；**此样本揭示 Xn 行号约定=行 IX=n−1（修正 5.4.3.3 端口表）** |
| `c4-1/` | 自产样本：C4 系统上下文图（Person/System/System_Ext + 2 条 Rel + 标题，`02-c4-1.mmd`） | **对照样本（非手工绘制）**：页面 IN 制；节点实例自足式写法（全几何/全连接点/全样式 cell）；母版 ID 100–108 九枚整套带；连接线条目与梯形共用一个母版文件（W-1 待核）；无 page1.xml.rels；无 thumbnail；docProps 最小填写 + RecalcDocument；供第六章剖析 |
| `class/` | 手工 UML 类图：2 类 + 1 接口 + 2 枚举（含成员行/分隔符）+ 依赖/接口实现/继承三关系 | **复合形状**素材：容器与成员机制（Group + LISTSHEETREF 公式家族）；类系列连接点四行布局（左/右/下/上中点）；关系专用母版（虚线/实心三角，EndArrow 12/14）；master7 与 master9 逐字节相同；Trigger 元素首见；EllipticalArcTo 圆角行；详见 [class-结构分析.md](class-结构分析.md) |
| `ER/` | 手工 ER 图：3 实体 + 主键/普通属性行 + 分隔线 + 2 关系线 | 数据库语义容器：msvShapeCategories=Database;DbEntity；列表项母版注册 USE("Primary Key Attribute")；主键属性行/普通属性行两枚母版（PrimaryKey=1/0）+ 分隔线；关系线钉在属性行上的实证；详见 [ER-结构分析.md](ER-结构分析.md) |
| `gantt/` | 手工甘特图：框架 + 列 + 两级标尺 + 6 任务行 + 任务条/里程碑/文本条目 + 连接线（65 顶层/113 形状） | **样式表家族**：document.xml 31 枚（24 枚 pr 前缀、两簇继承）；任务条/里程碑大型 Group 母版（8 子形状、1301/1265 个 cell、Property 段）；命名连接行 LeftSide/RightSide.X（W-12）；Field 段首见；Link lines MasterType=1；原名 gannt 已规范；详见 [gantt-结构分析.md](gantt-结构分析.md) |
| `sequence/` | 手工时序图：3 生命线（2 对象 + 1 参与者）+ 6 激活 + 2 片段 + 4 消息 | **时间点连接行**：生命线母版带 100 枚连接行（6.35mm 步长、IF/MODULUS 公式），Xn/ToPart 扩到 X23/122，ToPart=100+IX 规律延伸；激活条 1-D + 100 行；消息四类母版（Return 虚线、Self/Async 箭头 3/4）；MasterType=29 消息族、=1 激活条；详见 [sequence-结构分析.md](sequence-结构分析.md) |
| （待扩充） | 后续将加入更多解压包 | 甘特/时序/带缩略图/带批注等进阶样本 |

素材约定：

- 手工素材（`basic-N/`）：来自 Visio 手工绘制的最简图纸，非本工程产物
  （避免与生成逻辑互相污染）；素材只读、不修改；新增素材时在本表登记并
  注明教学特征；
- 对照素材（`c4-1/` 等）：本工程自产产物解压包，用于对照验证与写入特征
  记录，**不充当通用规律的证据**；登记时注明来源 mermaid 源稿与正文章节；
- 曾用素材：`01-C4-vsdx-内部结构剖析.md`（C4 真实产物剖析）已删除——其内容
  已按五步体例并入规范版第六章（见 6.5.4 处置对照表）；`document.xml`
  独立素材已并入 `basic-1/visio/document.xml`。

## 文档体系

| 文档 | 说明 |
| --- | --- |
| [通用visio结构分析.md](通用visio结构分析.md) | **规范版**（现行）：五步体例，第〇至六章已完成，长期维护（第六章为 C4 自产样本案例；5.6 索引 Group/容器机制） |
| [class-结构分析.md](class-结构分析.md) | **图型专篇**：UML 类图的行为层机制（Group 体系、容器与成员公式、关系形状） |
| [ER-结构分析.md](ER-结构分析.md) | **图型专篇**：数据库语义容器、列表项母版注册、关系线钉属性行 |
| [gantt-结构分析.md](gantt-结构分析.md) | **图型专篇**：pr 样式表家族、任务条大型母版、命名连接行、Field 段 |
| [sequence-结构分析.md](sequence-结构分析.md) | **图型专篇**：时间点连接行（100 行时间格）、激活条、消息族 |

## 待办

- 图型专篇已建成四篇（class/ER/gantt/sequence）；后续：自产样本对照
  （03-class-1、04-er-1、07-gantt-1、15-sequence-1.vsdx）逐篇补写；
- 公式级解剖：gantt 任务条 8 子形状 1300 cell、标尺 Field/AXISFORMAT
  引用链（g-6/g-5）；gantt 专篇 g-1……g-6 与各篇 k/e/s 观察点待核；
- 待核清单：规范版各章补充注解的 ❓ 条目与第六章 W-1……W-12，素材扩充时
  逐项复核，W 清单汇总在 6.5；class 专篇另有 k-1……k-8 观察点；
- 旧版对照存档已随 git 历史保留（原 docs/archived 区已移除），旧体例全文见 git 历史。
