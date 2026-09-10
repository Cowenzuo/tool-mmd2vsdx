// mmd2vsdx - vsdxdoc/serialize：xmlPartsBuilder（DocumentCore → XmlParts）
//
// C++ serialize/xmlpartsbuilder.cpp 平移（坑位 ⑩-10.1/10.5）。
// 流程照抄：无页面抛错 → needsRecalculation → ensureRecalcDocument（custom.xml
// 的 RecalcDocument=true；缺 property 时 pid=现有最大+1）→ flush 脏部件
// （documentRoot/pagesRoot/dirtyPages 重序列化回包）→ pagesRelsDirty 同步 →
// package.validate() → 全部部件 payload 提取为 XmlParts（CT 由 opcpkg 生成，
// 不在 XmlParts 内；*.rels 部件存于 parts_，随包）。
//
// TS 差异：页面关系部件在 addPage 路径即时写包（addPart 后 setRelationships），
// pagesRelsDirty 仅作同步标记；此处按 C++ 顺序在 flush 后清标记。

import { parseDocument, serializeDocument } from '../../xml/xmlNode.js';
import type { XmlNode } from '../../xml/xmlNode.js';
import { PartUri } from '../../opcpkg/partUri.js';
import { kCustomUri } from '../../xml/constants.js';
import type { XmlParts } from '../../core/xmlparts.js';
import { defaultXmlParts } from '../../core/xmlparts.js';
import type { DocumentCore } from '../docmodel/documentCore.js';

const kVisioFmtId = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';

/** 确保 custom.xml 的 RecalcDocument=true（Visio 重算连接，坑位 ⑩-10.5）。 */
function ensureRecalcDocument(core: DocumentCore): void {
    const customUri = PartUri.parse(kCustomUri);
    if (!core.package.contains(customUri)) return;

    const text = core.package.part(customUri).payload.toString('utf8');
    const root = parseDocument(text, kCustomUri);

    let recalc: XmlNode | null = null;
    for (const child of root.children) {
        if (typeof child === 'string') continue;
        if (child.name === 'property') {
            const name = child.attrs.find((a) => a.name === 'name')?.value;
            if (name === 'RecalcDocument') {
                recalc = child;
                break;
            }
        }
    }

    const boolNode: XmlNode = { name: 'vt:bool', attrs: [], children: ['true'] };
    if (recalc) {
        const idx = recalc.children.findIndex(
            (c) => typeof c !== 'string' && c.name === 'vt:bool');
        if (idx >= 0) recalc.children[idx] = boolNode;
        else recalc.children.push(boolNode);
    } else {
        let nextPid = 0;
        for (const child of root.children) {
            if (typeof child === 'string' || child.name !== 'property') continue;
            const pidValue = child.attrs.find((a) => a.name === 'pid')?.value ?? '0';
            const pid = Number(pidValue);
            if (Number.isFinite(pid) && pid > nextPid) nextPid = pid;
        }
        recalc = { name: 'property', attrs: [], children: [] };
        recalc.attrs.push({ name: 'fmtid', value: kVisioFmtId });
        recalc.attrs.push({ name: 'pid', value: String(nextPid + 1) });
        recalc.attrs.push({ name: 'name', value: 'RecalcDocument' });
        recalc.children.push(boolNode);
        root.children.push(recalc);
    }
    core.package.part(customUri).payload = Buffer.from(serializeDocument(root), 'utf8');
}

/** 将脏 XML 部件刷回 package（documentRoot/pagesRoot/dirtyPages）。 */
function flushXmlParts(core: DocumentCore): void {
    if (core.documentXmlDirty) {
        if (core.documentRoot) {
            core.package.part(core.documentUri).payload =
                Buffer.from(serializeDocument(core.documentRoot), 'utf8');
        }
        core.documentXmlDirty = false;
    }
    if (core.pagesXmlDirty) {
        if (core.pagesRoot) {
            core.package.part(core.pagesUri).payload =
                Buffer.from(serializeDocument(core.pagesRoot), 'utf8');
        }
        core.pagesXmlDirty = false;
    }
    for (const page of core.pages) {
        if (core.dirtyPages.has(page.id) && page.root) {
            core.package.part(page.partUri).payload =
                Buffer.from(serializeDocument(page.root), 'utf8');
        }
    }
    core.dirtyPages.clear();
}

/** DocumentCore → XmlParts（纯数据，供 opcpkg 打包）。 */
export function build(core: DocumentCore): XmlParts {
    if (core.pages.length === 0) {
        throw new Error('VSDX document has no pages');
    }
    if (core.needsRecalculation) {
        ensureRecalcDocument(core);
        core.needsRecalculation = false;
    }
    flushXmlParts(core);
    if (core.pagesRelsDirty) {
        // 页面关系部件在 addPage 路径即时写包（与 C++ 的 pagesRelationships
        // 缓存 + 此处写回语义等价）；清标记防重复同步。
        core.pagesRelsDirty = false;
    }
    core.package.validate();

    const result = defaultXmlParts();
    for (const uri of core.package.partUris()) {
        const part = core.package.part(uri);
        result.parts.push({
            uri: uri.string(),
            contentType: part.contentType,
            xml: part.payload.toString('utf8'),
        });
    }
    return result;
}
