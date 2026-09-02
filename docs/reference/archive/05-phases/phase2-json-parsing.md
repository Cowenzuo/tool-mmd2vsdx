# Phase 2: JSON 反序列化

> 状态: done (2026-08-03) | 预估: 小

## 目标

集成 nlohmann/json，实现 JSON → IR 的反序列化映射。

## 前置条件

- [x] Phase 1 完成

## 任务清单

- [ ] **2.1** CMake 集成 nlohmann/json（FetchContent）
- [ ] **2.2** 在 `src/json_parser.cpp` / `src/json_parser.hpp` 中实现:
  - `jsonToDiagram(json)` 顶层函数
  - `jsonToNode(json)` / `jsonToEdge(json)` 辅助函数
  - `mapShape(string)`, `mapEdgeStyle(string)`, `mapArrowType(string)` 映射函数
- [ ] **2.3** 创建 `tests/test_json.cpp`，准备多组 JSON 样本测试:
  - 正常单节点
  - 正常多节点 + 多边
  - 空标签
  - 缺失字段（fallback 默认值）
  - error 状态的 JSON
  - 所有 shape 枚举值
  - 所有 edge style 枚举值
- [ ] **2.4** `cmake --build` 编译通过，所有测试通过

## 验收标准

- 有效 JSON → 正确 `Diagram` 对象，所有字段与输入一致
- `status: "error"` 的 JSON → 抛出 `Error(MermaidError, ...)`
- 缺失可选字段 → 使用默认值，不抛异常
- 所有 5 种 `NodeShape` 正确映射
- 所有 3 种 `EdgeStyle` 正确映射
- 所有 3 种 `ArrowType` 正确映射

## 技术注意事项

- 使用 `nlohmann::json::parse()` 解析，捕获 `nlohmann::json::parse_error`
- 映射表用 `const std::unordered_map<std::string, EnumType>` (O(1) 查找)
- 未知枚举值 → fallback 默认值（不抛异常，保持鲁棒）
- JSON 节点/边数组为空 → 返回空 Diagram，不报错

## 产出文件

```
src/json_parser.hpp
src/json_parser.cpp
tests/test_json.cpp
```
