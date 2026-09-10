// xml-parts（⑬ 部件栈）：契约 B 收口——补公共部件（docProps/windows/登记表/关系表）+ 校验
import { makeElement, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
import { kCorePropsContentType, kDocPropsVTypesNs, kExtendedPropsContentType, kDcNs, kCorePropsNs, kExtendedPropsNs } from '../common/xml/constants.js';
import { part, validateContractB, type ContractB, type XmlPart } from '../contracts/index.js';
import { OpcPackage } from '../opc/index.js';

const kAnsiNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const kCustomPropsNs = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
const kCustomPropsContentType = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';

function decl(root: XmlNode): string {
    return serializeDocument(root, {
        declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        indent: 0,
    });
}

export interface PublicOptions {
    /** 文档标题/作者，默认 mmd2vsdx。 */
    title?: string;
    creator?: string;
    /** 是否带 RecalcDocument 自定义属性，默认 true。 */
    recalc?: boolean;
}

/** 部件栈门面：补全后返回完整契约 B（用 OpcPackage 保证登记表与关系表一致性）。 */
export class PartsAssembler {
    assemble(parts: XmlPart[], opts: PublicOptions = {}): ContractB {
        const pkg = new OpcPackage();
        for (const p of parts) pkg.addPart(p.uri, p.contentType, p.xml);
        this.addCommonParts(pkg, opts);
        const buf = pkg.save();
        const reopened = OpcPackage.open(buf);
        const all: XmlPart[] = reopened.listUris().map((u) => {
            const p = reopened.get(u)!;
            return part(u, p.contentType, p.xml);
        });
        const b: ContractB = { parts: all };
        const v = validateContractB(b);
        if (!v.ok) throw new Error(`[xml-parts] 契约 B 校验失败：${v.errors.join('；')}`);
        return b;
    }

    private hasMasters = false;

    private addCommonParts(pkg: OpcPackage, opts: PublicOptions): void {
        this.hasMasters = pkg.has('/visio/masters/masters.xml');
        if (!pkg.has('/docProps/core.xml')) {
            pkg.addPart('/docProps/core.xml', kCorePropsContentType, this.coreXml(opts));
        }
        if (!pkg.has('/docProps/app.xml')) {
            pkg.addPart('/docProps/app.xml', kExtendedPropsContentType, this.appXml());
        }
        if (!pkg.has('/docProps/custom.xml')) {
            pkg.addPart('/docProps/custom.xml', kCustomPropsContentType, this.customXml(opts));
        }
        if (!pkg.has('/visio/windows.xml')) {
            pkg.addPart('/visio/windows.xml', 'application/vnd.ms-visio.windows+xml', this.windowsXml());
        }
        if (!pkg.has('/_rels/.rels')) {
            pkg.addPart('/_rels/.rels', 'application/vnd.openxmlformats-package.relationships+xml', this.rootRels());
        }
        if (!pkg.has('/visio/_rels/document.xml.rels')) {
            pkg.addPart('/visio/_rels/document.xml.rels', 'application/vnd.openxmlformats-package.relationships+xml', this.docRels());
        }
        // 页目录关系表（research 5.5.1/5.5.3.5：页条目 Rel r:id → pageN.xml）
        if (pkg.has('/visio/pages/pages.xml') && !pkg.has('/visio/pages/_rels/pages.xml.rels')) {
            pkg.addPart(
                '/visio/pages/_rels/pages.xml.rels',
                'application/vnd.openxmlformats-package.relationships+xml',
                this.pagesRels(),
            );
        }
    }

    private coreXml(opts: PublicOptions): string {
        const root = makeElement('cp:coreProperties');
        setAttribute(root, 'xmlns:cp', kCorePropsNs);
        setAttribute(root, 'xmlns:dc', kDcNs);
        const title = makeElement('dc:title');
        title.children.push(opts.title ?? 'mmd2vsdx');
        const creator = makeElement('dc:creator');
        creator.children.push(opts.creator ?? 'mmd2vsdx');
        root.children.push(title, creator);
        return decl(root);
    }

    private appXml(): string {
        const root = makeElement('Properties');
        setAttribute(root, 'xmlns', kExtendedPropsNs);
        const app = makeElement('Application');
        app.children.push('mmd2vsdx');
        const ver = makeElement('AppVersion');
        ver.children.push('2.0');
        root.children.push(app, ver);
        return decl(root);
    }

    private customXml(opts: PublicOptions): string {
        const root = makeElement('Properties');
        setAttribute(root, 'xmlns', kCustomPropsNs);
        setAttribute(root, 'xmlns:vt', kDocPropsVTypesNs);
        const fmtid = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';
        const addI4 = (pid: number, name: string, value: number) => {
            const p = makeElement('property');
            setAttribute(p, 'fmtid', fmtid);
            setAttribute(p, 'pid', String(pid));
            setAttribute(p, 'name', name);
            const v = makeElement('vt:i4');
            v.children.push(String(value));
            p.children.push(v);
            root.children.push(p);
        };
        const bool = (pid: number, name: string, value: boolean) => {
            const p = makeElement('property');
            setAttribute(p, 'fmtid', fmtid);
            setAttribute(p, 'pid', String(pid));
            setAttribute(p, 'name', name);
            const v = makeElement('vt:bool');
            v.children.push(String(value));
            p.children.push(v);
            root.children.push(p);
        };
        addI4(3, 'BuildNumberCreated', 1179401801);
        addI4(4, 'BuildNumberEdited', 1179401801);
        bool(5, 'IsMetric', false);
        bool(7, 'RecalcDocument', opts.recalc ?? true);
        return decl(root);
    }

    private windowsXml(): string {
        const root = makeElement('Windows');
        setAttribute(root, 'xmlns', 'http://schemas.microsoft.com/office/visio/2012/main');
        setAttribute(root, 'xmlns:r', kAnsiNs);
        const w = makeElement('Window');
        setAttribute(w, 'ID', '0');
        setAttribute(w, 'WindowType', 'Drawing');
        setAttribute(w, 'ContainerType', 'Page');
        setAttribute(w, 'Page', '0');
        setAttribute(w, 'ViewScale', '1');
        const sr = makeElement('ShowRulers');
        sr.children.push('1');
        const sg = makeElement('ShowGrid');
        sg.children.push('0');
        const sb = makeElement('ShowPageBreaks');
        sb.children.push('1');
        const gs = makeElement('GlueSettings');
        gs.children.push('9');
        const ss = makeElement('SnapSettings');
        ss.children.push('295');
        w.children.push(sr, sg, sb, gs, ss);
        root.children.push(w);
        return decl(root);
    }

    private rootRels(): string {
        const root = makeElement('Relationships');
        setAttribute(root, 'xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');
        // Target 用相对路径（research 3.3/3.4："包根表的 Target 不带前缀"）
        const rels: Array<[string, string, string]> = [
            ['rId1', 'http://schemas.microsoft.com/visio/2010/relationships/document', 'visio/document.xml'],
            ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
            ['rId3', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties', 'docProps/app.xml'],
            ['rId4', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties', 'docProps/custom.xml'],
        ];
        for (const [id, type, target] of rels) {
            const el = makeElement('Relationship');
            setAttribute(el, 'Id', id);
            setAttribute(el, 'Type', type);
            setAttribute(el, 'Target', target);
            root.children.push(el);
        }
        return decl(root);
    }

    /** 页目录关系表：rId1 → page1.xml（research 5.5.3.5）。 */
    private pagesRels(): string {
        const root = makeElement('Relationships');
        setAttribute(root, 'xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');
        const el = makeElement('Relationship');
        setAttribute(el, 'Id', 'rId1');
        setAttribute(el, 'Type', 'http://schemas.microsoft.com/visio/2010/relationships/page');
        setAttribute(el, 'Target', 'page1.xml');
        root.children.push(el);
        return decl(root);
    }

    private docRels(): string {
        const root = makeElement('Relationships');
        setAttribute(root, 'xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');
        const rels: Array<[string, string, string]> = [];
        if (this.hasMasters) {
            rels.push(['rId1', 'http://schemas.microsoft.com/visio/2010/relationships/masters', 'masters/masters.xml']);
        }
        rels.push(['rId2', 'http://schemas.microsoft.com/visio/2010/relationships/pages', 'pages/pages.xml']);
        rels.push(['rId3', 'http://schemas.microsoft.com/visio/2010/relationships/windows', 'windows.xml']);
        for (const [id, type, target] of rels) {
            const el = makeElement('Relationship');
            setAttribute(el, 'Id', id);
            setAttribute(el, 'Type', type);
            setAttribute(el, 'Target', target);
            root.children.push(el);
        }
        return decl(root);
    }
}
