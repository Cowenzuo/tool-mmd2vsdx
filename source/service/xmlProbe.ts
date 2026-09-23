// 产物探针：从产物部件里读出页面尺寸与形状数，回执的元数据靠它
import { attr, elementChildren, parseDocument, type XmlNode } from '../common/xml/index.js';
import type { XmlPart } from '../contracts/index.js';

interface PageProbe {
    name: string;
    widthIn: number;
    heightIn: number;
}

function walk(node: XmlNode, visit: (n: XmlNode) => void): void {
    visit(node);
    for (const child of elementChildren(node)) walk(child, visit);
}

function pageSheetCells(page: XmlNode): Map<string, string> {
    const out = new Map<string, string>();
    const sheet = elementChildren(page).find((n) => n.name === 'PageSheet');
    if (!sheet) return out;
    for (const cell of elementChildren(sheet)) {
        if (cell.name !== 'Cell') continue;
        const n = attr(cell, 'N');
        const v = attr(cell, 'V');
        if (n && v !== null) out.set(n, v);
    }
    return out;
}

/** 页目录探针：页名与页面尺寸（英寸）。 */
export function probePages(parts: XmlPart[]): PageProbe[] {
    const pagesPart = parts.find((p) => p.uri === '/visio/pages/pages.xml');
    if (!pagesPart) return [];
    const root = parseDocument(pagesPart.xml);
    return elementChildren(root)
        .filter((n) => n.name === 'Page')
        .map((page) => {
            const cells = pageSheetCells(page);
            return {
                name: attr(page, 'NameU') ?? attr(page, 'Name') ?? '',
                widthIn: Number(cells.get('PageWidth') ?? '0'),
                heightIn: Number(cells.get('PageHeight') ?? '0'),
            };
        });
}

/** 页面形状总数：回执里的 shapeCount 靠它。 */
export function probeShapeCount(parts: XmlPart[]): number {
    let shapeCount = 0;
    for (const p of parts) {
        if (!/^\/visio\/pages\/page\d+\.xml$/.test(p.uri)) continue;
        const root = parseDocument(p.xml);
        walk(root, (n) => {
            if (n.name === 'Shape') shapeCount++;
        });
    }
    return shapeCount;
}
