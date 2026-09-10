// 母版组：官方模具资产读取与缓存（docs/redesign/04-转义层/10-公用库）
//
// 资产来源：resources/visio-binary/stencil-data.json（本地生成资产，不入包），
// 格式：{ [内部名]: gzip(base64(JSON)) }，JSON = {mastersXml, contents, relsXml?, stylesXml?}。

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { attr, elementChildren, parseDocument } from '../../xml/index.js';

export interface StencilRecord {
    mastersXml: string;
    relsXml?: string;
    stylesXml?: string;
    contents: Record<string, string>;
}

export interface StencilMaster {
    nameU: string;
    /** 目录条目里的 Rel r:id。 */
    relId: string;
    /** 关系表目标文件名（masterN.xml）。 */
    fileName: string;
}

let cache: Record<string, unknown> | null = null;

/** 加载资产库文件（不存在时返回 null）。 */
export function loadAssetFile(): Record<string, unknown> | null {
    const p = 'resources/visio-binary/stencil-data.json';
    if (!existsSync(p)) return null;
    if (cache) return cache;
    cache = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    return cache;
}

/** 解出单个模具记录；资产缺失或解码失败返回 null。 */
export function loadStencilRecord(kind: string): StencilRecord | null {
    const file = loadAssetFile();
    if (!file) return null;
    const encoded = file[kind];
    if (typeof encoded !== 'string') return null;
    try {
        return JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')) as StencilRecord;
    } catch {
        return null;
    }
}

/** 按 NameU 找母版条目（目录条目 + 关系表落点）。 */
export function findMasterEntry(record: StencilRecord, nameU: string): StencilMaster | null {
    const rels = new Map<string, string>();
    if (record.relsXml) {
        const relRoot = parseDocument(record.relsXml);
        for (const el of elementChildren(relRoot)) {
            if (el.name === 'Relationship') {
                const id = attr(el, 'Id');
                const target = attr(el, 'Target');
                if (id && target) rels.set(id, target);
            }
        }
    }
    const root = parseDocument(record.mastersXml);
    for (const m of elementChildren(root)) {
        if (m.name !== 'Master') continue;
        if (attr(m, 'NameU') !== nameU) continue;
        for (const child of elementChildren(m)) {
            if (child.name !== 'Rel') continue;
            const relId = attr(child, 'id') ?? attr(child, 'r:id') ?? '';
            if (!relId) continue;
            const fileName = rels.get(relId) ?? '';
            if (!fileName) continue;
            return { nameU, relId, fileName };
        }
    }
    return null;
}
