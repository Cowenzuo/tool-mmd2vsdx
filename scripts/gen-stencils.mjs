#!/usr/bin/env node
/**
 * gen-stencils.mjs — 官方模具 → TS 资产生成（对标 scripts/extract_stencil.py）。
 *
 * 读取 resources/visio/*.vssx|vstx（8 份官方模具），按 stencil 提取：
 *   visio/masters/masters.xml、visio/masters/_rels/masters.xml.rels、
 *   rels 引用的 masterN.xml、document.xml 中的 StyleSheets/Colors/FaceNames
 *   （包为 <VisioStyles> 根），每模具压缩为 gzip(base64(JSON)) 资产，写入
 *   src/vsdxdoc/masters/stencilData.ts。
 *
 * 说明：
 *   - 本脚本自包含（不含 ZIP 三方库）：内嵌轻量 zip 读取（EOCD+中央目录+
 *     inflateRawSync），与 src/opcpkg/zipArchive.ts 同源语义、仅服务读取；
 *   - 产物 stencilData.ts 提交仓库（开发资产）。分发红线现状（审核 P2-⑨）：
 *     package.json 为 private:true（npm 不分发），631KB 资产随 tsc 编入 dist；
 *     若将来转公开发布，须补 files 白名单 + 用户侧资产生成工具后，再宣称
 *     "官方模具不随包"——当前注释不预设该机制存在；
 *   - 用法：node scripts/gen-stencils.mjs [visio_dir] [out_ts]
 * 默认 visio_dir=resources/visio，out=src/vsdxdoc/masters/stencilData.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { gunzipSync, gzipSync, inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const visioDir = process.argv[2] ? path.resolve(process.argv[2])
    : path.join(root, 'resources', 'visio');
const outFile = process.argv[3] ? path.resolve(process.argv[3])
    : path.join(root, 'src', 'vsdxdoc', 'masters', 'stencilData.ts');

// ── 轻量 zip 读取（自包含；raw deflate） ──
function readZipEntries(buf) {
    if (buf.length < 22) throw new Error('zip too small');
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50 &&
            i + 22 + buf.readUInt16LE(i + 20) === buf.length) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('EOCD not found');
    const count = buf.readUInt16LE(eocd + 10);
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    const entries = [];
    let p = cdOffset;
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central sig');
        const method = buf.readUInt16LE(p + 10);
        const csize = buf.readUInt32LE(p + 20);
        const usize = buf.readUInt32LE(p + 24);
        const nlen = buf.readUInt16LE(p + 28);
        const elen = buf.readUInt16LE(p + 30);
        const clen = buf.readUInt16LE(p + 32);
        const localOff = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nlen);
        const lp = localOff;
        const lNlen = buf.readUInt16LE(lp + 26);
        const lElen = buf.readUInt16LE(lp + 28);
        const dataStart = lp + 30 + lNlen + lElen;
        const raw = buf.subarray(dataStart, dataStart + csize);
        let data;
        if (method === 0) data = Buffer.from(raw);
        else if (method === 8) data = inflateRawSync(raw);
        else throw new Error('unsupported method ' + method + ' for ' + name);
        if (data.length !== usize) throw new Error('size mismatch ' + name);
        entries.push({ name, data });
        p += 46 + nlen + elen + clen;
    }
    return entries;
}

// ── styles 提取（StyleSheets/Colors/FaceNames → <VisioStyles> 包装） ──
function extractStyles(documentXml) {
    const parts = [];
    for (const tag of ['StyleSheets', 'Colors', 'FaceNames']) {
        const m = new RegExp('<' + tag + '>.*?</' + tag + '>', 's').exec(documentXml);
        if (m) parts.push(m[0]);
    }
    if (parts.length === 0) return null;
    return '<VisioStyles>' + parts.join('') + '</VisioStyles>';
}

function gzipB64(text) {
    return gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64');
}

const files = readdirSync(visioDir).filter((f) => /\.(vssx|vstx)$/i.test(f)).sort();
if (files.length === 0) throw new Error('no stencils found in ' + visioDir);

const data = {};
for (const f of files) {
    const stencilName = f.replace(/\.(vssx|vstx)$/i, '');
    const buf = readFileSync(path.join(visioDir, f));
    const entries = readZipEntries(buf);
    const byName = new Map(entries.map((e) => [e.name, e.data.toString('utf8')]));
    const mastersXml = byName.get('visio/masters/masters.xml');
    if (!mastersXml) throw new Error(f + ': no visio/masters/masters.xml');

    const relsXml = byName.get('visio/masters/_rels/masters.xml.rels') ?? null;
    const contents = {};
    if (relsXml) {
        const relRe = /<Relationship[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g;
        const targetSet = new Set();
        let m;
        while ((m = relRe.exec(relsXml)) !== null) targetSet.add(m[2]);
        for (const target of targetSet) {
            const key = 'visio/masters/' + target;
            const xml = byName.get(key);
            if (xml !== undefined) contents[target] = xml;
        }
    }
    const stylesXml = byName.has('visio/document.xml')
        ? extractStyles(byName.get('visio/document.xml'))
        : null;
    const record = { mastersXml, contents };
    if (relsXml !== null) record.relsXml = relsXml;
    if (stylesXml !== null) record.stylesXml = stylesXml;
    data[stencilName] = gzipB64(JSON.stringify(record));
    console.log(`${f} → ${stencilName}: masters=${Object.keys(contents).length} files`);
}

mkdirSync(path.dirname(outFile), { recursive: true });
const json = JSON.stringify(data);
writeFileSync(outFile,
    '// 生成文件（scripts/gen-stencils.mjs）：8 份官方模具按 stencil 压缩资产。\n' +
    '// 分发红线（审核 P2-⑨）：package.json private:true（npm 不分发），资产随 tsc 编入 dist；\n' +
    '// 若转公开发布须补 files 白名单与用户侧资产生成工具后再移除本说明。\n' +
    '// key=stencil 名（basic_shape/flowchart/uml_class/...），value=gzip(base64(JSON{\n' +
    '//   mastersXml, relsXml?, contents:{fileName:xml}, stylesXml?}))。\n' +
    'export const STENCIL_DATA: Record<string, string> = ' + json + ';\n');
const total = Buffer.byteLength(json);
console.log(`written ${outFile} (${total} bytes, gzip 后 ${Math.round(total / 1024)} KB)`);
