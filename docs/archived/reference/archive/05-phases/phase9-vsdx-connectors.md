# Phase 9: VSDX 连接线与 Glue

> 状态: done (2026-08-03) | 预估: 中偏大

## 目标

将 IR Edge 写成具有一致 Begin/End 缓存、ShapeSheet 公式、Geometry、页面 Connect 记录、样式、箭头和文本的原生一维 Connector。

## 前置条件

- [x] Phase 8 完成

## 任务清单

- [ ] **9.1** 定义 `ConnectorSpec` 与 `ConnectorStyle`:
  - source/target 逻辑 ID 或 Shape ID
  - label
  - EdgeStyle
  - arrowHead/arrowTail
  - 页面坐标 waypoints
- [ ] **9.2** 实现 waypoint 清理:
  - 删除相邻重复点
  - 拒绝 NaN/Infinity
  - 少于两个有效点时生成直线
  - 首尾点替换为最终 Glue 端口
- [ ] **9.3** 实现四向端口选择:
  - 使用首段和末段方向
  - 无路径时使用节点中心方向
  - 水平/垂直主轴判定
  - 返回 Connection Row IX、Cell 名和 ToPart
- [ ] **9.4** 写入一维 Shape Cell:
  - BeginX/BeginY/EndX/EndY
  - Width/Height/Pin/LocPin
  - `PAR(PNT(...))` 公式与当前 V 缓存
  - BegTrigger/EndTrigger
  - Connector 路由行为 Cell
- [ ] **9.5** 写入 Connector Geometry:
  - 页面 waypoint 转局部坐标
  - MoveTo `(0, 0)`
  - 后续 LineTo
  - 最后一点严格等于 `(Width, Height)`
  - 正确支持负 Width 和负 Height
- [ ] **9.6** 写入页面 `Connects`:
  - BeginX / FromPart 9
  - EndX / FromPart 12
  - ToSheet、ToCell、ToPart 与端口一致
  - 删除 Connector 时同步删除两条记录
- [ ] **9.7** 映射样式和箭头:
  - Normal/Dotted/Thick
  - None/Arrow/Circle 的起点与终点
  - 使用具名常量
  - 通过 Visio fixture 确认数值，不沿用未验证的 4/13 魔法数字
- [ ] **9.8** 写入 Connector label:
  - Text
  - Control/TextPosition
  - 默认位于路径弧长中点
- [ ] **9.9** 维护 `RecalcDocument=true`:
  - custom.xml 不存在时创建 Part、Content Type 和 root Relationship
  - 已存在时复用唯一属性
  - pid 唯一且类型为 bool
- [ ] **9.10** 创建 `test_vsdx_connectors.cpp`:
  - 四方向端口
  - 水平、垂直、斜向和折线路径
  - 负 Width/Height
  - Begin/End V/F、Geometry 和 Connect 一致
  - 样式、箭头、标签和重算属性

## 验收标准

- 每条有效 Edge 生成一个 Connector Shape 和两条 Connect 记录
- 不存在端点找不到时静默跳过 Edge 的路径
- Connector Geometry 首尾与 Begin/End 完全一致
- source/target 处于任意相对方向时均选择合理端口
- waypoints 不被丢弃，初始路径与 IR 折线一致
- 节点移动后的 Visio 人工验证中端点保持 Glue 并允许重路由
- custom.xml 中最多一个 `RecalcDocument=true`

## 技术注意事项

- `FromSheet` 始终是 Connector，`ToSheet` 是节点，不按业务箭头方向解释字段名
- `Connections.Xn` 是 1-based 名称，Row IX 是 0-based
- Geometry 不能固定写 `Y=0`；终点必须是 `(Width, Height)`
- 公式字符串、V 缓存与 Connect 记录由同一个 EndpointBinding 对象生成
- 箭头代码必须有 fixture 与测试依据

## 产出文件

```text
src/mermaidc/vsdx.hpp
src/vsdx/connector_router.hpp
src/vsdx/connector_router.cpp
src/vsdx/shape_sheet.cpp
src/vsdx/document.cpp
tests/test_vsdx_connectors.cpp
tests/fixtures/vsdx/
tests/CMakeLists.txt
```