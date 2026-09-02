// mmd2vsdx - xml 层：xmlNode（轻量 XML 树 + 序列化 + 只读解析器）
//
// C++ xml/xmldocument.{hpp,cpp} + libxml2 能力替代（TS 化设计：04 §2）。
// 设计要点（判别记录 D17）：
//   - 命名空间前缀直接内嵌进元素名（'visio:Document'），xmlns 声明是普通属性，
//     由调用方按常量表写在根节点上（不建模 ns 指针/声明作用域）；
//   - 属性保序：XmlAttr[]（有序数组），序列化保序是"与 C++ 产物 diff"的前提；
//   - 子内容保序：children 中元素与文本字符串交错（Text 节点 <cp/>+文本 即此形态）；
//   - 安全红线：禁 DTD/外部实体（解析器见 <!DOCTYPE 即抛错，不展开任何实体）；
//   - 序列化格式对齐 C++ 产物实测字节形态：
//     `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` + 紧凑根 + `\n`
//     （无缩进、无 CR；空元素自闭合 <X/>；无子且无文本的元素不输出成对标签）。

// ── 树模型 ──

export interface XmlAttr {
    name: string;
    value: string;
}

/** 子内容：元素或文本片段（保序，允许交错 = 混合内容）。 */
export type XmlContent = XmlNode | string;

export interface XmlNode {
    name: string;
    attrs: XmlAttr[];
    children: XmlContent[];
}

// ── 构造 ──

export function makeElement(name: string): XmlNode {
    return { name, attrs: [], children: [] };
}

/** 元素本地名（去前缀）：'visio:Document' → 'Document'。 */
export function localNameOf(node: XmlNode): string {
    const i = node.name.indexOf(':');
    return i >= 0 ? node.name.slice(i + 1) : node.name;
}

// ── 属性操作 ──

export function attribute(node: XmlNode, name: string): string | null {
    for (const a of node.attrs) {
        if (a.name === name) return a.value;
    }
    return null;
}

export function hasAttribute(node: XmlNode, name: string): boolean {
    return attribute(node, name) !== null;
}

export function setAttribute(node: XmlNode, name: string, value: string): void {
    for (const a of node.attrs) {
        if (a.name === name) {
            a.value = value;
            return;
        }
    }
    node.attrs.push({ name, value });
}

export function removeAttribute(node: XmlNode, name: string): void {
    node.attrs = node.attrs.filter((a) => a.name !== name);
}

/** 首个直接子元素（本地名匹配，忽略前缀）；找不到返回 null。 */
export function directChild(node: XmlNode, localName: string): XmlNode | null {
    for (const c of node.children) {
        if (typeof c !== 'string' && localNameOf(c) === localName) return c;
    }
    return null;
}

export function appendChild(parent: XmlNode, child: XmlNode): XmlNode {
    parent.children.push(child);
    return child;
}

export function appendTextChild(parent: XmlNode, localName: string, value: string): XmlNode {
    const node = appendChild(parent, makeElement(localName));
    appendText(node, value);
    return node;
}

export function appendText(parent: XmlNode, text: string): void {
    if (text === '') return; // 空文本不入树（保证空元素自闭合形态）
    // 与末尾相邻文本合并，避免碎文本节点
    const last = parent.children[parent.children.length - 1];
    if (typeof last === 'string') {
        parent.children[parent.children.length - 1] = last + text;
    } else {
        parent.children.push(text);
    }
}

export function clearChildren(node: XmlNode): void {
    node.children = [];
}

// ── 转义（判定：统一转义，见规划 D6） ──

export function escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string): string {
    return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ── 序列化 ──

export function serializeNode(node: XmlNode): string {
    let out = '<' + node.name;
    for (const a of node.attrs) {
        out += ' ' + a.name + '="' + escapeAttr(a.value) + '"';
    }
    const hasContent = node.children.length > 0;
    if (!hasContent) return out + '/>';
    out += '>';
    for (const c of node.children) {
        out += typeof c === 'string' ? escapeText(c) : serializeNode(c);
    }
    return out + '</' + node.name + '>';
}

/** 整文档序列化（对齐 C++ XmlDocument::serialize 字节形态：声明行 + LF + 根 + LF）。 */
export function serializeDocument(root: XmlNode): string {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + serializeNode(root) + '\n';
}

// ── 只读解析器（自研 ~150 行：decl/注释/PI 跳过、CDATA 当文本、五实体+数字实体） ──

function decodeEntities(text: string, source: string): string {
    if (!text.includes('&')) return text;
    return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, body: string) => {
        if (body === 'amp') return '&';
        if (body === 'lt') return '<';
        if (body === 'gt') return '>';
        if (body === 'quot') return '"';
        if (body === 'apos') return "'";
        const code = body.startsWith('#x')
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
            throw new Error(`[xml] invalid character entity '${m}' in ${source}`);
        }
        return String.fromCodePoint(code);
    });
}

const kMaxXmlLength = 512 * 1024 * 1024; // 对应 C++ int 上限的同量级护栏

function parseName(input: string, pos: number, source: string): { name: string; next: number } {
    const start = pos;
    while (pos < input.length) {
        const ch = input[pos]!;
        if (/[\s/>]/.test(ch)) break;
        if (ch === '=') break;
        pos++;
    }
    const name = input.slice(start, pos);
    if (!name) throw new Error(`[xml] expected element name in ${source}`);
    return { name, next: pos };
}

function skipWhitespace(input: string, pos: number): number {
    while (pos < input.length && /\s/.test(input[pos]!)) pos++;
    return pos;
}

/**
 * 解析一段 XML 文本，返回根元素（文档级骨架 decl/注释被跳过）。
 * @throws Error —— 非良构 / 含 DOCTYPE / 外部实体 / 超限
 */
export function parseDocument(xml: string, sourceName = '<memory>'): XmlNode {
    const source = sourceName;
    if (xml.length === 0) throw new Error('[xml] XML payload is empty');
    if (xml.length > kMaxXmlLength) throw new Error('[xml] XML payload is too large');

    const stack: XmlNode[] = [];
    let root: XmlNode | null = null;
    let pos = 0;

    const expect = (ch: string) => {
        if (inputChar() !== ch) throw new Error(`[xml] expected '${ch}' in ${source}`);
    };

    const inputChar = (): string => {
        if (pos >= xml.length) throw new Error(`[xml] unexpected end of input in ${source}`);
        return xml[pos]!;
    };

    const parseTagName = (): string => {
        pos = skipWhitespace(xml, pos);
        const { name, next } = parseName(xml, pos, source);
        pos = next;
        return name;
    };

    const parseAttributeValue = (): string => {
        const quote = inputChar();
        if (quote !== '"' && quote !== "'") throw new Error(`[xml] attribute value must be quoted in ${source}`);
        pos++;
        const start = pos;
        while (pos < xml.length && xml[pos] !== quote) pos++;
        if (pos >= xml.length) throw new Error(`[xml] unterminated attribute value in ${source}`);
        const raw = xml.slice(start, pos);
        pos++;
        return decodeEntities(raw, source);
    };

    const isNameChar = (ch: string) => !/[\s/>=]/.test(ch);

    const parseAttribute = (node: XmlNode) => {
        pos = skipWhitespace(xml, pos);
        if (inputChar() === '>') return false; // 无属性，直接开始内容
        const start = pos;
        while (pos < xml.length && isNameChar(xml[pos]!)) pos++;
        const name = xml.slice(start, pos);
        if (!name) throw new Error(`[xml] malformed attribute in ${source}`);
        pos = skipWhitespace(xml, pos);
        expect('=');
        pos++; // expect 只断言不推进，必须显式越过 '='
        pos = skipWhitespace(xml, pos);
        const value = parseAttributeValue();
        node.attrs.push({ name, value });
        return true;
    };

    while (true) {
        if (pos >= xml.length) {
            if (stack.length === 0) break;
            throw new Error(`[xml] unclosed element <${stack[stack.length - 1]!.name}> in ${source}`);
        }
        if (xml[pos] !== '<') {
            // 文本内容
            const start = pos;
            while (pos < xml.length && xml[pos] !== '<') pos++;
            const raw = xml.slice(start, pos);
            const target = stack[stack.length - 1];
            if (target) appendText(target, decodeEntities(raw, source));
            continue;
        }
        if (xml.startsWith('<?', pos)) {
            const end = xml.indexOf('?>', pos + 2);
            if (end < 0) throw new Error(`[xml] unterminated processing instruction in ${source}`);
            pos = end + 2;
            continue;
        }
        if (xml.startsWith('<!--', pos)) {
            const end = xml.indexOf('-->', pos + 4);
            if (end < 0) throw new Error(`[xml] unterminated comment in ${source}`);
            pos = end + 3;
            continue;
        }
        if (xml.startsWith('<![CDATA[', pos)) {
            const end = xml.indexOf(']]>', pos + 9);
            if (end < 0) throw new Error(`[xml] unterminated CDATA in ${source}`);
            const target = stack[stack.length - 1];
            if (target) appendText(target, xml.slice(pos + 9, end));
            pos = end + 3;
            continue;
        }
        if (xml.startsWith('<!DOCTYPE', pos) || xml.startsWith('<!ENTITY', pos)) {
            throw new Error(`[xml] DTD/entity declarations are not supported in ${source}`);
        }
        if (xml.startsWith('</', pos)) {
            pos += 2;
            const { name, next } = parseName(xml, pos, source);
            pos = next;
            pos = skipWhitespace(xml, pos);
            if (inputChar() !== '>') throw new Error(`[xml] malformed closing tag in ${source}`);
            pos++;
            const open = stack.pop();
            if (!open) throw new Error(`[xml] unexpected closing tag </${name}> in ${source}`);
            if (open.name !== name) {
                throw new Error(`[xml] mismatched tag: expected </${open.name}> got </${name}> in ${source}`);
            }
            if (stack.length === 0) {
                root = open;
                break;
            }
            continue;
        }
        // 开始标签
        if (stack.length === 0 && root !== null) {
            throw new Error(`[xml] multiple root elements in ${source}`);
        }
        pos++; // consume '<'
        const name = parseTagName();
        const node = makeElement(name);
        while (true) {
            pos = skipWhitespace(xml, pos);
            if (inputChar() === '>') {
                pos++;
                if (stack.length > 0) appendChild(stack[stack.length - 1]!, node);
                stack.push(node);
                break;
            }
            if (xml.startsWith('/>', pos)) {
                pos += 2;
                if (stack.length > 0) appendChild(stack[stack.length - 1]!, node);
                else {
                    root = node; // 自闭合根（理论情形）
                    break;
                }
                break;
            }
            parseAttribute(node);
        }
    }
    if (!root) throw new Error(`[xml] no root element in ${source}`);
    return root;
}

// ── 便捷：文档根创建（root + xmlns 声明由调用方按常量表设置） ──

export function makeRootElement(rootName: string, namespaceUri: string, prefix: string): XmlNode {
    const root = makeElement(prefix ? `${prefix}:${rootName}` : rootName);
    if (prefix) setAttribute(root, 'xmlns:' + prefix, namespaceUri);
    else setAttribute(root, 'xmlns', namespaceUri);
    return root;
}
