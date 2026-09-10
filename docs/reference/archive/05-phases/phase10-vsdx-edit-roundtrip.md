# Phase 10: VSDX 编辑与保真写回

> 状态: done (2026-08-03) | 预估: 中偏大

## 目标

打开已有 VSDX，通过 Relationships 定位页面和母版，对受支持对象进行局部编辑，并在未知内容和未修改 Part 保真的前提下安全写回。

## 前置条件

- [x] Phase 9 完成

## 任务清单

- [ ] **10.1** 实现 `Document::open`:
  - 读取 Content Types 和根 Relationships
  - 按 Relationship Type 定位 Document Part
  - 定位 Pages Index 和全部 Page Part
  - 支持非默认 Part URI
  - 收集打开基线诊断
- [ ] **10.2** 实现 Page/Shape/Connector 索引:
  - Page ID、Name/NameU、Relationship
  - 顶层 Shape ID 与 Type
  - Master 属性和 Style ID
  - Connector 与 Connect 记录
  - 未解析子树保留在原 DOM
- [ ] **10.3** 实现局部修改:
  - 文本
  - Pin/Width/Height
  - Line/Fill 基础样式
  - Connector endpoints、waypoints、样式和标签
  - 修改后只标记相关 Part dirty
- [ ] **10.4** 实现母版实例编辑:
  - 保留 Master 与页面 Master Relationship
  - 以本地 Cell/Section 覆盖位置、尺寸、文本和样式
  - 不修改共享 masterN.xml
- [ ] **10.5** 实现富文本保留:
  - 未修改 Text 时保持原 mixed content
  - 局部运行替换不删除周围 cp/pp/tp/fld
  - 整段替换时清理本库管理的失效索引
- [ ] **10.6** 实现引用扫描:
  - Connect FromSheet/ToSheet
  - BegTrigger/EndTrigger
  - 已识别 `Sheet.ID!` 公式
  - 已知逻辑 ID
  - 未知 XML 中可识别的数字引用
- [ ] **10.7** 实现安全删除:
  - 自动清理已知引用
  - 遇未知引用拒绝并返回 Part URI、元素路径和引用值
  - 删除 Shape/Connector 后保持 ID 分配器单调递增
- [ ] **10.8** 实现 dirty Part 保存:
  - 未修改 payload 摘要不变
  - 修改 XML 保留未知节点、属性、命名空间、注释和 PI
  - 保留 External Relationship
  - 不因不识别 Theme、Master、Group、Image 或 Data Part 而删除
- [ ] **10.9** 创建 roundtrip fixture:
  - 从 `docs/min.vsdx` 复制小型测试 fixture
  - 从 `docs/ceshi` 提炼包含 Master、Theme、无母版 Shape 和 Connector 的脱敏 fixture
- [ ] **10.10** 创建 `test_vsdx_roundtrip.cpp`:
  - 只改一个文本，其他 Part payload 摘要不变
  - 修改母版实例写本地覆盖
  - Theme 和未知 Part 保留
  - External Relationship 保留且不访问
  - 未知引用阻止删除
  - 保存后重新打开并再次修改

## 验收标准

- `min.vsdx` 可打开、修改文本、保存并重新打开
- 读取不依赖固定 `visio/pages/page1.xml` 路径
- 修改母版实例不改共享 Master Part
- 未修改 Part 的未压缩 payload 摘要保持一致
- 修改 XML Part 的未知节点、属性和命名空间仍存在
- 删除未知引用目标时返回 `UnknownReference`，原文件和 Document 状态不被部分修改
- 保存后的文件通过 ZIP、OPC 和 VSDX 验证

## 技术注意事项

- 删除操作先构建完整变更计划，通过验证后一次提交 DOM 修改
- libxml2 重序列化会改变格式，不把 XML 缩进和属性顺序作为保真目标
- 未修改二进制 Part 必须逐字节保留 payload
- 读取时不自动“修复”无关的第三方错误
- 基线已有错误与本次新增错误分开报告

## 产出文件

```text
src/vsdx/document.cpp
src/vsdx/xml_part.cpp
src/vsdx/shape_sheet.cpp
src/vsdx/validator.hpp
src/vsdx/validator.cpp
tests/fixtures/vsdx/min.vsdx
tests/fixtures/vsdx/complex.vsdx
tests/test_vsdx_roundtrip.cpp
tests/CMakeLists.txt
```