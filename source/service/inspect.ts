// 检视适配：把自产 .vsdx 拆回部件清单与页面结构，作为 agent 的"结构反馈"
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Squeeze } from '../squeeze/index.js';
import { ServiceError } from './errors.js';
import { kMaxInspectBytes, kMaxInspectTexts } from './limits.js';
import { isInside, type PathPolicy } from './paths.js';
import { probePageStats, probePages, type PageProbe } from './xmlProbe.js';

export interface InspectPart {
    uri: string;
    contentType: string;
    bytes: number;
}

export interface InspectReceipt {
    path: string;
    bytes: number;
    parts: InspectPart[];
    pages: PageProbe[];
    shapeCount: number;
    texts: string[];
}

/** 读一个自产 .vsdx，回报部件、页面尺寸、形状数与文本清单。 */
export function inspectFile(policy: PathPolicy, file: string, cwd?: string): InspectReceipt {
    if (typeof file !== 'string' || !file.trim()) {
        throw new ServiceError('invalid_argument', '检视需要文件路径', '传 path 指向一个 .vsdx');
    }
    const abs = resolve(file.startsWith('.') || !/^[A-Za-z]:[\\/]|^\//.test(file) ? resolve(cwd ?? policy.cwd, file) : file);
    if (!policy.roots.some((r) => isInside(r, abs))) {
        throw new ServiceError('path_denied', `检视路径不在允许目录内：${abs}`, `允许根：${policy.roots.join('、')}`);
    }
    let bytes: Buffer;
    try {
        const st = statSync(abs);
        if (st.size > kMaxInspectBytes) {
            throw new ServiceError('too_large', `文件 ${st.size} 字节，超过检视上限 ${kMaxInspectBytes} 字节`, '换一个小一些的产物');
        }
        bytes = readFileSync(abs);
    } catch (e) {
        if (e instanceof ServiceError) throw e;
        throw new ServiceError('invalid_argument', `读不到文件：${abs}`, String((e as Error).message));
    }
    let parts;
    try {
        parts = Squeeze.open(bytes).parts;
    } catch (e) {
        throw new ServiceError('invalid_argument', `不是可解析的 vsdx 包：${abs}`, String((e as Error).message));
    }
    const stats = probePageStats(parts, kMaxInspectTexts);
    return {
        path: abs,
        bytes: bytes.length,
        parts: parts.map((p) => ({ uri: p.uri, contentType: p.contentType, bytes: Buffer.byteLength(p.xml, 'utf8') })),
        pages: probePages(parts),
        shapeCount: stats.shapeCount,
        texts: stats.texts,
    };
}
