# Phase 7: VSDX 文档与页面

> 状态: done (2026-08-03) | 预估: 中

## 目标

在 OPC 层之上建立 VSDX 文档模型、命名空间感知 XML 访问、最小新建包和可靠多页写入，不包含节点与连接线细节。

## 前置条件

- [x] Phase 6 完成

## 任务清单

- [ ] **7.1** 实现 `XmlPart`:
  - 原始 payload 按需解析为 libxml2 tree
  - 使用 `xmlReadMemory` 非网络模式保留注释和 Processing Instruction
  - 使用 `xmlSaveToBuffer` 序列化 UTF-8
  - 首次修改时标记 dirty
  - UTF-8 序列化回 payload
- [ ] **7.2** 实现命名空间 helper:
  - local name 与 `xmlNs` URI 匹配
  - in-scope namespace 查找或创建
  - namespace URI + local name 匹配
  - 创建节点时复用原文档前缀
  - 支持 `2012/main` 与 `2011/1/core`
- [ ] **7.3** 创建 `VsdxDocument` 内部模型:
  - move-only PIMPL
  - 持有 `OpcPackage`
  - Document/Pages/Page Relationship 索引
  - Page ID 和 Relationship ID 分配器
  - Page 顺序与名称索引
- [ ] **7.4** 结构化创建最小文档部件:
  - 根 Relationships
  - app/core/custom 属性
  - `visio/document.xml` 最小 DocumentSettings 与 StyleSheets
  - `document.xml.rels`
  - `pages.xml` 与 `pages.xml.rels`
  - 不创建 Master、Theme 和 Thumbnail
- [ ] **7.5** 实现多页管理:
  - 新增、查询、重命名、删除 Page
  - Page ID 从当前最大值递增
  - 页面名称稳定消歧
  - Page Part、Relationship 和 Content Type 同步增删
  - 零页面保存明确失败
- [ ] **7.6** 实现 `CoordinateTransform`:
  - 96 px/in
  - 显式 outputScale
  - bounds 归一化
  - Y 轴翻转
  - 四边独立边距
  - PageWidth/PageHeight 计算
- [ ] **7.7** 实现统一 `NumberFormatter`:
  - classic locale
  - `max_digits10`
  - 禁止 NaN/Infinity
  - 避免 `-0`
- [ ] **7.8** 创建 `test_vsdx_document.cpp`:
  - 单页与三页包
  - 页面名称和顺序
  - Unicode 名称和重名消歧
  - Page/Relationship/Content Type 同步
  - 坐标与页面尺寸
  - 零页面失败

## 验收标准

- 可创建包含 1 页和 3 页空 PageContents 的有效 VSDX
- 页面数量、顺序、ID、名称、Relationship 和 Part 数量完全一致
- 新建包不包含 Masters 或 Theme Relationship
- `DocumentSettings.TopPage` 指向首个页面
- 坐标转换对非零 bounds、负坐标和显式 scale 均正确
- 系统区域设置不会把 XML 数值写成小数逗号
- 全部测试不依赖 Node.js

## 技术注意事项

- Page Part URI 使用稳定 `visio/pages/pageN.xml`，但读取已有文件时仍按 Relationship 定位
- 禁用 libxml2 网络访问和外部实体展开，不使用进程级可变实体加载回调
- 新建 XML 的元素顺序遵守 Visio Schema
- 本阶段允许空页面，但 Document 保存时至少存在一个页面
- Page 删除后不复用旧 ID，避免引用混淆

## 产出文件

```text
src/mermaidc/vsdx.hpp
src/vsdx/document.cpp
src/vsdx/xml_names.hpp
src/vsdx/xml_part.hpp
src/vsdx/xml_part.cpp
src/vsdx/coordinate_transform.hpp
src/vsdx/coordinate_transform.cpp
tests/test_vsdx_document.cpp
tests/CMakeLists.txt
```