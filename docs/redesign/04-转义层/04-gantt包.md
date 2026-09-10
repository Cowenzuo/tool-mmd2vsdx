# diag/gantt（⑤ gantt 包）

## 1. 模块职能

gantt 包是全管线最重的图型：日期序列 → 行列坐标 → 任务条/里程碑/文本
条目/非工作时间/连接线五大构件。它同时声明最大的样式需求：pr 家族
（24 枚）经 common.styles 注册生成。组织为五个子写手加一个布局器。
设计依据见 `docs/research/gantt-结构分析.md`。

## 2. 目录与文件

```
source/diag/gantt/
├── index.ts           GanttRenderer.render(a) → 契约B
├── layout.ts          日期序列与行列坐标计算
├── frame.ts           框架/列/标尺/行写手（含 Field 段）
├── bar.ts             任务条/里程碑写手（Group 8 子形状 + Property 段）
├── textEntry.ts       文本条目写手（Field/Actions 段）
├── link.ts            任务连线写手（Link lines，MasterType=1）
└── styleFamily.ts     pr 家族样式需求声明（24 枚 KEY 注册）
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| GanttLayout | 日期序列：serial↔日期、列宽、行高 | `buildAxis(model): Axis` |
| GanttScaleWriter | 两级标尺与列 | `writeColumns(axis)`、`writeScales(axis)` |
| GanttBarWriter | 任务条与里程碑 | `writeBar(task)`、`writeMilestone(task)` |
| GanttTextWriter | 文本条目 | `writeEntry(cell)` |
| GanttLinkWriter | 任务连线 | `writeLink(dep)` |
| GanttStyleFamily | pr 家族声明 | `declare(): StyleKey[]` |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| serialToDate(serial) | 序列日 | Date | Excel 序列日期换算（沿用） |
| formatDate(serial, fmt) | 序列日 + 格式 | 字符串 | 标尺格日期文本 |
| buildAxis(model) | 任务表 | 列/行/日期刻度 | 行列坐标唯一来源 |
| writeTaskBarFields(bar) | 任务条 | User/Property 行族 | gantt 专用行族（taskName/percent/date） |
| writeBarNavigation(bar) | 任务条 | 命名连接行 | LeftSide.X/RightSide.X |
| writeFieldCell(cell, ref) | 单元格 | Field 段 | AXISFORMAT 等字段引用 |
| declareStyles() | — | 契约B 需求 | pr Frame Line…pr Link Line 24 枚注册 |

## 5. 边界与注意

- 标尺的 Field/AXISFORMAT 引用链是公式密集区，逐步实现、逐步 golden
  验证（g-5/g-6）；
- pr 家族样式：样式**注册声明**由本包给出，**生成器**在 common.styles，
  本包不写 StyleSheet 片段；
- 待核：命名连接行 LeftSide/RightSide 的 ToPart 100/101 语义（W-12），
  实现期先按实测值写。
