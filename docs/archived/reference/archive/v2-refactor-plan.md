# mmd2vsdx v2 重构 — 分批实施计划

> 目标：从 v1（6 目录）渐进迁移到 v2（7 模块），每批结束构建 + ctest 8/8 全绿。
> 原则：**先加后拆、每批可回退**——每批是一个独立提交，批间可单独验证。
> 契约依据：`docs/重构v2/interface-contract.md`

---

## 批次总览（第一轮校对修正版）

> 校对发现：原计划 B2/B3（去指针）时 render 仍依赖 opcpkg 的 xml 子域，
> 会改两遍——xml 迁入提前；vsdxdoc→opcpkg 依赖是正确方向（装配需要），
> 真正要拆的只是 opcpkg 的 xml 子域。

| 批 | 名称 | 内容 | 风险 | 验证 |
|---|---|---|---|---|
| B0 | 契约落地 | core 增 XmlParts/ConvertResult；xml 模块建立 | 低 | ✅ 已完成 |
| B1 | mmdparse→mmdtransform | 目录/类更名 + SnapshotClient 下沉 http::client | 中 | ✅ 已完成 |
| B2 | xml 模块落地 | opcpkg 的 XmlDocument/XmlUtils 迁入 src/xml（命名空间 xml::）；opcpkg/vsdxdoc 改引用 | 低 | 构建 + 8/8 |
| B3 | docmodel 去指针 | ShapeModel/ConnectorModel 删 xmlNodePtr；render 签名加 node 参数（386 处机械替换） | 中 | 构建 + 8/8 + 产物对比 |
| B4 | translate 拆分 | DiagramImporter 拆 ModelBuilder（纯翻译）+ 装配器；DocumentCore 装配态明确 | 中 | 构建 + 8/8 + 产物对比 |
| B5 | app 服务化 | Application::serve + ConvertHandler 实现 + http::server | 中 | 构建 + 8/8 + HTTP 实测 |
| B6 | 收尾对齐 | 文档/README/测试名对齐 v2；删 v1 残留 | 低 | 构建 + 8/8 |

---

## B0：契约落地（低风险，先行）

**目标**：core 获得跨模块契约类型；xml 模块空壳建立；opcpkg 保持不动。

```
src/
├── core/
│   ├── base.hpp / ir.hpp / vsdx.hpp      （不动）
│   └── xmlparts.hpp                      （新增：XmlPart/XmlParts 从 opcpkg 迁入）
├── xml/                                  （新增模块）
│   ├── CMakeLists 并入 src/CMakeLists.txt
│   └── （空壳：README/占位；B4 迁入 XmlDocument）
├── opcpkg/                               （不动，仍定义 XmlParts——B4 再切换）
└── ...
```

- `core/xmlparts.hpp`：`XmlPart{uri, contentType, xml}`、`XmlParts{parts}`（纯字符串，无 libxml2 依赖）
- `src/CMakeLists.txt`：新增 `mmd2vsdx_xml` INTERFACE 库（占位，B4 变 STATIC）
- 验证：构建 + ctest 8/8（core 新头未使用，无行为变化）

## B1：mmdparse → mmdtransform（中风险）

**目标**：命名与职责对齐 v2 设计；http::client 骨架建立。

```
src/mmdparse/  →  src/mmdtransform/
    parser.hpp/cpp     → translator.hpp/cpp（Parser→Translator，parse→translate）
    jsonparser.*       → 保留名 jsonparser（或 irparser）
    nodejsprocess.*    → 移至 src/http/client/snapshotclient.*
src/http/
    client/httpclient.hpp/cpp          （WinHTTP 封装，从 nodejsprocess 抽出）
    client/snapshotclient.hpp/cpp      （服务定位+生命周期+convert/health）
```

- `Translator` 保持单例门面：`shared()/translate()/setScriptPath()/shutdown()`
- `NodeJsProcess` 拆为 `http::HttpClient`（通用）+ `http::SnapshotClient`（专用）
- 所有引用更新：`#include <mmdparse/parser.hpp>` → `<mmdtransform/translator.hpp>`
- 验证：构建 + ctest 8/8（teste2e 全链）

## B2：xml 模块落地（低风险，机械移动）

**目标**：opcpkg 的 xml 子域迁入独立模块，命名空间 `opcpkg` → `xml`。

```
src/opcpkg/xmldocument.{hpp,cpp}  →  src/xml/xmldocument.{hpp,cpp}   （xml::XmlDocument）
opcpkg/xmlutils 同文件内           →  xml::XmlUtils
```

- 全部引用更新：`#include <opcpkg/xmldocument.hpp>` → `<xml/xmldocument.hpp>`，
  `opcpkg::XmlDocument` → `xml::XmlDocument`（opcpkg 的 contenttypes/relationships
  序列化 + vsdxdoc 全部引用点）
- `mmd2vsdx_xml` 由 INTERFACE 转 STATIC（含 xmldocument.cpp）
- opcpkg/vsdxdoc 的 CMake 依赖补 `mmd2vsdx_xml`
- 验证：构建 + ctest 8/8（纯改名，产物不变）

## B3：docmodel 去指针（中风险，机械替换）

**目标**：模型层与 XML 树解耦——ShapeModel/ConnectorModel 不再持有节点指针。

背景事实（第四轮校对验证）：
- render 族共 386 处 XML 操作（gantt 170 + renderer 138 + pie 41 +
  git 28 + sequence 13 + quadrant 3）——**render 本来就是"模型→树"转换器**
- `shape.node` 使用模式单一：全部是"把模型持有的节点句柄传给
  XmlUtils/XmlBuilder 操作"（抽样 12 处一致），机械替换可行
- gantt 的 `frame.node` 为 GanttRenderer 自建局部节点（不走 ShapeModel），
  不受影响

改造（机械）：
```
ShapeModel.node            → 删除；renderShape(page, shape, node) 经参数传入
ConnectorModel.begin/endConnect → 删除；renderManagedConnector(page, conn, node, begin, end)
PageModel.xml/shapesNode/connectsNode → 保留（页面=树的容器，组合关系）
renderManagedShape/Connector 签名加 node 参数；RendererFactory 透传
```

- 386 处 `shape.node` → `node`（函数参数）机械替换，渲染逻辑零改动
- 验证：构建 + 8/8 + 全样例 .vsdx SHA-256 与 B2 一致

## B4：translate 拆分（中风险）

**目标**：DiagramImporter（373 行装配器）拆分为两个清晰职责：

```
ModelBuilder（新）：Diagram → DocumentModel（纯翻译：坐标变换/规格组装，
                    不碰 Package/树）—— 现 translate() 的 1/3 部分
Assembler（装配）：DocumentModel → DocumentCore（建 Package/写 Relationships/
                    建文档部件/调 render）—— 现 translate() 的 2/3 部分
```

- `docmodel` 装配态明确：DocumentCore = package + 文档部件 + pages（组合）
- 验证：构建 + 8/8 + 产物 SHA-256 一致

## B5：app 服务化（中风险）

**目标**：Application::serve(port) + http::server 装配。

```
src/app/
    serve.cpp            （Application::serve 实现）
    converthandler.cpp   （ConvertHandler 实现：pipeline → base64）
src/http/
    server/httpserver.*       （路由/JSON/串行）
    server/converthandler.hpp （interface，core 定义 ConvertResult）
```

- `POST /convert {mmd, options}` → `{status, vsdx(base64), diagramType}`
- `GET /health` → `{status:"ok"}`
- gen_samples 继续走 CLI 形态（convertDir 保留）
- 验证：构建 + 8/8 + 手动 HTTP 实测（curl 或 Invoke-RestMethod）

## B6：收尾对齐（低风险）

- README 模块表/目录结构更新为 v2（7 模块）
- `docs/architecture/` 类图跟进 v2 现状（从 重构v2 回迁或重写）
- 测试名/注释对齐（testparser → testtranslator 等，视情况）
- 删除 v1 残留（空目录、旧注释）
- 验证：构建 + 8/8 + 全样例产物哈希与 v1 一致（回归基线）

---

## 验收基线（全程守护）

| 项 | 方法 |
|---|---|
| 功能回归 | `ctest -C Debug --test-dir build` 8/8 |
| 产物一致性 | B3/B4 前后全样例 .vsdx SHA-256 对比（`resources/testio/output/`） |
| 依赖方向 | 脚本校验 include：禁止 vsdxdoc→opcpkg 的 xml 子域（`opcpkg/xmldocument.hpp`）；允许 vsdxdoc→opcpkg 容器类型（package/relationships/parturi）；禁止 core→任何模块 |
| 无黑盒 | grep 校验：docmodel 的 ShapeModel/ConnectorModel 无 xmlNodePtr；core 无业务 include |

## 回退策略

- 每批独立提交；若某批失败且 30 分钟内无法修复 → `git revert` 该批，记录原因
- B3/B4（docmodel 去指针/translate 拆分）：先行在分支 `refactor/v2-vsdxdoc` 上实施，全绿后合回 master
