// mmd2vsdx - opcpkg：relationships（.rels 关系部件）
//
// C++ opcpkg/relationships.{hpp,cpp} 平移（04 §4.3、坑位 ⑪-11.2）。
// 语义（逐条照抄 C++）：
//   - parse：根必须为 Relationships；Relationship 属性 Id/Type/Target[/TargetMode]；
//     TargetMode 空或缺省=Internal（内部目标经 PartUri::resolve 校验）、
//     'External'=External、其它 → Error；Id 重复 → Error；字段空 → TypeError；
//   - items 保持文件序/添加序；serialize 按 items 序重建树
//     （C++ 序列化即文档树序=解析序/追加序，等价复刻）；
//   - add：id 空 → rIdN 最小空闲；显式 id 重复 → TypeError；返回新 id；
//   - resolveTarget：External → null，Internal → PartUri::resolve(source, target)。
//   - 解析错误用 Error，参数错误用 TypeError，消息同 C++。

import { PartUri } from './partUri.js';
import {
    appendChild,
    attribute,
    makeElement,
    parseDocument,
    serializeDocument,
    setAttribute,
} from '../xml/xmlNode.js';

const kRelationshipsNamespace =
    'http://schemas.openxmlformats.org/package/2006/relationships';

export enum RelationshipTargetMode {
    Internal,
    External,
}

export interface Relationship {
    id: string;
    type: string;
    target: string;
    targetMode: RelationshipTargetMode;
}

function validateRelationship(relationship: Relationship): void {
    if (relationship.id.length === 0 || relationship.type.length === 0 ||
        relationship.target.length === 0) {
        throw new TypeError('OPC relationship fields must not be empty');
    }
}

export class Relationships {
    private readonly source_: PartUri | null;
    private readonly items_: Relationship[] = [];

    private constructor(source: PartUri | null) {
        this.source_ = source;
    }

    static parse(payload: Uint8Array, source: PartUri | null): Relationships {
        const result = new Relationships(source);
        const xml = Buffer.from(payload).toString('utf8');
        const root = parseDocument(xml, 'relationships part');
        if (root.name !== 'Relationships') {
            throw new Error('Relationships part has an invalid root element');
        }
        const ids = new Set<string>();
        for (const child of root.children) {
            if (typeof child === 'string' || child.name !== 'Relationship') continue;
            const relationship: Relationship = {
                id: attribute(child, 'Id') ?? '',
                type: attribute(child, 'Type') ?? '',
                target: attribute(child, 'Target') ?? '',
                targetMode: RelationshipTargetMode.Internal,
            };
            const mode = attribute(child, 'TargetMode') ?? '';
            if (mode.length === 0 || mode === 'Internal') {
                relationship.targetMode = RelationshipTargetMode.Internal;
                PartUri.resolve(source, relationship.target); // 校验内部目标
            } else if (mode === 'External') {
                relationship.targetMode = RelationshipTargetMode.External;
            } else {
                throw new Error('Unsupported Relationship TargetMode: ' + mode);
            }
            validateRelationship(relationship);
            if (ids.has(relationship.id)) {
                throw new Error('Duplicate Relationship Id: ' + relationship.id);
            }
            ids.add(relationship.id);
            result.items_.push(relationship);
        }
        return result;
    }

    static create(source: PartUri | null): Relationships {
        return new Relationships(source);
    }

    source(): PartUri | null {
        return this.source_;
    }

    items(): readonly Relationship[] {
        return this.items_;
    }

    findById(id: string): Relationship | null {
        return this.items_.find((r) => r.id === id) ?? null;
    }

    findByType(type: string): Relationship[] {
        return this.items_.filter((r) => r.type === type);
    }

    resolveTarget(relationship: Relationship): PartUri | null {
        if (relationship.targetMode === RelationshipTargetMode.External) {
            return null;
        }
        return PartUri.resolve(this.source_, relationship.target);
    }

    /** rIdN 最小空闲（C++ nextId 语义）。 */
    private nextId(): string {
        for (let value = 1; ; value++) {
            const id = 'rId' + value;
            if (!this.findById(id)) return id;
        }
    }

    add(type: string, target: string,
        mode: RelationshipTargetMode = RelationshipTargetMode.Internal,
        id = ''): string {
        const relationship: Relationship = {
            id: id.length === 0 ? this.nextId() : id,
            type,
            target,
            targetMode: mode,
        };
        validateRelationship(relationship);
        if (this.findById(relationship.id)) {
            throw new TypeError('Duplicate Relationship Id: ' + relationship.id);
        }
        if (relationship.targetMode === RelationshipTargetMode.Internal) {
            PartUri.resolve(this.source_, relationship.target);
        }
        this.items_.push(relationship);
        return relationship.id;
    }

    serialize(): Buffer {
        const root = makeElement('Relationships');
        setAttribute(root, 'xmlns', kRelationshipsNamespace);
        for (const relationship of this.items_) {
            const node = appendChild(root, makeElement('Relationship'));
            setAttribute(node, 'Id', relationship.id);
            setAttribute(node, 'Type', relationship.type);
            setAttribute(node, 'Target', relationship.target);
            if (relationship.targetMode === RelationshipTargetMode.External) {
                setAttribute(node, 'TargetMode', 'External');
            }
        }
        return Buffer.from(serializeDocument(root), 'utf8');
    }
}
