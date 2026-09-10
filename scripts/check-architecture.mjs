#!/usr/bin/env node
// check-architecture.mjs — 新结构分层依赖守门（结构红线可执行化）
// 用法：node scripts/check-architecture.mjs（package.json: check:arch）
//
// 规则 = 分组白名单（与 docs/architecture/00-模块结构与边界.md §依赖规则 一致）：
//   - 组粒度：source/ 顶层一目录一组（convert 为编排入口组）；
//   - 同组互引一律放行；跨组边必须在白名单内；
//   - 白名单方向即架构方向：契约层只被依赖；common/xml/opc 为共用与基础；
//     diag-* 只允许依赖 契约+公用+基础；编排入口 convert 允许依赖一切（人不依赖 convert）；
//   - 测试文件（*.test.ts）走门面组合，不参与依赖红线。
// 维护：架构调整须同时更新本文件白名单与架构文档（先审后放行，勿静默扩权）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '..', 'source');

/** 依赖白名单（目标组 ← 源组；条目含义 = "源组允许依赖目标组"）。 */
const kAllowed = new Set([
    // 入口/编排（仅 convert；无人依赖 convert）
    'convert>contracts', 'convert>common', 'convert>xml', 'convert>opc', 'convert>parser',
    'convert>diag-common', 'convert>diag-pie', 'convert>diag-quadrant', 'convert>diag-git',
    'convert>diag-sequence', 'convert>diag-mindmap', 'convert>diag-c4', 'convert>diag-xy',
    'convert>diag-class', 'convert>diag-er', 'convert>diag-gantt',
    'convert>xml-parts', 'convert>squeeze',
    // 解析层：只进契约与公用
    'parser>contracts', 'parser>common',
    // 转义层各包：契约 + 公用 + 基础
    'diag-common>contracts', 'diag-common>common', 'diag-common>xml',
    'diag-pie>contracts', 'diag-pie>common', 'diag-pie>xml',
    'diag-quadrant>contracts', 'diag-quadrant>common', 'diag-quadrant>xml',
    'diag-git>contracts', 'diag-git>common', 'diag-git>xml',
    'diag-sequence>contracts', 'diag-sequence>common', 'diag-sequence>xml',
    'diag-mindmap>contracts', 'diag-mindmap>common', 'diag-mindmap>xml',
    'diag-class>contracts', 'diag-class>common', 'diag-class>xml',
    'diag-er>contracts', 'diag-er>common', 'diag-er>xml',
    'diag-gantt>contracts', 'diag-gantt>common', 'diag-gantt>xml',
    // 打包层
    'xml-parts>contracts', 'xml-parts>xml', 'xml-parts>opc',
    'squeeze>contracts', 'squeeze>opc',
    // 基础层
    'opc>xml',
    // 公用库（形状/母版/样式写手）：契约 + 基础
    'common>contracts', 'common>xml',
]);

function groupOf(p) {
    const r = path.relative(srcDir, p).replaceAll('\\', '/');
    const top = r.split('/')[0];
    if (top === undefined) throw new Error('unmapped: ' + r);
    return top.replace(/\.ts$/, '');
}

// ── 收集 source/**/*.ts（非测试）的相对 import 边 ──
const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) files.push(p);
    }
})(srcDir);

const violations = [];
let edgeCount = 0;
for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const from = groupOf(f);
    const imps = [...text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
    for (const imp of imps) {
        let target = path.resolve(path.dirname(f), imp);
        if (!fs.existsSync(target)) {
            const base = target.replace(/\.js$/, '');
            if (fs.existsSync(base + '.ts')) target = base + '.ts';
            else continue; // 资源/外部模块引用，不参与
        }
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
        const to = groupOf(target);
        if (from === to) continue; // 同组互引放行
        edgeCount++;
        const key = `${from}>${to}`;
        if (!kAllowed.has(key)) {
            violations.push(
                `${path.relative(srcDir, f).replaceAll('\\', '/')} -> ` +
                `${path.relative(srcDir, target).replaceAll('\\', '/')} (${key})`);
        }
    }
}

if (violations.length > 0) {
    console.error(`[check-architecture] FAIL: ${violations.length} 条越层/反向依赖：`);
    for (const v of violations) console.error('  ' + v);
    console.error('架构调整需先更新 scripts/check-architecture.mjs 白名单与 docs/architecture/。');
    process.exit(1);
}
console.log(`[check-architecture] ok: ${files.length} files, ${edgeCount} cross-group edges, 无越层/反向依赖`);
