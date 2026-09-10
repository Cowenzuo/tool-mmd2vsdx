# diag/class（③ class 包）

## 1. 模块职能

class 包按 UML 类图写产品：类盒是**列表容器**（Group 嵌套子形状 +
容器 User 行族 + Controls.ROW_1 行宽控制 + 成员注册），成员行与分隔符是
页级形状（公式回指容器），关系线用专用母版（依赖虚线、继承实心三角）。
设计依据见 `docs/research/class-结构分析.md`。

## 2. 目录与文件

```
source/diag/class/
├── index.ts        ClassRenderer.render(a) → 契约B
├── box.ts          类盒写手（Group 容器）
├── member.ts       成员行写手（Member/Separator）
├── relation.ts     关系线写手（Dependency/Inheritance/Interface Realization）
└── parts.ts        页面部件 + 母版需求（调 common.MasterPacker）
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| ClassRenderer | 编排三写手与部件组装 | `render(model): ContractB` |
| ClassBoxWriter | 类盒：组轮廓、圆角几何、四连接行、容器行族、嵌套子形状 | `write(klass)` |
| MemberRowWriter | 成员行与分隔符：容器公式回指、行宽继承 | `write(member)`、`write(separator)` |
| ClassRelationWriter | 三类关系线：母版选择、端点粘附、Connects | `write(relation)` |
| MasterDemands | 母版需求收集 | `collect(boxes, rels): string[]`（NameU 列表） |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| writeContainerUser(box) | 类盒 | User 行族 | WidthMin/EntityName/msvSDContainerMargin/msvSDListItemMaster |
| writeRowControl(box) | 类盒 | Control Row_1 | BOUND 行宽公式（借 common.formula） |
| writeConnectionRows(box) | 类盒 | 四连接行 | IX0-3 左/右/下/上中点（见 class 专篇 2.4） |
| writeNestedTitle(box) | 类盒 | 子形状 | 标题子形状，其余 F=Inh 最小形态 |
| writeMemberRow(member) | 成员 | Shape 节点 | Pin/Width(IFERROR LISTSHEETREF)/User 行族/文本 |
| writeSeparator(sep) | 分隔符 | Shape 节点 | 单行几何 + LinePattern=23 |
| pickRelationMaster(kind) | 关系类型 | NameU | dependency/inheritance/realization |
| gluePortTarget(rel, end) | 关系 + 端 | PortIntent | 目标类盒四中点之一；继承走 WALKGLUE |

## 5. 边界与注意

- 类盒只写容器结构，成员行的**自动重排**靠 Visio 打开重算，离线只写
  缓存位置（与 research k-3 待核一致）；
- 母版需求按 NameU 收集，装配交给 common.MasterPacker，本包不碰资产；
- 待核：master7 与 master9 内容相同的现象说明依赖/接口实现可共用内容
  文件，装配期由包声明 NameU 后由 assets 定位。
