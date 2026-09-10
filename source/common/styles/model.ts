// 样式组：模型与生成（docs/开发过程/01-结构设计.md）
//
// 样式 KEY 是语义名（'normal'、'connector'、'prTimebarFill'…），
// 文档内 ID 由 resolver 按注册顺序分配（0-6 基底 + pr 家族 7 起）。

import type { CellIntent, SectionIntent } from '../intents.js';
import { cell } from '../intents.js';
import { kFont } from './fonts.js';

/** 文档内样式 ID 常量（与 Visio 模板惯例对齐：0-6 基底）。 */
export const kStyleIdBase = {
    noStyle: 0,
    textOnly: 1,
    none: 2,
    normal: 3,
    guide: 4,
    theme: 6,
    basic: 7,
} as const;

export interface StyleSheetSpec {
    nameU: string;
    /** 显示名（空=用 NameU）。 */
    name?: string;
    /** 三引用：Line/Fill/Text 指向的样式 ID。 */
    lineStyle?: number;
    fillStyle?: number;
    textStyle?: number;
    cells: CellIntent[];
    sections?: SectionIntent[];
}

export type StyleKey =
    | 'noStyle'
    | 'textOnly'
    | 'none'
    | 'normal'
    | 'guide'
    | 'theme'
    | 'basic'
    | 'connector'
    | string; // pr 家族等按名注册

/** 注册表：KEY → 规格 + 文档内 ID。默认含基底 7 枚。 */
export class StyleRegistry {
    private specMap = new Map<string, StyleSheetSpec>();
    private ids = new Map<string, number>();

    constructor() {
        this.registerBase();
    }

    private registerBase(): void {
        // 基底默认 Cell（规范版 6.4.3 特征：0 号 No Style 为默认基线，含 Font/Size；
        // 4 号 Guide 取 #7f7f7f 且不可打印）。仅资产缺失时生效，资产模板优先。
        this.specMap.set('noStyle', {
            nameU: 'No Style',
            cells: [
                cell('Font', 'SimSun'),
                cell('Size', '0.16666666666666666', 'PT'),
                cell('LineWeight', '0.01041666666666667', 'PT'),
            ],
        });
        this.ids.set('noStyle', kStyleIdBase.noStyle);
        this.specMap.set('textOnly', { nameU: 'Text Only', lineStyle: 3, fillStyle: 3, textStyle: 3, cells: [] });
        this.ids.set('textOnly', kStyleIdBase.textOnly);
        this.specMap.set('none', {
            nameU: 'None',
            lineStyle: 3,
            fillStyle: 3,
            textStyle: 3,
            cells: [cell('LinePattern', '0'), cell('FillPattern', '0')],
        });
        this.ids.set('none', kStyleIdBase.none);
        this.specMap.set('normal', { nameU: 'Normal', lineStyle: 6, fillStyle: 6, textStyle: 6, cells: [] });
        this.ids.set('normal', kStyleIdBase.normal);
        this.specMap.set('guide', {
            nameU: 'Guide',
            lineStyle: 3,
            fillStyle: 3,
            textStyle: 3,
            cells: [cell('LineColor', '#7f7f7f'), cell('NonPrinting', '1')],
        });
        this.ids.set('guide', kStyleIdBase.guide);
        this.specMap.set('theme', { nameU: 'Theme', lineStyle: 0, fillStyle: 0, textStyle: 0, cells: [] });
        this.ids.set('theme', kStyleIdBase.theme);
        this.specMap.set('basic', {
            nameU: 'Basic',
            lineStyle: 0,
            fillStyle: 0,
            textStyle: 0,
            cells: [cell('LinePattern', '0'), cell('FillForegnd', '0')],
        });
        this.ids.set('basic', kStyleIdBase.basic);
    }

    /** 注册或覆盖一个样式（pr 家族等）；返回分配的文档内 ID。 */
    register(key: string, spec: StyleSheetSpec): number {
        this.specMap.set(key, spec);
        const existing = this.ids.get(key);
        if (existing !== undefined) return existing;
        const next = Math.max(7, ...this.ids.values()) + 1;
        this.ids.set(key, next);
        return next;
    }

    idOf(key: string): number {
        const id = this.ids.get(key);
        if (id === undefined) throw new Error(`[styles] 未注册样式 KEY：${key}`);
        return id;
    }

    /** 已注册的样式清单（按注册序）。 */
    specs(): Array<{ key: string; id: number; spec: StyleSheetSpec }> {
        const order = new Map<string, number>();
        let n = 0;
        for (const key of this.specMap.keys()) order.set(key, n++);
        return [...this.ids.entries()]
            .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
            .map(([key, id]) => ({ key, id, spec: this.specMap.get(key)! }));
    }
}

/** 字体声明：默认 SimSun（与素材观察一致），可追加。 */
export function defaultFaceNames(): Array<{ nameU: string; attrs: Record<string, string> }> {
    return [
        {
            nameU: 'SimSun',
            attrs: {
                UnicodeRanges: '515 680460288 6 0',
                CharSets: '262145 0',
                Panose: '2 1 6 0 3 1 1 1 1 1',
                Flags: '421',
            },
        },
    ];
}

export { kFont };
