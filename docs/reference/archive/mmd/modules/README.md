# src/ 模块类图

按模块拆分的 classDiagram，每份对应一个目录/命名空间，聚焦本模块的类、成员与内部关系；
跨模块依赖以「依赖 xxx」注释标注（不画跨域连线，保持每图独立清晰）。

| 模块 | 文件 | 职责 | 依赖 |
|---|---|---|---|
| 总览 | `overview.mmd` | 模块依赖关系（flowchart） | — |
| core | `core.mmd` | IR 领域模型 + 异常 | 零依赖 |
| opc | `opc.mmd` | OPC/ZIP/XML 打包 | 零依赖 |
| api | `api.mmd` | 公共句柄 + DTO（vsdx.hpp） | detail/model/io/masters/opc/core |
| model | `model.mmd` | 内部文档对象模型 | core/opc（detail 反向指针） |
| detail | `detail.mmd` | DocumentCore 协调者 + 母版数据 | model/opc |
| render | `render.mmd` | 渲染策略族 + 连接线辅助 | model/io/masters/core |
| masters | `masters.mmd` | 母版库 | opc/core |
| io | `io.mmd` | 序列化（写盘） | model/masters/detail/opc |
| parse | `parse.mmd` | 解析域 | core |
| app | `app.mmd` | 应用编排 | parse/core |

全量参考图：`../src-classes.mmd`（含全部跨模块关系，改动代码后需同步各模块图与全量图）。

**注意**：读取 .vsdx 的能力（原 `io::VsdxReader`/`Document::open`）已移出主库，
仅测试使用（`tests/vsdx_reader.*`），不在主库类图中。
