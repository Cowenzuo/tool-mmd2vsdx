# 连接线 OLE 嵌入修复记录（2026-08-23）

> 主题：mmd2vsdx 生成流程图连接线（Dynamic connector）在 Word OLE 嵌入双击激活
> （快速路径，初始不重算）下显示异常，逐轮修复至"直接打开 / 嵌入双击 / 拖动节点重算"
> 三条路径一致的完整记录。
> 基线：`5bc7a9b`；最终提交：`152e8bd`。

---

## 1. 背景与关键结论

- 目标：工具生成的 `.vsdx` 嵌入 Word 后双击激活（OLE 快速路径）即显示正确，
  与"直接打开 / 移动节点触发重算后"一致。
- 关键事实（用户实测确立）：
  - OLE 快速路径**直接显示文件存储的几何顶点与 V 缓存值**，不做 1-D 旋转、
    不重路由、不重算公式。
  - 直接打开 Visio 会**完整重算**（触发公式链、重路由），此时文件里的公式链
    必须自洽可算，否则显示异常。
- 推论：
  - 几何必须**烘焙为页面差正交折线**（每段水平/竖直），快速路径原样显示。
  - 所有 V 缓存值必须与公式、实际尺寸自洽（生成期即输出"Visio 保存形态"）。
  - 连接线必须保留完整 **1-D 身份 cell**（页内自包含），否则"端点 → 1-D 变换
    → 文字位置"计算链脆弱，文字位置异常是其症状。

---

## 2. 今日 Git 提交总结（5bc7a9b..152e8bd）

| 提交 | 主题 |
|---|---|
| 0d46368 | 时序图生命线默认 Object lifeline（仅显式 actor 声明映射 Actor） |
| 2d71c5e | 母版实例固化（公式求值器 + applyInstanceOverrides）；**连接线删除 13 个 1-D cell**（本次脆弱根源） |
| 3193a66 | 连接线 Geometry 固化直角折线 |
| f7e29f9 | 框补 Connection Section（4 连接点） |
| f2ece8e | Connection Section X/Y 强制 U=IN |
| 24efb58 | 折线末段方向 = 垂直于 End 粘边 |
| ec7b58b | 折线首段方向改回整体走向启发式 |
| 19af0d3 | 文字 TxtPinX=|Width|/2（试错） |
| b2e67bc | 文字 TxtPinX=hypot/2（试错） |
| 6809230 | 折线顶点投影到 1-D 本地坐标（toLocal，试错） |
| 9771074 | 文字恢复 08-07 基线实现 |
| 113dd61 | 文字中心落线：TxtPin = 目标点 − TxtLocPin，折线目标 = 中段中点 |
| 59dd8d0 | 折线 Connects 粘连接点（ToPart=100..103，试错） |
| e5f2b94 | 折线几何改正交页面差 + Height 真实值 + Connects PinY/PinX（**直线被连带改坏**） |
| 1dc914d | 直线 Connects 恢复 PinX/PinX（折线保持 PinY/PinX）；文字误改回本地坐标 |
| 8c16b27 | 直线文字 target 恢复页面差中点（TxtPinY=−0.1） |
| b39ada3 | 所有形状补 EventXFMod（修 _XFTRIGGER #REF! 链） |
| 152e8bd | **连接线恢复 13 个 1-D 身份 cell（最终修复）** |

### 合并后净改动（文件 × 函数）

| 文件 | 函数 | 净改动 |
|---|---|---|
| mermaid-snapshot/snapshot.mjs | extractSequence | actor-man 图标检测，节点加 `lifelineKind` |
| src/core/ir.hpp | struct Node | 新增 `lifelineKind` |
| src/mmdparse/jsonparser.cpp | jsonToDiagram | 解析 `lifelineKind` |
| src/tests/testjson.cpp | TEST_CASE ×2 | lifelineKind 断言 |
| src/vsdxdoc/masters/masterlibrary.cpp | 新增 EvalCtx/FormulaParser/cellValueIn/cellValueInches/evalFormula/inferFormula/rewriteCellV/rewriteSectionRows/stripNs/ensureEventXFMod | 母版公式求值器（Width/Height/User./Controls./Scratch.X1/Geometry1.X1、MIN/MAX/IF/AND/OR/BOUND）；去 ns；实例补 EventXFMod V=0 |
| src/vsdxdoc/masters/masterlibrary.cpp | applyFromMasterShape | 克隆母版 TxtPin 六件套 + User/Control/Scratch/Geometry/Connection，V 按实例尺寸求值 |
| src/vsdxdoc/masters/masterlibrary.cpp | applyInstanceOverrides | 实例固化入口 + ensureEventXFMod |
| src/vsdxdoc/masters/masterlibrary.hpp | MasterLibrary | 声明 applyInstanceOverrides |
| src/vsdxdoc/render/connectorbinder.cpp/.hpp | setConnect | 新增 toCell/toPart 参数（默认 PinX/3） |
| src/vsdxdoc/render/renderer.cpp | FlowchartRenderer::renderShape | 母版实例调 applyInstanceOverrides |
| src/vsdxdoc/render/renderer.cpp | Renderer::renderConnector | 见下节（连接线最终形态） |
| src/vsdxdoc/render/sequencerenderer.cpp | addLifeline | 按 lifelineKind 选 Actor/Object lifeline 母版 |

---

## 3. 脆弱根源定位

`2d71c5e` 的立论是"OLE 快速路径不重算、不走完整母版继承链，要把计算结果全部烘焙到页内"——
它对**框**正是这么做的（applyInstanceOverrides 克隆全套）。

但对**连接线**，同一个提交做了相反操作：删除页内 1-D cell、指望母版继承；
而 `renderConnector` 从不调用 applyInstanceOverrides。连接线成为全图唯一
"既不烘焙、又无页内 1-D cell"的形状，快速路径下失去 1-D 身份。

| 被删 cell | 1-D 作用 | 后果 |
|---|---|---|
| ObjType=2 | 对象分类（1-D 连接线） | 实例失去 1-D 身份 |
| LockCalcWH=1 | 保护 1-D Width/Height 不被重算改写 | Height 暴露（我们恰好对 Height 有两套取值） |
| LockHeight=1 | 保护 Height | 同上 |
| Angle | 实例角度（原 GUARD(0DA)） | 回退母版缓存 V=0 |
| GlueType=2 | 1-D 走线粘附 | 粘附语义退化 |
| FlipX/FlipY/ResizeMode | 变换基准 | 回退母版默认 |
| DynFeedback/NoLiveDynamics/ShapeSplittable/NoAlignBox/TxtAngle | 1-D 编辑行为 | 编辑体验退化 |

症状对应：线形正常（烘焙几何不走 1-D 计算链）；文字错（文字块位置走
"端点 → Pin/Angle/Width/Height → 文字块变换"链）——**文字是连接线的体温计**。

第二道裂纹：BegTrigger/EndTrigger 的 `_XFTRIGGER(Sheet.N!EventXFMod)` 引用
不存在的 EventXFMod → 重算 #REF! → _WALKGLUE 算不出端点（b39ada3 已修）。

---

## 4. 修改方案（152e8bd 前定稿）

- 目标：连接线恢复**页内自包含的 1-D 身份**，堵住端点获取失败 → 计算链异常。
- 唯一修改点：`src/vsdxdoc/render/renderer.cpp` 的 `renderConnector`。
- 恢复清单（按 08-07 基线原样写回）：

| Cell | 值/公式 | 与现逻辑相容性 |
|---|---|---|
| Angle | V=0, GUARD(0DA) | V=0 与烘焙页面差正交几何自洽；直接打开重算会重路由，不受影响 |
| FlipX/FlipY | V=0, GUARD(FALSE) | 变换基准 |
| ResizeMode | V=0 | 基准 |
| ObjType | V=2 | 1-D 身份（核心） |
| GlueType | V=2 | 走线粘附 |
| LockHeight/LockCalcWH | V=1 | 只挡非公式改写，GUARD 公式照常成立 |
| DynFeedback/NoLiveDynamics/ShapeSplittable/NoAlignBox | V=2/1/1/1 | 编辑行为 |
| TxtAngle | V=0 | 文本不旋转 |

- 明确不做：不接 applyInstanceOverrides；不动 Geometry/Connects/Height 分流/
  TxtPin 值/EventXFMod；不碰 masterlibrary.cpp。

---

## 5. 修改内容（152e8bd 实际落地）

`src/vsdxdoc/render/renderer.cpp`，`Renderer::renderConnector`，+18 行，三个插入点：

1. `LocPinX` 之后：Angle/FlipX/FlipY/ResizeMode（变换基准）。
2. `EndTrigger` 之后：GlueType/DynFeedback/ObjType/NoLiveDynamics/ShapeSplittable/
   LockHeight/LockCalcWH/NoAlignBox（1-D 粘附/保护/编辑行为）。
3. `TxtLocPinY` 之后：TxtAngle=0。

验证结果：
- ctest 8/8。
- sdd-001 直线 shape8 含全部 13 cell 且值正确；Height=GUARD(0.2DL)/LocPinY=0.1/
  TxtPinY=−0.1/Connects PinX/PinX 与上一版逐一比对不变（无回归）。
- samples 与用户工程 256 个全部重转。

---

## 6. 连接线最终形态（合并后，供后续对照）

- 变换/身份：PinX/PinY=GUARD((Begin+End)/2)、Width=GUARD(EndX-BeginX)、
  Angle=GUARD(0DA)、FlipX/FlipY=GUARD(FALSE)、ResizeMode=0、ObjType=2、GlueType=2。
- 尺寸保护：LockHeight=1、LockCalcWH=1、NoAlignBox=1。
- 端点：BeginX/BeginY/EndX/EndY=_WALKGLUE + BegTrigger/EndTrigger=_XFTRIGGER
  （依赖目标 EventXFMod，所有形状已补 V=0）。
- Height/LocPinY 分流：同高线 Height=GUARD(0.2DL)/LocPinY=0.1；
  折线 Height=GUARD(EndY-BeginY)/LocPinY=height/2。
- 路由：ShapeRouteStyle=1（mindmap=2）、ConLineRouteExt=1、ConFixedCode=6。
- 几何：同高线 MoveTo(0,0.1)→LineTo(W,0.1)；折线 = 页面差正交四组合
  （横-竖-横 / 横-竖 / 竖-横 / 竖-横-竖，末段方向=End 进入 box 边方向，
  剔除零长顶点，无 Del 行）。
- 文字：target = 直线页面差线中点 / 折线中段中点；TxtPin = target − TxtLocPin；
  Control TextPosition X/Y/XDyn/YDyn 同步 target 且无公式。
- Connects：直线/ER Begin/End ToCell=PinX、ToPart=3；折线 Begin ToCell=PinY、
  End ToCell=PinX、ToPart=3。
- 其他：EventXFMod=0、TxtAngle=0、箭头尺寸 THEMEVAL 公式。

---

## 7. 遗留风险与待验证

1. **直线文字位置**：EventXFMod（b39ada3）+ 1-D 身份恢复（152e8bd）后，
   需用户最终确认（此前 TxtPinY=0 与 −0.1 两版实测均偏）。
2. **FormulaParser 子集外公式**：其他图型（甘特/饼图/时间轴/状态等）母版公式
   若超出求值器支持（MIN/MAX/IF/AND/OR/BOUND 与四则运算、有限引用集），
   克隆 cell 的 V 可能是母版默认值，OLE 快速路径下有显示风险——未逐一验证。
3. **折线负 Height**：GUARD(EndY-BeginY) 在向下折线为负值，Visio 重算语义下
   的合法性未证实（快速路径用缓存值未暴露）。
4. **Del 行删除**：折线多固定 LineTo 后，Visio 切换线型（直线/曲线/直角）UI
   可能失效（原注释明确警告）。
5. **建议**：补一条关键 cell 值 XML 快照自动化断言（直线/折线各一），防止
   折线/直线修复互相踩踏（今日 e5f2b94→1dc914d 即为踩踏实例）。

---

## 8. Word 自动嵌入二次改写定位与母版级修复

后续复测发现：原始 `.vsdx` 直接打开正常，但经 Word 自动脚本嵌入后，从 Word
内双击激活 Visio 仍会出现连接线异常。重新按“原始包 / Word 内嵌 payload / 激活
路径”分层排查后，确认问题不在原始 `.vsdx` 是否写入了连接线实例 cell，而在
Word/Visio 嵌入阶段会对内嵌 `.vsdx` 做一次二次保存/规范化。

实测 `InlineShapes.AddOLEObject(FileName=..., LinkToFile=false)` 生成的 `.docx`
中，`word/embeddings/Microsoft_Visio_Drawing.vsdx` 不是源 `.vsdx` 的字节复制：
`visio/pages/page1.xml`、`visio/document.xml`、`visio/masters/masters.xml` 与
master 文件均被改写。改写后，页面连接线实例上的以下 1-D 身份/保护 cell 会被
清理掉：`Angle`、`FlipX`、`FlipY`、`ResizeMode`、`ObjType`、`GlueType`、
`LockHeight`、`LockCalcWH`、`DynFeedback`、`NoLiveDynamics`、`ShapeSplittable`、
`NoAlignBox`、`TxtAngle`。因此，152e8bd 只把这些 cell 写在实例上，仍不足以
抵抗 Word 嵌入保存路径。

进一步对比发现，官方 Dynamic connector 母版的根 Shape 中 `ObjType` 原为 `1`，
且缺少 `GlueType`、`LockHeight` 等 1-D 粘附/保护 cell。也就是说，一旦 Word
嵌入过程清理实例覆盖，连接线会退回到不完整的母版继承状态。

最终改进点：`src/vsdxdoc/masters/masterlibrary.cpp` 的 `normalizeConnectorMaster()`
在把 Dynamic connector 母版规范化为 `Type="Shape"`、删除子形状后，同时把上述
13 个 1-D 身份/保护/编辑 cell 固化到母版根 Shape。这样 Word 嵌入阶段即使继续
清理页面实例局部 cell，连接线仍能从母版继承正确身份。

验证：

- MSBuild Debug|x64 构建通过，0 警告、0 错误。
- `testmasters`、`testtranslate`、`testroundtrip`、`teste2e` 全部通过。
- 重新生成 `05-flowchart-1.vsdx`、`06-flowchart-2.vsdx` 后，源文件 Dynamic
  connector 母版包含完整 13 个 1-D cell。
- 将新生成样例嵌入 Word 后，内嵌 payload 的 Dynamic connector 母版仍保留
  `ObjType=2`、`GlueType=2`、`LockHeight=1`、`LockCalcWH=1`、`Angle=GUARD(0DA)`
  及其余 1-D cell，证明母版级修复可以穿过 Word/Visio 的二次改写。

---

## 9. 垂直线 Width=0 退化修复与二次嵌入对比

Word 嵌入保存还会把**垂直连接线**的 `Width=0`（GUARD(EndX-BeginX) 在竖直时
为 0）改写成 `Width=0.2DL`，并把几何从 `(0,0)->(0,H)` 改成带 `X=0.1` 偏移、
混入额外 LineTo 的形态——源文件直接打开能重算纠正，OLE 初始缓存不能。

修复（`renderer.cpp` renderConnector）：对 `!sameLevel && |width|<1e-6` 的垂直
连接线，Begin/End 页面坐标不变，但形状盒宽固化为 `Width=GUARD(0.2DL)/V=0.2`、
`LocPinX=0.1`，几何顶点与文字 target 经 `localX(p)=p-width/2+locPinX` 平移
`+0.1`（非垂直线为恒等变换，零影响），文字中心仍落回同一条页面竖线中点。

验证（新生成样例 vs 新嵌入 payload 实例级对比）：
- 垂直线 `Width=0.2DL`、`LocPinX=0.1`、`Height/LocPinY` 源文件与 payload
  **完全一致**，`Width=0→0.2DL` 改写与 X=0.1 几何注入的差异消失。
- payload 内 Dynamic connector 母版（master11.xml）保留全部 13 个 1-D cell
  （实例 cell 被 Visio 保存去重，继承自母版，语义等价）。
- 剩余差异均为无害规范化：整页统一平移（OLE 容器偏移）、Visio 按实际文本
  重算 TxtWidth/TxtHeight（文字微小位移）、折线去掉 MoveTo/垂直线追加重复
  尾 LineTo（零长冗余行，视觉无影响）。
- 垂直连接线文字 pin 被 Visio 嵌入期重定位（SRC -0.15/-0.36 vs payload
  0.0515/-0.778），文字视觉位置以用户最终嵌入目视为准。
