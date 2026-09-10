// OPC 底层：[Content_Types].xml 生成与解析
import { makeElement, parseDocument, setAttribute } from '../common/xml/xmlNode.js';
import { serializeDocument } from '../common/xml/xmlNode.js';
import { kRelsContentType, kXmlContentType } from '../common/xml/constants.js';

export interface ContentTypeOverride {
    partName: string;
    contentType: string;
}

/** 生成登记表：Default rels/xml + 逐部件 Override（rels 部件除外）。 */
export function buildContentTypes(parts: Array<{ uri: string; contentType: string }>): {
    xml: string;
    overrides: ContentTypeOverride[];
} {
    const root = makeElement('Types');
    setAttribute(root, 'xmlns', 'http://schemas.openxmlformats.org/package/2006/content-types');
    const defaults: Array<[string, string]> = [
        ['rels', kRelsContentType],
        ['xml', kXmlContentType],
    ];
    for (const [ext, ct] of defaults) {
        const el = makeElement('Default');
        setAttribute(el, 'Extension', ext);
        setAttribute(el, 'ContentType', ct);
        root.children.push(el);
    }
    const overrides: ContentTypeOverride[] = [];
    for (const p of parts) {
        const ext = p.uri.slice(p.uri.lastIndexOf('.') + 1).toLowerCase();
        if (ext === 'rels') continue;
        const el = makeElement('Override');
        setAttribute(el, 'PartName', p.uri);
        setAttribute(el, 'ContentType', p.contentType);
        root.children.push(el);
        overrides.push({ partName: p.uri, contentType: p.contentType });
    }
    const xml = serializeDocument(root, {
        declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        indent: 0,
    });
    return { xml, overrides };
}

/** 解析登记表：返回 Override 表（部件 uri → contentType）。 */
export function parseContentTypes(xml: string): Map<string, string> {
    const root = parseDocument(xml);
    const map = new Map<string, string>();
    for (const el of root.children) {
        if (typeof el !== 'string' && el.name === 'Override') {
            const name = el.attrs.find((a) => a.name === 'PartName')?.value;
            const ct = el.attrs.find((a) => a.name === 'ContentType')?.value;
            if (name && ct) map.set(name, ct);
        }
    }
    return map;
}
