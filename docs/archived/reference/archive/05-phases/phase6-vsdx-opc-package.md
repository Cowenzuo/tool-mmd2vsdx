# Phase 6: VSDX OPC 包基础

> 状态: done (2026-08-03) | 预估: 中

## 目标

用系统 `libxml2 + zlib` 建立安全、可验证的 OPC 包层，替换当前错误的 ZIP/CRC 实现，并提供 Content Types 与 Relationships 的结构化读写能力。

## 前置条件

- [x] `docs/spec.md` v1.1.0 已定版
- [x] `docs/vsdx-format.md` 已完成
- [x] `docs/implementation.md` VSDX 技术方案已完成
- [x] 开发环境可由 CMake 找到 libxml2 与 zlib

## 任务清单

- [ ] **6.1** 集成系统依赖:
  - 使用 `find_package(LibXml2 CONFIG REQUIRED)`
  - 使用 `find_package(ZLIB CONFIG REQUIRED COMPONENTS shared)`
  - 链接 `LibXml2::LibXml2` 与 `ZLIB::ZLIB`
  - 缺失依赖时输出明确安装提示
- [ ] **6.2** 实现 `opc::PartUri`:
  - 规范化 `/` 分隔的 Part URI
  - Relationship Target 相对解析
  - 源 Part 与 `_rels/*.rels` URI 双向转换
  - 拒绝绝对路径、反斜杠、重复分隔、越界 `..` 和空 URI
- [ ] **6.3** 实现 `opc::ZipArchive` 与 `opc::Package` 基础读写:
  - 解析 EOCD、Central Directory 与 Local File Header
  - 支持 ZIP32 Store/Deflate，使用 zlib raw Inflate/Deflate
  - CRC 使用 zlib `crc32`
  - 拒绝加密、ZIP64、多磁盘、未知压缩方法和重叠条目
  - CRC 错误、重复条目和损坏 ZIP 明确报错
  - 保存原始 payload、Content Type 和 dirty 标记
  - 创建新 archive 并写入 Local Header、Central Directory 与 EOCD
- [ ] **6.4** 实现 `ContentTypes`:
  - 使用 libxml2 非网络模式解析与序列化
  - 解析 Default 与 Override
  - 根据 Part URI 查询 Content Type
  - 新增、更新和删除 Override
  - 检查无类型 Part 和指向不存在 Part 的 Override
- [ ] **6.5** 实现 `Relationships`:
  - 使用 libxml2 namespace-aware DOM
  - 解析包级与部件级 `.rels`
  - 按 source Part 分组
  - 按 ID、Type、Target 查询
  - 分配局部唯一 `rIdN`
  - 解析 Internal Target，保留但不访问 External Target
- [ ] **6.6** 实现包级安全限制:
  - 最大条目数
  - 单 Part 最大展开大小
  - 总展开大小
  - 危险 URI 与路径穿越拒绝
- [ ] **6.7** 创建 `test_opc_uri.cpp` 和 `test_opc_package.cpp`:
  - URI 正常与异常案例
  - 打开 `docs/min.vsdx` 并读取全部 17 个 Part
  - 读取当前坏 CRC fixture 时返回 `InvalidZip`
  - 新建包后由本库与独立 ZIP 读取器分别逐 Part 读取
  - Store/Deflate、截断、坏偏移、加密、ZIP64 与重复条目
  - Content Types 与 Relationship 往返
- [ ] **6.8** 移除 VSDX 新路径对手写 CRC/中央目录函数的调用，但暂时保留旧 Writer 兼容入口

## 验收标准

- `docs/min.vsdx` 的全部 Part 可读取，CRC 校验通过
- 新建测试包由本库和独立 ZIP 读取器再次打开，所有 payload 与 CRC 完整一致
- Internal Relationship Target 均规范化为现存 Part URI
- External Relationship 不触发网络或文件系统访问
- 绝对路径、`..` 越界、重复 Part 和坏 CRC 均产生明确错误
- OPC 层测试不启动 Node.js 或 Chromium

## 技术注意事项

- 不把 ZIP 条目解压到磁盘目录
- Part URI 使用 OPC URI 语义，不使用 `std::filesystem::path` 做包内路径归一化
- 未修改 Part 的“字节保真”指未压缩 payload；ZIP 时间戳、压缩数据和条目顺序允许变化
- libxml2 与 zlib 类型不得出现在公开 `mermaidc` 头文件中
- 保存先写临时文件，本阶段可先验证临时包；原子替换在 Phase 11 完成

## 产出文件

```text
CMakeLists.txt
src/CMakeLists.txt
src/opc/part_uri.hpp
src/opc/part_uri.cpp
src/opc/zip_archive.hpp
src/opc/zip_archive.cpp
src/opc/package.hpp
src/opc/package.cpp
src/opc/content_types.hpp
src/opc/content_types.cpp
src/opc/relationships.hpp
src/opc/relationships.cpp
tests/test_opc_uri.cpp
tests/test_opc_package.cpp
tests/CMakeLists.txt
```