// 契约 A 运行时兜底（docs/开发过程/01-结构设计.md 第二节）
import { type ContractA } from './a.js';

/** 缺省字段补默认值；返回新对象，不修改入参。 */
export function fillDefaults(a: Partial<ContractA>): ContractA {
    return {
        kind: a.kind ?? 'flowchart',
        meta: { ...defaultMetaValues, ...(a.meta ?? {}) },
        shapes: a.shapes ?? [],
        edges: a.edges ?? [],
        clusters: a.clusters ?? [],
        classModel: a.classModel,
        erModel: a.erModel,
        sequence: a.sequence,
    };
}

const defaultMetaValues = {
    title: '',
    direction: '',
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    sourceText: '',
};
