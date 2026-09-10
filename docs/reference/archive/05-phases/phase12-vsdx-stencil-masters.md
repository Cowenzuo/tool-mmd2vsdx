# Phase 12 — Stencil & Masters（内置模具 → 母版统一）

> 日期: 2026-08-03 | 依赖: Phase 6–11 全部完成

## 目标

把「图表类型 → 官方模具 → 母版子集」统一进 VSDX 输出流程：

1. 构建期将 `builtin/` 官方模具的母版与样式嵌入二进制。
2. 新建文档时按 `diagramType` 提取母版子集，重写 ID/关系/ContentTypes，合并 StyleSheets。
3. 连接线改用官方 Dynamic connector 母版（删除手写 `createMastersXml`/`createMaster2Xml`）。
4. 2D 形状改为母版实例（删除本地 Geometry Writer）。
5. 保留 `useConnectorMaster` 兼容开关（默认 true）。

## 前置条件

- [x] `builtin/` 下 8 份官方模具已验证完整（58/15/40/27/18/8/7/5 母版）
- [x] 已确认官方母版引用 `document.xml` StyleSheets（ID 6/7/8 等），需合并重映射
- [x] 已确认母版含 Icon base64（需保留）

## 任务清单

### 12.1 构建期资源嵌入

- [ ] 新增 `tools/extract_stencil.py`（或 CMake 脚本）：从 `builtin/*.vssx/vstx` 提取
  - `visio/masters/masters.xml`
  - `visio/masters/masterN.xml`（全部）
  - `visio/masters/_rels/masters.xml.rels`
  - `visio/document.xml` 中 `<StyleSheets>`、`<Colors>`、`<FaceNames>` 片段
- [ ] 输出 `src/vsdx/stencil_resources.cpp/.h`（C 数组 + 每份模具的清单元数据：模具名、母版 NameU→文件映射）
- [ ] CMake 构建时自动重跑（输入文件变化触发）

### 12.2 母版选择器 `src/vsdx/stencil.hpp/cpp`

- [ ] `enum class DiagramType { Auto, Basic, Flowchart, Class, Sequence, ER, Gantt, Timeline, Calendar }`
- [ ] `MasterSelector::select(DiagramType)` → 返回「母版子集 + 所需 StyleSheet 列表」
- [ ] 解析嵌入模具：读 `masters.xml`（NameU/ID/MasterType/Icon）、`masterN.xml` 原文
- [ ] `Auto` 推导：IR Diagram 类型 → DiagramType（flowchart/class/er/gantt/timeline/sequence…）

### 12.3 母版打包与重写

- [ ] 母版 ID 重写：原 ID → 新空间（从 100 递增），记录映射
- [ ] `masters.xml` 重写 Master ID + `<Rel r:id>`；`masters.xml.rels` 重建 rId→masterN.xml
- [ ] `masterN.xml` 复制原样（文件名沿用 masterN.xml）
- [ ] `[Content_Types].xml` 为每个母版注册 Override
- [ ] `document.xml.rels` 增加 masters 关系；`masters.xml.rels` 建立
- [ ] Icon 保留（原样复制 base64）

### 12.4 StyleSheets 合并

- [ ] 从嵌入模具 `document.xml` 提取 StyleSheets/Colors/FaceNames
- [ ] ID 重映射：与输出 document.xml 既有 0/3/4 冲突的（官方 6/7/8）平移到新 ID
- [ ] 重写母版 Shape 内 `LineStyle/FillStyle/TextStyle` 引用
- [ ] 合并进输出 `createDocumentXml()`

### 12.5 形状/连接线改用母版实例

- [ ] `renderManagedShape`：`<Shape Master="N">` + 实例 Cell（Pin/Width/Height/LocPin/Angle）+ Text，删除本地 Geometry
- [ ] 类图 Group：母版 Class + 嵌套分隔线子形状
- [ ] `renderManagedConnector`：引用官方 Dynamic connector 母版 ID（替换硬编码 "4"）
- [ ] `createEmptyImpl`：按 `diagramType` 打包母版 + 合并样式
- [ ] `CreateOptions` 增 `diagramType`（默认 `Auto`）；`useConnectorMaster` 保留

### 12.6 测试

- [ ] `test_stencil.cpp`：提取/映射/ID 重写/样式合并单测
- [ ] `test_vsdx_connectors.cpp`：断言新母版 ID + masters 部件存在
- [ ] `test_vsdx_shapes.cpp`：断言 `Master="N"` 存在、无本地 Geometry
- [ ] 端到端：生成各类型样本，检查 masters.xml 母版数与 NameU 集合
- [ ] 回归：16 个既有测试全绿

## 验收标准

- [ ] `ctest -C Debug --output-on-failure --test-dir build` 全绿
- [ ] flowchart 输出含 11 个母版（无 Custom 1-4），连接线 Master=官方 Dynamic connector
- [ ] class 输出含 Class/Member/Separator 等母版
- [ ] 无手写 `createMastersXml`/`createMaster2Xml`
- [ ] 样本 vsdx 在 Visio 打开：形状面板可见对应组件、可拖拽；连接线可切换线型；形状可调整大小

## 技术注意事项

- 官方母版 Shape 样式引用（`LineStyle="7"` = Flow Normal）必须与 StyleSheets 合并同步完成，否则样式悬空。
- 母版 ID 与页面 Shape ID 是不同命名空间，但页面 `Master="N"` 必须匹配重写后的母版 ID。
- Icon 是 base64 大字符串，嵌入资源体积约 +几 KB/母版，可接受（决策 4）。
- `Auto` 推导只作默认；调用方可显式覆盖。
- 兼容：`useConnectorMaster=false` 时退回旧行为（不打包母版、连接线本地），保证旧调用方不破坏。

## 产出文件

- `tools/extract_stencil.py`
- `src/vsdx/stencil_resources.cpp/.h`（生成物）
- `src/vsdx/stencil.hpp/.cpp`
- 修改：`src/vsdx/document.cpp`、`src/mermaidc/vsdx.hpp`、`src/CMakeLists.txt`、`CMakeLists.txt`
- 新增：`tests/test_stencil.cpp`
- 修改：`tests/test_vsdx_connectors.cpp`、`tests/test_vsdx_shapes.cpp`
