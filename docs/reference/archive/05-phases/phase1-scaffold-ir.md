# Phase 1: 工程骨架 + IR 数据结构

> 状态: done (2026-08-03) | 预估: 小

## 目标

搭建 CMake 工程框架，定义全部 IR 数据结构（header-only）。

## 前置条件

- [x] 规格定版 (`docs/spec.md`)
- [x] 技术方案 (`docs/implementation.md`)

## 任务清单

- [ ] **1.1** 创建 `CMakeLists.txt`（顶层），C++17 标准，`mermaidc` 静态库目标
- [ ] **1.2** 创建 `src/mermaidc/ir.hpp`，定义全部 struct 和 enum:
  - `Point`, `Node`, `Edge`, `BoundingBox`, `Diagram`
  - `NodeShape`, `EdgeStyle`, `ArrowType` 枚举
  - `Error` 异常类
- [ ] **1.3** 创建 `src/CMakeLists.txt`，添加 `mermaidc` 库
- [ ] **1.4** 创建 `tests/CMakeLists.txt`，集成 doctest（FetchContent）
- [ ] **1.5** 创建 `tests/test_ir.cpp`，编译验证:
  - 各 struct 能编译通过
  - `BoundingBox::width()/height()` 计算正确
  - `Error` 异常能正常抛出和捕获
- [ ] **1.6** `cmake --build` 编译通过，测试通过

## 验收标准

- `cmake -B build && cmake --build build` 零错误零警告
- `ctest --test-dir build` 全部通过
- `#include "mermaidc/ir.hpp"` 可在独立 .cpp 中使用所有类型

## 技术注意事项

- `ir.hpp` 必须是 header-only，不引入任何依赖
- 使用 `#pragma once`
- `enum class` 统一风格
- 所有 struct 成员有默认值，支持 `= default` 构造
- `BoundingBox` 的 `width()/height()` 标记 `[[nodiscard]]`
- `Error` 继承 `std::runtime_error`，带 `Code` 枚举

## 产出文件

```
CMakeLists.txt
src/CMakeLists.txt
src/mermaidc/ir.hpp
tests/CMakeLists.txt
tests/test_ir.cpp
```
