// 单位组：非度量 cell（枚举/布尔/符号常量）——不挂 U 属性
// 准则实例：LinePattern/FillPattern/EndArrow/GlueType 等均无 U（5.5.3.3/6.2.3.3）。
export const kNoUnitCells = new Set([
    'LinePattern',
    'FillPattern',
    'LineColor',
    'FillForegnd',
    'FillBkgnd',
    'BeginArrow',
    'EndArrow',
    'BeginArrowSize',
    'EndArrowSize',
    'GlueType',
    'ObjType',
    'DynFeedback',
    'NoLiveDynamics',
    'ShapeSplittable',
    'LockHeight',
    'LockCalcWH',
    'NoAlignBox',
    'ShapeRouteStyle',
    'ConLineRouteExt',
    'ConFixedCode',
    'LayerMember',
    'EventXFMod',
    'ShapeFixedCode',
    'ShapePlaceStyle',
    'NoObjHandles',
    'DirX',
    'DirY',
    'Type',
    'AutoGen',
    'Rounding',
    'HideText',
    'TextDirection',
    'VerticalAlign',
    'ShapeSplit',
    'WrapText',
]);

/** 是否为非度量 cell（不挂 U）。 */
export function isNoUnitCell(name: string): boolean {
    return kNoUnitCells.has(name);
}
