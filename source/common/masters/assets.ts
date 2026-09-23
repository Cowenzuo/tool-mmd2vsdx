// 母版组：资产目录构建——模板函数直接返回 XML 文本（docs/开发过程/01-结构设计.md）
//
// 不再依赖 vssx/stencil-data.json：6 枚我们用到的母版（节点 5 种 + 连接线）
// 原文固化在 templates.ts（从官方模具提取物一次性生成，与 docs/VSDX解压结构研究 素材
// 逐字一致），构建函数按 NameU 返回 StencilRecord 结构（mastersXml/contents/
// relsXml），其中 ID/NameU/文件名由构建期填充。

import { kMasterTemplates, type MasterTemplateSet } from './templates.js';
import { kClassTemplates, type TypeMasterEntry } from './templates/class.js';
import { kErTemplates } from './templates/er.js';
import { kSequenceTemplates } from './templates/sequence.js';

export interface StencilRecord {
    mastersXml: string;
    relsXml?: string;
    stylesXml?: string;
    contents: Record<string, string>;
}

interface StencilMaster {
    nameU: string;
    /** 目录条目里的 Rel r:id。 */
    relId: string;
    /** 关系表目标文件名（masterN.xml）。 */
    fileName: string;
    /** 该条目来自哪个记录（跨记录目录用）。 */
    record?: StencilRecord;
}

/** 多记录目录：按序查找 NameU（如节点=basic_shape、连接线=flowchart）。 */
export interface MasterCatalog {
    /** 记录的查找顺序（先到先得）。 */
    records: StencilRecord[];
}

/** 按 NameU 找母版条目（目录条目 + 关系表落点）。 */
export function findMasterEntry(record: StencilRecord, nameU: string): StencilMaster | null {
    const rels = parseRels(record.relsXml ?? '');
    const root = record.mastersXml;
    for (const m of root.matchAll(/<Master\s([^>]*)>([\s\S]*?)<\/Master>/g)) {
        const entryAttrs = m[1]!;
        if (!new RegExp(`NameU="?${escapeRe(nameU)}"?`).test(entryAttrs)) continue;
        const relId = /Rel[^>]*r:id="([^"]+)"/.exec(m[2]!)?.[1] ?? /Rel[^>]*id="([^"]+)"/.exec(m[2]!)?.[1];
        if (!relId) continue;
        const fileName = rels.get(relId) ?? '';
        if (!fileName) continue;
        return { nameU, relId, fileName, record };
    }
    return null;
}
/** 构建默认目录：节点记录（basic 家族 5 种）+ 连接线记录（flowchart 家族 1 种）
 *  + 专用图型类型记录（class/ER/sequence，取自官方模板解压包 verbatim，
 *  见 templates/ 下的生成模块；文件序号防撞：1/50/100/150/250）。 */
export function buildMasterCatalog(): MasterCatalog | null {
    const nodeRec = buildRecord(filterNodes(kMasterTemplates), kMasterTemplates.bsRelsXml, 1);
    const connRec = buildRecord(filterConnector(kMasterTemplates), kMasterTemplates.fcRelsXml, 50);
    const classRec = buildRecord(kClassTemplates, '', 100);
    const erRec = buildRecord(kErTemplates, '', 150);
    const seqRec = buildRecord(kSequenceTemplates, '', 250);
    const records = [nodeRec, connRec, classRec, erRec, seqRec].filter((r): r is StencilRecord => r !== null);
    return records.length === 0 ? null : { records };
}

/** 过滤出节点模板（5 种 basic 家族，不含连接线；MasterType=2）。 */
function filterNodes(t: MasterTemplateSet): Record<string, TypeMasterEntry> {
    const out: Record<string, TypeMasterEntry> = {};
    for (const [name, e] of Object.entries(t.entries)) {
        if (name === 'Dynamic connector') continue;
        out[name] = { masterType: 2, contentXml: e.contentXml };
    }
    return out;
}

/** 由模板构造一个 StencilRecord（ID 从 100 起、NameU 原样、文件名 masterN.xml 连续、
 *  rId 连续——目录条目由本函数构建，不沿用原始 rId/文件名）。
 *  @param startIndex 内容文件名起始序号（跨记录目录防撞名：连接线记录从 50 起）。 */
export function buildRecord(
    entries: Record<string, TypeMasterEntry>,
    _relsHead?: string,
    startIndex = 1,
): StencilRecord | null {
    const names = Object.keys(entries);
    if (names.length === 0) return null;
    const masters: string[] = [];
    const rels: string[] = [];
    const contents: Record<string, string> = {};
    let id = 100;
    let relIndex = 1;
    let fileIndex = startIndex;
    for (const name of names) {
        const e = entries[name]!;
        const masterType = e.masterType ?? 2;
        const fileName = `master${fileIndex++}.xml`;
        const relId = `rId${relIndex++}`;
        const entry = `<Master ID="${id}" NameU="${escapeXml(name)}" IsCustomNameU="1" Name="${escapeXml(name)}" IsCustomName="1" BaseID="{F7290A45-E3AD-11D2-AE4F-006008C9F5A9}" PatternFlags="0" Hidden="0" MasterType="${masterType}"><PageSheet LineStyle="0" FillStyle="0" TextStyle="0"><Cell N="PageWidth" V="3.937007874015748" U="MM"/><Cell N="PageHeight" V="3.937007874015748" U="MM"/><Cell N="PageScale" V="0.03937007874015748" U="MM"/><Cell N="DrawingScale" V="0.03937007874015748" U="MM"/></PageSheet><Rel r:id="${relId}"/></Master>`;
        masters.push(entry);
        contents[fileName] = e.contentXml;
        rels.push(`<Relationship Id="${relId}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="${fileName}"/>`);
    }
    const mastersXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Masters xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">` +
        masters.join('') + `</Masters>`;
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
    return { mastersXml, relsXml, contents };
}

function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 过滤出连接线模板（Dynamic connector 单枚；MasterType=541）。 */
function filterConnector(t: MasterTemplateSet): Record<string, TypeMasterEntry> {
    const out: Record<string, TypeMasterEntry> = {};
    const e = t.entries['Dynamic connector'];
    if (e) out['Dynamic connector'] = { masterType: 541, contentXml: e.contentXml };
    return out;
}

function parseRels(relsXml: string): Map<string, string> {
    const rels = new Map<string, string>();
    for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
        rels.set(m[1]!, m[2]!);
    }
    return rels;
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
