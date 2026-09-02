// mmd2vsdx - mmdtransform：translator（门面：文本 → Diagram）
//
// C++ translator.{hpp,cpp} 进程内化（06 §2、坑位 ③ ③-3.1）：
//   translate(text) = snapshotRenderer.renderDiagram(text)
//                    → jsonToDiagram({status:'ok', ...result}) → Diagram
// 首次调用惰性初始化 + 预热；失败抛 MmdError（MermaidError/JsonParseError）；
// setScriptPath 保留兼容签名（进程内模式无实际作用，P2 HTTP 模式使用）。

import type { Diagram } from '../core/types.js';
import type { SnapshotResult } from '../core/snapshotTypes.js';
import { MmdError, MmdErrorCode } from '../core/errors.js';
import { jsonToDiagram } from './jsonToDiagram.js';
import { SnapshotRenderer, isSnapshotResult } from '../snapshot/renderer.js';

class Translator {
    private scriptPathOverride_ = '';
    private renderer_: SnapshotRenderer | null = null;

    /** 兼容签名：进程内模式保留字段；P2 独立 HTTP 模式使用。 */
    setScriptPath(path: string): void {
        this.scriptPathOverride_ = path;
        void this.scriptPathOverride_;
    }

    private ensureRenderer(): SnapshotRenderer {
        if (!this.renderer_) this.renderer_ = new SnapshotRenderer();
        return this.renderer_;
    }

    /** 翻译 Mermaid 文本 → Diagram（async；首次调用初始化 + 预热）。 */
    async translate(text: string): Promise<Diagram> {
        if (text.trim().length === 0) {
            throw new MmdError(MmdErrorCode.MermaidError, 'empty input');
        }
        try {
            const renderer = this.ensureRenderer();
            const result = await renderer.renderDiagram(text);
            if (!isSnapshotResult(result)) {
                throw new MmdError(MmdErrorCode.JsonParseError,
                    'snapshot result is malformed');
            }
            return jsonToDiagram({ status: 'ok', ...result });
        } catch (error) {
            if (error instanceof MmdError) throw error;
            throw new MmdError(MmdErrorCode.MermaidError,
                (error as Error).message ?? String(error));
        }
    }

    /** 关闭渲染器释放浏览器资源（幂等）。 */
    async shutdown(): Promise<void> {
        if (this.renderer_) {
            await this.renderer_.shutdown();
            this.renderer_ = null;
        }
    }
}

/** 共享单例（进程内直调默认路径）。 */
export const translator = new Translator();

export type { SnapshotResult };
