// service 门面：库 API、CLI、MCP 三个入口共用这一层
// 对应 docs/版本开发过程/alpha3/方案.md：入口只做参数校验与回执整形，转换逻辑在这里
import { Parser } from '../parser/index.js';
import { toServiceError } from './errors.js';
import {
    convertBatch,
    convertToFile,
    type BatchItem,
    type BatchReceipt,
    type ConvertReceipt,
    type ConvertRequest,
} from './convert.js';
import { inspectFile, type InspectReceipt } from './inspect.js';
import { createPathPolicy, type PathPolicy } from './paths.js';
import { validateText, type ValidateReceipt } from './validate.js';

export interface ServiceConfig {
    /** 输出根目录，等价环境变量 MMD2VSDX_OUTPUT_DIR。 */
    outputDir?: string | undefined;
    /** 工作目录，默认进程工作目录；测试可注入。 */
    cwd?: string | undefined;
}

export class ServiceSession {
    private readonly parser = new Parser();
    readonly policy: PathPolicy;

    constructor(cfg: ServiceConfig = {}) {
        this.policy = createPathPolicy({
            outputDir: cfg.outputDir ?? process.env['MMD2VSDX_OUTPUT_DIR'],
            cwd: cfg.cwd,
        });
    }

    /** 单次转换。 */
    async convert(req: ConvertRequest): Promise<ConvertReceipt> {
        try {
            return await convertToFile(this.parser, this.policy, req);
        } catch (e) {
            throw toServiceError(e);
        }
    }

    /** 批量转换，逐项隔离失败。 */
    async convertMany(items: BatchItem[], outDir?: string, overwrite = false): Promise<BatchReceipt> {
        try {
            return await convertBatch(this.parser, this.policy, items, outDir, overwrite);
        } catch (e) {
            throw toServiceError(e);
        }
    }

    /** 只解析的校验，失败也返回回执。 */
    async validate(text: unknown): Promise<ValidateReceipt> {
        return validateText(this.parser, text);
    }

    /** 检视自产产物。 */
    inspect(file: string): InspectReceipt {
        try {
            return inspectFile(this.policy, file);
        } catch (e) {
            throw toServiceError(e);
        }
    }

    /** 关掉浏览器资源（进程退出前调用）。 */
    async shutdown(): Promise<void> {
        await this.parser.shutdown();
    }
}

export { ServiceError, toServiceError } from './errors.js';
export type { ServiceErrorCode, ServiceErrorInfo } from './errors.js';
export type { ConvertRequest, ConvertReceipt, BatchItem, BatchReceipt, BatchItemResult } from './convert.js';
export type { ValidateReceipt } from './validate.js';
export type { InspectReceipt, InspectPart } from './inspect.js';
export type { PathPolicy } from './paths.js';
export { kMaxBatchItems, kMaxInputBytes, kMaxOutputBytes } from './limits.js';
