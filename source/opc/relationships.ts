// OPC 底层：关系表（.rels）结构、序列化与解析
import {
    attr,
    elementChildren,
    makeElement,
    parseDocument,
    serializeDocument,
    setAttribute,
} from '../xml/xmlNode.js';
import { kPackageRelsNs } from '../xml/constants.js';

export interface Relationship {
    id: string;
    type: string;
    target: string;
    /** 'External' 或缺省。 */
    targetMode?: string;
}

/** 关系表构建器：rId 自增分配，目标保持相对写法。 */
export class Relationships {
    private items: Relationship[] = [];

    add(type: string, target: string, targetMode?: string): string {
        const id = `rId${this.items.length + 1}`;
        this.items.push({ id, type, target, targetMode });
        return id;
    }

    addWithId(id: string, type: string, target: string, targetMode?: string): void {
        this.items.push({ id, type, target, targetMode });
    }

    list(): Relationship[] {
        return [...this.items];
    }

    /** 序列化为完整 .rels 文件。 */
    toXml(): string {
        const root = makeElement('Relationships');
        setAttribute(root, 'xmlns', kPackageRelsNs);
        for (const r of this.items) {
            const el = makeElement('Relationship');
            setAttribute(el, 'Id', r.id);
            setAttribute(el, 'Type', r.type);
            setAttribute(el, 'Target', r.target);
            if (r.targetMode) setAttribute(el, 'TargetMode', r.targetMode);
            root.children.push(el);
        }
        return serializeDocument(root, {
            declaration: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            indent: 0,
        });
    }

    static fromXml(xml: string): Relationship[] {
        const root = parseDocument(xml);
        return elementChildren(root)
            .filter((c) => c.name === 'Relationship')
            .map((c) => ({
                id: attr(c, 'Id') ?? '',
                type: attr(c, 'Type') ?? '',
                target: attr(c, 'Target') ?? '',
                targetMode: attr(c, 'TargetMode') ?? undefined,
            }));
    }
}
