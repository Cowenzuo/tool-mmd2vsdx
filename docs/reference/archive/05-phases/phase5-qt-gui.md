# Phase 5: Qt GUI 可视化测试

> 状态: done (2026-08-03) | 预估: 小

## 目标

构建一个简易 Qt 应用，将 `mermaidc::parse()` 的输出用 `QGraphicsScene` 可视化渲染，用于人工验证布局正确性。

## 前置条件

- [x] Phase 4 完成
- [x] Qt 5.x 已安装

## 任务清单

- [ ] **5.1** 创建 `tests/gui/CMakeLists.txt`，可选编译 (`-DMERMAIDC_BUILD_GUI_TESTS=ON`)
- [ ] **5.2** 创建 `tests/gui/main.cpp`，实现:
  - 主窗口: `QGraphicsView` + `QGraphicsScene`
  - 文本输入框 + "解析" 按钮
  - 调用 `mermaidc::parse(text)` → 得到 Diagram
  - 渲染函数:
    - 遍历 `diagram.nodes`:
      - `NodeShape::Rect` → `QGraphicsRectItem`
      - `NodeShape::Diamond` → `QGraphicsPolygonItem` (菱形)
      - `NodeShape::Circle` → `QGraphicsEllipseItem` (等宽高)
      - `NodeShape::RoundRect` → `QGraphicsRectItem` + 圆角
      - 其他 → 带颜色区分的 `QGraphicsRectItem`
      - 每个节点居中显示 `label` 文字 (`QGraphicsTextItem`)
    - 遍历 `diagram.edges`:
      - `EdgeStyle::Normal/Dotted/Thick` → 不同线型 `QPen`
      - `waypoints` → `QPainterPath` 折线
      - 箭头 → 自定义 `QGraphicsPolygonItem` 三角形
      - 边标签 → `QGraphicsTextItem` 位于中点
  - 滚轮缩放、拖拽平移
- [ ] **5.3** 预设几个测试用例（下拉选择）:
  - 简单: `graph LR; A-->B`
  - 分支: `graph TB; A --> B; A --> C; A --> D`
  - 循环: `graph LR; A --> B --> C --> A`
  - 中文: `graph TB; 开始 --> 处理 --> 结束`
- [ ] **5.4** 编译并手动运行验证

## 验收标准

- 能渲染至少 10 个节点 10 条边的图
- 菱形节点视觉上确实是菱形
- 箭头方向正确
- 中文标签正常显示
- 滚轮缩放、拖拽平移流畅

## 技术注意事项

- 不依赖 mermaid-c 做任何渲染决策，纯数据驱动的视觉展示
- 节点中心坐标 `(x, y)` → 需要减去 `width/2`, `height/2` 得到左上角
- 不同 shape 用不同颜色区分，便于验证
- `QPen` 线型: `SolidLine`, `DotLine`, 粗线用 `setWidthF(3.5)`

## 产出文件

```
tests/gui/CMakeLists.txt
tests/gui/main.cpp
```
