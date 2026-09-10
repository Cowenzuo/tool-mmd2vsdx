// 契约 B：部件清单（docs/开发过程/01-结构设计.md）
//
// 纯数据层：一条部件 = uri + contentType + xml 文本。
// 压缩库拿到 ContractB 即等于拿到完整 vsdx 内容。

export interface XmlPart {
    /** 规范部件 URI，如 '/visio/pages/page1.xml'。 */
    uri: string;
    /** 部件媒体类型，如 'application/vnd.ms-visio.page+xml'。 */
    contentType: string;
    /** 部件 XML 文本（含声明行）。 */
    xml: string;
}

export interface ContractB {
    parts: XmlPart[];
}

export function part(uri: string, contentType: string, xml: string): XmlPart {
    return { uri, contentType, xml };
}

export function defaultContractB(): ContractB {
    return { parts: [] };
}

export interface BValidation {
    ok: boolean;
    errors: string[];
}

/** 校验：uri 非空且唯一、contentType 非空、xml 非空。 */
export function validateContractB(b: ContractB): BValidation {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const p of b.parts) {
        if (!p.uri || p.uri[0] !== '/') errors.push(`uri 非法：${JSON.stringify(p.uri)}`);
        if (seen.has(p.uri)) errors.push(`uri 重复：${p.uri}`);
        seen.add(p.uri);
        if (!p.contentType) errors.push(`contentType 为空：${p.uri}`);
        if (!p.xml) errors.push(`xml 为空：${p.uri}`);
    }
    return { ok: errors.length === 0, errors };
}

/** 追加部件；重复 uri 抛错（调方应先在合并层处理覆盖语义）。 */
export function addPart(b: ContractB, p: XmlPart): ContractB {
    if (b.parts.some((x) => x.uri === p.uri)) {
        throw new Error(`[contractB] 部件 uri 已存在：${p.uri}`);
    }
    return { parts: [...b.parts, p] };
}

/** 合并两份契约 B；重复 uri 时后者覆盖前者（母版/文档并入页面部件的语义）。 */
export function mergeParts(a: ContractB, b: ContractB): ContractB {
    const map = new Map<string, XmlPart>();
    for (const p of a.parts) map.set(p.uri, p);
    for (const p of b.parts) map.set(p.uri, p);
    return { parts: [...map.values()] };
}
