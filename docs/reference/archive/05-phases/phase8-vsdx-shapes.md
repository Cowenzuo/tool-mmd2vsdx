# Phase 8: VSDX 本地形状

> 状态: done (2026-08-03) | 预估: 中

## 目标

使用完全本地 ShapeSheet Geometry 写入五种基础节点、四向连接点、纯文本和基础样式，并完成 Diagram Node 到 VSDX Shape 的转换。

## 前置条件

- [x] Phase 7 完成

## 任务清单

- [ ] **8.1** 定义公开数据类型:
  - `ShapeSpec`
  - `ShapeStyle`
  - 页面坐标 `Point` / `Rect`
  - Shape 逻辑 ID 与数字 ID
- [ ] **8.2** 实现 `ShapeSheetBuilder` 基础操作:
  - `setCell(N, V, U, F)`
  - `upsertSection(N, IX)`
  - `upsertRow(N/IX/T)`
  - 清理过期 `E`
  - 保持 Schema 子元素顺序
- [ ] **8.3** 写入二维 Shape 公共 Cell:
  - PinX/PinY/Width/Height
  - LocPinX/LocPinY
  - Angle/FlipX/FlipY
  - Line/Fill/Text 基础 Cell
  - 本地 Style 值与明确单位
- [ ] **8.4** 实现五种本地 Geometry:
  - Rect 闭合矩形
  - RoundRect 直线与圆弧，限制圆角半径
  - Diamond 四点闭合
  - Circle 使用 Ellipse Row 且强制等宽高
  - Ellipse 使用 Ellipse Row 且宽高独立
  - 每个公式同时写正确 V 缓存
- [ ] **8.5** 实现标准 Connection section:
  - IX 0 左、IX 1 右、IX 2 下、IX 3 上
  - X/Y 公式与 V 缓存一致
  - Connection 名称映射集中定义
- [ ] **8.6** 实现纯文本:
  - Character 与 Paragraph 行
  - UTF-8 文本和换行
  - XML 1.0 控制字符检查
  - 统一水平/垂直对齐
- [ ] **8.7** 实现 Node 转换:
  - NodeShape 映射
  - CoordinateTransform 转换中心与尺寸
  - 逻辑节点 ID 唯一性检查
  - Shape ID 分配
  - 基础 styleClass 到固定样式的保守映射
- [ ] **8.8** 创建 `test_vsdx_shapes.cpp`:
  - 五种 Geometry 行和公式
  - Resize 后 V/F 一致性计算
  - 四个 Connection Row
  - 中文、XML 特殊字符和多行文本
  - 填充、线色、线宽
  - Circle 等宽高

## 验收标准

- 五种节点均为独立可编辑 Shape，不引用 Master
- Shape 的 Pin、LocPin、Width、Height 和 Geometry 描述同一边界
- Geometry 闭合、NoFill/NoLine 语义正确
- 四个连接点位置和 `Connections.X1..X4` 映射稳定
- 中文、多行和 XML 特殊字符可往返
- 固定 RGB、线宽和填充可由 XML 断言验证
- 形状测试不启动 Node.js

## 技术注意事项

- 不将静态 XML 大字符串作为 Shape 模板；通过 DOM Builder 创建
- 公式常量集中管理，V 值由同一几何计算函数产生
- `lineWidth` 在公开 API 中明确使用 point 或 inch，不保留模糊单位
- `styleClass` 当前 IR 不携带完整 CSS，缺失信息时使用文档默认样式，不猜测颜色
- RoundRect 与 Ellipse 的 Row 参数先通过小型 Visio fixture 验证再固化

## 产出文件

```text
src/mermaidc/vsdx.hpp
src/vsdx/shape_sheet.hpp
src/vsdx/shape_sheet.cpp
src/vsdx/document.cpp
tests/test_vsdx_shapes.cpp
tests/fixtures/vsdx/
tests/CMakeLists.txt
```