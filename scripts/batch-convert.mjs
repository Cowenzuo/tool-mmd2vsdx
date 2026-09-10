#!/usr/bin/env node
// batch-convert.mjs — 新管线批量转换目录（逐文件容错，输出报告）
// 用法：node scripts/batch-convert.mjs <inputDir> <outputDir> [reportPath]
// 新管线：Parser（契约A）→ renderContract（契约B）→ PartsAssembler → Squeeze → .vsdx
// 运行时依赖：dist/ 的构建产物（npm run build 先行）与 Playwright Chromium。
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from '../dist/parser/index.js';
import { renderContract } from '../dist/convert.js';
import { PartsAssembler } from '../dist/xml-parts/index.js';
import { Squeeze } from '../dist/squeeze/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inputDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'resources', 'test-examples', 'mmd-input');
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'resources', 'test-examples', 'vsdx-output');
const reportPath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(outDir, '_report.json');

const files = readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith('.mmd')).sort();
mkdirSync(outDir, { recursive: true });

const results = [];
let okCount = 0;
const started = Date.now();
const parser = new Parser();
try {
  for (const f of files) {
    const stem = f.replace(/\.mmd$/i, '');
    const target = path.join(outDir, stem + '.vsdx');
    const t0 = Date.now();
    try {
      const a = await parser.convertText(readFileSync(path.join(inputDir, f), 'utf8'));
      const b = renderContract(a);
      const pack = new PartsAssembler().assemble(b.parts);
      const bytes = new Squeeze().pack(pack);
      writeFileSync(target, bytes);
      okCount++;
      results.push({ file: f, status: 'ok', ms: Date.now() - t0, size: bytes.length, kind: a.kind });
      if (okCount % 8 === 0 || okCount === files.length) {
        console.log(`progress ${okCount}/${files.length} (${Date.now() - started}ms)`);
      }
    } catch (e) {
      results.push({ file: f, status: 'throw', message: (e && e.message) || String(e), ms: Date.now() - t0 });
      console.log(`FAIL ${f}: ${(e && e.message) || e}`);
    }
  }
} finally {
  await parser.shutdown();
}

writeFileSync(reportPath, JSON.stringify({ startedAt: new Date().toISOString(), durationMs: Date.now() - started, okCount, total: files.length, results }, null, 2));
const fails = results.filter((r) => r.status !== 'ok');
console.log(`\n[convert] ${okCount}/${files.length} 成功${fails.length ? `，失败 ${fails.length}：` + fails.map((r) => r.file).join(', ') : ''}；报告 ${reportPath}`);
process.exit(fails.length > 0 ? 1 : 0);
