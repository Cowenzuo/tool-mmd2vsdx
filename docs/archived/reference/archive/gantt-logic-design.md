# 甘特图组件复刻 — 逻辑设计（终版）

> 目标：以 Visio 官方 Gantt 模板（`docs/过时归档/reference/07-gantt-1-test.vsdx`）为唯一基准，
> 生成器产出的 `.vsdx` 在组件结构上与官方逐项一致。仅描述逻辑不涉代码。

---

## 1. 组件总览（官方 85 顶层形状 = 73 结构形状 + 12 伪影）

| ID | 母版 NameU | 实例数(官方样本) | 职责 |
|----|-----------|-----------------|------|
| 100 | Gantt Chart frame | 1 | 图表标尺定义 + 引擎锚点 |
| 101 | Column | 6 | ID/任务名称/开始/完成/工期/刻度区（链式） |
| 102 | Row | 8 | 每任务一行 |
| 103 | Task bar | 7 | 任务条（Group+8子形状+Property）；**里程碑行无任务条** |
| 104 | Milestone | 1 | 里程碑（Group+8子形状，Width=0） |
| 105 | Link lines | 1 | 连接线（1-D，BeginX/Y+EndX/Y=PAR 连接点） |
| 106/107/108 | Title/Legend/DynConn | 0 | 不实例化（Title 待决策，见 §3.9） |
| 112 | Sec scale cell | 1(样本) | 次刻度；**跨月时 = 覆盖月数** |
| 113 | Pri scale cell | 14 | 主刻度（每天一个） |
| 114 | Non working time | 2 | 周末块 |
| 115 | Text Entry | 32实+12空 | 每行 4 实（名称/开始/完成/工期）+ 伪影空 |

> 数量：Row=N；Task bar=N−里程碑数；Milestone=里程碑数；Text Entry=4×N 实。
> 验算：1+6+8+7+1+1+1+14+2+32=73 ✓；85=73+12 ✓。

## 2. 数据流

```
GanttChart（IR）                    GanttRenderer::render()
  startSerial/endSerial ► totalDays；跨月计算次刻度数量
  tasks[]（name/start/duration/milestone/section）
     ├─► 每任务：Row + (milestone ? Milestone : Task bar+8子形状) + 4×TextEntry
     └─► 里程碑行：无 Task bar
  dateFormat ─────────► 刻度文本格式（经母版 FORMAT 公式，非直接写文本）
                        └─► 全部写入 page.shapesNode（任务条/里程碑含嵌套子形状）
GanttChart ───────────► GanttRenderer::addPageEngineConfig()
                        └─► 写 pages.xml PageSheet（User/Property/Layer/Actions/Trigger）
```

布局常量（英寸）：kScalar=0.2492、kIdColW=0.2461、kNameColW=1.9685、kFieldColW=0.9843、
kHeaderH=0.4921、kRowH=0.2953、kMargin=1.0721、kFrameTopY=5.5435。

## 3. 形状逻辑

### 3.1 框架（M=100，1 个）
- 顶层 Cell：PinX=xLeft、PinY=yTop、Width、Height、**LocPinY(F=Inh)**、**LayerMember=0**
- Width F=`末列右缘−ID列左缘`（前向引用，列创建后补）
- Height F=`首行PinY+User.HeaderHeight−末行PinY+末行Height`（前向引用，行创建后补）
- User 段（**无 HeaderHeight 行**）：StartDate/EndDate、ScaleUnits(F=`EndDate-StartDate`)、
  **Scalar(F=`刻度列宽/ScaleUnits`)**、WorkingDays="0;1;1;1;1;1;0;"、DayStartTime=8、
  DayEndTime=16、PriScaleUnitsType=3、SecScaleUnitsType=5、WDLookup="0;0;0;0;0;2;1"、
  WHLookup="8;7;…;9;"、WTScalar(**F=Inh**，V=0.3333)、GUID（GCVisioGUID=图表GUID/
  GCModelGUID/GCChartGUID/IDColumnGUID/LastColGUID/LastRowGUID[行创建后补]）
- ⚠️ Scalar 在 **User 段既有行**更新；Width/Height 是顶层 Cell。

### 3.2 列（M=101，6 个，链式）
- 列 ID=2~7：2=ID、3=名称、4=开始、5=完成、6=工期、7=刻度区
- PinX F=`前一列!PinX−LocPinX+Width`；首列=框架 PinX
- 每列 User：**HeaderHeight(F=`Sheet.<框架>!User.HeaderHeight`)**、GCFieldType、
  GUID（GCPrevColGUID 链，首列→图表GUID）；ID 列+IsID=1；刻度列+GCShapeType=40
- 类型码：ID=55、名称=61、开始=83、完成=34、工期=27、刻度区=10001
- 刻度列：空 `<Text/>`；其余列文本：ID/任务名称/开始时间/完成/持续时间
- ✅ **列实例有 HeaderHeight（F 引用框架）——勿删**；刻度列实例带 **Actions 段**
  （Row_3/Row_4）

### 3.3 次刻度（M=112，覆盖月数 1 个/月）
- 每个自然月生成一个；月起点可早于图起点（Offset 负），靠 LR/RR（F=Inh）裁剪
- 定位 F（实例物理携带）：
  - PinX=`GUARD(MAX(User.ScaledStartPos+LocPinX,User.ScaleStart))`
  - PinY=`GUARD(Sheet.<刻度列>!PinY)`；Height=`Sheet.<刻度列>!User.HeaderHeight/2`
  - Width=`User.ScaledDuration-(User.LeftWidthReduction+User.RightWidthReduction)`
- User：ScaledStartPos(F=`Offset×Scalar+ScaleStart`)/**ScaledDuration(F=`Duration×Scalar`)**/
  StartDate/Duration(当月天数)/Offset(月起点−图起点)/ScaleStart/ScaleEnd/TextWidth/
  LeftWidthReduction/RightWidthReduction/PreText(季度公式) + GUID(GCVisioGUID/GCColGUID/GCChartGUID)

### 3.4 主刻度（M=113，每天一个）
- PinX=刻度区左缘+i×kScalar；**实例无 Text 元素**（文本由母版 Field+FORMAT 生成）
- 定位 F：PinX=`GUARD(MAX(...))`；PinY=`GUARD(Sheet.<刻度列>!PinY-User.HeaderHeight/2)`；
  Width=`User.ScaledDuration-(LR+RR)`；Height=`Sheet.<刻度列>!User.HeaderHeight/2`
- User：ScaledStartPos/ScaledDuration/StartDate/Duration=1/ScaleStart/ScaleEnd/
  **首例无 Offset 行**、其余 Offset=i；TextWidth(F=Inh)/PreText + GUID

### 3.5 非工作时间（M=114，周末块）
- 判定 `(tm_wday+6)%7 ∈ {5,6}`；PinX=周六起点；Width F=`ScaledDuration-(LR+RR)`
  （母版 LR/RR 自动裁剪，末日周末不越界）；相邻周末相隔 5 工作日不重叠
- 定位 F：PinX=`GUARD(MAX(...))`；PinY=`GUARD(Sheet.<刻度列>!PinY-User.HeaderHeight)`；
  Height=`Sheet.<刻度列>!Height-Sheet.<刻度列>!User.HeaderHeight`
- User：ScaledStartPos/StartDate/Duration=2/Offset + GUID

### 3.6 行（M=102，N 个）
- 首行 PinY=`框架!PinY−框架!User.HeaderHeight`；后续=`前行!PinY−前行!Height`
- Width=框架 Width、Height=行高
- User：HeaderWidth(指ID列宽)/HeaderPinX + GUID（GCPrevRowGUID 链，首行→图表GUID）
- 文本：行号（首行文本为空，官方如此）

### 3.7 任务条（M=103，N−里程碑数，Group）
- PinY=`Sheet.<行>!PinY`；PinX=`MIN(MAX(ScaledStartPos+LocPinX,ScaleStart),ScaleEnd)`
- 顶层 Cell：Width F=`User.ScaledDuration-(LR+RR)`、**Comment V=任务名 F=Inh**、
  **Connection 段（LeftSide/RightSide，F=Inh）**（Link 的 PAR 依赖此段）
- User 实例行：ScaledStartPos(F=`MAX(Offset×Scalar+ScaleStart,Dependency)`)/ScaledDuration/
  StartDate/Duration/ScaleStart/ScaleEnd/Offset/ScaledEndPos/StartSymType/WDOffset/
  WHOffset/LastStartFromMove/WTNormalizedStart + **DependencyDuration(F=Inh，V=-1.5E300)**
  + GUID（GCVisioGUID/GCModelGUID/GCChartGUID/GCRowGUID/ParentModelGUID）
- **IsSummary/Dependency 不在实例**（母版固有：`IsSummary=IF(User.DependencyEnd>-1.5E300,1,0)`、
  `Dependency=-1.5E300`）；仅**有依赖的任务**显式覆盖 Dependency
  （=`MAX(<源>!User.ScaledEndPos+<连接线>!User.ScaledDuration)`）+ TaskDuration
- Property：Name/Start/End/Duration(F=FORMAT)/ActualStart/ActualEnd/UserDefTime/TaskID
  （User.Duration=日历天 vs Prop.Duration=工作日显示）
- Control：宽度拖拽把手
- **8 子形状（MS=10/5/9/6/7/11/12/13，用 `MasterShape='N'` 属性）**：
  - 覆盖：MS=6(GeometryID/NormalGeometryID/SummaryGeometryID)、
    MS=7(TimeOffset+PinX)、MS=11(TextLeft/TextRight+PinX)、
    MS=12(TextLeft/TextRight)、MS=13(TextLeft/TextRight+PinX)
  - MS=10/9：仅 LayerMember=0；MS=5：PinX/Width/LocPinX + LayerMember=0

### 3.8 Text Entry（M=115，4×N 实）
- 每任务 4 实：名称(列3)/开始(列4)/完成(列5)/工期(列6)
- PinX=`Sheet.<列>!PinX`、PinY=`Sheet.<行>!PinY`、Width=`Sheet.<列>!Width`
- 单元格：LayerMember=0；**LockTextEdit 仅开始/完成/工期 3 列有**
  （F=`IF(<任务条>!User.IsSummary=1,1,0)`），**名称列 TE 无**
- User：Field(F=引用任务条 Prop)/TextFormat/TextType + GUID（GCVisioGUID/GCRowGUID/
  GCColGUID/GCChartGUID）；Field Section（显示值 F=Inh）
- **伪影 12 个**：判据=**无 Field 段 + 无 LockTextEdit**（有 LayerMember=0 和 4 个 GUID
  行）；分布=视觉行 7/6/3 各 4 个（视觉序=PinY 降序）。**不纳入复刻**。

### 3.9 Title（M=106）
- 官方 0 实例；**不生成**（已决策移除）。

### 3.10 Milestone（M=104，里程碑数，Group）
- PinY=`Sheet.<行>!PinY`；PinX 同任务条；**Width=0**（母版 TimebarType 判 Width=0→2）
- User 实例行：ScaledStartPos/ScaledDuration(F=`IF(IsSummary=1,DependencyDuration,
  Duration×Scalar)`)/StartDate/ScaleStart/ScaleEnd/Offset/ScaledEndPos/WDOffset/WHOffset/
  LastStartFromMove/WTNormalizedStart + **DependencyDuration(F=Inh，V=-1.5E300)**
  + GUID（GCVisioGUID/GCModelGUID/GCChartGUID/GCRowGUID/ParentModelGUID；**无 GCColGUID**）
- **无 Duration/IsSummary/Dependency 实例行**（母版值）；仅依赖时覆盖 Dependency
- Property：同任务条（Name/Start/End/Duration/…）
- **8 子形状**；覆盖仅 **MS=11/12/13 的 TextLeft/TextRight**；全部 LayerMember=0
- 触发：**IR `GanttTask.milestone`**（glue 判定=0时长且有日期且非after依赖）；
  勿用"duration=0"兜底（会误判 after 依赖任务）

### 3.11 Link lines（M=105，连接线数）
- 顶层 Cell 全 F=Inh（PinX/PinY/Width/Height/LocPinX/LocPinY/TxtPinX/TxtPinY）
- BeginX/BeginY=`PAR(PNT(Sheet.<源>!Connections.RightSide.X,.Y))`；
  EndX/EndY=`PAR(PNT(Sheet.<目标>!Connections.LeftSide.X,.Y))`
- 单元格：LayerMember=0
- User：EndPointDiff/CrossWidth(F=`EndPointDiff-TotalOffset`)/HideLine/GCVisioGUID/
  GCModelGUID/GCChartGUID/ScaledDuration/LagTime
- **Connects 段**：2 条 Connect，**EndX 在前、BeginX 在后**，含 FromPart/ToPart
  （EndX:12→LeftSide:100、BeginX:9→RightSide:101）
- 依赖链路：源→Link(BeginX/EndX PAR)→目标 Dependency 覆盖
- 触发：mermaid `after 前置` 依赖语法 → glue `dependsOn` → IR `GanttTask.dependsOn`

## 4. GUID 引用体系

| GUID | 归属 | 作用 |
|------|------|------|
| GCChartGUID | 所有 | 同图标识 |
| GCVisioGUID | 每个 | 形状身份（=UniqueID，85 全对） |
| GCColGUID | 任务条/里程碑/TextEntry/刻度 | 指向所属刻度列（**里程碑无**） |
| GCRowGUID | 任务条/里程碑/TextEntry | 指向所属行 |
| GCModelGUID | 框架/任务条/里程碑/Link | 模型身份 |
| ParentModelGUID | 任务条/里程碑 | 挂框架模型树 |
| GCPrevColGUID | 列 | 列链（首列→图表GUID） |
| GCPrevRowGUID | 行 | 行链（首行→图表GUID） |
| IDColumnGUID/LastColGUID/LastRowGUID | 框架 | 引擎锚点 |

约束：GCVisioGUID==UniqueID（同 seed）；引用链目标存在。

## 5. 页面层引擎配置

- User 段 11 行：TaskTextLeft/Right/Inner、MilestoneShape、NormalTaskStartSym(8)/
  NormalTaskEndSym(7)/SummaryTaskStart/EndSym(1)、PropertyFilter(1)、
  ConnectorType(0,BOOL)、SchemeName(Gantt)
  - **TaskTextLeft/Right/Inner、NormalTaskEndSym 带 F=`LOOKUP(Prop.xxx,Prop.xxx.Format)`**
    及 Prompt/RefBy 单元格
- Property 段 13 行：SymbolHeight/NormalHeight/SummaryHeight/NormalPercentHeight/
  SummaryPercentHeight/TaskLeftText/Right/Inner/MilestoneShape/NormalTaskStartSym/
  NormalTaskEndSym/SummaryTaskStart/EndSym；每行带 Invisible=1/LangID=zh-CN/
  Calendar=0/Verify/DataLinked/Type/Label/Format
- Layer 段：甘特图层（Name/NameUniv=Gantt/Color=255/…）
- Actions 段：Row_1 "S 型连接线(&N)"（SETF 切换 ConnectorType）、Row_2 分隔符
- Trigger：RecalcNowAndRand

## 6. 公式链

```
框架 Scalar = 刻度列宽 / ScaleUnits                       ← User 段既有行更新
消费形状 ScaleStart = 刻度列!PinX − 刻度列!LocPinX          ← 在消费形状(User)上
消费形状 ScaleEnd   = ScaleStart + 刻度列!Width
主刻度 ScaledStartPos = Offset×Scalar + ScaleStart
任务条 ScaledStartPos = MAX(Offset×Scalar+ScaleStart, Dependency)
任务条 PinX = MIN(MAX(ScaledStartPos+LocPinX, ScaleStart), ScaleEnd)
任务条 PinY = Sheet.<行>!PinY
```

## 7. 边界条件

- totalDays=0/1：`max(1.0,…)` 钳制；nTasks=0：`empty()` 早退（空图是否生成框架待确认）
- 里程碑：IR.milestone 判据；Width=0
- 跨月：次刻度=覆盖月数，Offset 可负
- 首例/实例差异放行清单：
  - 首主刻度无 Offset；首行文本为空；框架无 HeaderHeight 实例行
  - **列实例有 HeaderHeight(F=框架)**——正常行
  - **名称列 TE 无 LockTextEdit**；里程碑实例无 Duration/IsSummary/Dependency
  - **DependencyDuration 是实例物理行（F=Inh）**，任务条/里程碑都有
- 末日周末：母版 LR/RR 自动裁剪

## 8. 实施状态

原 v4 待办已全部落地（见 `gantt-todo.md` 设计结论与遗留差异表）。
遗留 4 项（次要）：框架 Height 顶层公式、PageSheet Property 次要单元格、
单位体系（有意差异）、document.xml/windows.xml 次要项。

## 9. 验收标准（v4）

- 母版 ID 与官方一致（含 109-111 空洞）
- 73 结构形状类型/数量与官方一致（排除 12 伪影 TE）
- 各形状 User 行名+F/V 与官方一致（放行清单=§7）
- 公式引用链（Scalar/Width/Height 前向引用 + ScaledStartPos→PinX）自洽
- GUID 唯一且引用正确（GCVisioGUID=UniqueID、GCPrev* 链、引擎锚点、ParentModelGUID）
- PageSheet User/Property 段逐值一致（含 LOOKUP 公式）
- 里程碑/Link 按需生成（IR 已支持 milestone / dependsOn）
