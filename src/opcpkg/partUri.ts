// mmd2vsdx - opcpkg：partUri（OPC 部件 URI）
//
// C++ opcpkg/parturi.{hpp,cpp} 平移（04 §4.1、坑位 ⑪-11.2）。
// 规则（逐条照抄 C++）：
//   - 禁 \ ? #；禁空/尾斜杠（"不命名部件"）；段禁空/./..（"未规范化"）；
//     段内禁 ':'（"绝对 URI 段"）；parse 剥一个前导 '/'；
//   - resolve：绝对（前导 /）→ parse；相对 → 源目录 + 目标段（跳过空与 '.'，
//     '..' 出栈越界抛"escapes the package"，段含 ':' 抛"absolute URI"）；
//   - 大小写不敏感比较经存储规范化值（equals 直接比较字符串，与 C++ operator== 一致）；
//   - 参数类错误用 TypeError，消息与 C++ invalid_argument 文案相同。

export class PartUri {
    /** 规范化后的部件名（无前导 '/'），如 "visio/document.xml"。 */
    readonly value: string;

    private constructor(value: string) {
        this.value = value;
    }

    private static validateCommon(value: string): void {
        if (value.length === 0) throw new TypeError('OPC part URI is empty');
        if (value.includes('\\')) throw new TypeError('OPC part URI contains a backslash');
        if (value.includes('?') || value.includes('#')) {
            throw new TypeError('OPC part URI contains a query or fragment');
        }
    }

    private static splitSegments(value: string): string[] {
        return value.split('/');
    }

    private static joinSegments(segments: string[]): string {
        return segments.join('/');
    }

    /** 解析并校验一个部件名。 */
    static parse(value: string): PartUri {
        PartUri.validateCommon(value);
        let v = value;
        if (v.startsWith('/')) v = v.slice(1);
        if (v.length === 0 || v.endsWith('/')) {
            throw new TypeError('OPC part URI does not name a part');
        }
        for (const segment of PartUri.splitSegments(v)) {
            if (segment.length === 0 || segment === '.' || segment === '..') {
                throw new TypeError('OPC part URI is not normalized');
            }
            if (segment.includes(':')) {
                throw new TypeError('OPC part URI contains an absolute URI segment');
            }
        }
        return new PartUri(v);
    }

    /** 相对目标解析：source=null 表示包根。 */
    static resolve(source: PartUri | null, target: string): PartUri {
        PartUri.validateCommon(target);
        if (target.endsWith('/')) {
            throw new TypeError('OPC relationship target does not name a part');
        }
        if (target.startsWith('/')) return PartUri.parse(target);

        const segments: string[] = [];
        if (source !== null) {
            const base = PartUri.splitSegments(source.value);
            base.pop(); // 去掉源文件名，保留目录
            segments.push(...base);
        }
        for (const segment of PartUri.splitSegments(target)) {
            if (segment.length === 0 || segment === '.') continue;
            if (segment === '..') {
                if (segments.length === 0) {
                    throw new TypeError('OPC relationship target escapes the package');
                }
                segments.pop();
                continue;
            }
            if (segment.includes(':')) {
                throw new TypeError('OPC relationship target is an absolute URI');
            }
            segments.push(segment);
        }
        if (segments.length === 0) {
            throw new TypeError('OPC relationship target does not name a part');
        }
        return new PartUri(PartUri.joinSegments(segments));
    }

    /** 包级关系部件 "_rels/.rels"。 */
    static packageRelationships(): PartUri {
        return new PartUri('_rels/.rels');
    }

    /** 本部件的 .rels 位置（同目录 _rels/ 下）。 */
    relationshipsUri(): PartUri {
        const slash = this.value.lastIndexOf('/');
        if (slash < 0) {
            return new PartUri('_rels/' + this.value + '.rels');
        }
        return new PartUri(
            this.value.slice(0, slash + 1) + '_rels/' + this.value.slice(slash + 1) + '.rels');
    }

    /** 从关系部件反推源部件；根关系（_rels/.rels）返回 null；非法抛 TypeError。 */
    static sourceFromRelationships(relationshipsUri: PartUri): PartUri | null {
        if (relationshipsUri.equals(PartUri.packageRelationships())) return null;
        const value = relationshipsUri.value;
        const marker = value.lastIndexOf('/_rels/');
        const prefixLength = marker < 0 ? 0 : marker + 1;
        const markerLength = 6; // "/_rels/"

        if ((marker < 0 && !value.startsWith('_rels/')) ||
            value.length <= prefixLength + markerLength ||
            value.length < 5 || !value.endsWith('.rels')) {
            throw new TypeError('URI is not an OPC relationships part');
        }
        const directory = value.slice(0, prefixLength);
        const filenameBegin = prefixLength + markerLength;
        const filenameLength = value.length - filenameBegin - 5;
        if (filenameLength === 0) {
            throw new TypeError('Relationships part has no source name');
        }
        return PartUri.parse(directory + value.slice(filenameBegin, filenameBegin + filenameLength));
    }

    /** 对照 C++ operator==（规范化存储值比较）。 */
    equals(other: PartUri): boolean {
        return this.value === other.value;
    }

    /** 对照 C++ operator< 语义（排序用）。 */
    static compare(a: PartUri, b: PartUri): number {
        return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    }

    string(): string {
        return this.value;
    }
}
