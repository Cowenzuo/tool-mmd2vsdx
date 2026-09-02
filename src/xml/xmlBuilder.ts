// mmd2vsdx - xml 层：xmlBuilder（低层 XML 构建工具）
//
// C++ vsdxdoc/serialize/xmlbuilder.{hpp,cpp} 平移（04 §2、坑位 ⑩-10.3）。
// 差异：无 libxml2 → 无 ns 参数/句柄；节点即对象引用（去指针红利）。
// 语义红线（照抄 C++）：
//   - number()：17 位 max_digits10 语义；非有限值抛错；|v|<1e-15 归零；
//   - Cell 属性：V（数值或字符串原样）、U（单位，空则移除）、F（公式，空则移除）、
//     E 一律移除（"Inh" 是合法 F 值，语义与"无 F=本地覆盖"不同）；
//   - setNumericCell/setStringCell 找不到 Cell 时 insertSheetChild：新元素插到
//     sheet 内第一个 Section/Text/Data1/ForeignData/Shapes 之前（VSDX 子元素顺序规则）；
//   - appendSection 插到 Text 元素之前；
//   - replaceShapeText：清空旧 Text，写单一 <cp IX="0"/> + 文本节点（单 run 无 pp）。

import {
    appendChild,
    clearChildren,
    directChild,
    makeElement,
    setAttribute,
    removeAttribute,
} from './xmlNode.js';
import type { XmlNode } from './xmlNode.js';

// ── 数字格式化 ──

/**
 * V 值格式化（语义档）：JS 最短往返表达（Visio 按数值解析，等价即合格）。
 * 语义照抄 C++：非有限抛错；|v| < 1e-15 归零。
 */
export function number(value: number): string {
    if (!Number.isFinite(value)) throw new TypeError('[xml] VSDX number is not finite');
    if (Math.abs(value) < 1e-15) value = 0;
    return String(value);
}

/**
 * C++ std::to_string(double) 形态（定点 6 位小数）——公式文本内嵌数值复刻用
 * （如 BOUND(2.500000DL,...)、IF(User.IsSummary,-1.5E300,46240.000000)）。
 */
export function cppFixed6(value: number): string {
    return value.toFixed(6);
}

/**
 * 对照档（仅调试/对照测试用）：17 位有效数字 + %g 风格修剪，
 * 用于与 C++ 17 位 defaultfloat 输出做数值/文本比对（04 §3.2）。
 */
export function formatNumberStrict(value: number): string {
    if (!Number.isFinite(value)) throw new TypeError('[xml] VSDX number is not finite');
    if (Math.abs(value) < 1e-15) return '0';
    const raw = value.toPrecision(17);
    if (!raw.includes('e')) {
        if (raw.includes('.')) return raw.replace(/0+$/, '').replace(/\.$/, '');
        return raw;
    }
    return raw;
}

/** 对应 C++ XmlBuilder::parseDouble（std::stod + 全消费 + 有限性校验）。 */
export function parseNumber(value: string, fallback: number): number {
    if (value.length === 0) return fallback;
    const trimmed = value.trim();
    if (trimmed.length === 0) return fallback;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
}

// ── 树操作工具（对应 XmlUtils / 低层工具） ──

export function appendElement(parent: XmlNode, localName: string): XmlNode {
    return appendChild(parent, makeElement(localName));
}

export function setCellAttribute(cell: XmlNode, name: string, value: string): void {
    setAttribute(cell, name, value);
}

/** 设置属性并在 value 为空时移除（对应 C++ unit/formula 空指针语义）。 */
export function setOptionalAttribute(node: XmlNode, name: string, value: string | null | undefined): void {
    if (value === null || value === undefined || value === '') removeAttribute(node, name);
    else setAttribute(node, name, value);
}

// ── Cell / Section / Row（C++ XmlBuilder 22 工具平移） ──

/** appendCell：数值重载（V=number()，可选 U/F）。 */
export function appendCellNumber(parent: XmlNode, name: string, value: number, unit?: string, formula?: string): XmlNode {
    const cell = appendElement(parent, 'Cell');
    setAttribute(cell, 'N', name);
    setAttribute(cell, 'V', number(value));
    setOptionalAttribute(cell, 'U', unit);
    setOptionalAttribute(cell, 'F', formula);
    return cell;
}

/** appendCell：字符串重载（V 原样写入、不做数字转换——保持 C++ 语义）。 */
export function appendCellString(parent: XmlNode, name: string, value: string, unit?: string, formula?: string): XmlNode {
    const cell = appendElement(parent, 'Cell');
    setAttribute(cell, 'N', name);
    setAttribute(cell, 'V', value);
    setOptionalAttribute(cell, 'U', unit);
    setOptionalAttribute(cell, 'F', formula);
    return cell;
}

/** directCell：sheet 直接子级中 N=name 的 Cell；找不到返回 null。 */
export function directCell(sheet: XmlNode | null, name: string): XmlNode | null {
    if (!sheet) return null;
    for (const child of sheet.children) {
        if (typeof child === 'string') continue;
        const n = child.attrs.find((a) => a.name === 'N')?.value;
        if (child.name === 'Cell' && n === name) return child;
    }
    return null;
}

/**
 * insertSheetChild：新建 localName 元素并插到 sheet 内第一个
 * Section/Text/Data1/ForeignData/Shapes 之前（无则追加末尾）。
 */
export function insertSheetChild(sheet: XmlNode, localName: string): XmlNode {
    const node = makeElement(localName);
    const kAnchors = new Set(['Section', 'Text', 'Data1', 'ForeignData', 'Shapes']);
    for (let i = 0; i < sheet.children.length; i++) {
        const child = sheet.children[i]!;
        if (typeof child !== 'string') {
            const local = child.name.includes(':') ? child.name.slice(child.name.indexOf(':') + 1) : child.name;
            if (kAnchors.has(local)) {
                sheet.children.splice(i, 0, node);
                return node;
            }
        }
    }
    sheet.children.push(node);
    return node;
}

/** setNumericCell：找到/新建 Cell，写 V=number()；U/F 空则移除；E 一律移除。 */
export function setNumericCell(sheet: XmlNode, name: string, value: number, unit?: string, formula = ''): XmlNode {
    let cell = directCell(sheet, name);
    if (!cell) {
        cell = insertSheetChild(sheet, 'Cell');
        setAttribute(cell, 'N', name);
    }
    setAttribute(cell, 'V', number(value));
    setOptionalAttribute(cell, 'U', unit);
    setOptionalAttribute(cell, 'F', formula === '' ? undefined : formula);
    removeAttribute(cell, 'E');
    return cell;
}

/** setStringCell：V 原样写入（不做数字转换）；U 空则移除；F/E 一律移除。 */
export function setStringCell(sheet: XmlNode, name: string, value: string, unit?: string): XmlNode {
    let cell = directCell(sheet, name);
    if (!cell) {
        cell = insertSheetChild(sheet, 'Cell');
        setAttribute(cell, 'N', name);
    }
    setAttribute(cell, 'V', value);
    setOptionalAttribute(cell, 'U', unit);
    removeAttribute(cell, 'F');
    removeAttribute(cell, 'E');
    return cell;
}

/** appendSection：新建 Section（可选 IX），插到 Text 之前（无则末尾）。 */
export function appendSection(shape: XmlNode, name: string, index?: number): XmlNode {
    const section = makeElement('Section');
    setAttribute(section, 'N', name);
    if (index !== undefined) setAttribute(section, 'IX', String(index));
    const text = directChild(shape, 'Text');
    if (text) {
        const i = shape.children.indexOf(text);
        shape.children.splice(i, 0, section);
    } else {
        shape.children.push(section);
    }
    return section;
}

/** appendRow：section 下新建 Row（可选 T/N，IX 必填）。 */
export function appendRow(section: XmlNode, type: string | null, index: number, name?: string): XmlNode {
    const row = appendElement(section, 'Row');
    if (type !== null) setAttribute(row, 'T', type);
    setAttribute(row, 'IX', String(index));
    if (name !== undefined && name !== null) setAttribute(row, 'N', name);
    return row;
}

/** appendNamedRow：section 下新建 Row（仅 N，无 IX/T）。 */
export function appendNamedRow(section: XmlNode, name: string): XmlNode {
    const row = appendElement(section, 'Row');
    setAttribute(row, 'N', name);
    return row;
}

/** replaceShapeText：清空 Text（无则新建），写 <cp IX="0"/>（自闭合）+ 文本。 */
export function replaceShapeText(shape: XmlNode, text: string): void {
    let textNode = directChild(shape, 'Text');
    if (!textNode) {
        textNode = appendElement(shape, 'Text');
    }
    clearChildren(textNode);
    const cp = makeElement('cp');
    setAttribute(cp, 'IX', '0');
    textNode.children.push(cp, text);
}
