// 公式组：常量与构造器（docs/redesign/04-转义层/10-公用库）
//
// 本包只写公式文本，不求值。求值（V 缓存重写）归 masters 组内部。

export const F_INH = 'Inh';
export const F_NO_FORMULA = 'No Formula';

/** GUARD(expr)：锁定公式结果。 */
export function guard(expr: string): string {
    return `GUARD(${expr})`;
}

/** 端点粘附：PAR(PNT(Sheet.n!Connections.Xi, Sheet.n!Connections.Yi))。 */
export function gluePar(sheetId: number, xn: number): string {
    return `PAR(PNT(Sheet.${sheetId}!Connections.X${xn},Sheet.${sheetId}!Connections.Y${xn}))`;
}

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

/** 固定 DL 尺寸：GUARD(0.19685039370079DL) 一类。 */
export function fixedDl(inches: number): string {
    return `GUARD(${inches}DL)`;
}

/** 容器回指：IFERROR(LISTSHEETREF()!User.MSVSDCONTAINERMARGIN,0)。 */
export function listSheetRef(path: string, fallback: string): string {
    return `IFERROR(LISTSHEETREF()!${path},${fallback})`;
}

/** 母版引用注册：USE("NameU")。 */
export function useMaster(nameU: string): string {
    return `USE("${nameU}")`;
}

/** 主题钩子：THEMEVAL("LineWeight",0.24PT)。 */
export function themeVal(slot: string, fallback: string): string {
    return `THEMEVAL("${slot}",${fallback})`;
}
