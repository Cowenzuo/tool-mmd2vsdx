// 写手桥：意图 → XmlNode（docs/redesign/04-转义层/10-公用库 cells 组）
import { makeElement, setAttribute, type XmlNode } from '../../xml/index.js';
import type { CellIntent, GeometryIntent, RowIntent, SectionIntent } from '../intents.js';

/** Cell 意图 → <Cell N= V= U= F=> 元素。 */
export function writeCellIntent(c: CellIntent): XmlNode {
    const el = makeElement('Cell');
    setAttribute(el, 'N', c.name);
    if (c.value !== undefined) setAttribute(el, 'V', c.value);
    if (c.unit !== undefined) setAttribute(el, 'U', c.unit);
    if (c.formula !== undefined) setAttribute(el, 'F', c.formula);
    return el;
}

/** Row 意图 → <Row …> 元素（普通行/命名行/几何行/Del 行）。 */
export function writeRowIntent(r: RowIntent): XmlNode {
    const el = makeElement('Row');
    if (r.kind !== undefined) setAttribute(el, 'T', r.kind);
    if (r.ix !== undefined) setAttribute(el, 'IX', String(r.ix));
    if (r.name !== undefined) setAttribute(el, 'N', r.name);
    if (r.del) setAttribute(el, 'Del', '1');
    for (const c of r.cells) el.children.push(writeCellIntent(c));
    return el;
}

/** Section 意图 → <Section N= …> 元素。 */
export function writeSectionIntent(s: SectionIntent): XmlNode {
    const el = makeElement('Section');
    setAttribute(el, 'N', s.kind);
    if (s.ix !== undefined) setAttribute(el, 'IX', String(s.ix));
    for (const r of s.rows) el.children.push(writeRowIntent(r));
    return el;
}

/** Geometry 意图 → <Section N='Geometry' IX='0'>（含开关 cell）。 */
export function writeGeometryIntent(g: GeometryIntent, ix = 0): XmlNode {
    const el = makeElement('Section');
    setAttribute(el, 'N', 'Geometry');
    setAttribute(el, 'IX', String(ix));
    for (const c of g.switches ?? []) el.children.push(writeCellIntent(c));
    for (const r of g.rows) el.children.push(writeRowIntent(r));
    return el;
}

/** 把一组 cell 意图挂到形状节点（追加）。 */
export function appendCells(shape: XmlNode, cells: CellIntent[]): void {
    for (const c of cells) shape.children.push(writeCellIntent(c));
}
