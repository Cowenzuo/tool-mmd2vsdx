# mmd2vsdx — 测试规划（基于新架构）

> 状态：已确认（用户评审通过）
> 原则：**每个测试测不同的东西**，按新架构模块分组，杜绝冗余。

## 测试架构原则

1. **按模块归属**：core / mmdparse / vsdxdoc / opcpkg / app 各司其职
2. **不冗余**：同一环节只保留一份测试（解析/子进程/图型覆盖合并进 Parser 测试；OPC 单元合并成一份）
3. **句柄废弃对应移除**：`Document`/`Page`/`Shape`/`Connector` 句柄已废弃，相关测试移除，有价值的**翻译/渲染用例**吸收进 `testtranslate`
4. **单例串行**：测试走新架构单例门面（`Parser`/`VsdxTranslator`/`OpcPackager`/`Application`），不碰内部实现

## 测试清单（8 个）

| # | 测试 | 模块 | 内容 | 吸收的旧测试 |
|---|---|---|---|---|
| 1 | `testir` | core | IR 类型默认值/枚举/Error | testir（保留） |
| 2 | `testjson` | mmdparse | jsonToDiagram（JSON→Diagram、枚举映射） | testjson（保留） |
| 3 | `testparser` | mmdparse | Parser 单例编排 + 子进程（崩溃/自动启动/无效路径）+ 17 图类型解析覆盖 | testengine + testnodeprocess + testvalidation |
| 4 | `testopc` | opcpkg | PartUri + ZipArchive + ContentTypes/Relationships + Package（分节合并） | testopcuri + testopczip + testopcxml + testopcpackage |
| 5 | `testtranslate` | vsdxdoc | DiagramImporter 翻译（坐标变换/页面/形状/连接线）+ 渲染输出验证 | testvsdxcoordinates + testvsdxshapes + testvsdxconnectors + testvsdxdocument（翻译/渲染用例，句柄操作丢弃） |
| 6 | `testmasters` | vsdxdoc | MasterLibrary（load/select/pack/merge） | teststencil（保留） |
| 7 | `testroundtrip` | vsdxdoc+opcpkg | 生成→读取→再生成（产物往返质量验收） | testvsdxroundtrip（保留） |
| 8 | `teste2e` | app | Application 全链（18 mmd 样本 → .vsdx）+ 输出验证 | testvsdx + testapi |

## 覆盖矩阵

| 环节 | 数据流 | 测试 |
|---|---|---|
| core 类型 | IR/枚举/值类型 | `testir` |
| JSON→Diagram | mmdparse | `testjson` |
| 解析/子进程/图型覆盖 | mmdparse | `testparser` |
| OPC 容器全 | opcpkg | `testopc` |
| 翻译/渲染/坐标 | vsdxdoc | `testtranslate` |
| 母版 | vsdxdoc | `testmasters` |
| 产物往返 | vsdxdoc+opcpkg | `testroundtrip` |
| 全链（文件→.vsdx） | app | `teste2e` |

## 与旧测试的映射汇总

```
17 个旧测试
├─ 保留 3：testir、testjson、teststencil→testmasters、testvsdxroundtrip→testroundtrip
├─ 改名/改造 2：testengine→testparser、testvsdx→teste2e
├─ 合并 8→1：testopcuri/zip/xml/package → testopc
├─ 吸收 3：testnodeprocess/validation → testparser；testcoordinates → testtranslate
└─ 移除 3：testvsdxdocument/shapes/connectors（句柄废弃）
→ 结果：8 个测试
```

## 验收红线（对应架构图）

- 只测门面公开接口（单例），不测内部实现细节
- `teste2e` 走 `Application::convertFile/convertDir`（串行，按顺序输出）
- `testtranslate` 验证输出为 `XmlParts`（opcpkg 类型）
- 每阶段重构完成：构建 + 对应测试全绿
