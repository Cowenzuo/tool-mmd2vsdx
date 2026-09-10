// 样式组：document.xml 骨架与样式表部件生成（docs/redesign/04-转义层/10-公用库）
import { makeElement, serializeDocument, setAttribute } from '../xml/index.js';
import { kDocumentContentType, kDocumentUri, kVisioNamespace } from '../xml/constants.js';
import { part, type XmlPart } from '../../contracts/index.js';
import { defaultFaceNames, type StyleRegistry } from './model.js';

export interface ColorsOptions {
    /** ColorEntry 列表：{ix, rgb}；缺省给主题首尾两条。 */
    entries?: Array<{ ix: number; rgb: string }>;
    /** 预生成 document.xml 模板（research 6.4 c4-1 自产基准）；提供时原样使用。 */
    baseXml?: string;
}

function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cellXml(name: string, value: string, unit?: string, formula?: string): string {
    const u = unit ? ` U="${unit}"` : '';
    const f = formula ? ` F="${escapeXml(formula)}"` : '';
    return `<Cell N="${name}" V="${value}"${u}${f}/>`;
}

/** 生成 document.xml 部件：DocumentSettings + StyleSheets + Colors + FaceNames。 */
export function buildDocumentPart(registry: StyleRegistry, opts: ColorsOptions = {}): XmlPart {
    if (opts.baseXml) return part(kDocumentUri, kDocumentContentType, opts.baseXml);

    const root = makeElement('VisioDocument');
    setAttribute(root, 'xmlns', kVisioNamespace);
    setAttribute(root, 'xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');

    const settings = makeElement('DocumentSettings');
    setAttribute(settings, 'TopPage', '0');
    setAttribute(settings, 'DefaultTextStyle', '3');
    setAttribute(settings, 'DefaultLineStyle', '3');
    setAttribute(settings, 'DefaultFillStyle', '3');
    setAttribute(settings, 'DefaultGuideStyle', '4');
    // 文档级行为开关（research 6.4.4：手绘 8 个、自产 9 个，含空 SnapAngles）
    for (const [name, value] of [
        ['GlueSettings', '9'],
        ['SnapSettings', '295'],
        ['SnapExtensions', '34'],
        ['SnapAngles', ''],
        ['DynamicGridEnabled', '1'],
        ['ProtectStyles', '0'],
        ['ProtectShapes', '0'],
        ['ProtectMasters', '0'],
        ['ProtectBkgnds', '0'],
    ] as Array<[string, string]>) {
        const child = makeElement(name);
        if (value) child.children.push(value);
        settings.children.push(child);
    }
    root.children.push(settings);

    const sheets = makeElement('StyleSheets');
    for (const { id, spec } of registry.specs()) {
        const el = makeElement('StyleSheet');
        setAttribute(el, 'ID', String(id));
        setAttribute(el, 'NameU', spec.nameU);
        setAttribute(el, 'IsCustomNameU', '1');
        if (spec.name) setAttribute(el, 'Name', spec.name);
        if (spec.lineStyle !== undefined) setAttribute(el, 'LineStyle', String(spec.lineStyle));
        if (spec.fillStyle !== undefined) setAttribute(el, 'FillStyle', String(spec.fillStyle));
        if (spec.textStyle !== undefined) setAttribute(el, 'TextStyle', String(spec.textStyle));
        for (const c of spec.cells) {
            const child = makeElement('Cell');
            setAttribute(child, 'N', c.name);
            if (c.value !== undefined) setAttribute(child, 'V', c.value);
            if (c.unit !== undefined) setAttribute(child, 'U', c.unit);
            if (c.formula !== undefined) setAttribute(child, 'F', c.formula);
            el.children.push(child);
        }
        sheets.children.push(el);
    }
    root.children.push(sheets);

    const colors = makeElement('Colors');
    const entries = opts.entries ?? [
        { ix: 24, rgb: '#7F7F7F' },
        { ix: 25, rgb: '#FFFFFF' },
    ];
    for (const e of entries) {
        const el = makeElement('ColorEntry');
        setAttribute(el, 'IX', String(e.ix));
        setAttribute(el, 'RGB', e.rgb);
        colors.children.push(el);
    }
    root.children.push(colors);

    const faces = makeElement('FaceNames');
    for (const f of defaultFaceNames()) {
        const el = makeElement('FaceName');
        setAttribute(el, 'NameU', f.nameU);
        for (const [k, v] of Object.entries(f.attrs)) setAttribute(el, k, v);
        faces.children.push(el);
    }
    root.children.push(faces);

    const xml = serializeDocument(root, {
        declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        indent: 0,
    });
    return part(kDocumentUri, kDocumentContentType, xml);
}

export { cellXml };
