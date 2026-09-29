// 几何组：坐标换算（像素 → 英寸；y 翻转可视化由调用方按需声明）
//
// 单位约定：mermaid 快照给像素（SVG，y 向下）；Visio 内部制为英寸
// （页面坐标 y 向上）。inch = px / 96 为默认换算（96dpi 是 mermaid
// 渲染基准），页面边距与总页尺寸由打包层按目标页策略叠加。

const kPxPerInch = 96;

/** 画布呼吸位（英寸，单侧）：= 最粗默认线宽的一半（0.0104IN/2），
 *  让最外圈线的外半边不被页面边裁掉。P-4 画布策略：页面 = 内容盒 + 半线宽。 */
export const kCanvasMargin = 0.0053;

/** 画布余量比例（每侧，占内容尺寸的比例）：页面 = 内容 × (1 + 2×比例) = 内容 × 1.1。
 *
 *  为什么需要：连线走**全自动**（`_WALKGLUE` + 不写 `ConFixedCode`），Visio 打开时
 *  会自己重算走线，而它的绕行可以伸到内容盒之外——我们只能保证"自己烘的缓存"在页内，
 *  Visio 重算后的走线**事先不可知**。没有余量时这种外凸会被页边裁掉（画布不够）。
 *
 *  为什么用比例而不是固定英寸：固定值会改长宽比（06 号样本 2.51×14.93IN 加 0.2IN 后
 *  比例从 1:5.95 变 1:5.58，偏 6%），而按比例外扩保证**页面比例 == 内容比例**。
 *  实测（temp/visio-overflow.ps1，用 Visio 解析母版继承后量）：加余量前四边外凸均为 0，
 *  即"刚好贴合、零余量"——余量是为**别人重算**留的，不是为现状留的。 */
export const kCanvasSlackRatio = 0.05;

interface TransformOptions {
    /** 像素到英寸的比例因子，默认 1/96。 */
    pxPerInch?: number;
    /** 页面前缀偏移（英寸），默认 0。 */
    pageOrigin?: { x: number; y: number };
}

/** 像素 x → 英寸 x。 */
export function pxToInch(px: number, opts: TransformOptions = {}): number {
    const k = opts.pxPerInch ?? kPxPerInch;
    return (px / k) + (opts.pageOrigin?.x ?? 0);
}

/** 像素宽高 → 英寸宽高。 */
export function pxSizeToInch(px: number, opts: TransformOptions = {}): number {
    return pxToInch(px, opts) - (opts.pageOrigin?.x ?? 0);
}

/** 格式化英寸数值（确定性：最多 10 位有效，去尾零）。 */
export function fmtInch(v: number): string {
    if (!Number.isFinite(v)) return '0';
    const s = Number(v.toPrecision(12));
    return String(s === 0 ? 0 : s);
}
