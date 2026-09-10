// mmd2vsdx - vsdxdoc/docmodel：validator（模型/参数校验）
//
// C++ serialize/validator.cpp 平移（坑位 ⑩-10.4：渲染前调用、失败即中止）。
// 归位说明：校验对象为模型层形状/样式参数，translate 与 render 两处共用，
// 放 docmodel 消除 render → serialize 的反向依赖。

import type { ShapeStyle } from '../../core/vsdx.js';

const kHexDigit = /^[0-9a-fA-F]$/;

export function validColor(value: string): boolean {
    return value.length === 7 && value.startsWith('#') &&
        [...value.slice(1)].every((ch) => kHexDigit.test(ch));
}

export function validateStyle(style: ShapeStyle): void {
    if (!validColor(style.fillColor) || !validColor(style.lineColor) ||
        !validColor(style.textColor)) {
        throw new TypeError('VSDX colors must use #RRGGBB');
    }
    if (!Number.isFinite(style.lineWidthPoints) || style.lineWidthPoints < 0 ||
        !Number.isFinite(style.fontSizePoints) || style.fontSizePoints <= 0) {
        throw new TypeError('VSDX style sizes are invalid');
    }
}

export function validateShapeBounds(x: number, y: number, width: number, height: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) ||
        !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new TypeError('VSDX shape bounds must be finite and positive');
    }
}
