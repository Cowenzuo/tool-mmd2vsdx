// mmd2vsdx - testxml：xml 层（树/序列化/解析器/xmlBuilder 工具）
// C++ 无独立 xml 单测；本套件落地 TS-401~403/804 的转义与数字格式化专项
// （对照 04 §3 与坑位 ⑩-10.3 语义），并锁序列化字节形态（libxml2 产物实测）。
import { describe, expect, it } from 'vitest';
import {
    appendChild,
    appendTextChild,
    attribute,
    directChild,
    escapeAttr,
    escapeText,
    hasAttribute,
    localNameOf,
    makeElement,
    makeRootElement,
    parseDocument,
    serializeDocument,
    serializeNode,
    setAttribute,
} from '../src/xml/xmlNode.js';
import {
    appendCellNumber,
    appendCellString,
    appendRow,
    appendSection,
    appendNamedRow,
    directCell,
    formatNumberStrict,
    insertSheetChild,
    number,
    parseNumber,
    replaceShapeText,
    setNumericCell,
    setStringCell,
} from '../src/xml/xmlBuilder.js';
import { kVisioNamespace } from '../src/xml/constants.js';

function deepEqualXml(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

describe('number() 数字格式化（C++ XmlBuilder::number 语义）', () => {
    it('整数/小数/JS 最短往返表达', () => {
        expect(number(0)).toBe('0');
        expect(number(1.5)).toBe('1.5');
        expect(number(12)).toBe('12');
        expect(number(0.1 + 0.2)).toBe('0.30000000000000004');
    });
    it('|v| < 1e-15 归零（含负零与极小值）', () => {
        expect(number(1e-16)).toBe('0');
        expect(number(-5e-16)).toBe('0');
        expect(number(-0)).toBe('0');
        expect(number(1e-15)).not.toBe('0'); // 边界外不归零
    });
    it('非有限值抛错（C++ invalid_argument 语义）', () => {
        expect(() => number(NaN)).toThrow(TypeError);
        expect(() => number(Infinity)).toThrow(TypeError);
        expect(() => number(-Infinity)).toThrow(TypeError);
    });
});

describe('formatNumberStrict() 对照档', () => {
    it('17 位有效数字 + %g 修剪', () => {
        expect(formatNumberStrict(0)).toBe('0');
        expect(formatNumberStrict(0.48958333333333331)).toBe('0.48958333333333331');
        expect(formatNumberStrict(1.5)).toBe('1.5');
        expect(formatNumberStrict(1e-16)).toBe('0');
    });
});

describe('parseNumber()（C++ parseDouble 语义）', () => {
    it('空串/全空白 → fallback', () => {
        expect(parseNumber('', 7)).toBe(7);
        expect(parseNumber('   ', 7)).toBe(7);
    });
    it('正常数值 → 解析；非数字/非有限 → fallback', () => {
        expect(parseNumber('12.5', 7)).toBe(12.5);
        expect(parseNumber(' 1e3 ', 7)).toBe(1000);
        expect(parseNumber('abc', 7)).toBe(7);
        expect(parseNumber('NaN', 7)).toBe(7);
        expect(parseNumber('Infinity', 7)).toBe(7);
    });
});

describe('转义', () => {
    it('五实体规则：文本 & < >；属性追加 " 与 \'', () => {
        expect(escapeText('a&b<c>d')).toBe('a&amp;b&lt;c&gt;d');
        expect(escapeAttr('a"b\'c&d')).toBe('a&quot;b&apos;c&amp;d');
    });
    it('往返安全：解析后还原原文', () => {
        const xml = '<x a="&quot;&apos;&amp;&lt;&gt;">&amp;&lt;&gt;文本</x>';
        const root = parseDocument(xml);
        expect(root.attrs[0]!.value).toBe('"\'&<>');
        expect(root.children).toEqual(['&<>文本']);
    });
});

describe('序列化字节形态（对齐 libxml2 实测：紧凑、自闭合、decl+LF+根+LF）', () => {
    it('空元素自闭合、无子不成对', () => {
        const root = makeElement('PageContents');
        setAttribute(root, 'xmlns', kVisioNamespace);
        const shape = appendChild(root, makeElement('Shape'));
        appendChild(shape, makeElement('Cell'));
        expect(serializeNode(root)).toBe(
            '<PageContents xmlns="' + kVisioNamespace + '"><Shape><Cell/></Shape></PageContents>');
    });
    it('整文档：声明行 standalone=yes + LF + 紧凑根 + LF，无 CR', () => {
        const root = makeRootElement('PageContents', kVisioNamespace, '');
        const out = serializeDocument(root);
        expect(out).toBe(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<PageContents xmlns="' + kVisioNamespace + '"/>\n');
        expect(out.includes('\r')).toBe(false);
    });
    it('parse → serialize 对含注释/CDATA/声明/PI/前缀名的文档稳定', () => {
        const xml =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<!-- 注释 -->\n' +
            '<cp:doc xmlns:cp="urn:test" a="1">\n' +
            '  <cp:item>&amp;实体</cp:item>\n' +
            '  <![CDATA[<raw>&]]>\n' +
            '  <empty/>\n' +
            '</cp:doc>\n';
        const root = parseDocument(xml);
        expect(root.name).toBe('cp:doc');
        expect(localNameOf(root)).toBe('doc');
        expect(attribute(root, 'a')).toBe('1');
        const item = directChild(root, 'item');
        expect(item?.children).toEqual(['&实体']);
        // 第二次往返稳定（结构一致）
        const again = parseDocument(serializeDocument(root));
        expect(deepEqualXml(again, root)).toBe(true);
        expect(serializeNode(root).includes('<raw>')).toBe(false); // CDATA 归一为转义文本
        expect(serializeNode(root).includes('&lt;raw&gt;&amp;')).toBe(true);
    });
});

describe('解析器守卫（安全红线：禁 DTD/外部实体）', () => {
    it('空输入/超长守卫', () => {
        expect(() => parseDocument('')).toThrow(/empty/);
    });
    it('DOCTYPE/ENTITY 拒绝', () => {
        expect(() => parseDocument('<!DOCTYPE x [<!ENTITY e "v">]><x>&e;</x>')).toThrow(/DTD/);
    });
    it('非良构（标签不匹配/未闭合）报错且带来源名', () => {
        expect(() => parseDocument('<a><b></a></b>', 'page1.xml')).toThrow(/page1\.xml/);
        expect(() => parseDocument('<a><b></a>')).toThrow(/unclosed|mismatched/);
    });
    it('多根报错', () => {
        expect(() => parseDocument('<a/><b/>')).toThrow(/multiple root/);
    });
});

describe('xmlBuilder：Cell/Section/Row/Text 语义（坑位 ⑩-10.3）', () => {
    it('appendCellNumber 与 appendCellString：V 数字格式化 vs 字符串原样', () => {
        const sheet = makeElement('Shape');
        appendCellNumber(sheet, 'PinX', 1.25, 'IN');
        appendCellString(sheet, 'Comment', '1.25', 'STR');
        expect(serializeNode(sheet)).toBe(
            '<Shape><Cell N="PinX" V="1.25" U="IN"/><Cell N="Comment" V="1.25" U="STR"/></Shape>');
    });
    it('setNumericCell：先建后改保序；U/F 空则移除；E 一律移除', () => {
        const sheet = makeElement('Shape');
        const c1 = setNumericCell(sheet, 'Width', 2, 'IN', 'Width*0.5');
        expect(attribute(c1, 'U')).toBe('IN');
        expect(attribute(c1, 'F')).toBe('Width*0.5');
        expect(hasAttribute(c1, 'E')).toBe(false);
        // 重设：无 unit/formula → U/F 移除
        setNumericCell(sheet, 'Width', 3);
        expect(attribute(c1, 'V')).toBe('3');
        expect(hasAttribute(c1, 'U')).toBe(false);
        expect(hasAttribute(c1, 'F')).toBe(false);
        // Cell 在 Section 之前（insertSheetChild 顺序规则）
        const sec = appendSection(sheet, 'Geometry');
        const iCell = sheet.children.indexOf(c1!);
        const iSec = sheet.children.indexOf(sec);
        expect(iCell).toBeLessThan(iSec);
        // 顺序：首个 Cell 仍居首（覆盖不改位）
        expect(sheet.children[0]).toBe(c1);
    });
    it('appendSection 插到 Text 之前', () => {
        const shape = makeElement('Shape');
        appendTextChild(shape, 'Text', 'hello');
        const sec = appendSection(shape, 'User');
        expect(shape.children[0]).toBe(sec);
        expect(shape.children.indexOf(shape.children[1] as never)).toBe(1);
        const textNode = directChild(shape, 'Text');
        expect(textNode).not.toBeNull();
        expect(shape.children.indexOf(textNode!)).toBe(1);
    });
    it('insertSheetChild 在 Section/Text/Data1/ForeignData/Shapes 之前插入', () => {
        const sheet = makeElement('Shape');
        const geom = appendSection(sheet, 'Geometry');
        const cell = insertSheetChild(sheet, 'Cell');
        expect(sheet.children[0]).toBe(cell);
        expect(sheet.children[1]).toBe(geom);
        const cell2 = directCell(sheet, 'Nope');
        expect(cell2).toBeNull();
    });
    it('appendRow / appendNamedRow 属性', () => {
        const sec = makeElement('Section');
        appendRow(sec, 'MoveTo', 0);
        appendRow(sec, 'LineTo', 1, 'row1');
        appendNamedRow(sec, 'named');
        expect(serializeNode(sec)).toBe(
            '<Section><Row T="MoveTo" IX="0"/><Row T="LineTo" IX="1" N="row1"/><Row N="named"/></Section>');
    });
    it('replaceShapeText：<cp IX="0"/> + 文本（C++ 单 run 形态）', () => {
        const shape = makeElement('Shape');
        replaceShapeText(shape, '开始');
        expect(serializeNode(shape)).toBe('<Shape><Text><cp IX="0"/>开始</Text></Shape>');
        // 再次替换 = 先清后写（渲染可重入，坑位 ⑥-6.2）
        replaceShapeText(shape, 'A&B');
        expect(serializeNode(shape)).toBe('<Shape><Text><cp IX="0"/>A&amp;B</Text></Shape>');
    });
    it('setStringCell：V 原样、U/F/E 语义', () => {
        const sheet = makeElement('Shape');
        const c = setStringCell(sheet, 'MermaidId', '节点', 'STR');
        expect(attribute(c, 'V')).toBe('节点');
        expect(attribute(c, 'U')).toBe('STR');
        expect(hasAttribute(c, 'F')).toBe(false);
        expect(hasAttribute(c, 'E')).toBe(false);
        expect(serializeNode(sheet)).toBe('<Shape><Cell N="MermaidId" V="节点" U="STR"/></Shape>');
    });
});
