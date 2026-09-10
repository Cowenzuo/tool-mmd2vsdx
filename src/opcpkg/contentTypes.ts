// mmd2vsdx - opcpkg：contentTypes（[Content_Types].xml）
//
// C++ opcpkg/contenttypes.{hpp,cpp} 平移（04 §4.2、坑位 ⑪-11.2）。
// 语义（逐条照抄 C++）：
//   - parse：根必须为 Types；Default 需非空 Extension（小写化）；Override 的
//     PartName 非空且以 '/' 开头（存储键经 PartUri.parse 规范化，剥前导 '/'）；
//     两者 ContentType 需含 '/'；重复项抛错；
//   - contentTypeFor：Override 命中优先，其次按扩展名 Default，均无 → null；
//     扩展名 = 最后一个 '/' 之后最后一段的最后一个 '.' 之后（小写）；
//   - setDefault：扩展名小写、禁空与 '.' 开头；setOverride/removeOverride 按键；
//   - 序列化顺序 = 先全部 Default 后全部 Override，各自保持插入序
//     （对照 C++：Default 恒插在首个 Override 之前、Override 追加末尾，
//     重建树即可复刻该形态）；XML 文本 = serializeDocument（decl+LF+根+LF）。
//   - 解析错误用 Error（消息同 C++ runtime_error），参数错误用 TypeError。

import { PartUri } from './partUri.js';
import {
    appendChild,
    attribute,
    makeElement,
    parseDocument,
    serializeDocument,
    setAttribute,
} from '../xml/xmlNode.js';

const kContentTypesNamespace =
    'http://schemas.openxmlformats.org/package/2006/content-types';
const kSourceName = '[Content_Types].xml';

function lowercase(value: string): string {
    return value.toLowerCase();
}

/** 部件扩展名（小写）；无扩展名返回空串。 */
function extensionFor(part: PartUri): string {
    const value = part.string();
    const slash = value.lastIndexOf('/');
    const dot = value.lastIndexOf('.');
    if (dot < 0 || (slash >= 0 && dot < slash) || dot + 1 === value.length) {
        return '';
    }
    return lowercase(value.slice(dot + 1));
}

function validateContentType(contentType: string): void {
    if (contentType.length === 0 || !contentType.includes('/')) {
        throw new TypeError('Invalid OPC content type: ' + contentType);
    }
}

export class ContentTypes {
    private readonly defaults_: Map<string, string> = new Map();
    private readonly overrides_: Map<string, string> = new Map();

    private constructor() {}

    static parse(payload: Uint8Array): ContentTypes {
        const result = new ContentTypes();
        const xml = Buffer.from(payload).toString('utf8');
        const root = parseDocument(xml, kSourceName);
        if (root.name !== 'Types') {
            throw new Error('[Content_Types].xml has an invalid root element');
        }
        for (const child of root.children) {
            if (typeof child === 'string') continue;
            if (child.name === 'Default') {
                const extension = lowercase(attribute(child, 'Extension') ?? '');
                const contentType = attribute(child, 'ContentType') ?? '';
                if (extension.length === 0) {
                    throw new Error('Content type Default has no Extension');
                }
                validateContentType(contentType);
                if (result.defaults_.has(extension)) {
                    throw new Error('Duplicate content type Default: ' + extension);
                }
                result.defaults_.set(extension, contentType);
            } else if (child.name === 'Override') {
                const partName = attribute(child, 'PartName') ?? '';
                const contentType = attribute(child, 'ContentType') ?? '';
                if (partName.length === 0 || !partName.startsWith('/')) {
                    throw new Error('Content type Override has an invalid PartName');
                }
                validateContentType(contentType);
                const part = PartUri.parse(partName);
                if (result.overrides_.has(part.string())) {
                    throw new Error('Duplicate content type Override: ' + part.string());
                }
                result.overrides_.set(part.string(), contentType);
            }
        }
        return result;
    }

    static create(): ContentTypes {
        return new ContentTypes();
    }

    contentTypeFor(part: PartUri): string | null {
        const overridden = this.overrides_.get(part.string());
        if (overridden !== undefined) return overridden;
        const extension = extensionFor(part);
        return this.defaults_.get(extension) ?? null;
    }

    defaults(): Map<string, string> {
        return this.defaults_;
    }

    overrides(): Map<string, string> {
        return this.overrides_;
    }

    setDefault(extension: string, contentType: string): void {
        const ext = lowercase(extension);
        if (ext.length === 0 || ext.startsWith('.')) {
            throw new TypeError('Content type extension is invalid');
        }
        validateContentType(contentType);
        this.defaults_.set(ext, contentType);
    }

    setOverride(part: PartUri, contentType: string): void {
        validateContentType(contentType);
        this.overrides_.set(part.string(), contentType);
    }

    removeOverride(part: PartUri): void {
        this.overrides_.delete(part.string());
    }

    serialize(): Buffer {
        const root = makeElement('Types');
        setAttribute(root, 'xmlns', kContentTypesNamespace);
        for (const [extension, contentType] of this.defaults_) {
            const node = appendChild(root, makeElement('Default'));
            setAttribute(node, 'Extension', extension);
            setAttribute(node, 'ContentType', contentType);
        }
        for (const [partName, contentType] of this.overrides_) {
            const node = appendChild(root, makeElement('Override'));
            setAttribute(node, 'PartName', '/' + partName);
            setAttribute(node, 'ContentType', contentType);
        }
        return Buffer.from(serializeDocument(root), 'utf8');
    }
}
