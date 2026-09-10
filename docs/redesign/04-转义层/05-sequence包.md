# diag-sequence（⑥ sequence 包）

## 1. 模块职能

sequence 包写时序图：生命线是带**时间格连接行**的 Group（100 行、6.35mm
步长、Control.Row_1 时间原点），激活条是带时间点行的 1-D 形状，消息四类
母版（同步/返回/自/异步）差异在箭头与线型，片段是轻量组框。设计依据见
`docs/research/sequence-结构分析.md`。

## 2. 目录与文件

```
src/diag-sequence/
├── index.ts        SequenceRenderer.render(a) → 契约B
├── lifeline.ts     生命线写手（时间格连接行）
├── activation.ts   激活条写手
├── message.ts      消息写手（四类母版分发）
├── fragment.ts     片段写手（loop/opt）
└── parts.ts        页面部件 + 母版需求
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| SequenceRenderer | 编排 | `render(model): ContractB` |
| LifelineWriter | 生命线 | `write(actor)` |
| ActivationWriter | 激活条 | `write(activation)` |
| MessageWriter | 消息 | `write(msg)` |
| FragmentWriter | 片段 | `write(frag)` |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| timeSlotRow(ix) | 行号 | 连接行 | 6.35mm 步长 + IF/MODULUS 公式（借 common.formula） |
| writeLifelineControl(lf) | 生命线 | Control Row_1 | 时间原点拖动句柄 |
| messageMaster(kind) | 消息类型 | NameU | sync→Message、return→Return Message、self→Self Message、async→Asynchronous Message |
| messageArrow(kind) | 类型 | {arrow, pattern} | 返回=3/虚线，异步=3/实线，其余=4/实线 |
| glueMessage(msg, end) | 消息 | PortIntent | 端点选生命线/激活的时间格行号，ToPart=100+IX |

## 5. 边界与注意

- 时间格行 100 行是母版规模，页面实例只写用到的行缓存；端口策略统一
  走 common.ports（s-5）；
- 消息端点行号由布局算出，是语义层写入，不靠公式求值（s-2）；
- 待核：片段类型与 mermaid alt/loop 语法映射（s-3）。
