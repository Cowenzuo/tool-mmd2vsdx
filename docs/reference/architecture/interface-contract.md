# mmd2vsdx v2 重构 — 模块接口契约

> 状态：设计定稿（用户确认：xml 独立 / docmodel 彻底去指针 / XmlParts 归 core）
> 原则：
>   1. **core 永远最简单**：纯数据结构 + 枚举 + 跨模块契约，零依赖
>   2. **依赖单向**：只允许「上层 → 下层」，禁止回环、禁止穿透
>   3. **门面对门面**：跨模块只调门面公开接口，内部全隐藏
>   4. **无黑盒**：每个模块的输入/输出/副作用必须在接口上显式可见

---

## 1. 模块总览（7 模块）

```
┌─────────────────────────────────────────────────┐
│ app        编排层：Application + input/pipeline/ │
│            output + ConvertHandler 实现          │
├─────────┬───────────────────────┬───────────────┤
│ mmdtransform  翻译层             │ http 通信层    │
│ Translator + JsonToDiagram      │ client/server  │
├─────────┴──────────┬────────────┴───────────────┤
│ vsdxdoc  文档翻译    │ opcpkg  OPC 容器            │
│ VsdxTranslator     │ OpcPackager                │
├────────────────────┴────────────────────────────┤
│ xml  XML 树工具（libxml2 薄封装）                  │
├─────────────────────────────────────────────────┤
│ core  数据层：IR + vsdx 契约 + XmlParts（零依赖）  │
└─────────────────────────────────────────────────┘
```

依赖方向（只允许向下）：
```
app → mmdtransform → http → core
app → vsdxdoc → xml → core
app → opcpkg → xml → core
```

## 2. 各模块接口契约

### 2.1 core（数据层）— 零依赖

| 项 | 内容 |
|---|---|
| 职责 | 跨模块共享的纯数据结构与枚举，无业务逻辑 |
| 文件 | `core/base.hpp`（Point/BoundingBox/Error/Code）、`core/ir.hpp`（Diagram/Node/Edge/Cluster + 图语义类型）、`core/vsdx.hpp`（PageId/ShapeId/ShapeStyle/CreateOptions/规格） |
| **新增** | `core/xmlparts.hpp`：`XmlPart{uri, contentType, xml}` + `XmlParts{parts}`（跨模块流转契约，纯字符串数据） |
| 依赖 | 无（不依赖 libxml2、不依赖任何模块） |
| 红线 | 禁止出现任何业务模块头文件 |

### 2.2 xml（XML 工具层）— 新模块

| 项 | 内容 |
|---|---|
| 职责 | libxml2 薄封装：XML 树构建/解析/序列化的通用能力 |
| 门面 | 无单例；自由类 `XmlDocument` / `XmlUtils`（自 `opcpkg/xmldocument.*` 迁入） |
| 依赖 | libxml2（外部）、core（Error） |
| 被依赖 | opcpkg（ContentTypes/Relationships 序列化）、vsdxdoc（文档构建） |
| 红线 | 不出现任何 VSDX/OPC 语义；不依赖 opcpkg/vsdxdoc |

### 2.3 opcpkg（OPC 容器层）— 瘦身

| 项 | 内容 |
|---|---|
| 职责 | OPC 容器规范（ISO 29500）：Package/PartUri/Relationships/ContentTypes/ZipArchive |
| 门面 | `OpcPackager`（单例）：`pack(XmlParts, path)`、`open(path)` |
| 输入 | `core::XmlParts`（**不再定义 XmlParts，改从 core 引用**） |
| 依赖 | core（XmlParts/Error）、xml（XmlDocument） |
| 不依赖 | vsdxdoc（保持现状） |
| 红线 | 不出现任何 VSDX 语义字符串（"visio/document.xml" 等属 vsdxdoc） |

### 2.4 vsdxdoc（VSDX 文档翻译）— 核心重构

| 项 | 内容 |
|---|---|
| 职责 | Diagram → XmlParts（IR → VSDX XML 部件集合） |
| 门面 | `VsdxTranslator`（单例）：`translate(Diagram, CreateOptions) → XmlParts` |
| 输入 | `core::Diagram` + `core::CreateOptions` |
| 输出 | `core::XmlParts` |
| 内部子域 | translate（Diagram→DocumentModel 纯翻译 + 装配）、docmodel（**纯数据模型**，ShapeModel 无 XML 成员）、render（**模型→树**：ShapeSheet 填充，node 经参数传入）、serialize（树→XmlParts）、masters（MasterLibrary） |
| 依赖 | core（Diagram/CreateOptions/XmlParts/Error）、xml（XmlDocument/XmlUtils）、**opcpkg（Package/Relationships/PartUri 容器类型）** |
| 依赖修正 | ~~"不依赖 opcpkg"~~ **错误**：VSDX 装配（建包/写关系/加部件）本质需要 OPC 容器，vsdxdoc→opcpkg 是正确方向。真正要拆的是 opcpkg 的 xml 子域（归 xml 模块），vsdxdoc 不得 include `opcpkg/xmldocument.hpp`（改 `<xml/xmldocument.hpp>`） |
| 红线 | docmodel 的 ShapeModel/ConnectorModel 不含 `xmlNodePtr`；render 的 node 经函数参数传入；XML 树构建（XmlBuilder）收口于 serialize+masters |

### 2.5 mmdtransform（翻译层）— 原 mmdparse 更名

| 项 | 内容 |
|---|---|
| 职责 | mermaid 文本 → Diagram（翻译编排 + 契约映射；不解析） |
| 门面 | `Translator`（单例）：`translate(text) → Diagram`、`setScriptPath`、`shutdown` |
| 内部 | `JsonToDiagram`（JSON→IR 纯函数）、持有 `http::SnapshotClient` |
| 依赖 | core（Diagram/Error）、http（SnapshotClient） |
| 红线 | 不出现任何 vsdxdoc/opcpkg 引用 |

### 2.6 http（通信层）— 新模块

| 项 | 内容 |
|---|---|
| 职责 | 纯通信，零业务依赖 |
| client | `HttpClient`（WinHTTP 封装）、`SnapshotClient`（mermaid-snapshot 专用：服务定位/生命周期/convert/health） |
| server | `HttpServer`（路由/JSON/串行）、`ConvertHandler`（interface，**由 app 注入实现**） |
| 依赖 | core（Error） |
| 红线 | server 业务必须经 ConvertHandler 回调，禁止 include mmdtransform/vsdxdoc/opcpkg |

### 2.7 app（编排层）

| 项 | 内容 |
|---|---|
| 职责 | 一级逻辑触发入口：CLI 形态 + 服务形态 |
| 门面 | `Application`（单例）：`convertFile` / `convertDir` / `serve(port)` / `setSnapshotPath` / `shutdown` |
| 内部 | input（FileScanner/MmdReader）、pipeline（Pipeline）、output（OutPathResolver）、`ConvertHandler` 实现类 |
| 依赖 | core、mmdtransform、vsdxdoc、opcpkg、http |
| 红线 | 不包含业务实现，只做编排与装配 |

## 3. 跨模块契约清单（唯一数据通道）

| 契约类型 | 定义处 | 生产者 | 消费者 |
|---|---|---|---|
| `Diagram`（IR） | core/ir.hpp | mmdtransform | vsdxdoc |
| `CreateOptions` | core/vsdx.hpp | app | vsdxdoc |
| `XmlParts` | **core/xmlparts.hpp（新增）** | vsdxdoc | opcpkg |
| `ConvertResult`（base64 vsdx） | core（新增小结构） | app::ConvertHandler | http::server |
| HTTP JSON 协议 | —（文档约定） | http | mmdtransform / app |

## 4. 黑盒防范清单

1. vsdxdoc 不再 include `<opcpkg/xmldocument.hpp>` / `<opcpkg/parturi.hpp>` 中的
   xml 子域（改 `<xml/xmldocument.hpp>`）；允许 include `opcpkg/package.hpp` /
   `opcpkg/relationships.hpp`（容器类型，装配需要）
2. docmodel 的 `ShapeModel/ConnectorModel` 删除全部 `xmlNodePtr` 成员；
   render 的 node 经函数参数传入（386 处 `shape.node` → `node` 机械替换）
3. `PageModel` 保留自己的树（page.xml/shapesNode/connectsNode）——组合关系，
   页面=树的容器，清晰可见；`DocumentCore` 保留装配态（package/文档部件）
4. XML 树构建（XmlBuilder）收口于 serialize + masters 两处
5. core 保持零 include（脚本校验：`grep -r '#include <' core/` 只允许标准库）
