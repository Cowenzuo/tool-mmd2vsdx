// mmd2vsdx - core 数据层：errors（统一错误）
//
// 分层错误定案（规划 D3，与 C++ 实码语义一致）：
//   1. MmdError（code: 4 码）——编排/翻译链错误（C++ core/base.hpp Error::Code
//      平移：NodeNotFound/JsonParseError/SubprocessCrashed/MermaidError）；
//   2. ZipError（M1 起，opcpkg 自含 7 码）——zip 层专用；
//   3. 参数/结构错误用内建 TypeError/RangeError（对应 C++ invalid_argument 等检查）；
//   4. 所有错误消息带 [phase] 前缀（TS-905）。

/** C++ Error::Code 顺序原样平移（数值保持 0..3 便于对照）。 */
export enum MmdErrorCode {
    NodeNotFound = 0,
    JsonParseError = 1,
    SubprocessCrashed = 2,
    MermaidError = 3,
}

/** 统一业务错误：携带 code，可被调用方按码分支处理。 */
export class MmdError extends Error {
    readonly code: MmdErrorCode;

    constructor(code: MmdErrorCode, message: string) {
        super(message);
        this.name = 'MmdError';
        this.code = code;
    }
}

/** 类型守卫：判断任意抛出值是否为 MmdError。 */
export function isMmdError(value: unknown): value is MmdError {
    return value instanceof MmdError;
}
