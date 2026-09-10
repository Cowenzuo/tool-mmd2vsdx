// 样式组：gantt pr 家族（gantt-结构分析.md 2.2：ID 8-31、两簇继承链）
// 注入到 document.xml 的 </StyleSheets> 前（仅 gantt 图使用；其它图不注入）。

export interface PrStyle {
    id: number;
    name: string;
    line: number;
    fill: number;
    text: number;
}

export const kPrStyles: PrStyle[] = [
    { id: 8, name: 'pr Frame Line', line: 6, fill: 6, text: 6 },
    { id: 9, name: 'pr Background Fill', line: 6, fill: 6, text: 6 },
    { id: 10, name: 'pr Grid Line', line: 6, fill: 6, text: 6 },
    { id: 11, name: 'pr Column Header Fill', line: 12, fill: 12, text: 12 },
    { id: 12, name: 'pr Normal', line: 6, fill: 6, text: 6 },
    { id: 13, name: 'pr Column Header Text', line: 12, fill: 12, text: 12 },
    { id: 14, name: 'pr Secondary Scale Line', line: 10, fill: 10, text: 10 },
    { id: 15, name: 'pr Secondary Scale Fill', line: 11, fill: 11, text: 11 },
    { id: 16, name: 'pr Secondary Scale Text', line: 13, fill: 13, text: 13 },
    { id: 17, name: 'pr Non Working Fill', line: 12, fill: 12, text: 12 },
    { id: 18, name: 'pr Primary Scale Line', line: 10, fill: 10, text: 10 },
    { id: 19, name: 'pr Primary Scale Fill', line: 11, fill: 11, text: 11 },
    { id: 20, name: 'pr Primary Scale Text', line: 13, fill: 13, text: 13 },
    { id: 21, name: 'pr Timebar Inside Text', line: 22, fill: 22, text: 22 },
    { id: 22, name: 'pr Timebar Text', line: 12, fill: 12, text: 12 },
    { id: 23, name: 'pr Symbols Line', line: 6, fill: 6, text: 6 },
    { id: 24, name: 'pr Milestone Symbol Fill', line: 6, fill: 6, text: 6 },
    { id: 25, name: 'pr Timebar Line', line: 10, fill: 10, text: 10 },
    { id: 26, name: 'pr Timebar Fill', line: 6, fill: 6, text: 6 },
    { id: 27, name: 'pr Percent Complete Fill', line: 12, fill: 12, text: 12 },
    { id: 28, name: 'pr Start Symbols Fill', line: 6, fill: 6, text: 6 },
    { id: 29, name: 'pr End Symbols Fill', line: 6, fill: 6, text: 6 },
    { id: 30, name: 'pr Task Text', line: 12, fill: 12, text: 12 },
    { id: 31, name: 'pr Link Line', line: 12, fill: 12, text: 12 },
];

/** 生成 pr 家族 XML 块（插入 </StyleSheets> 前）。 */
export function buildPrStylesXml(): string {
    return (
        kPrStyles
            .map(
                (s) =>
                    `<StyleSheet ID="${s.id}" NameU="${s.name}" IsCustomNameU="1" LineStyle="${s.line}" FillStyle="${s.fill}" TextStyle="${s.text}"/>`,
            )
            .join('') + '\n'
    );
}

/** 注入到 document.xml 样式表尾部。 */
export function injectPrStyles(docXml: string): string {
    if (!docXml.includes('</StyleSheets>')) return docXml;
    return docXml.replace('</StyleSheets>', buildPrStylesXml() + '</StyleSheets>');
}
