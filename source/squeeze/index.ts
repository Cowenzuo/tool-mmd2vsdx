// squeeze（压缩库）：契约 B → .vsdx 字节；打开逆向（docs/开发过程/01-结构设计.md）
import { OpcPackage } from '../opc/index.js';
import { part, type ContractB, type XmlPart } from '../contracts/index.js';

export class Squeeze {
    /** 契约 B → zip 字节。登记表由包层保证；部件顺序即写入顺序。 */
    pack(b: ContractB): Buffer {
        const pkg = new OpcPackage();
        for (const p of b.parts) {
            if (p.uri === '/[Content_Types].xml') pkg.setPart(p.uri, p.contentType, p.xml);
            else pkg.addPart(p.uri, p.contentType, p.xml);
        }
        return pkg.save();
    }

    /** 打开 .vsdx → 契约 B（校验与后续比对用）。 */
    static open(buf: Buffer): ContractB {
        const pkg = OpcPackage.open(buf);
        const parts: XmlPart[] = pkg.listUris().map((u) => {
            const p = pkg.get(u)!;
            return part(u, p.contentType, p.xml);
        });
        return { parts };
    }
}
