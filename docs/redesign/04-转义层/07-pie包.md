# diag-pie（⑧ pie 包）

## 1. 模块职能

pie 包写饼图：圆心半径、扇区按角度切分（EllipticalArcTo 弧段或母版
Circle 装饰）、扇区标签、标题。语义来自契约 A 的 PieChart 块。

## 2. 目录与文件

```
src/diag-pie/
├── index.ts       PieRenderer.render(a) → 契约B
├── slice.ts       扇区写手
└── pie.ts         饼体与标题写手
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| PieRenderer | 编排 | `render(pie): ContractB` |
| SliceWriter | 扇区 | `write(slice, angle)` |
| PieBodyWriter | 饼体 | `write(pie): 外形+标题` |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| sliceAngles(slice, prev) | 扇区 + 起始角 | {start, end} | 按值占比累计角度 |
| arcGeometry(cx,cy,r,a0,a1) | 圆心半径角 | 几何行 | EllipticalArcTo 弧段 |
| labelPos(slice, angle) | 扇区 | 文本位置 | 扇区中线外的标签点 |

## 5. 边界与注意

- 扇区颜色写实例 FillForegnd，标签文本带百分比数值由契约 A 提供；
- 待核：mermaid pie 的 100% 边缘情况（全角 360°），实现期以 golden 样本
  覆盖。
