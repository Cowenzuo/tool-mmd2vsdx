// 几何组：坐标换算（像素 → 英寸；y 翻转可视化由调用方按需声明）
//
// 单位约定：mermaid 快照给像素（SVG，y 向下）；Visio 内部制为英寸
// （页面坐标 y 向上）。inch = px / 96 为默认换算（96dpi 是 mermaid
// 渲染基准），页面边距与总页尺寸由打包层按目标页策略叠加。

const kPxPerInch = 96;

/** 画布呼吸位（英寸，单侧）：= 最粗默认线宽的一半（0.0104IN/2），
 *  让最外圈线的外半边不被页面边裁掉。P-4 画布策略：页面 = 内容盒 + 半线宽。 */
export const kCanvasMargin = 0.0053;

/** 画布出血（英寸，单侧）：页面 = 内容盒 + 半线宽 + 出血。
 *
 *  为什么需要：连线走**全自动**（`_WALKGLUE` + 不写 `ConFixedCode`），Visio 打开时
 *  会自己重算走线，而它的绕行可以伸到内容盒之外——我们只能保证"自己烘的缓存"在页内，
 *  Visio 重算后的走线**事先不可知**。没有出血时，这种外凸会被页边裁掉（画布不够）。
 *
 *  取值 0.1IN（7.2pt）：覆盖常见绕行外凸的量级；对很小的图也不至于吃掉太多比例。
 *  实测（temp/visio-overflow.ps1，用 Visio 解析母版继承后量）：现状四边外凸均为 0，
 *  即"刚好贴合、无余量"——出血是为**别人重算**留的，不是为现状留的。 */
export const kCanvasBleed = 0.1;

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
