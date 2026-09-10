# 使用指南（构建 / 库调用 / 批量转换 / 校验）

> 适用于当前仓库（private 包，未发 npm）。实现为 `source/` 分层管线：
> Parser（Chromium + mermaid）→ 契约 A → diag-* 各图型包 → 契约 B →
> PartsAssembler → Squeeze → .vsdx。旧实现（application/CLI/serve）已移除。

## 〇、构建与首次准备

```bash
npm install                 # 装依赖（mermaid + playwright）
npx playwright install chromium   # 首次必做：渲染需 Chromium
npm run build               # 产出 dist/（tsc + dist/parser/ext/*.mjs 复制）
# 门禁自检
npm run typecheck && npm test && npm run check:arch
```

- `dist/` 自包含（Node ≥22.2；同目录需含 node_modules 的 playwright/mermaid）；
- 运行期 Chromium 首次 launch 约 1s，之后串行复用约 100ms/图；
- **母版资产**（`resources/visio-binary/stencil-data.json`，官方模具提取物）仅本地开发用，
  提供时产物带母版区与形状引用；缺失时自动降级（自足式，骨架简化）。
  模具原件与提取物不随分发（合规红线，见 `docs/research/README` 与
  `resources/visio-binary/` 约定）。

## 一、库调用（管道四步）

```ts
import { Parser } from 'mmd2vsdx/dist/parser/index.js';
import { renderContract } from 'mmd2vsdx/dist/convert.js';
import { PartsAssembler } from 'mmd2vsdx/dist/xml-parts/index.js';
import { Squeeze } from 'mmd2vsdx/dist/squeeze/index.js';

const parser = new Parser();
try {
  const a = await parser.convertText('flowchart LR\n  A-->B');  // 契约 A（图型 json）
  const b = renderContract(a);                                  // 契约 B（部件清单）
  const pack = new PartsAssembler().assemble(b.parts);          // 完整包
  const bytes = new Squeeze().pack(pack);                       // .vsdx 字节
  // bytes 落盘或转 base64
} finally {
  await parser.shutdown();   // 长驻进程用完必调：关 Chromium
}
```

错误模型：`convertText` 失败抛 `MermaidParseError`；各步参数类错误抛
`TypeError/RangeError`。单测与批量脚本是调用范例（`source/golden.test.ts`、
`scripts/batch-convert.mjs`）。

## 二、批量转换

```bash
node scripts/batch-convert.mjs [inputDir] [outputDir] [reportPath]
# 缺省：resources/test-examples/mmd-input → resources/test-examples/vsdx-output
# 逐文件容错；产出 _report.json（{okCount,total,results:[{file,status,ms,size,kind}]}）；
# 有任何失败 exit 1
```

## 三、产物校验（研究条款门禁）

```bash
node scripts/verify-vsdx.mjs [vsdxDir]
# 对每个产物逐条断言 docs/research 规范版条款：
# A 页目录关系表 + B 主文档三向与母版骨架 + C 关系表 Target 相对 +
# D 样式基座（DocumentSettings 9 子元素/0 号样式有 Cell）+
# E Connects ToPart=100+行号 + F Connection 方向列；任何条款违反 exit 1
```

## 四、与图型的关系

| 图型 | 提取 | 转义包 |
| --- | --- | --- |
| flowchart/block/state/timeline/c4/xy | SVG 通用 或 DB（c4/xy） | diag-common |
| pie/quadrant/git/sequence/mindmap/class/er | DB 语义（gantt 文本直解） | diag-pie/quadrant/git/sequence/mindmap/class/er/gantt |

已实现图型清单见 `source/convert.ts` 的 `kImplementedKinds`。
