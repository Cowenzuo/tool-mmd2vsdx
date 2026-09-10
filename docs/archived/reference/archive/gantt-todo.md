# 甘特图组件复刻 —— 设计结论（2026-08-07）

> 目标：以 Visio 官方 Gantt 模板（`docs/过时归档/reference/07-gantt-1-test.vsdx`）为基准，
> 生成产物在组件结构/公式链/数据语义上与官方一致。
> 验证：构建 + ctest 8/8 + 产物 XML 对比（`scripts/compare_gantt.py`）+ Visio 实测。
> 设计细节：见 `gantt-logic-design.md`。

## 最终设计状态

### 组件结构
- 框架(M=100)×1、列(M=101)×6、行(M=102)×N、任务条(M=103)×(N−里程碑数)、
  里程碑(M=104)、链接线(M=105)、次刻度(M=112)×覆盖月数、主刻度(M=113)×天数、
  非工作时间(M=114)×周末数、Text Entry(M=115)×4N
- Master ID 空洞：108 后跳 112-115（skipHole +3）
- 所有顶层形状 UniqueID = User.GCVisioGUID；GUID 链（GCPrevCol/Row、GCRow/Col、引擎锚点）
- 固定列（开始/完成/工期）Width 与 LocPinX 继承母版（无本地 Cell）：GC 据此识别固定列，
  显式写本地值会让 GC 把固定列当可调整列
- Title 不生成（官方无实例）

### 关键机制（防回退约束）
- 字符串单元格必须 `U='STR'`：无单位时 Visio 把 V 当数字解析，中文字符串 → 0.00
- `document.xml` 含 EventList 文档打开事件（Target=GC /CMD=2）：GC 插件接管列拖动重排
- 列 Geometry 段（IX=0/1）是 GC 识别/管理列的依据，缺则列行为异常
- 主刻度实例无 Text 元素：文本由 GC 按 Field FORMAT 公式动态渲染
- after 依赖任务推算真实开始日期=依赖任务结束，否则 Prop.Start=0 显示 1899-12-30
- 框架 Scalar 公式在 User 段既有行更新（setUserRowFormula），不能用 setNumericCell
- 框架 Width/Height 顶层前向引用公式（列/行创建后补）
- 首例差异：主刻度首例无 Offset；首行文本为空；名称列 TE 无 LockTextEdit；
  里程碑无 Duration/IsSummary/Dependency 实例行

### 数据语义
- Prop.UserDefTime = 图起点+8h；Prop.End：1 天=Start，多天=Start+日历天数
- Prop.Duration 用 `FORMAT(…,"#.####")&"天"`；User.Duration=日历天
- 天数算法：glue `endSerial = floor(maxE) + 2`

## 遗留差异（有意保留，均为次要）

1. 框架 Height 顶层无公式（静态 chartH；官方为前向引用公式，仅引擎按行数重算时依赖）
2. PageSheet Property 次要单元格未补（Prompt/Invisible/LangID 等）
3. 单位体系：IN 显式静态值 vs 官方 MM+继承（逻辑等价）
4. document.xml FaceNames / windows.xml 视图参数

## 验证

1. 构建：`cmake --build build --config Debug`；测试：`ctest -C Debug --test-dir build`（8/8）
2. 产物：`resources/testio/output/07-gantt-1.vsdx`（生成）/ `docs/过时归档/reference/07-gantt-1-test.vsdx`（官方参照）
3. 对比工具：`scripts/compare_gantt.py <gen_page1.xml> <ref_page1.xml>`
4. 输入样本：`resources/testio/input/07-gantt-1.mmd`（7 任务+1 里程碑，含 after 依赖）
