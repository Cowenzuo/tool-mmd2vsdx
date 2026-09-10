// 文本组：run 分段与转义（docs/开发过程/01-结构设计.md）

/** 文本分段意图：一段文本 = 若干 run；多行用字面换行（research basic-4 观察）。 */
export interface RunSegment {
    text: string;
    /** 该 run 之前是否有换行（首行 0，后续行 1）。 */
    newlinesBefore: number;
}

/** XML 文本转义（& < >）。 */
export function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 文本 → run 分段：单段一个 run；多行每行一段（首行 0、后续行 1）；
 * 忽略前导空行与末尾空行，中间空行表现为下一行 newlinesBefore=1。
 */
export function splitRuns(text: string): RunSegment[] {
    const lines = text.split('\n');
    const runs: RunSegment[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.length === 0 && (i === 0 || i === lines.length - 1)) continue;
        runs.push({ text: line, newlinesBefore: runs.length === 0 ? 0 : 1 });
    }
    if (runs.length === 0 && text.includes('\n')) {
        runs.push({ text: '', newlinesBefore: 1 });
    }
    if (runs.length === 0) runs.push({ text: '', newlinesBefore: 0 });
    return runs;
}

/** 文本块宽度估算：最长行 × 单字符宽（宽度校准见 text/layout 阶段）。 */
export function estimateTextWidth(text: string, charWidthInch = 0.0556): number {
    const w = Math.max(0, ...splitRuns(text).map((r) => r.text.length));
    return w * charWidthInch;
}

/** 文本块高度估算：行数 × 行高。 */
export function estimateTextHeight(text: string, lineHeightInch = 0.1389): number {
    return Math.max(1, splitRuns(text).length) * lineHeightInch;
}
