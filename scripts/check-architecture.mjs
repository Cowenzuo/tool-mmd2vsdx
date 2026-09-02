#!/usr/bin/env node
// check-architecture.mjs — 分层依赖守门（结构红线可执行化）
// 用法：node scripts/check-architecture.mjs（package.json: check:arch）
//
// 规则 = 分层白名单矩阵（与 docs/architecture/00-模块结构与边界.md §一 一致）：
//   - 组粒度：cli / app / vsdxdoc 六子包(vxt|translate|docmodel|render|masters|serialize)
//     / mmdtransform / snapshot / opcpkg / xml / core；
//   - 同组互引一律放行；跨组边必须在白名单内；
//   - 白名单方向即架构方向：反向边（如 render→translate）与越层边（core 被依赖方
//     反向依赖业务层等）都会在这里被拦下（exit 1）。
// 维护：架构调整须同时更新本文件白名单与架构文档（先审后放行，勿静默扩权）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '..', 'src');

/** 依赖白名单（目标组 ← 源组；条目含义 = "源组允许依赖目标组"）。 */
const kAllowed = new Set([
    // 入口/编排
    'cli>app',
    'app>core', 'app>mmdtransform', 'app>opcpkg', 'app>vxt',
    // 业务层内部子包
    'translate>docmodel', 'translate>masters', 'translate>opcpkg',
    'translate>render', 'translate>serialize', 'translate>xml', 'translate>core',
    'docmodel>core', 'docmodel>masters', 'docmodel>opcpkg', 'docmodel>xml',
    'render>core', 'render>docmodel', 'render>masters', 'render>xml',
    'masters>core', 'masters>opcpkg', 'masters>xml',
    'serialize>core', 'serialize>docmodel', 'serialize>opcpkg', 'serialize>xml',
    'vxt>core', 'vxt>serialize', 'vxt>translate',
    // IR 与容器/基础
    'mmdtransform>core', 'mmdtransform>snapshot',
    'snapshot>core',
    'opcpkg>core', 'opcpkg>xml',
]);

function groupOf(p) {
    const r = path.relative(srcDir, p).replaceAll('\\', '/');
    if (r === 'cli.ts') return 'cli';
    if (r.startsWith('app/')) return 'app';
    if (r.startsWith('vsdxdoc/')) {
        const rest = r.slice('vsdxdoc/'.length);
        const i = rest.indexOf('/');
        return i < 0 ? 'vxt' : rest.slice(0, i);
    }
    const top = r.split('/')[0];
    if (top === undefined) throw new Error('unmapped: ' + r);
    return top;
}

// ── 收集 src/**/*.ts 的相对 import 边 ──
const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) files.push(p);
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
