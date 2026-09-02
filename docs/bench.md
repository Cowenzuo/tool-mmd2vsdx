# mmd2vsdx 性能基线（M6 冒烟，2026 同机实测）

> 冒烟口径：本仓库 vitest（testapp）内计时；浏览器为 Playwright 1.61.1 / chromium-1228。
> 完整对比 C++ 基线需同机跑 gen_samples 计时（可后续补充），设计结论见
> docs/reference/ts-port-original/01-效率评估.md（瓶颈=Chromium 渲染，与语言无关）。

## 数据（实测）

| 场景 | 耗时 | 说明 |
|---|---|---|
| fixture 翻译+序列化（06-flowchart-2，真实母版打包） | ~51ms | 纯计算路径（不含浏览器） |
| convertText 首次（graph TB; A-->B，含浏览器冷启动+预热+渲染+打包） | ~1,005ms | 冷启动大头为 Chromium 拉起；常驻服务形态后续单图 < 渲染耗时 |
| 批量 convertDir（2 小图，同进程复用浏览器） | 全套 1.8s 内含两次渲染 | 串行、顺序=输入序 |

## 备注

- 运行时内存基线 Node ~40-80MB（设计文档预期），未做峰值专项。
- 数字仅用于回归趋势；如后续出现明显劣化（>2×）需调查。
