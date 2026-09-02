// mmd2vsdx - xml 层：constants（VSDX/OPC 语义常量表）
//
// 来源：C++ vsdxdoc/docmodel/render_internal.hpp（常量部分）+ masters 相关
// ContentType（坑位 ⑨-9.1c）+ OPC 包常量。命名保留 C++ k 前缀便于对照。

// ── 命名空间 ──

export const kVisioNamespace = 'http://schemas.microsoft.com/office/visio/2012/main';
export const kOfficeRelationshipsNamespace =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const kExtendedPropertiesNamespace =
    'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';
export const kCorePropertiesNamespace =
    'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
export const kCustomPropertiesNamespace =
    'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';

// ── 关系类型（Relationship.Type） ──

export const kDocumentRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/document';
export const kPagesRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/pages';
export const kPageRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/page';
export const kCoreRelationship =
    'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
export const kExtendedRelationship =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties';
export const kCustomRelationship =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
export const kWindowsRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/windows';
export const kMastersRelationship =
    'http://schemas.microsoft.com/visio/2010/relationships/masters';

// ── ContentTypes ──

export const kDocumentContentType = 'application/vnd.ms-visio.drawing.main+xml';
export const kPagesContentType = 'application/vnd.ms-visio.pages+xml';
export const kPageContentType = 'application/vnd.ms-visio.page+xml';
export const kCoreContentType = 'application/vnd.openxmlformats-package.core-properties+xml';
export const kExtendedContentType =
    'application/vnd.openxmlformats-officedocument.extended-properties+xml';
export const kCustomContentType =
    'application/vnd.openxmlformats-officedocument.custom-properties+xml';
export const kWindowsContentType = 'application/vnd.ms-visio.windows+xml';
export const kMastersContentType = 'application/vnd.ms-visio.masters+xml'; // ⑨-9.1c
export const kMasterContentType = 'application/vnd.ms-visio.master+xml'; // ⑨-9.1c

// ── 部件 URI ──

export const kDocumentUri = 'visio/document.xml';
export const kPagesUri = 'visio/pages/pages.xml';
export const kCoreUri = 'docProps/core.xml';
export const kAppUri = 'docProps/app.xml';
export const kCustomUri = 'docProps/custom.xml';
export const kWindowsUri = 'visio/windows.xml';

// ── OPC 包级常量（opcpkg 也用） ──

/** ZIP 目录条目默认 ContentType（包内默认扩展名）。 */
export const kContentTypesUri = '[Content_Types].xml';
export const kRelsExtension = 'rels';
export const kXmlExtension = 'xml';
