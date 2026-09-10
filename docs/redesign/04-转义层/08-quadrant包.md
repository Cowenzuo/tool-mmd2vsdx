# diag-quadrant（⑨ quadrant 包）

## 1. 模块职能

quadrant 包写四象限图：十字线、四组象限标签、数据点（Circle）与标题。
几何来自契约 A 的 QuadrantChart 块（含 crossX/crossY 与画布范围）。

## 2. 目录与文件

```
src/diag-quadrant/
├── index.ts        QuadrantRenderer.render(a) → 契约B
├── axes.ts         十字线与象限标签写手
└── point.ts        数据点写手
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| QuadrantRenderer | 编排 | `render(q): ContractB` |
| AxesWriter | 十字线/标签 | `write(chart)` |
| PointWriter | 数据点 | `write(p)` |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| crossLines(chart) | 四象限数据 | 两条线段几何 | 水平/垂直分隔线 |
| labelCells(chart) | 图 | 四组文本 | 上下左右标签 + 标题 |
| pointCircle(p) | 点 | 圆形几何 | Circle 母版实例，半径固定常量 |

## 5. 边界与注意

- 点不参与连接线粘附；本包无 Connects 产出；
- 点半径与颜色按设计常量处理，不做语义对齐（与 research 结论无关，
  属渲染观感，待样本对照再动）。
