// XML 栈：数字格式化与常量（docs/redesign/01 包的 xml/ 底层库）

/** 确定性数值格式化：最多 17 位有效、去尾零、0 正常化。 */
export function number(v: number): string {
    if (!Number.isFinite(v)) return '0';
    if (v === 0) return '0';
    const s = Number(v.toPrecision(17));
    return String(s);
}

/** 与 C++ baseline 对齐的 6 位小数固定格式（golden 比对用，可选）。 */
export function cppFixed6(v: number): string {
    if (!Number.isFinite(v)) return '0';
    return (Number.isInteger(v) ? v.toFixed(1) : v.toFixed(6)).replace(/\.0+$/, '').replace(/0+$/, '').replace(/\.$/, '');
}

// ── VSDX/OPC 常量 ──

export const kVisioNamespace = 'http://schemas.microsoft.com/office/visio/2012/main';
export const kOfficeRelsNs =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const kPackageRelsNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const kCorePropsNs = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
export const kExtendedPropsNs = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';
export const kCustomPropsNs = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
export const kDocPropsVTypesNs =
    'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
export const kDcNs = 'http://purl.org/dc/elements/1.1/';

export const kDocumentUri = '/visio/document.xml';
export const kPagesUri = '/visio/pages/pages.xml';
export const kPageUri = '/visio/pages/page1.xml';
export const kMasterUri = '/visio/masters/masters.xml';
export const kWindowsUri = '/visio/windows.xml';
export const kRelsContentType =
    'application/vnd.openxmlformats-package.relationships+xml';
export const kXmlContentType = 'application/xml';
export const kDocumentContentType = 'application/vnd.ms-visio.drawing.main+xml';
export const kMastersContentType = 'application/vnd.ms-visio.masters+xml';
export const kMasterContentType = 'application/vnd.ms-visio.master+xml';
export const kPagesContentType = 'application/vnd.ms-visio.pages+xml';
export const kPageContentType = 'application/vnd.ms-visio.page+xml';
export const kWindowsContentType = 'application/vnd.ms-visio.windows+xml';
export const kCorePropsContentType =
    'application/vnd.openxmlformats-package.core-properties+xml';
export const kExtendedPropsContentType =
    'application/vnd.openxmlformats-officedocument.extended-properties+xml';
export const kCustomPropsContentType =
    'application/vnd.openxmlformats-officedocument.custom-properties+xml';

export const kMasterRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/master';
export const kPageRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/page';
export const kDocumentRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/document';
export const kMastersRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/masters';
export const kPagesRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/pages';
export const kWindowsRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/windows';
