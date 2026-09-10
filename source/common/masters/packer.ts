// 母版组：装配服务——NameU 集 → masters 三件套（docs/redesign/04-转义层/10-公用库）
//
// 规则（research 5.4）：目录条目按 wanted 序重排、ID 从 100 起重写、
// Rel r:id 保留原值、内容文件原样复制、rels 按保留的 rId→文件重建。

import { makeElement, serializeDocument, setAttribute, attr, elementChildren, parseDocument, type XmlNode } from '../../xml/index.js';
import { kMasterContentType, kMastersContentType } from '../../xml/constants.js';
import { part, type XmlPart } from '../../contracts/index.js';
import { findMasterEntry, type StencilRecord } from './assets.js';

export interface PackedMasters {
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
    constructor(private readonly record: StencilRecord | null) {}

    /** 按 wanted 序打包；ID 从 100 起连续。 */
    pack(nameUs: string[]): PackedMasters {
        if (!this.record) return { parts: [], masterIds: new Map() };
        const masterIds = new Map<string, number>();
        let nextId = 100;
        const kept: Array<{ nameU: string; relId: string; fileName: string }> = [];
        for (const nameU of nameUs) {
            const entry = findMasterEntry(this.record, nameU);
            if (!entry) continue;
            masterIds.set(nameU, nextId++);
            kept.push(entry);
        }
        if (kept.length === 0) return { parts: [], masterIds };

        // masters.xml：重排 + 重写 ID（保留原条目其余属性与子元素）
        const root = parseDocument(this.record.mastersXml);
        const mastersEl = makeElement('Masters');
        setAttribute(mastersEl, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
        setAttribute(mastersEl, 'xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        for (const k of kept) {
            const entry = findMasterEntry(this.record, k.nameU);
            if (!entry) continue;
            const old = cloneEntry(root, k.nameU);
            if (!old) continue;
            setAttribute(old, 'ID', String(masterIds.get(k.nameU)));
            mastersEl.children.push(old);
        }
        void attr;

        // 内容文件 + 关系表
        const relsEl = makeElement('Relationships');
        setAttribute(relsEl, 'xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');
        const parts: XmlPart[] = [];
        for (const k of kept) {
            const content = this.record.contents[k.fileName];
            if (content === undefined) continue;
            parts.push(part(`/visio/masters/${k.fileName}`, kMasterContentType, content));
            const rel = makeElement('Relationship');
            setAttribute(rel, 'Id', k.relId);
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
function cloneEntry(root: XmlNode, nameU: string): XmlNode | null {
    const src = elementChildren(root).find((m) => m.name === 'Master' && attr(m, 'NameU') === nameU);
    if (!src) return null;
    return deepClone(src) as XmlNode;
}

function deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}
