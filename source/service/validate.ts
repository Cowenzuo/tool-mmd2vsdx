// 校验适配：只解析不落盘，给 agent 一个低成本的试错入口
import type { Parser } from '../parser/index.js';
import { toServiceError, type ServiceErrorInfo } from './errors.js';
import { checkText } from './limits.js';

export interface ValidateReceipt {
    ok: boolean;
    kind?: string;
    supported: boolean;
    counts: Record<string, number>;
    error?: ServiceErrorInfo;
}

function countsOf(a: Awaited<ReturnType<Parser['convertText']>>): Record<string, number> {
    const counts: Record<string, number> = {
        shapes: a.shapes.length,
        edges: a.edges.length,
        clusters: a.clusters.length,
    };
    if (a.classModel) {
        counts.classes = a.classModel.classes.length;
        counts.relations = a.classModel.relations.length;
    }
    if (a.erModel) {
        counts.entities = a.erModel.entities.length;
        counts.relations = a.erModel.relations.length;
    }
    if (a.sequence) {
        counts.actors = a.sequence.actors.length;
        counts.messages = a.sequence.messages.length;
        counts.activations = a.sequence.activations.length;
        counts.fragments = a.sequence.fragments.length;
    }
    return counts;
}

/** 文本 → 校验回执；任何失败都落成回执里的 error，不向外抛。 */
export async function validateText(parser: Parser, text: unknown): Promise<ValidateReceipt> {
    try {
        const a = await parser.convertText(checkText(text));
        return { ok: true, kind: a.kind, supported: true, counts: countsOf(a) };
    } catch (e) {
        const err = toServiceError(e);
        return {
            ok: false,
            supported: err.code !== 'unsupported_kind',
            counts: {},
            error: err.info(),
        };
    }
}
