# Phase 3: NodeProcess 子进程管理

> 状态: done (2026-08-03) | 预估: 中

## 目标

实现 Node.js 子进程的启动、stdin/stdout 通信、终止，Windows 平台优先。

## 前置条件

- [x] Phase 2 完成
- [x] 系统已安装 Node.js v22+
- [x] `js-glue/` 已 `npm install`，`glue.mjs` 可独立运行

## 任务清单

- [ ] **3.1** 创建 `src/node_process.hpp`，声明类接口
- [ ] **3.2** 创建 `src/node_process.cpp`，Windows 实现:
  - `start()`: `CreateProcessW` + 匿名管道 (`CreatePipe`)
    - 命令行: `node.exe "<glue.mjs路径>" --server`
    - 等待子进程 **stdout** 输出 ready 信号（首行 JSON `{"status":"ready"}`，超时 10 秒）
  - `send(text)`: `WriteFile` 到 stdin（`text + "\n"`），`ReadFile` 从 stdout 读到 `\n`
  - `isRunning()`: `WaitForSingleObject(procInfo.hProcess, 0)`
  - `stop()`: `TerminateProcess` + 关闭句柄
- [ ] **3.3** 错误处理:
  - Node.js 未安装 → `Error(NodeNotFound)`
  - glue.mjs 不存在 → `Error(...)`
  - 子进程启动超时 → `Error(SubprocessCrashed)`
  - 通信管道断开 → 自动重启 + 重试 1 次
- [ ] **3.4** 通信协议:
  - 写入: `mermaidText + "\n"`（单次发送）
  - 读取: 阻塞读一行 JSON（以 `\n` 结尾）
  - 行最大长度: 1MB（防止内存溢出）
- [ ] **3.5** 创建 `tests/test_node_process.cpp`:
  - 启动子进程测试
  - send/recv 简单文本往返测试
  - 子进程崩溃恢复测试
  - 超时测试

## 验收标准

- `start()` 成功启动 `node glue.mjs --server`，stdout 读到 `{"status":"ready"}`
- `send("graph TB; A-->B")` 返回有效 JSON
- 连续 10 次 send 无泄漏、无卡死
- 子进程手动 kill 后，下次 send 自动重启成功
- 资源释放: 进程退出后所有句柄关闭

## 技术注意事项

- RAII: 析构函数中 `stop()` 确保进程终止
- 管道缓冲区: Windows 匿名管道默认 4KB，大数据用循环读取
- 编码: 管道 API 使用 `char` 字节流，UTF-8 文本
- 安全: `CreateProcessW` 不继承不需要的句柄
- `glue.mjs` 路径: 相对于可执行文件，或通过 `MERMAIDC_GLUE_PATH` 环境变量
- 阻塞读取: 使用 `OVERLAPPED` + `WaitForSingleObject` 支持超时

## 产出文件

```
src/node_process.hpp
src/node_process.cpp
tests/test_node_process.cpp
```
