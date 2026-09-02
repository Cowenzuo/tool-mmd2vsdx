// mmd2vsdx - core 数据层：xmlparts（跨模块流转契约）
//
// C++ core/xmlparts.hpp 平移：XmlParts = XML 内存集合（uri + contentType + xml），
// vsdxdoc 输出、opcpkg 打包输入的唯一边界。纯字符串数据，可跨模块自由流转。

/** 单个 XML 部件（未压缩的 .vsdx 解压内容之一）。 */
export interface XmlPart {
    /** OPC 部件路径，如 "visio/document.xml"。 */
    uri: string;
    /** ContentType，如 "application/vnd.ms-visio.drawing.main+xml"。 */
    contentType: string;
    /** XML 内容。 */
    xml: string;
}

/** XML 部件集合（纯数据）。 */
export interface XmlParts {
    parts: XmlPart[];
}

/** HTTP 服务 /convert 的响应载荷（base64 编码的 .vsdx）。 */
export interface ConvertResult {
    ok: boolean;
    /** ok=false 时的错误信息。 */
    error: string;
    /** ok=true 时的 .vsdx 内容（base64）。 */
    vsdxBase64: string;
    /** 识别出的图类型（调试/统计用）。 */
    diagramType: string;
    pageCount: number;
}

export function defaultXmlParts(): XmlParts {
    return { parts: [] };
}

export function defaultConvertResult(): ConvertResult {
    return { ok: false, error: '', vsdxBase64: '', diagramType: '', pageCount: 0 };
}
