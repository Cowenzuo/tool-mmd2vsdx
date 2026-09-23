// OPC 底层：包对象（部件集合 → zip 字节；打开逆向）
import { readZip, writeZip, type ZipEntry } from './zip.js';
import { PartUri } from './partUri.js';
import { buildContentTypes, parseContentTypes } from './contentTypes.js';
import { kRelsContentType } from '../common/xml/constants.js';

interface PackagePart {
    uri: string;
    contentType: string;
    /** 文本内容（zip 条目原字节按 utf8）。 */
    xml: string;
}

/** zip 条目名：去前导斜杠。 */
function toEntryName(uri: string): string {
    return uri.slice(1);
}

export class OpcPackage {
    private parts = new Map<string, PackagePart>();

    listUris(): string[] {
        return [...this.parts.keys()];
    }

    get(uri: string): PackagePart | undefined {
        return this.parts.get(uri);
    }

    has(uri: string): boolean {
        return this.parts.has(uri);
    }

    addPart(uri: string, contentType: string, xml: string): void {
        const u = PartUri.parse(uri);
        if (this.parts.has(u.value)) throw new Error(`[opc] 部件已存在：${u.value}`);
        this.parts.set(u.value, { uri: u.value, contentType, xml });
    }

    setPart(uri: string, contentType: string, xml: string): void {
        const u = PartUri.parse(uri);
        this.parts.set(u.value, { uri: u.value, contentType, xml });
    }

    removePart(uri: string): void {
        this.parts.delete(uri);
    }

    /** 序列化：登记表缺失时自动补 → zip 字节。 */
    save(): Buffer {
        this.ensureContentTypes();
        const entries: ZipEntry[] = [...this.parts.values()].map((p) => ({
            name: toEntryName(p.uri),
            data: Buffer.from(p.xml, 'utf8'),
        }));
        return writeZip(entries);
    }

    private ensureContentTypes(): void {
        if (this.parts.has('/[Content_Types].xml')) return;
        const all = [...this.parts.values()].map((p) => ({ uri: p.uri, contentType: p.contentType }));
        const { xml } = buildContentTypes(all);
        this.parts.set('/[Content_Types].xml', {
            uri: '/[Content_Types].xml',
            contentType: 'application/xml',
            xml,
        });
    }

    /** 打开：zip → 部件；contentType 取自登记表，rels 走 Default。 */
    static open(buf: Buffer): OpcPackage {
        const entries = readZip(buf);
        const pkg = new OpcPackage();
        const ctMap = parseContentTypes(
            entries.find((e) => e.name === '[Content_Types].xml')?.data.toString('utf8') ?? '',
        );
        for (const e of entries) {
            const uri = '/' + e.name;
            const contentType =
                ctMap.get(uri) ?? (uri.endsWith('.rels') ? kRelsContentType : 'application/xml');
            pkg.parts.set(uri, { uri, contentType, xml: e.data.toString('utf8') });
        }
        return pkg;
    }
}
