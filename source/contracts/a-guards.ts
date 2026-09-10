// 契约 A 运行时校验与兜底（docs/redesign/02-契约层/01-契约A 第 4 节）
import { kDiagramKinds, type ContractA, type DiagramKind } from './a.js';

/** 各图型对应的主扩展块字段名；kindOf 按先后顺序推断。 */
const kKindBlocks: ReadonlyArray<{ kind: DiagramKind; block: string }> = [
    { kind: 'class', block: 'classModel' },
    { kind: 'er', block: 'erModel' },
    { kind: 'sequence', block: 'sequence' },
];

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 结构校验：kind 合法即通过；扩展块与 kind 的对应留给消费方。 */
export function isContractA(v: unknown): v is ContractA {
    if (!isRecord(v)) return false;
    const kind = v['kind'];
    if (typeof kind !== 'string' || !(kDiagramKinds as readonly string[]).includes(kind)) {
        return false;
    }
    if (!isRecord(v['meta'])) return false;
    if (!Array.isArray(v['shapes'])) return false;
    if (!Array.isArray(v['edges'])) return false;
    if (!Array.isArray(v['clusters'])) return false;
    return true;
}

/** 从扩展块推断图型；自定义 kind 优先。kind 未声明时兜底 flowchart。 */
export function kindOf(a: ContractA): DiagramKind {
    const declared = a.kind;
    if ((kDiagramKinds as readonly string[]).includes(declared)) return declared;
    for (const { kind, block } of kKindBlocks) {
        const b = (a as unknown as Record<string, unknown>)[block];
        if (b !== undefined && isRecord(b)) return kind;
    }
    return 'flowchart';
}

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
