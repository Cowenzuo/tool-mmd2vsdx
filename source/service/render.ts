// 转换：mermaid 文本 → .vsdx 字节。不落盘、不碰路径，产物只以字节形态交出。
import type { ContractA } from '../contracts/index.js';
import { renderContract } from '../convert.js';
import { PartsAssembler } from '../xml-parts/index.js';
import { Squeeze } from '../squeeze/index.js';
import type { Parser } from '../parser/index.js';
import { checkOutputSize, checkText } from './limits.js';

/** 既有管线四步：文本 → 契约 A → 契约 B → 部件 → 字节。 */
export async function renderVsdx(
    parser: Parser,
    text: unknown,
    timeoutMs = 0,
): Promise<{ bytes: Buffer; a: ContractA }> {
    const source = checkText(text);
    const a = await parser.convertText(source, { renderTimeoutMs: timeoutMs });
    const b = renderContract(a);
    const assembled = new PartsAssembler().assemble(b.parts);
    const bytes = new Squeeze().pack(assembled);
    checkOutputSize(bytes.length);
    return { bytes, a };
}
