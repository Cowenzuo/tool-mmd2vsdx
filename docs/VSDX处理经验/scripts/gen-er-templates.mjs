// 模板模块生成器：官方模板解压包 → source/common/masters/templates/<mod>.ts
// 用法：node docs/VSDX处理经验/scripts/gen-er-templates.mjs（在仓库根目录执行）
// ⚠ 已被通用脚本取代：docs/VSDX处理经验/scripts/gen-type-templates.mjs（支持多包合并与任意图型）。
//   本文件保留仅为 er.ts 头注释的历史引用；新包一律用通用脚本。
// 说明：
//  - 条目 = { masterType, contentXml }，contentXml 为官方 MasterContents 原文（verbatim）；
//  - NameU 为准；Name/Prompt（GBK 乱码）与 Icon 不携带；
//  - 本脚本对应 ER 的现行来源 er-all-in-one（5 枚）；class/sequence 的生成逻辑
//    见 docs/VSDX处理经验/scripts/gen-type-templates.mjs（class 需合并 class ∪ class-all-in-one）。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'docs/VSDX解压结构研究/标准研究模板-手动创建vsdx并解压/er-all-in-one';
const base = root;
const ms = readFileSync(join(base, 'visio/masters/masters.xml'), 'utf8');
const relsXml = readFileSync(join(base, 'visio/masters/_rels/masters.xml.rels'), 'utf8');
const relMap = new Map();
for (const m of relsXml.matchAll(/Id=['"]([^'"]+)['"][^>]*Target=['"]([^'"]+)['"]/g)) relMap.set(m[1], m[2]);
const out = {};
let guard = 0;
for (const m of ms.matchAll(/<Master\s([^>]*)>([\s\S]*?)<\/Master>/g)) {
  if (++guard > 64) break;
  const attrs = m[1];
  const nameU = /NameU=['"]([^'"]+)['"]/.exec(attrs)?.[1];
  const masterType = /MasterType=['"]([0-9]+)['"]/.exec(attrs)?.[1];
  const relId = /Rel[^>]*r:id=['"]([^'"]+)['"]/.exec(m[2])?.[1] ?? /Rel[^>]*id=['"]([^'"]+)['"]/.exec(m[2])?.[1];
  if (!nameU || !masterType || !relId) continue;
  const file = relMap.get(relId);
  if (!file) continue;
  const content = readFileSync(join(base, 'visio/masters', file), 'utf8');
  if (!content.includes('<MasterContents')) continue;
  out[nameU] = { masterType: Number(masterType), contentXml: content };
}
console.log('entries=', Object.keys(out).join(','));
const lines = [
  '// 本文件由 docs/VSDX处理经验/scripts/gen-er-templates.mjs 一次性生成（勿手改）。',
  '// 来源：docs/VSDX解压结构研究/标准研究模板-手动创建vsdx并解压/er-all-in-one/ 官方模板解压包（5 枚）；',
  '// 内容为母版 MasterContents 原文（verbatim），目录条目属性由 assets.ts buildRecord 合成；',
  '// NameU 为准；Name/Prompt（GBK 乱码）与 Icon 不携带。',
  '',
  'export interface TypeMasterEntry {',
  '    /** 官方目录条目 MasterType（34=成员行、29=消息、541/1=1-D 连接线、2=组）。 */',
  '    masterType: number;',
  '    /** MasterContents 原文。 */',
  '    contentXml: string;',
  '}',
  '',
  `export const kErTemplates: Record<string, TypeMasterEntry> = ${JSON.stringify(out, null, 4)};`,
  '',
];
writeFileSync('source/common/masters/templates/er.ts', lines.join('\n'), 'utf8');
console.log('[gen] source/common/masters/templates/er.ts done');
