// 母版组：装配服务——NameU 集 → masters 三件套（docs/开发过程/01-结构设计.md）
//
// 规则（规范版 5.4）：目录条目按 wanted 序重排、ID 从 100 起重写、
// Rel r:id 重写为目录内唯一（跨记录合并防冲突）、内容文件原样复制、
// rels 按保留的 rId→文件重建。
// 本包支持跨记录目录（如节点=basic_shape、连接线=flowchart）合并打包。

import { makeElement, serializeDocument, setAttribute, attr, elementChildren, parseDocument, type XmlNode } from '../xml/index.js';
import { kMasterContentType, kMastersContentType } from '../xml/constants.js';
import { part, type XmlPart } from '../../contracts/index.js';
import { findMasterEntry, type MasterCatalog, type StencilRecord } from './assets.js';

interface PackedMasters {
    parts: XmlPart[];
    /** NameU → 文档内母版 ID（渲染期 Master="N" 用）。 */
    masterIds: Map<string, number>;
}

function serializeRoot(root: XmlNode): string {
    return serializeDocument(root, {
        declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        indent: 0,
    });
}

export class MasterPacker {
    constructor(private readonly catalog: MasterCatalog | null) {}

    /** 兼容单记录调用：包装成目录。 */
    static fromRecord(record: StencilRecord | null): MasterPacker {
        return new MasterPacker(record ? { records: [record] } : null);
    }

    /** 按 wanted 序打包；ID 从 100 起连续；rId 重写为目录内唯一。 */
    pack(nameUs: string[]): PackedMasters {
        if (!this.catalog || this.catalog.records.length === 0) return { parts: [], masterIds: new Map() };
        const masterIds = new Map<string, number>();
        let nextId = 100;
        let nextRel = 1;
        // 按 wanted 序收集：每条目锁定来源记录；rId 重写（原 id 丢弃）
        const kept: Array<{ nameU: string; rec: StencilRecord; oldId: string; newId: string; fileName: string }> = [];
        for (const nameU of nameUs) {
            const entry = findMasterEntry(this.catalog.records[0]!, nameU) // 先查第一条（原语义）
                ?? this.catalog.records.slice(1).map((r) => findMasterEntry(r, nameU)).find((e) => e !== null) ?? null;
            if (!entry) continue;
            masterIds.set(nameU, nextId++);
            const newId = `rId${nextRel++}`;
            kept.push({ nameU, rec: entry.record ?? this.catalog.records[0]!, oldId: entry.relId, newId, fileName: entry.fileName });
        }
        if (kept.length === 0) return { parts: [], masterIds };

        // masters.xml：重排 + 重写 ID + 重写 Rel r:id（来源记录各自的目录条目）
        const mastersEl = makeElement('Masters');
        setAttribute(mastersEl, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
        setAttribute(mastersEl, 'xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        for (const k of kept) {
            const old = cloneEntry(k.rec, k.nameU);
            if (!old) continue;
            setAttribute(old, 'ID', String(masterIds.get(k.nameU)));
            rewriteRelId(old, k.oldId, k.newId);
            mastersEl.children.push(old);
        }

        // 内容文件 + 关系表
        const relsEl = makeElement('Relationships');
        setAttribute(relsEl, 'xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');
        const parts: XmlPart[] = [];
        for (const k of kept) {
            const content = k.rec.contents[k.fileName];
            if (content === undefined) continue;
            parts.push(part(`/visio/masters/${k.fileName}`, kMasterContentType, content));
            const rel = makeElement('Relationship');
            setAttribute(rel, 'Id', k.newId);
            setAttribute(rel, 'Type', 'http://schemas.microsoft.com/visio/2010/relationships/master');
            setAttribute(rel, 'Target', k.fileName);
            relsEl.children.push(rel);
        }
        if (parts.length === 0) return { parts: [], masterIds };
        parts.unshift(
            part('/visio/masters/masters.xml', kMastersContentType, serializeRoot(mastersEl)),
            part('/visio/masters/_rels/masters.xml.rels', 'application/vnd.openxmlformats-package.relationships+xml', serializeRoot(relsEl)),
        );
        return { parts, masterIds };
    }
}

/** 深拷贝目录条目节点（避免变动原记录）。 */
function cloneEntry(record: StencilRecord, nameU: string): XmlNode | null {
    const root = parseDocument(record.mastersXml);
    const src = elementChildren(root).find((m) => m.name === 'Master' && attr(m, 'NameU') === nameU);
    if (!src) return null;
    return deepClone(src) as XmlNode;
}

/** 重写条目内 Rel r:id（跨记录合并防冲突）。 */
function rewriteRelId(entry: XmlNode, oldId: string, newId: string): void {
    for (const child of elementChildren(entry)) {
        if (child.name !== 'Rel') continue;
        const id = attr(child, 'id') ?? attr(child, 'r:id') ?? '';
        if (id === oldId) {
            setAttribute(child, 'r:id', newId);
            setAttribute(child, 'id', newId);
        }
    }
}

function deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}
