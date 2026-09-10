// 模板模块生成器（通用）：官方模板解压包 → source/common/masters/templates/<mod>.ts
//
// 用法（仓库根目录执行）：
//   node docs/开发经验日志/scripts/gen-type-templates.mjs \
//     --packs <包目录> [<包目录> ...] \
//     --out source/common/masters/templates/<mod>.ts \
//     --export kXxxTemplates \
//     --label <图型名> \
//     [--interface TypeMasterEntry] \
//     [--desc <补充说明行>]
//
// 约定：
//  - 每个包目录需含 visio/masters/masters.xml + _rels/masters.xml.rels + masterN.xml
//    （与 docs/research/标准研究模板-手动创建vsdx并解压/* 一致）；
//  - 多包合并时**后面的包覆盖前面的同名母版**（class = class ∪ class-all-in-one：
//    先给旧包、后给 all-in-one，即 all-in-one 为准）；
//  - NameU 为准；Name/Prompt（GBK 乱码）与 Icon 不携带（与既有 6 枚模板同策）；
//  - contentXml 为官方 MasterContents 原文（verbatim），不重排不转义。
//
// 自测（应与现行模块逐字一致，仅文件头注释可能不同）：
//   node docs/开发经验日志/scripts/gen-type-templates.mjs \
//     --packs docs/research/标准研究模板-手动创建vsdx并解压/er-all-in-one \
//     --out temp/er-templates.ts --export kErTemplates --label ER
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv) {
  const out = { packs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--packs') { while (argv[i + 1] && !argv[i + 1].startsWith('--')) out.packs.push(argv[++i]); }
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--export') out.export = argv[++i];
    else if (a === '--label') out.label = argv[++i];
    else if (a === '--interface') out.iface = argv[++i];
    else if (a === '--desc') out.desc = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.packs.length || !args.out || !args.export) {
  console.error('用法：node docs/开发经验日志/scripts/gen-type-templates.mjs --packs <包...> --out <ts> --export <名字> --label <图型> [--interface <名字>] [--desc <说明>]');
  process.exit(2);
}
const iface = args.iface ?? 'TypeMasterEntry';
const out = {};
const seen = new Map(); // NameU → 来源包（用于覆盖提示）

for (const pack of args.packs) {
  const ms = readFileSync(join(pack, 'visio/masters/masters.xml'), 'utf8');
  const relsXml = readFileSync(join(pack, 'visio/masters/_rels/masters.xml.rels'), 'utf8');
  const relMap = new Map();
  for (const m of relsXml.matchAll(/Id=['"]([^'"]+)['"][^>]*Target=['"]([^'"]+)['"]/g)) relMap.set(m[1], m[2]);
  let guard = 0;
  for (const m of ms.matchAll(/<Master\s([^>]*)>([\s\S]*?)<\/Master>/g)) {
    if (++guard > 128) break;
    const attrs = m[1];
    const nameU = /NameU=['"]([^'"]+)['"]/.exec(attrs)?.[1];
    const masterType = /MasterType=['"]([0-9]+)['"]/.exec(attrs)?.[1];
    const relId = /Rel[^>]*r:id=['"]([^'"]+)['"]/.exec(m[2])?.[1] ?? /Rel[^>]*id=['"]([^'"]+)['"]/.exec(m[2])?.[1];
    if (!nameU || !masterType || !relId) continue;
    const file = relMap.get(relId);
    if (!file) continue;
    const content = readFileSync(join(pack, 'visio/masters', file), 'utf8');
    if (!content.includes('<MasterContents')) continue;
    if (seen.has(nameU)) console.log(`[override] ${nameU}: ${seen.get(nameU)} → ${pack}`);
    seen.set(nameU, pack);
    out[nameU] = { masterType: Number(masterType), contentXml: content };
  }
}

console.log(`entries(${Object.keys(out).length})=`, Object.keys(out).join(', '));
const header = [
  `// 本文件由 docs/开发经验日志/scripts/gen-type-templates.mjs 一次性生成（勿手改）。`,
  `// 来源：${args.packs.map((p) => p.replace(/^docs\/research\/标准研究模板-手动创建vsdx并解压\//, '') + '/').join(' ∪ ')}官方模板解压包（${Object.keys(out).length} 枚）；`,
  ...(args.desc ? [`// ${args.desc}`] : []),
  '// 内容为母版 MasterContents 原文（verbatim），目录条目属性由 assets.ts buildRecord 合成；',
  '// NameU 为准；Name/Prompt（GBK 乱码）与 Icon 不携带（与既有 6 枚模板同策）。',
  '',
  `export interface ${iface} {`,
  '    /** 官方目录条目 MasterType（34=成员行、29=消息、541/1=1-D 连接线、2=组）。 */',
  '    masterType: number;',
  '    /** MasterContents 原文。 */',
  '    contentXml: string;',
  '}',
  '',
  `export const ${args.export}: Record<string, ${iface}> = ${JSON.stringify(out, null, 4)};`,
  '',
];
writeFileSync(args.out, header.join('\n'), 'utf8');
console.log(`[gen] ${args.out} done（${args.label ?? ''}）`);
