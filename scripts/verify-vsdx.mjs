#!/usr/bin/env node
// verify-vsdx.mjs — 产出包结构校验（research 规范版条款断言）
// 用法：node scripts/verify-vsdx.mjs [vsdxDir]
// 断言条款（docs/research/通用visio结构分析.md）：
//   A 5.5.1/5.5.3.5 页目录关系表存在且 Target=pageN.xml（相对）
//   B 6.1.2/6.1.4 主文档关系表三向 masters/pages/windows；masters 区骨架存在
//   C 3.3/3.4 所有关系表 Target 相对路径（无前导斜杠）
//   D 6.4.3/6.4.4 document.xml：DocumentSettings 9 子元素；StyleSheets 0 号有 Cell
//   E 5.5.3.4 Connects ToPart=100+连接点行号（与 ToCell X n 对应）
//   F 5.4.3.3 Connection 段五行方向列（DirX/DirY 非恒零）
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../dist/opc/zip.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..', 'resources/test-examples/vsdx-output');
const files = readdirSync(dir).filter((f) => f.endsWith('.vsdx')).sort();

const failures = [];
const report = [];

function assert(cond, file, clause, msg) {
  if (!cond) {
    failures.push(`${file}: [${clause}] ${msg}`);
    report.push(`  ✗ [${clause}] ${msg}`);
  }
}

for (const f of files) {
  const failures0 = failures.length;
  const entries = readZip(readFileSync(path.join(dir, f)));
  const get = (n) => entries.find((e) => e.name === n);
  const text = (n) => get(n)?.data.toString('utf8') ?? '';
  const summary = [];

  // A 页目录关系表
  const pagesRels = get('visio/pages/_rels/pages.xml.rels');
  assert(!!pagesRels, f, 'A', '缺 pages.xml.rels（5.5.1/6.1.4 骨架）');
  if (pagesRels) {
    const rel = /<Relationship[^>]*Id="rId1"[^>]*Target="([^"]+)"/.exec(pagesRels.data.toString('utf8'));
    assert(!!rel, f, 'A', 'pages.xml.rels 无 rId1');
    if (rel) assert(!/^\//.test(rel[1]), f, 'A', `page Target 带前导斜杠：${rel[1]}`);
  }

  // B masters 骨架 + 主文档三向
  const docRels = text('visio/_rels/document.xml.rels');
  const hasMasterRel = /relationships\/masters/.test(docRels);
  assert(hasMasterRel, f, 'B', 'document.xml.rels 缺 masters 关系（6.1.2 三向）');
  assert(!!get('visio/masters/masters.xml'), f, 'B', '缺 masters 目录（6.1.4 两支目录）');
  assert(!!get('visio/masters/_rels/masters.xml.rels'), f, 'B', '缺 masters.xml.rels');
  const masterFiles = entries.filter((e) => /^visio\/masters\/master\d+\.xml$/.test(e.name));
  assert(masterFiles.length >= 1, f, 'B', '无 masterN.xml 内容文件');
  if (masterFiles.length >= 1 && hasMasterRel) {
    const target = /relationships\/masters" Target="([^"]+)"/.exec(docRels)?.[1];
    assert(!!target && /^masters\//.test(target), f, 'B', `masters 关系 Target 异常：${target}`);
  }

  // C 全部 .rels Target 相对
  for (const e of entries.filter((x) => x.name.endsWith('.rels'))) {
    const xml = e.data.toString('utf8');
    for (const m of xml.matchAll(/<Relationship[^>]*Target="([^"]+)"/g)) {
      assert(!/^\//.test(m[1]), f, 'C', `${e.name} Target 带前导斜杠：${m[1]}`);
    }
  }

  // D 样式基座
  const doc = text('visio/document.xml');
  assert(doc.length > 2000, f, 'D', `document.xml 过小（${doc.length}B），样式基座疑似空壳（6.4.3）`);
  const settingsCount = (doc.match(/<DocumentSettings[\s\S]*?<\/DocumentSettings>/) ?? [''])[0]
    ?.match(/<GlueSettings>|<SnapSettings>|<SnapExtensions>|<SnapAngles|<DynamicGridEnabled>|<ProtectStyles>|<ProtectShapes>|<ProtectMasters>|<ProtectBkgnds>/g)?.length ?? 0;
  assert(settingsCount >= 9, f, 'D', `DocumentSettings 子元素 ${settingsCount}/9（6.4.4）`);
  const styleSheets0 = /<StyleSheet ID="0"[^>]*>([\s\S]*?)<\/StyleSheet>/.exec(doc)?.[1] ?? '';
  assert(styleSheets0.includes('<Cell'), f, 'D', '0 号 No Style 空壳（6.4.3 默认基线）');

  // E Connects ToPart
  const page = text('visio/pages/page1.xml');
  let connIssue = 0;
  for (const m of page.matchAll(/<Connect[^>]*ToCell="([^"]+)"[^>]*ToPart="(\d+)"/g)) {
    const n = /X(\d+)/.exec(m[1])?.[1];
    if (n) {
      const expectPart = 100 + (Number(n) - 1);
      if (Number(m[2]) !== expectPart) connIssue++;
    }
  }
  assert(connIssue === 0, f, 'E', `${connIssue} 条 ToPart 与行号不符（5.5.3.4）`);

  // F Connection 方向列（research 5.4.3.3）
  // 页面无 Connection 段=母版继承形态（research 5.4.5），通过；有段则五行方向不得恒零。
  let dirIssue = 0;
  for (const sec of page.matchAll(/<Section N="Connection">([\s\S]*?)<\/Section>/g)) {
    const flags = [...sec[1].matchAll(/<Cell N="DirX" V="([-0-9.]+)"\/>\s*<Cell N="DirY" V="([-0-9.]+)"/g)];
    if (flags.length === 5 && flags.every((mm) => mm[1] === '0' && mm[2] === '0')) dirIssue++;
  }
  assert(dirIssue === 0, f, 'F', `${dirIssue} 个 Connection 段方向列恒零（5.4.3.3）`);

  const ok = failures.length === failures0;
  console.log(`${ok ? 'ok ' : 'BAD'} ${f}${summary.length ? ' ' + summary.join(' ') : ''}`);
}

console.log(`\n[verify-vsdx] ${files.length - failures.length}/${files.length} 通过研究条款断言`);
if (failures.length > 0) {
  console.log('失败明细：');
  for (const m of failures) console.log('  ' + m);
  process.exit(1);
}
