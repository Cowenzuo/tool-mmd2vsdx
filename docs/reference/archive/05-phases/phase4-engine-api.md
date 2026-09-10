# Phase 4: Engine 编排 + 公共 API

> 状态: done (2026-08-03) | 预估: 中

## 目标

实现 Engine 编排层和 `mermaidc::parse()` 公共 API，串联全部组件。

## 前置条件

- [x] Phase 3 完成

## 任务清单

- [ ] **4.1** 创建 `src/engine.hpp` / `src/engine.cpp`:
  - Engine 持有 `NodeProcess` 实例
  - `parse(text)`:
    1. `process_.send(text)` → JSON string
    2. `jsonToDiagram(json)` → Diagram
    3. 异常时尝试重启进程并重试 1 次
- [ ] **4.2** 创建 `src/mermaidc/mermaidc.hpp`，公共 API:
  - `mermaidc::initialize()`:
    - 查找 node.exe（PATH → 常见路径）
    - 定位 glue.mjs（exe目录 → 环境变量）
    - 启动 NodeProcess + 预热（发一条空解析）
  - `mermaidc::parse(text)` → Diagram
  - `mermaidc::shutdown()` → 停止子进程
- [ ] **4.3** 全局单例 Engine（`.cpp` 内部 file-static）
- [ ] **4.4** 创建 `tests/test_engine.cpp` 集成测试:
  - 无参 parse → 默认测试文本
  - 中文标签测试
  - 子图测试（如果 mermaid 支持）
  - 错误文本测试（mermaid 语法错误 → Error）
  - 连续 10 次 parse 稳定性测试
- [ ] **4.5** 创建 `tests/test_api.cpp`，从外部调用 `mermaidc::parse()`:
  - 验证头文件可独立使用
  - 验证异常正确传播

## 验收标准

- `mermaidc::parse("graph TB; A-->B")` 返回含 2 节点 1 边的 Diagram
- 节点坐标不为 0（布局已计算）
- 中文标签正确（UTF-8）
- 语法错误文本 → 抛出 `Error(MermaidError)`
- Node.js 未安装 → `initialize()` 抛出 `Error(NodeNotFound)`
- `shutdown()` 后子进程已终止

## 技术注意事项

- Engine 单例线程安全: 第一期不加锁，文档注明"调用方负责串行化"
- `initialize()` 幂等性: 重复调用不重启进程
- `parse()` 中的 JSON 中间字符串: 用 `std::string` 接收，`nlohmann::json::parse` 原地解析
- 预热: 发送 `"graph TB; A-->B"` 并丢弃结果，目的让 Chromium 完成首次加载

## 产出文件

```
src/engine.hpp
src/engine.cpp
src/mermaidc/mermaidc.hpp
tests/test_engine.cpp
tests/test_api.cpp
```
