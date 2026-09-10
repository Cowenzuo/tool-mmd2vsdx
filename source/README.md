# source —— 当前实现根目录

> 本目录是重做后的实现，结构设计见 `docs/开发过程/01-结构设计.md`，
> 实测现状见 `docs/开发过程/02-现状.md`（旧 `src/` 已移除，历史随 git 保留）。
> 文档只讲设计与约定，文件级细节以本目录的代码为准。

## 模块（按流水线分层）

1. `contracts/` 契约层（L0）：契约 A、契约 B 的纯类型与校验；
2. `common/xml/` 与 `opc/` 底层（L1）：XML 树与序列化、OPC/ZIP 容器；
3. `common/` 公用库（L2）：几何、单元格、公式、文本、样式、母版、端口；
4. `parser/` 解析层（L3）：mermaid 文本到契约 A（Chromium 加提取脚本组）；
5. `diag/` 图型包（L4）：四个平级单文件 `common.ts`、`class.ts`、`er.ts`、
   `sequence.ts`，契约 A 到契约 B；
6. `xml-parts/` 与 `squeeze/` 打包层（L5）：契约 B 到 .vsdx；
7. `convert.ts` 编排层（L6）：按 `kind` 分派到图型包。

验收唯一标尺 = `docs/VSDX解压结构研究/` 的准则：`tests/spec.test.ts`（9 个样本逐条断言）。

## 约定

- 分层与依赖白名单见 `docs/开发过程/01-结构设计.md` 与
  `docs/AI开发约定/项目特定规范.md`，跨层边加不进去；
- 对外模块给 `index.ts` 门面，`diag/` 是四个平级单文件、无门面；
- 测试集中在根 `tests/`，与源码分离；
- 构建：根 `tsconfig.build.json` 编 `source/`，`npm run build` 内联复制
  `parser/ext/*.mjs` 到 `dist/`。
