// xml-parts（部件栈）：契约 B 收口——补公共部件（docProps/windows/登记表/关系表）+ 校验
import { attr, elementChildren, makeElement, parseDocument, serializeDocument, setAttribute, type XmlNode } from '../common/xml/index.js';
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

interface PublicOptions {
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
        // 页目录关系表（规范版 5.5.1/5.5.3.5：页条目 Rel r:id → pageN.xml）
        if (pkg.has('/visio/pages/pages.xml') && !pkg.has('/visio/pages/_rels/pages.xml.rels')) {
            pkg.addPart(
                '/visio/pages/_rels/pages.xml.rels',
                'application/vnd.openxmlformats-package.relationships+xml',
                this.pagesRels(),
            );
        }
        this.addPageMasterRels(pkg);
    }

    /** 页→母版关系表：pageN.xml 用到的每个母版一条。
     *  官方样本除自产的 c4-1 外 14/15 都有此件；缺了之后页面的关系闭包里没有母版，
     *  OLE 激活首帧会按"母版未解析"作画（见 docs/VSDX处理经验/02-坑位与解法.md 8.1）。 */
    private addPageMasterRels(pkg: OpcPackage): void {
        const mastersUri = '/visio/masters/masters.xml';
        const mastersRelsUri = '/visio/masters/_rels/masters.xml.rels';
        if (!pkg.has(mastersUri) || !pkg.has(mastersRelsUri)) return;
        const fileByRel = new Map<string, string>();
        for (const rel of this.relElements(pkg.get(mastersRelsUri)!.xml)) {
            const id = attr(rel, 'Id');
            const target = attr(rel, 'Target');
            if (id && target) fileByRel.set(id, target);
        }
        const relById = new Map<string, string>();
        for (const master of elementChildren(parseDocument(pkg.get(mastersUri)!.xml))) {
            if (master.name !== 'Master') continue;
            const id = attr(master, 'ID');
            const relChild = elementChildren(master).find((c) => c.name === 'Rel');
            const relId = relChild ? (attr(relChild, 'r:id') ?? attr(relChild, 'id')) : null;
            if (id && relId) relById.set(id, relId);
        }
        if (relById.size === 0) return;
        for (const pageUri of pkg.listUris().filter((u) => /^\/visio\/pages\/page\d+\.xml$/.test(u)).sort()) {
            const relsUri = pageUri.replace(/^\/visio\/pages\//, '/visio/pages/_rels/').replace(/\.xml$/, '.xml.rels');
            if (pkg.has(relsUri)) continue;
            const targets: string[] = [];
            for (const id of this.masterIdsUsed(pkg.get(pageUri)!.xml)) {
                const relId = relById.get(id);
                const file = relId ? fileByRel.get(relId) : undefined;
                if (file && !targets.includes(file)) targets.push(file);
            }
            if (targets.length === 0) continue;
            pkg.addPart(relsUri, 'application/vnd.openxmlformats-package.relationships+xml', this.pageMasterRels(targets));
        }
    }

    private relElements(xml: string): XmlNode[] {
        return elementChildren(parseDocument(xml)).filter((n) => n.name === 'Relationship');
    }

    /** 页内所有形状（含嵌套子形状）用到的母版 ID，按首次出现去重。 */
    private masterIdsUsed(xml: string): string[] {
        const out: string[] = [];
        const walk = (node: XmlNode): void => {
            for (const child of elementChildren(node)) {
                if (child.name === 'Shape') {
                    const id = attr(child, 'Master');
                    if (id && !out.includes(id)) out.push(id);
                }
                walk(child);
            }
        };
        walk(parseDocument(xml));
        return out;
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
        // Target 用相对路径（规范版 3.3/3.4："包根表的 Target 不带前缀"）
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

    /** 页目录关系表：rId1 → page1.xml（规范版 5.5.3.5）。 */
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

    /** 页→母版关系表内容：rId 从 1 起连续，Target 相对页部件（官方 basic-2 形态）。 */
    private pageMasterRels(files: string[]): string {
        const root = makeElement('Relationships');
        setAttribute(root, 'xmlns', 'http://schemas.openxmlformats.org/package/2006/relationships');
        files.forEach((file, i) => {
            const el = makeElement('Relationship');
            setAttribute(el, 'Id', `rId${i + 1}`);
            setAttribute(el, 'Type', 'http://schemas.microsoft.com/visio/2010/relationships/master');
            setAttribute(el, 'Target', `../masters/${file}`);
            root.children.push(el);
        });
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
