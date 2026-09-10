// 校验与 ID 分配（docs/开发过程/01-结构设计.md infra 组）

/** 颜色校验：#rrggbb。 */
export function isValidColor(v: string): boolean {
    return /^#?[0-9a-fA-F]{6}$/.test(v);
}

/** 样式值校验：色值或不存在的名。 */
export function validateStyle(value: string): { ok: boolean; reason?: string } {
    if (value === '') return { ok: true };
    if (/^\d+$/.test(value)) return { ok: true }; // 色板索引
    if (isValidColor(value)) return { ok: true };
    return { ok: false, reason: `非法样式值：${value}` };
}
