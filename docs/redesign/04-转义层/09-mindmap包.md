# diag-mindmap（⑩ mindmap 包）

## 1. 模块职能

mindmap 包写脑图：树形节点（圆角母版）、父节点射线、层级拓扑。契约 A
新增 MindmapModel 块（nodes: id/label/parentId/depth + 布局 box），
不再借用通用节点字段。

## 2. 目录与文件

```
src/diag-mindmap/
├── index.ts        MindmapRenderer.render(a) → 契约B
├── node.ts         节点写手
├── edge.ts         射线写手
└── layout.ts       层级布局（深度 → 半径/扇区角）
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| MindmapRenderer | 编排 | `render(m): ContractB` |
| MindNodeWriter | 节点 | `write(node)` |
| MindEdgeWriter | 射线 | `write(parent, child)` |
| RadialLayout | 环绕布局 | `build(nodes): 坐标` |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| radialPos(depth, index, total) | 层级/序号 | 位置 | 按深度环绕展开坐标 |
| nodeShape(depth) | 深度 | 母版名 | 根节点大圆角、子节点小圆角 |
| branchLine(parent, child) | 父子 | 几何行 | 射线折线 |
| branchGlue(child) | 子节点 | PortIntent | 起点钉父节点下边中点（经验值） |

## 5. 边界与注意

- mindmap 布局坐标优先取自契约 A（快照已算好），radialPos 只做兜底；
- 待核：中心根节点与普通节点的母版区分，待样本对照（本设计先按深度
  分流圆角母版处理）。
