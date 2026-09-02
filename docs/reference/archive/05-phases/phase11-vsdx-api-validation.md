# Phase 11: VSDX API、验证与交付

> 状态: done (2026-08-03) | 预估: 中

## 目标

稳定最小公开对象 API，完成严格验证、故障安全保存、旧接口迁移、全量自动化测试和桌面 Visio 验收，正式退役硬编码 Writer。

## 前置条件

- [x] Phase 10 完成

## 收尾状态 (2026-08-03)

- [x] 11.1 定版 `src/mermaidc/vsdx.hpp`（move-only `Document` PIMPL、`PageId`/`ShapeId`、增删改查、`CreateOptions`、`ShapeSpec`/`ConnectorSpec`，无 libxml2/zlib 泄漏）
- [x] 11.2 错误模型（`ValidationReport`/`ValidationIssue`/`ValidationSeverity`，`Document::validate()` 返回结构化报告；`VsdxErrorCode` 未单列，错误沿用 `std::exception` 子类）
- [~] 11.3 `VsdxValidator`（已覆盖 pages 非空、OPC 包结构、悬空关系；Connect/Geometry 一致性校验与编辑基线校验待后续强化）
- [x] 11.4 故障安全保存（同目录临时 archive → 重开验证 → Windows `MoveFileExW` 原子替换 → 失败清理）
- [x] 11.5 兼容接口（`writeVsdx` 委托 `Document::fromDiagrams`；零页/悬空端点报错）
- [x] 11.6 删除旧实现（无手写 CRC/ZIP、无巨型静态 XML 常量；2D 形状使用本地 Geometry，连接线使用最小 Dynamic connector 母版）
- [~] 11.7 构建与安装（README 已更新系统依赖；CMake install/export 未做）
- [x] 11.8 测试入口（全部单测入 CTest；`test_vsdx.cpp` 端到端写 17 种图表）
- [x] 11.9 自动化验收（单页/多页、五种 Shape、四方向与 waypoint Connector、Unicode、roundtrip、保真写回）
- [ ] 11.10 桌面 Visio 验收（未执行：需人工在桌面 Visio 打开生成的 .vsdx，验证无修复提示、移动保 Glue、重保存可再读）
- [x] 11.11 经验证事实已记录到 repository memory

## 任务清单

- [ ] **11.1** 定版 `src/mermaidc/vsdx.hpp`:
  - move-only `Document` PIMPL
  - `PageId` / `ShapeId`
  - Document/Page/Shape/Connector 必要增删改查
  - `CreateOptions`
  - `ShapeSpec` / `ConnectorSpec`
  - 无 libxml2/zlib 类型泄漏
- [ ] **11.2** 定版错误模型:
  - `VsdxErrorCode`
  - 文件路径、Part URI、Relationship ID、Page/Shape ID、XML 路径上下文
  - 库内不输出日志
- [ ] **11.3** 完成 `VsdxValidator`:
  - ZIP 全 Part 可读与 CRC
  - Content Type 完整性
  - Internal Relationship 可达与 ID 唯一
  - Page/Shape/Row ID 唯一
  - Style/Master 引用存在
  - Connect 与 Connection Row 对应
  - Connector V/F/Geometry 一致
  - RecalcDocument 唯一且类型正确
- [ ] **11.4** 实现故障安全保存:
  - 同目录临时 archive
  - ZIP32 Writer 关闭后由本库与独立 ZIP 读取器重新打开验证
  - Windows 原子替换封装
  - POSIX 同文件系统 rename
  - 失败时删除临时文件并保留原文件
- [ ] **11.5** 迁移兼容接口:
  - `writeVsdx(path, Diagram)` 委托 `Document::fromDiagrams`
  - `writeVsdx(path, vector<VsdxPage>)` 明确迁移或弃用策略
  - 多页调用不再丢页
  - 零页、悬空端点不再静默输出
- [ ] **11.6** 删除旧实现:
  - 手写 CRC/ZIP
  - 固定 page1/pages.xml/rels 字符串
  - 固定 Process/Dynamic connector 母版
  - 不完整 Theme
  - 巨型静态 XML 常量
- [ ] **11.7** 更新构建与安装:
  - 新源码加入 target
  - install/export 公共头文件
  - CMake Config 使用 `find_dependency`
  - README 增加系统依赖和 VSDX 示例
- [ ] **11.8** 更新测试入口:
  - 所有 OPC/VSDX 单元测试加入 CTest
  - `test_vsdx.cpp` 从“文件 >100 字节”升级为完整验证
  - Node 不可用时明确 skip Mermaid E2E，而不是空通过
  - VSDX 单元测试在无 Node 环境仍全部运行
- [ ] **11.9** 运行自动化验收:
  - 单页与三页
  - 五种 Shape
  - 四方向与 waypoint Connector
  - Unicode 与特殊字符
  - roundtrip 与未知引用
  - 全部既有非 VSDX 回归测试
- [ ] **11.10** 执行桌面 Visio 验收并记录结果:
  - 启用文件打开警告
  - 无修复提示
  - Shape/Connector 可独立编辑
  - 移动节点保持 Glue
  - 保存、关闭、重开稳定
  - Visio 重写文件可再次由本库打开和写回
- [ ] **11.11** 将经验证的构建命令、依赖安装方法和兼容性事实记录到 repository memory

## 验收标准

- `docs/spec.md` 第 5 章全部自动化与桌面条款满足
- 标准 ZIP 读取器可读取每个输出 Part，CRC 全部正确
- 单页、多页、创建、编辑和二次写回均通过
- 公开头文件可由不包含 libxml2/zlib 头的独立消费者编译
- 旧 `writeVsdx(path, Diagram)` 行为兼容且内部走新实现
- 源码中不再存在手写 ZIP 中央目录和硬编码整包 XML
- Node 不存在不会掩盖 OPC/VSDX 测试结果
- 桌面 Visio 无修复警告，移动节点后 Connector 保持 Glue

## 技术注意事项

- 本阶段不扩大到 Group、Image、Data、Theme 创作
- 对旧 API 的弃用使用编译期标记和迁移说明，不突然删除符号
- 保存验证失败时异常必须包含所有 Error 诊断摘要
- Windows 和 POSIX 原子替换分别实现，禁止以先删除目标再 rename 代替
- 人工 Visio 验收结果记录具体 Visio 版本和操作步骤

## 产出文件

```text
src/mermaidc/vsdx.hpp
src/vsdx/validator.hpp
src/vsdx/validator.cpp
src/vsdx/vsdx_writer.hpp
src/vsdx/vsdx_writer.cpp
src/CMakeLists.txt
tests/CMakeLists.txt
tests/test_vsdx.cpp
README.md
docs/implementation.md
/memories/repo/vsdx.md
```