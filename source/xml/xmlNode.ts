// XML 栈：轻量树 + 解析 + 序列化（docs/redesign/01 包的 xml/ 底层库）
//
// 特点：有序属性、混合内容（文本与元素子节点）、无 DTD、确定性输出。
// 序列化策略：纯元素树按 2 空格缩进；含文本子节点的子树内联（保文本语义）。

export interface XmlAttr {
    name: string;
    value: string;
}

export type XmlChild = XmlNode | string;

export interface XmlNode {
    /** 元素名（可带前缀，如 'cp:coreProperties'）。 */
    name: string;
    attrs: XmlAttr[];
    children: XmlChild[];
}

export function makeElement(name: string): XmlNode {
    return { name, attrs: [], children: [] };
}

export function appendChild(parent: XmlNode, child: XmlNode): void {
    parent.children.push(child);
}

export function appendTextChild(parent: XmlNode, text: string): void {
    parent.children.push(text);
}

export function setAttribute(node: XmlNode, name: string, value: string): void {
    const a = node.attrs.find((x) => x.name === name);
    if (a) a.value = value;
    else node.attrs.push({ name, value });
}

export function removeAttribute(node: XmlNode, name: string): void {
    node.attrs = node.attrs.filter((x) => x.name !== name);
}

export function attr(node: XmlNode, name: string): string | null {
    return node.attrs.find((x) => x.name === name)?.value ?? null;
}

export function elementChildren(node: XmlNode): XmlNode[] {
    return node.children.filter((c): c is XmlNode => typeof c !== 'string');
}

export function directChild(node: XmlNode, name: string): XmlNode | null {
    return elementChildren(node).find((c) => c.name === name) ?? null;
}

export function textOf(node: XmlNode): string {
    return node.children.filter((c): c is string => typeof c === 'string').join('');
}

// ── 序列化 ──

export interface SerializeOptions {
    /** 声明行；默认无声明。 */
    declaration?: string;
    /** 缩进空格数；0=单行。 */
    indent?: number;
}

function escapeAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

function escapeText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hasTextChild(node: XmlNode): boolean {
    return node.children.some((c) => typeof c === 'string');
}

function renderNode(node: XmlNode, depth: number, indent: number, lines: string[]): void {
    const pad = ' '.repeat(depth * indent);
    const attrs = node.attrs.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join('');
    if (node.children.length === 0) {
        lines.push(`${pad}<${node.name}${attrs}/>`);
        return;
    }
    if (hasTextChild(node)) {
        lines.push(`${pad}${renderMixed(node)}`);
        return;
    }
    lines.push(`${pad}<${node.name}${attrs}>`);
    for (const c of elementChildren(node)) renderNode(c, depth + 1, indent, lines);
    lines.push(`${pad}</${node.name}>`);
}

/** 混合内容整体内联渲染：子元素与文本按原序，不缩进（保文本语义）。 */
function renderMixed(node: XmlNode): string {
    const attrs = node.attrs.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join('');
    let out = `<${node.name}${attrs}>`;
    for (const c of node.children) {
        out += typeof c === 'string' ? escapeText(c) : renderMixed(c);
    }
    return out + `</${node.name}>`;
}

export function serializeDocument(root: XmlNode, opts: SerializeOptions = {}): string {
    const indent = opts.indent ?? 2;
    const lines: string[] = [];
    if (opts.declaration) lines.push(opts.declaration);
    renderNode(root, 0, indent, lines);
    return lines.join('\n') + '\n';
}

// ── 解析（手写、无 DTD） ──

const kEntityMap: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
};

function decodeEntities(s: string): string {
    return s.replace(/&(#[0-9]+|[a-zA-Z]+);/g, (m, body: string) => {
        if (body[0] === '#') {
            const code = Number.parseInt(body.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        }
        return kEntityMap[body] ?? m;
    });
}

class XmlParseError extends Error {
    constructor(message: string, public readonly pos: number) {
        super(`${message}@${pos}`);
    }
}

function skipWs(s: string, i: number): number {
    while (i < s.length && /\s/.test(s[i]!)) i++;
    return i;
}

function parseElement(s: string, i: number): { node: XmlNode; next: number } {
    i = skipWs(s, i);
    if (s[i] !== '<') throw new XmlParseError('期望 <', i);
    i++;
    // 注释 / PI / 声明跳过
    if (s.startsWith('!--', i)) {
        const end = s.indexOf('-->', i);
        if (end < 0) throw new XmlParseError('注释未闭合', i);
        return parseElement(s, end + 3);
    }
    if (s[i] === '?' || s[i] === '!') {
        const end = s.indexOf('>', i);
        if (end < 0) throw new XmlParseError('PI/声明未闭合', i);
        if (s[i] === '!' && s.startsWith('DOCTYPE', i + 1)) {
            // 跳过 DTD 到对应 '>'（简单起见取到第一个 '>' 前的 ']' 之后）
            let j = end + 1;
            if (s.slice(i, end).includes('[')) {
                j = s.indexOf(']', end) + 2;
            }
            return parseElement(s, j);
        }
        return parseElement(s, end + 1);
    }
    const nameStart = i;
    while (i < s.length && /[^\s/>]/.test(s[i]!)) i++;
    const name = s.slice(nameStart, i);
    if (!name) throw new XmlParseError('元素名缺失', i);
    const node = makeElement(name);
    // 属性
    for (;;) {
        i = skipWs(s, i);
        if (s[i] === '/') {
            if (s[i + 1] !== '>') throw new XmlParseError('非法自闭合', i);
            return { node, next: i + 2 };
        }
        if (s[i] === '>') break;
        const aStart = i;
        while (i < s.length && /[^\s=/>]/.test(s[i]!)) i++;
        const aName = s.slice(aStart, i);
        i = skipWs(s, i);
        if (s[i] !== '=') throw new XmlParseError(`属性 ${aName} 缺 =`, i);
        i++;
        i = skipWs(s, i);
        const q = s[i];
        if (q !== '"' && q !== "'") throw new XmlParseError(`属性 ${aName} 引号缺失`, i);
        i++;
        const vStart = i;
        while (i < s.length && s[i] !== q) i++;
        if (i >= s.length) throw new XmlParseError(`属性 ${aName} 未闭合`, i);
        node.attrs.push({ name: aName, value: decodeEntities(s.slice(vStart, i)) });
        i++;
    }
    i++; // 越过 '>'
    // 内容
    let textStart = i;
    for (;;) {
        const lt = s.indexOf('<', i);
        if (lt < 0) throw new XmlParseError(`元素 ${name} 未闭合`, i);
        if (lt > textStart) {
            const raw = s.slice(textStart, lt);
            // 纯空白文本节点丢弃（元素间缩进），有内容的文本保留
            if (raw.trim().length > 0) node.children.push(decodeEntities(raw));
        }
        if (s.startsWith('</', lt)) {
            const closeStart = lt + 2;
            const closeEnd = s.indexOf('>', closeStart);
            if (closeEnd < 0) throw new XmlParseError('闭合标签未闭合', lt);
            const closeName = s.slice(closeStart, closeEnd).trim();
            if (closeName !== name) {
                throw new XmlParseError(`闭合标签不匹配：${closeName} != ${name}`, lt);
            }
            return { node, next: closeEnd + 1 };
        }
        // 内容里的 PI/注释：跳过（不当作子元素）
        if (s.startsWith('<?', lt)) {
            const pe = s.indexOf('?>', lt);
            if (pe < 0) throw new XmlParseError('PI 未闭合', lt);
            i = pe + 2;
            textStart = i;
            continue;
        }
        if (s.startsWith('<!--', lt)) {
            const ce = s.indexOf('-->', lt);
            if (ce < 0) throw new XmlParseError('注释未闭合', lt);
            i = ce + 3;
            textStart = i;
            continue;
        }
        const child = parseElement(s, lt);
        node.children.push(child.node);
        i = child.next;
        textStart = i;
    }
}

/** 解析整份文档，返回根元素。XML 声明、BOM 与注释自动跳过。 */
export function parseDocument(xml: string): XmlNode {
    const clean = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
    const { node, next } = parseElement(clean, 0);
    // 尾部残留（允许空白）
    if (skipWs(clean, next) !== clean.length) {
        throw new XmlParseError('文档尾部存在多余内容', next);
    }
    return node;
}

/** 试解析：返回错误信息或 null。 */
export function tryParse(xml: string): string | null {
    try {
        parseDocument(xml);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}
