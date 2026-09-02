#!/usr/bin/env node
// batch-convert.mjs — 批量转换目录（逐文件容错，输出报告）
// 用法：node scripts/batch-convert.mjs <inputDir> <outputDir> [reportPath]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { application } from '../dist/app/application.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inputDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'resources', 'testio', 'input');
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'temp', 'output');
const reportPath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(outDir, '_report.json');

const files = readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith('.mmd')).sort();
mkdirSync(outDir, { recursive: true });

const results = [];
let okCount = 0;
const started = Date.now();
for (const f of files) {
  const stem = f.replace(/\.mmd$/i, '');
  const target = path.join(outDir, stem + '.vsdx');
  const t0 = Date.now();
  try {
    const r = await application.convertText(readFileSync(path.join(inputDir, f), 'utf8'));
    if (!r.ok) {
      results.push({ file: f, status: 'error', message: r.error, ms: Date.now() - t0 });
      console.log(`ERR  ${f}: ${r.error.slice(0, 200)}`);
      continue;
    }
    writeFileSync(target, Buffer.from(r.vsdxBase64, 'base64'));
    okCount++;
    results.push({ file: f, status: 'ok', ms: Date.now() - t0, size: Buffer.byteLength(r.vsdxBase64) });
    if (okCount % 25 === 0 || okCount === files.length) {
      console.log(`progress ${okCount}/${files.length} (${Date.now() - started}ms)`);
    }
  } catch (e) {
    results.push({ file: f, status: 'throw', message: (e && e.message) || String(e), ms: Date.now() - t0 });
    console.log(`FAIL ${f}: ${(e && e.message) || e}`);
  }
}
await application.shutdown();
const totalMs = Date.now() - started;
writeFileSync(reportPath, JSON.stringify({ total: files.length, ok: okCount, failed: files.length - okCount, totalMs, results }, null, 2));
console.log(`done: ${okCount}/${files.length} ok in ${totalMs}ms -> ${outDir}`);
