# 契约 A：图型 json

> 契约 A 是 parser 的唯一输出、图型包的唯一输入：一份"画了什么"的中间态。
> 设计依据是 research 各篇对图型语义的拆解：语义进各自扩展块，几何保持
> 像素单位，不掺 Visio 字段。

## 1. 模块职能

契约 A 解决三类问题：一是 parser 与图型包解耦，换渲染器不动图型包；
二是图型包之间互不 import，类型判断只认 `kind`；三是各图型有独立
字段块，class 的成员、ER 的主键不再挤在通用字段里。

## 2. 目录与文件

```
src/contracts/
├── a.ts          契约 A 全部类型 + 默认工厂 + 语义谓词
├── a-guards.ts   运行时校验与兜底（isContractA / kindOf / fillDefaults）
└── index.ts      门面导出（只导出类型与纯函数）
```

## 3. 类型定义

```
ContractA {
  kind: DiagramKind;              // 'flowchart'|'state'|'c4'|'block'|'class'|'er'
                                  // |'gantt'|'sequence'|'git'|'pie'|'quadrant'
                                  // |'mindmap'|'timeline'|'xy'
  meta: Meta;                     // 标题/方向/像素边界/原始文本
  shapes?: GenericShape[];        // 通用骨架（扁平图类）
  edges?: GenericEdge[];          // 通用边（含 waypoints 与箭头）
  clusters?: Cluster[];           // 子图簇
  classModel?: ClassModel;        // class 专用
  erModel?: ErModel;              // ER 专用
  gantt?: GanttModel;             // gantt 专用
  sequence?: SequenceModel;       // sequence 专用
  git?: GitGraph;                 // git 专用
  pie?: PieChart;                 // pie 专用
  quadrant?: QuadrantChart;       // quadrant 专用
  mindmap?: MindmapModel;         // mindmap 专用
}
```

### 通用骨架

| 类型 | 字段要点 | 说明 |
| --- | --- | --- |
| GenericShape | id/label/shapeKind(rect·roundRect·diamond·circle·ellipse)/x/y/width/height/fill/styleClass/parentId/lifelineKind/dividers | 几何像素值来自快照 |
| GenericEdge | from/to/label/style(normal·dotted·thick)/arrowHead/arrowTail/waypoints/fromMultiplicity/toMultiplicity | 多重性只被 ER 关系使用 |
| Cluster | id/label/box | 子图簇 |

### 图型扩展块

| 类型 | 关键字段 | 说明 |
| --- | --- | --- |
| ClassModel | classes[]：name/stereotypes/attributes[]/operations[]/relations[]：from/to/kind(dependency·inheritance·realization) | 类三栏盒与关系语义 |
| ErModel | entities[]：name/attributes[]：{name,type,primaryKey,foreignKey,required}/relations[]：from/to/label/multiplicityFrom/multiplicityTo/identifying | 主键与外键语义 |
| SequenceModel | actors[]：{id,label,kind(object·actor)}/messages[]：{from,to,label,kind(sync·return·self·async)}/activations[]/fragments[] | 消息语义与激活区间 |
| GanttModel | title/dateFormat/startSerial/endSerial/sections/tasks[] | 日期序列语义 |
| GitGraph | commits/branches/arrows | 分支语义 |
| PieChart | title/cx/cy/r/slices | 扇区语义 |
| QuadrantChart | title/四组标签/范围/十字线/points | 象限语义 |
| MindmapModel | nodes[]：{id,label,parentId,depth}/根节点 | 树语义 |

## 4. 关键函数

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| defaultContractA() | — | ContractA | 空契约，所有扩展块为 undefined |
| isContractA(v: unknown) | 任意值 | boolean | 结构校验：kind 合法 + 对应扩展块非空 |
| kindOf(a: ContractA) | 契约 A | DiagramKind | 从扩展块推断类型，兜底'flowchart' |
| fillDefaults(a) | 部分契约 | 完整契约 | 缺省字段补默认值 |

## 5. 边界与注意

- 契约 A 只存**语义**与**像素几何**，不含任何 Visio 字段（没有 cell、
  没有样式 ID、没有母版名）；
- 像素坐标统一"SVG 向下为正"，英寸换算在 common 几何组；
- timeline 与 xy 暂走 04-转义层/01-通用包 的骨架兜底表现，接入独立
  图型包时按 04-转义层 模板新增，不改变本契约骨架；
- 待核：class/ER 的 attributes 与 operations 是否有独立的视觉目标
  （类盒三栏 vs 二字栏），实现期由 diag 包决定，不影响契约。
