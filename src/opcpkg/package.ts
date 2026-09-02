// mmd2vsdx - opcpkg：package（OPC 包容器）
//
// C++ opcpkg/package.{hpp,cpp} 平移（04 §4.5、坑位 ⑪-11.2）。
// 语义（逐条照抄 C++）：
//   - 存储模型：contentTypes_（[Content_Types].xml 管理器，不占 parts_ 条目）；
//     parts_ 含全部其它部件（*.rels 部件以 payload 形式存于 parts_，无 CT Override，
//     由 "rels" Default 覆盖——ECMA-376 红线，Visio 等严格消费者拒绝带 Override 的包）；
//   - addPart：禁改 [Content_Types].xml；已存在部件 → 原位替换（contentType/payload/
//     compression/dirty）；新建 → dirty=true；
//   - 排序：std::map 键序 → partUris()/save() 必须显式按 PartUri 序迭代复刻；
//   - save：先 CT（以其压缩方式）后按序各部件 → ZipArchive.write；
//   - open：zip → CT 解析（压缩方式记下）→ 其余条目经 PartUri.parse 入 parts_
//     （contentType = contentTypeFor，查不到抛"has no content type"）→ validate()；
//   - validate：Override 引用的部件必须存在；每部件 contentType 与 CT 一致；
//     rels 部件源存在 + 每个 Internal 目标存在；
//   - 错误分层：结构错误 Error（runtime_error 消息）、参数 TypeError、越界 RangeError。
//
// TS 差异注：C++ const/non-const part() 的自动 dirty 翻转无消费方（save 恒全量
// 写出），TS 仅保留 dirty 字段供追踪，访问器不自动置位。

import { ContentTypes } from './contentTypes.js';
import { PartUri } from './partUri.js';
import { Relationships } from './relationships.js';
import { readZip, writeZip, ZipCompression } from './zipArchive.js';
import type { ZipCompressionValue, ZipEntry, ZipLimits } from './zipArchive.js';

const kContentTypesPartName = '[Content_Types].xml';
const kRelationshipsContentType =
    'application/vnd.openxmlformats-package.relationships+xml';

export interface OpcPart {
    uri: PartUri;
    contentType: string;
    payload: Buffer;
    compression: ZipCompressionValue;
    dirty: boolean;
}

function findZipEntry(entries: ZipEntry[], name: string): ZipEntry | null {
    return entries.find((e) => e.name === name) ?? null;
}

export class Package {
    private readonly contentTypes_: ContentTypes;
    private contentTypesCompression_: ZipCompressionValue = ZipCompression.Deflate;
    /** 键 = uri.string()（PartUri 规范化值）。 */
    private readonly parts_: Map<string, OpcPart> = new Map();

    private constructor(contentTypes: ContentTypes) {
        this.contentTypes_ = contentTypes;
    }

    static open(path: string, limits?: ZipLimits): Package {
        const entries = readZip(path, limits);
        const contentTypesEntry = findZipEntry(entries, kContentTypesPartName);
        if (!contentTypesEntry) {
            throw new Error('OPC package has no [Content_Types].xml');
        }
        const package_ = new Package(ContentTypes.parse(contentTypesEntry.data));
        package_.contentTypesCompression_ = contentTypesEntry.compression;
        for (const entry of entries) {
            if (entry.name === kContentTypesPartName) continue;
            const uri = PartUri.parse(entry.name);
            const contentType = package_.contentTypes_.contentTypeFor(uri);
            if (contentType === null) {
                throw new Error('OPC part has no content type: ' + uri.string());
            }
            package_.parts_.set(uri.string(), {
                uri,
                contentType,
                payload: entry.data,
                compression: entry.compression,
                dirty: false,
            });
        }
        package_.validate();
        return package_;
    }

    static create(): Package {
        const contentTypes = ContentTypes.create();
        contentTypes.setDefault('rels', kRelationshipsContentType);
        contentTypes.setDefault('xml', 'application/xml');
        return new Package(contentTypes);
    }

    contains(uri: PartUri): boolean {
        return this.parts_.has(uri.string());
    }

    /** 部件访问（返回 live 对象；不存在抛 RangeError，消息同 C++ out_of_range）。 */
    part(uri: PartUri): OpcPart {
        const found = this.parts_.get(uri.string());
        if (!found) {
            throw new RangeError('OPC part not found: ' + uri.string());
        }
        return found;
    }

    /** 部件清单（std::map 键序：显式排序复刻）。 */
    partUris(): PartUri[] {
        const result = [...this.parts_.keys()].map((k) => PartUri.parse(k));
        result.sort((a, b) => PartUri.compare(a, b));
        return result;
    }

    addPart(uri: PartUri, contentType: string, payload: Buffer,
            compression: ZipCompressionValue = ZipCompression.Deflate): void {
        if (uri.string() === kContentTypesPartName) {
            throw new TypeError('[Content_Types].xml is managed by Package');
        }
        // .rels 部件由 "rels" Default 覆盖；ECMA-376 禁止为其加 Override
        if (!uri.string().includes('.rels')) {
            this.contentTypes_.setOverride(uri, contentType);
        }
        const existing = this.parts_.get(uri.string());
        if (!existing) {
            this.parts_.set(uri.string(), {
                uri,
                contentType,
                payload,
                compression,
                dirty: true,
            });
        } else {
            existing.contentType = contentType;
            existing.payload = payload;
            existing.compression = compression;
            existing.dirty = true;
        }
    }

    removePart(uri: PartUri): void {
        this.parts_.delete(uri.string());
        this.contentTypes_.removeOverride(uri);
    }

    private static relationshipsPartUri(source: PartUri | null): PartUri {
        return source !== null ? source.relationshipsUri() : PartUri.packageRelationships();
    }

    relationships(source: PartUri | null): Relationships {
        const uri = Package.relationshipsPartUri(source);
        const found = this.parts_.get(uri.string());
        if (!found) return Relationships.create(source);
        if (found.contentType !== kRelationshipsContentType) {
            throw new Error('Relationships part has an invalid content type: ' + uri.string());
        }
        return Relationships.parse(found.payload, source);
    }

    setRelationships(relationships: Relationships): void {
        const uri = Package.relationshipsPartUri(relationships.source());
        this.addPart(uri, kRelationshipsContentType, relationships.serialize(),
            ZipCompression.Deflate);
    }

    contentTypes(): ContentTypes {
        return this.contentTypes_;
    }

    validate(): void {
        for (const partName of this.contentTypes_.overrides().keys()) {
            const uri = PartUri.parse(partName);
            if (!this.contains(uri)) {
                throw new Error(
                    'Content type Override references a missing part: ' + uri.string());
            }
        }
        for (const item of this.parts_.values()) {
            const contentType = this.contentTypes_.contentTypeFor(item.uri);
            if (contentType === null || contentType !== item.contentType) {
                throw new Error('Content type mismatch for OPC part: ' + item.uri.string());
            }
            if (item.contentType !== kRelationshipsContentType) continue;
            const source = PartUri.sourceFromRelationships(item.uri);
            if (source !== null && !this.contains(source)) {
                throw new Error('Relationships source part is missing: ' + source.string());
            }
            const parsed = Relationships.parse(item.payload, source);
            for (const relationship of parsed.items()) {
                const target = parsed.resolveTarget(relationship);
                if (target !== null && !this.contains(target)) {
                    throw new Error(
                        'Relationship ' + relationship.id + ' from ' +
                        (source !== null ? source.string() : '<package>') +
                        ' targets a missing part: ' + target.string());
                }
            }
        }
    }

    save(path: string, limits?: ZipLimits): void {
        this.validate();
        const entries: Array<{ name: string; data: Buffer; compression: ZipCompressionValue }> = [];
        entries.push({
            name: kContentTypesPartName,
            data: this.contentTypes_.serialize(),
            compression: this.contentTypesCompression_,
        });
        for (const item of this.partUris()) {
            const part = this.parts_.get(item.string())!;
            entries.push({ name: item.string(), data: part.payload, compression: part.compression });
        }
        writeZip(path, entries, limits);
    }
}
