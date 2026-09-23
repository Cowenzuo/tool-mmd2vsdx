// 公式组：常量与构造器（docs/开发过程/01-结构设计.md）
//
// 本包只写公式文本，不求值。求值（V 缓存重写）归 masters 组内部。

/** 走线吸附（basic-5 实证——参数顺序两端镜像，不能粘贴同一文本）：
 *  Begin 端 = _WALKGLUE(BegTrigger,EndTrigger,WalkPreference)；
 *  End 端 = _WALKGLUE(EndTrigger,BegTrigger,WalkPreference)。 */
export function walkGlue(begin = false): string {
    return begin ? '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)' : '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)';
}

/** 变换触发器：_XFTRIGGER(Sheet.n!EventXFMod)。 */
export function trigger(sheetId: number, event = 'EventXFMod'): string {
    return `_XFTRIGGER(Sheet.${sheetId}!${event})`;
}

/** 文本锚点写回控制点：SETATREF(Controls.TextPosition[.Y])。 */
export function setAtRef(control = 'TextPosition', axis?: 'x' | 'y'): string {
    const cell = axis === 'y' ? `${control}.Y` : control;
    return `SETATREF(Controls.${cell})`;
}

/** 中心随端点：GUARD((BeginX+EndX)/2)。 */
export function midPoint(): string {
    return 'GUARD((BeginX+EndX)/2)';
}

/** 尺寸随端点：GUARD(EndX-BeginX) / GUARD(EndY-BeginY)。 */
export function spanX(): string {
    return 'GUARD(EndX-BeginX)';
}

export function spanY(): string {
    return 'GUARD(EndY-BeginY)';
}
