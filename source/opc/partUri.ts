// OPC 底层：部件 URI 规则（前导 / 归一、.. 至多一次上跳、绝对路径拒绝）
export class PartUri {
    constructor(public readonly value: string) {
        if (!PartUri.isValid(value)) throw new Error(`[opc] 非法部件 URI：${value}`);
    }

    static parse(uri: string): PartUri {
        return new PartUri(uri);
    }

    static isValid(uri: string): boolean {
        if (uri.length === 0 || uri[0] !== '/') return false;
        if (uri.includes('\\')) return false;
        if (/^[A-Za-z]:/.test(uri)) return false; // 绝对路径
        const segs = uri.split('/');
        if (segs.includes('..')) return false; // 部件名不允许 ..；相对引用经 resolve
        if (segs.includes('.')) return false;
        return true;
    }

    /** zip 条目名：去前导斜杠。 */
    toEntryName(): string {
        return this.value.slice(1);
    }

    static fromEntryName(name: string): PartUri {
        return new PartUri('/' + name);
    }

    /** 关系表所在 uri：/a/b.xml → /a/_rels/b.xml.rels。 */
    relsUri(): string {
        const idx = this.value.lastIndexOf('/');
        const dir = idx >= 0 ? this.value.slice(0, idx + 1) : '/';
        const name = this.value.slice(idx + 1);
        return `${dir}_rels/${name}.rels`;
    }

    /** 相对 target 按 baseUri 解析（./ 与 ../ 支持，.. 越界抛错）。 */
    resolve(baseUri: string, target: string): string {
        if (target.startsWith('/')) return target;
        const base = baseUri.endsWith('/') ? baseUri : baseUri.slice(0, baseUri.lastIndexOf('/') + 1);
        const out: string[] = [];
        for (const seg of (base + target).split('/')) {
            if (seg === '' || seg === '.') continue;
            if (seg === '..') {
                if (out.length === 0) throw new Error('[opc] 相对引用越界');
                out.pop();
                continue;
            }
            out.push(seg);
        }
        return '/' + out.join('/');
    }
}
