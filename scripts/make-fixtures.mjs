#!/usr/bin/env node
/**
 * make-fixtures.mjs — 用基线 mermaid-snapshot（HTTP 服务模式）为 16 个验收样本
 * 采集 snapshot JSON 快照，落盘 tests/fixtures/snapshot/<stem>.json。
 *
 * 用途：M0–M2（无浏览器依赖）离线测试的输入事实基准；M3 收编后与真实渲染对照。
 * 用法：node scripts/make-fixtures.mjs [--snapshot <snapshot.mjs 路径>] [--out <目录>]
 * 默认：snapshot = 源仓库 D:\_dev\mmd2vsdx\mermaid-snapshot\snapshot.mjs
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const SRC_REPO = 'D:\\_dev\\mmd2vsdx';
const DEFAULT_INPUT = path.join(SRC_REPO, 'resources', 'testio', 'input');
const DEFAULT_SNAPSHOT = path.join(SRC_REPO, 'mermaid-snapshot', 'snapshot.mjs');
const DEFAULT_OUT = path.join(repoRoot, 'tests', 'fixtures', 'snapshot');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const inputDir = arg('--input', DEFAULT_INPUT);
const snapshotPath = arg('--snapshot', DEFAULT_SNAPSHOT);
const outDir = arg('--out', DEFAULT_OUT);

if (!process.argv.includes('--input')) {
  console.log('input dir : ' + inputDir);
  console.log('snapshot  : ' + snapshotPath);
  console.log('out dir   : ' + outDir);
}

const files = readdirSync(inputDir)
  .filter((f) => f.toLowerCase().endsWith('.mmd'))
  .sort(); // 字典序，与 C++ FileScanner 一致

// ── 拉起 snapshot HTTP 服务（动态端口 + ready 行协议）──
const child = spawn(process.execPath, [snapshotPath, '--http', '--port', '0'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});

const ready = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('snapshot ready timeout')), 60000);
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const nl = buf.indexOf('\n');
    if (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      clearTimeout(timer);
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(new Error('bad ready line: ' + line));
      }
    }
  });
  child.on('exit', (code) => reject(new Error('snapshot exited early: ' + code)));
});

const port = ready.port;
console.log('snapshot ready on port ' + port);

let failures = 0;
mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const stem = f.replace(/\.mmd$/i, '');
  const text = readFileSync(path.join(inputDir, f), 'utf8');
  const res = await fetch(`http://127.0.0.1:${port}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const json = await res.json();
  if (json.status !== 'ok') {
    failures++;
    console.error(`FAIL ${f}: ${json.message || json.status}`);
    continue;
  }
  delete json.status; // 保留 {svg,nodes,edges,clusters,diagramType,direction,...}
  writeFileSync(path.join(outDir, stem + '.json'), JSON.stringify(json));
  console.log(`ok   ${f}  (${json.diagramType}, nodes=${json.nodes?.length ?? 0}, edges=${json.edges?.length ?? 0})`);
}

child.kill('SIGTERM');
await new Promise((r) => setTimeout(r, 500));

console.log(failures === 0
  ? `fixtures OK: ${files.length} 份写入 ${outDir}`
  : `fixtures PARTIAL: ${failures} 失败`);
process.exit(failures === 0 ? 0 : 1);
