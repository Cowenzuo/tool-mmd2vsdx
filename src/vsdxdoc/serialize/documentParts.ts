// mmd2vsdx - vsdxdoc/serialize：documentParts（文档部件工厂）
//
// C++ serialize/documentparts.cpp 平移（坑位 ⑩-10.2/10.5）。
// TS 差异：返回 XmlNode 根（无文档对象；序列化 = serializeDocument(root)）；
// 命名空间声明为根上普通 xmlns/xmlns:r 属性（顺序=声明序，对齐 libxml 输出）。
import { existsSync } from 'node:fs';
import type { XmlNode } from '../../xml/xmlNode.js';
import {
    appendChild,
    appendTextChild,
    makeElement,
    setAttribute,
} from '../../xml/xmlNode.js';
import { appendCellNumber, appendCellString, number } from '../../xml/xmlBuilder.js';
import {
    kCorePropertiesNamespace,
    kCustomPropertiesNamespace,
    kExtendedPropertiesNamespace,
    kOfficeRelationshipsNamespace,
    kVisioNamespace,
} from '../../xml/constants.js';
import type { DiagramType } from '../../core/types.js';
import type { DocumentCore } from '../docmodel/documentCore.js';
import type { PageModel } from '../docmodel/model.js';

const kDocPropsVTypesNamespace =
    'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
const kDcNamespace = 'http://purl.org/dc/elements/1.1/';

/** 根元素 + 命名空间声明（xmlns 在前，顺序对齐 libxml）。 */
function rootElement(name: string, nsUri: string, prefix = ''): XmlNode {
    const root = makeElement(prefix ? `${prefix}:${name}` : name);
    if (prefix) setAttribute(root, 'xmlns:' + prefix, nsUri);
    else setAttribute(root, 'xmlns', nsUri);
    return root;
}

function ensureR(root: XmlNode): void {
    if (!root.attrs.some((a) => a.name === 'xmlns:r')) {
        setAttribute(root, 'xmlns:r', kOfficeRelationshipsNamespace);
    }
}

export function createDocumentXml(type: DiagramType): XmlNode {
    const root = rootElement('VisioDocument', kVisioNamespace);
    ensureR(root);

    const settings = appendChild(root, makeElement('DocumentSettings'));
    setAttribute(settings, 'TopPage', '0');
    setAttribute(settings, 'DefaultTextStyle', '3');
    setAttribute(settings, 'DefaultLineStyle', '3');
    setAttribute(settings, 'DefaultFillStyle', '3');
    setAttribute(settings, 'DefaultGuideStyle', '4');
    appendTextChild(settings, 'GlueSettings', '9');
    appendTextChild(settings, 'SnapSettings', '295');
    appendTextChild(settings, 'SnapExtensions', '34');
    appendChild(settings, makeElement('SnapAngles'));
    appendTextChild(settings, 'DynamicGridEnabled', '1');
    appendTextChild(settings, 'ProtectStyles', '0');
    appendTextChild(settings, 'ProtectShapes', '0');
    appendTextChild(settings, 'ProtectMasters', '0');
    appendTextChild(settings, 'ProtectBkgnds', '0');

    const styles = appendChild(root, makeElement('StyleSheets'));

    const noStyle = appendChild(styles, makeElement('StyleSheet'));
    setAttribute(noStyle, 'ID', '0');
    setAttribute(noStyle, 'NameU', 'No Style');
    setAttribute(noStyle, 'Name', 'No Style');
    appendCellNumber(noStyle, 'EnableLineProps', 1);
    appendCellNumber(noStyle, 'EnableFillProps', 1);
    appendCellNumber(noStyle, 'EnableTextProps', 1);
    appendCellNumber(noStyle, 'HideForApply', 0);

    const normal = appendChild(styles, makeElement('StyleSheet'));
    setAttribute(normal, 'ID', '3');
    setAttribute(normal, 'NameU', 'Normal');
    setAttribute(normal, 'Name', 'Normal');
    appendCellNumber(normal, 'LineWeight', 0.5 / 72.0, 'PT');
    appendCellString(normal, 'LineColor', '#000000');
    appendCellNumber(normal, 'LinePattern', 1);
    appendCellNumber(normal, 'BeginArrow', 0);
    appendCellNumber(normal, 'EndArrow', 0);
    appendCellString(normal, 'FillForegnd', '#FFFFFF');
    appendCellString(normal, 'FillBkgnd', '#FFFFFF');
    appendCellNumber(normal, 'FillPattern', 1);
    appendCellString(normal, 'Color', '#000000');
    appendCellNumber(normal, 'Size', 12.0 / 72.0, 'PT');

    const guide = appendChild(styles, makeElement('StyleSheet'));
    setAttribute(guide, 'ID', '4');
    setAttribute(guide, 'NameU', 'Guide');
    setAttribute(guide, 'Name', 'Guide');
    appendCellNumber(guide, 'LineWeight', 0.5 / 72.0, 'PT');
    appendCellString(guide, 'LineColor', '#000000');
    appendCellNumber(guide, 'LinePattern', 1);

    const colors = appendChild(root, makeElement('Colors'));
    const ce24 = appendChild(colors, makeElement('ColorEntry'));
    setAttribute(ce24, 'IX', '24');
    setAttribute(ce24, 'RGB', '#000000');
    const ce25 = appendChild(colors, makeElement('ColorEntry'));
    setAttribute(ce25, 'IX', '25');
    setAttribute(ce25, 'RGB', '#FFFFFF');

    const faceNames = appendChild(root, makeElement('FaceNames'));
    const faceName = appendChild(faceNames, makeElement('FaceName'));
    setAttribute(faceName, 'NameU', 'Calibri');

    // GC 甘特图组件文档打开事件（仅甘特图，与官方模板一致，坑位 ⑩-10.2）
    if (type === 'gantt') {
        const eventList = appendChild(root, makeElement('EventList'));
        const eventItem = appendChild(eventList, makeElement('EventItem'));
        setAttribute(eventItem, 'ID', '15');
        setAttribute(eventItem, 'EventCode', '2');
        setAttribute(eventItem, 'Action', '1');
        setAttribute(eventItem, 'Enabled', '1');
        setAttribute(eventItem, 'Target', 'GC');
        setAttribute(eventItem, 'TargetArgs', '/CMD=2');
    }

    return root;
}

export function createPagesXml(): XmlNode {
    const root = rootElement('Pages', kVisioNamespace);
    ensureR(root);
    return root;
}

export function createPageXml(): XmlNode {
    const root = rootElement('PageContents', kVisioNamespace);
    ensureR(root);
    appendChild(root, makeElement('Shapes'));
    return root;
}

export function createAppProperties(): XmlNode {
    const root = rootElement('Properties', kExtendedPropertiesNamespace);
    appendTextChild(root, 'Application', 'mmd2vsdx');
    appendTextChild(root, 'AppVersion', '2.0');
    return root;
}

export function createCoreProperties(): XmlNode {
    const root = rootElement('coreProperties', kCorePropertiesNamespace, 'cp');
    setAttribute(root, 'xmlns:dc', kDcNamespace);
    appendTextChild(root, 'dc:title', 'mmd2vsdx');
    appendTextChild(root, 'dc:creator', 'mmd2vsdx');
    return root;
}

/** 图型 → 本机 Visio 官方模具文件名（仅 createWindowsXml 内部使用）。 */
export function stencilFileForType(type: DiagramType): string {
    switch (type) {
        case 'basic': return 'BASIC_M.VSSX';
        case 'flowchart': return 'BASFLO_M.VSSX';
        case 'class': return 'USTRME_M.VSSX';
        case 'sequence': return 'USEQME_M.VSSX';
        case 'er': return 'DBUML_M.VSSX';
        case 'gantt': return 'GANTT_M.VSSX';
        case 'timeline': return 'TIMELN_M.VSSX';
        case 'calendar': return 'CALNDR_M.VSSX';
        case 'git': return 'BASIC_M.VSSX';
        case 'mindmap': return 'BASIC_M.VSSX';
        default: return 'BASIC_M.VSSX';
    }
}

/** 本机官方模具探测（8 条候选路径，2052 中文优先；找不到返回 null）。 */
export function officeStencilPath(fileName: string): string | null {
    const roots = [
        'C:\\Program Files\\Microsoft Office\\root\\Office16\\visio content\\2052\\',
        'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\visio content\\2052\\',
        'C:\\Program Files\\Microsoft Office\\root\\Office16\\visio content\\1033\\',
        'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\visio content\\1033\\',
        'C:\\Program Files\\Microsoft Office\\Office16\\visio content\\2052\\',
        'C:\\Program Files (x86)\\Microsoft Office\\Office16\\visio content\\2052\\',
        'C:\\Program Files\\Microsoft Office\\root\\Office15\\visio content\\2052\\',
        'C:\\Program Files (x86)\\Microsoft Office\\root\\Office15\\visio content\\2052\\',
    ];
    for (const r of roots) {
        const full = r + fileName;
        try {
            if (existsSync(full)) return full;
        } catch {
            // 忽略探测路径 IO 错误
        }
    }
    return null;
}

export function createWindowsXml(type: DiagramType): XmlNode {
    const root = rootElement('Windows', kVisioNamespace);
    ensureR(root);
    const window = appendChild(root, makeElement('Window'));
    setAttribute(window, 'ID', '0');
    setAttribute(window, 'WindowType', 'Drawing');
    setAttribute(window, 'ContainerType', 'Page');
    setAttribute(window, 'Page', '0');
    setAttribute(window, 'ViewScale', '1');
    appendTextChild(window, 'ShowRulers', '1');
    appendTextChild(window, 'ShowGrid', '0');
    appendTextChild(window, 'ShowPageBreaks', '1');
    appendTextChild(window, 'ShowGuides', '1');
    appendTextChild(window, 'ShowConnectionPoints', '1');
    appendTextChild(window, 'GlueSettings', '9');
    appendTextChild(window, 'SnapSettings', '295');
    appendTextChild(window, 'DynamicGridEnabled', '1');

    // Stencil 窗口：仅本机探测到官方模具才生成（坑位 ⑩-10.2；macOS 无 Visio → 不生成）
    const stencilPath = officeStencilPath(stencilFileForType(type));
    if (stencilPath !== null) {
        const stencil = appendChild(root, makeElement('Window'));
        setAttribute(stencil, 'ID', '1');
        setAttribute(stencil, 'WindowType', 'Stencil');
        setAttribute(stencil, 'WindowState', '1025');
        setAttribute(stencil, 'WindowLeft', '-351');
        setAttribute(stencil, 'WindowTop', '-10');
        setAttribute(stencil, 'WindowWidth', '342');
        setAttribute(stencil, 'WindowHeight', '1045');
        setAttribute(stencil, 'Document', stencilPath);
        setAttribute(stencil, 'ParentWindow', '0');
        appendTextChild(stencil, 'StencilGroup', '10');
        appendTextChild(stencil, 'StencilGroupPos', '1');
    }
    return root;
}

export function createCustomProperties(): XmlNode {
    const root = rootElement('Properties', kCustomPropertiesNamespace);
    setAttribute(root, 'xmlns:vt', kDocPropsVTypesNamespace);
    const fmtId = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';

    const addProperty = (pid: string, name: string, vt: string, value: string) => {
        const property = appendChild(root, makeElement('property'));
        setAttribute(property, 'fmtid', fmtId);
        setAttribute(property, 'pid', pid);
        setAttribute(property, 'name', name);
        appendTextChild(property, 'vt:' + vt, value);
    };
    addProperty('2', '_VPID_ALTERNATENAMES', 'lpwstr', '');
    addProperty('3', 'BuildNumberCreated', 'i4', '1179401801');
    addProperty('4', 'BuildNumberEdited', 'i4', '1179401801');
    addProperty('5', 'IsMetric', 'bool', 'false');
    addProperty('6', 'TimeEdited', 'filetime', '2026-07-27T00:00:00Z');
    addProperty('7', 'RecalcDocument', 'bool', 'true');
    return root;
}

/** pages.xml 追加 Page 元数据（含 PageSheet 尺寸/网格与 Rel r:id），返回节点。 */
export function addPageMetadata(core: DocumentCore, page: PageModel): XmlNode {
    const pagesRoot = core.pagesRoot;
    if (!pagesRoot) throw new Error('pages.xml root is not initialized');
    if (pagesRoot.attrs.every((a) => a.name !== 'xmlns:r')) {
        setAttribute(pagesRoot, 'xmlns:r', kOfficeRelationshipsNamespace);
    }
    const node = appendChild(pagesRoot, makeElement('Page'));
    setAttribute(node, 'ID', String(page.id));
    setAttribute(node, 'NameU', page.name);
    setAttribute(node, 'Name', page.name);
    setAttribute(node, 'ViewScale', '1');
    setAttribute(node, 'ViewCenterX', number(page.width / 2));
    setAttribute(node, 'ViewCenterY', number(page.height / 2));

    const pageSheet = appendChild(node, makeElement('PageSheet'));
    setAttribute(pageSheet, 'LineStyle', '0');
    setAttribute(pageSheet, 'FillStyle', '0');
    setAttribute(pageSheet, 'TextStyle', '0');
    appendCellNumber(pageSheet, 'PageWidth', page.width, 'IN');
    appendCellNumber(pageSheet, 'PageHeight', page.height, 'IN');
    appendCellNumber(pageSheet, 'PageScale', 1.0, 'IN');
    appendCellNumber(pageSheet, 'DrawingScale', 1.0, 'IN');
    appendCellNumber(pageSheet, 'DrawingSizeType', 0);
    appendCellNumber(pageSheet, 'DrawingScaleType', 0);
    appendCellNumber(pageSheet, 'InhibitSnap', 0);
    appendCellNumber(pageSheet, 'UIVisibility', 0);
    appendCellNumber(pageSheet, 'DrawingResizeType', 1);
    appendCellNumber(pageSheet, 'PlaceStyle', 2);
    appendCellNumber(pageSheet, 'RouteStyle', 1);
    appendCellNumber(pageSheet, 'PageShapeSplit', 1);

    const rel = appendChild(node, makeElement('Rel'));
    setAttribute(rel, 'r:id', page.relationshipId);
    return node;
}
