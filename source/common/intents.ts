// common 意图层：Cell/Section/几何行的"纯数据意图"
//
// 意图层与 xml 栈解耦：写手把意图转成 XmlNode（见 source/xml），
// 布局器只产意图。意图单位约定：length 一律英寸（内部制），
// value 保留原样；单位标注（IN/MM/PT/DEG）由意图里的 unit 标明。

export interface CellIntent {
    name: string;
    /** 值（英寸内部值或字面量，如颜色串）。 */
    value?: string;
    /** 显示单位：IN/MM/PT/DEG/DL/BOOL/STR。 */
    unit?: string;
    /** 公式；有公式时 value 是缓存。 */
    formula?: string;
}

export interface RowIntent {
    /** 行类型：MoveTo/LineTo/EllipticalArcTo/Connection/…；空=普通行。 */
    kind?: string;
    /** 行号。 */
    ix?: number;
    /** 行名（User 行等）。 */
    name?: string;
    /** 删除占位行（Del='1'，保留行号）。 */
    del?: boolean;
    cells: CellIntent[];
}

export interface SectionIntent {
    kind:
        | 'Connection'
        | 'Geometry'
        | 'User'
        | 'Control'
        | 'Character'
        | 'Paragraph'
        | 'Field'
        | 'Property';
    ix?: number;
    rows: RowIntent[];
}

/** 几何意图：一个 Geometry 段的全部行。 */
export interface GeometryIntent {
    rows: RowIntent[];
    /** 段开头的开关 cell（NoFill/NoLine/NoShow/NoSnap/NoQuickDrag）。 */
    switches?: CellIntent[];
}

export function cell(name: string, value?: string, unit?: string, formula?: string): CellIntent {
    const c: CellIntent = { name };
    if (value !== undefined) c.value = value;
    if (unit !== undefined) c.unit = unit;
    if (formula !== undefined) c.formula = formula;
    return c;
}

export function row(kind: string | undefined, ix: number | undefined, cells: CellIntent[], del = false): RowIntent {
    return { kind, ix, cells, del };
}
