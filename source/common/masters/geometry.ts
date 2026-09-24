// 母版几何组：把母版 Geometry 段按实例尺寸实例化（照抄 Visio 保存态的取值，不发明公式）
//
// 背景（docs/VSDX处理经验/02-坑位与解法.md 8.1 / 8.2）：实例几何是"可见态缓存"，
// 直接读 XML 的下游不会替我们解析母版继承；写成矩形一刀切会让 Diamond 变方框，
// 写不出来则退回"不写"（靠母版继承），绝不写错的形状。
import { attr, elementChildren, parseDocument } from '../xml/index.js';

export interface MasterGeoCell {
    name: string;
    value: string;
    formula?: string;
}

export interface MasterGeoRow {
    type: string;
    ix: string;
    cells: MasterGeoCell[];
}

export interface MasterGeometry {
    rows: MasterGeoRow[];
    /** 母版 User 行数值（公式里的 User.xxx 取它）。 */
    users: Map<string, number>;
}

export interface InstantiatedRow {
    type: string;
    ix: string;
    /** X/Y/A/B/C/D 等格的绝对英寸值。 */
    cells: Array<{ name: string; value: number }>;
}

/** 读母版内容里第一枚 Shape 的 Geometry（取 IX=0 段）与 User 行数值；没有几何返回 null。 */
export function readMasterGeometry(contentXml: string): MasterGeometry | null {
    const root = parseDocument(contentXml);
    const shapes = elementChildren(root).find((n) => n.name === 'Shapes');
    const users = new Map<string, number>();
    let rows: MasterGeoRow[] | null = null;
    for (const shape of elementChildren(shapes ?? root)) {
        if (shape.name !== 'Shape') continue;
        for (const section of elementChildren(shape)) {
            if (section.name !== 'Section') continue;
            const sectionName = attr(section, 'N');
            if (sectionName === 'User' && users.size === 0) {
                for (const row of elementChildren(section)) {
                    if (row.name !== 'Row') continue;
                    const name = attr(row, 'N');
                    const valueCell = elementChildren(row).find((c) => c.name === 'Cell' && attr(c, 'N') === 'Value');
                    const raw = valueCell ? attr(valueCell, 'V') : undefined;
                    if (name && raw !== undefined && Number.isFinite(Number(raw))) users.set(name, Number(raw));
                }
            }
            if (sectionName === 'Geometry' && (attr(section, 'IX') ?? '0') === '0' && rows === null) {
                rows = [];
                for (const row of elementChildren(section)) {
                    if (row.name !== 'Row') continue;
                    const type = attr(row, 'T');
                    if (!type) continue;
                    const cells: MasterGeoCell[] = [];
                    for (const cell of elementChildren(row)) {
                        if (cell.name !== 'Cell') continue;
                        const name = attr(cell, 'N');
                        const value = attr(cell, 'V');
                        if (name === null || value === null) continue;
                        const formula = attr(cell, 'F');
                        cells.push(formula === null ? { name, value } : { name, value, formula });
                    }
                    rows.push({ type, ix: attr(row, 'IX') ?? '0', cells });
                }
            }
        }
        if (rows !== null) break;
    }
    return rows === null ? null : { rows, users };
}

/** 公式求值（英寸）：字面量（可带 MM/IN/PT 单位）、Width/Height、User.xxx、Geometry1.X1/Y1、IF、四则。 */
class FormulaReader {
    private pos = 0;

    constructor(
        private readonly text: string,
        private readonly vars: Map<string, number>,
    ) {}

    evaluate(): number | null {
        const value = this.expr();
        if (value === null) return null;
        this.ws();
        return this.pos === this.text.length ? value : null;
    }

    private ws(): void {
        while (this.pos < this.text.length && this.text[this.pos] === ' ') this.pos++;
    }

    private expr(): number | null {
        let left = this.term();
        if (left === null) return null;
        for (;;) {
            this.ws();
            const op = this.text[this.pos];
            if (op !== '+' && op !== '-') return left;
            this.pos++;
            const right = this.term();
            if (right === null) return null;
            left = op === '+' ? left + right : left - right;
        }
    }

    private term(): number | null {
        let left = this.factor();
        if (left === null) return null;
        for (;;) {
            this.ws();
            const op = this.text[this.pos];
            if (op !== '*' && op !== '/') return left;
            this.pos++;
            const right = this.factor();
            if (right === null) return null;
            if (op === '/' && right === 0) return null;
            left = op === '*' ? left * right : left / right;
        }
    }

    private factor(): number | null {
        this.ws();
        const ch = this.text[this.pos];
        if (ch === '(') {
            this.pos++;
            const inner = this.expr();
            if (inner === null) return null;
            this.ws();
            if (this.text[this.pos] !== ')') return null;
            this.pos++;
            return inner;
        }
        if (ch === '-') {
            this.pos++;
            const inner = this.factor();
            return inner === null ? null : -inner;
        }
        if (ch === '+' ) {
            this.pos++;
            return this.factor();
        }
        const number = this.number();
        if (number !== null) return number;
        return this.identifier();
    }

    private number(): number | null {
        const rest = this.text.slice(this.pos);
        const m = /^\d+(?:\.\d+)?/.exec(rest);
        if (!m) return null;
        this.pos += m[0].length;
        let scale = 1;
        const unit = /^(MM|IN|PT)\b/.exec(this.text.slice(this.pos));
        if (unit) {
            const suffix = unit[1] ?? '';
            this.pos += suffix.length;
            scale = suffix === 'MM' ? 1 / 25.4 : suffix === 'PT' ? 1 / 72 : 1;
        }
        return Number(m[0]) * scale;
    }

    private identifier(): number | null {
        const rest = this.text.slice(this.pos);
        const call = /^IF\s*\(/.exec(rest);
        if (call) {
            this.pos += call[0].length;
            const cond = this.expr();
            if (cond === null) return null;
            this.ws();
            if (this.text[this.pos] !== ',') return null;
            this.pos++;
            const whenTrue = this.expr();
            if (whenTrue === null) return null;
            this.ws();
            if (this.text[this.pos] !== ',') return null;
            this.pos++;
            const whenFalse = this.expr();
            if (whenFalse === null) return null;
            this.ws();
            if (this.text[this.pos] !== ')') return null;
            this.pos++;
            return cond !== 0 ? whenTrue : whenFalse;
        }
        const m = /^[A-Za-z_][\w.]*/.exec(rest);
        if (!m) return null;
        this.pos += m[0].length;
        const name = m[0];
        const value = this.vars.get(name);
        return value === undefined ? null : value;
    }
}

/**
 * 按实例尺寸实例化母版几何；任一格求值不出（文法不支持）就整体返回 null。
 * 返回值只含母版本来有的格与行序，不增删、不重排。
 */
export function instantiateMasterGeometry(geo: MasterGeometry, w: number, h: number): InstantiatedRow[] | null {
    const vars = new Map<string, number>([['Width', w], ['Height', h]]);
    for (const [name, value] of geo.users) vars.set(`User.${name}`, value);
    const out: InstantiatedRow[] = [];
    for (const row of geo.rows) {
        const cells: Array<{ name: string; value: number }> = [];
        for (const cell of row.cells) {
            const raw = cell.formula ?? cell.value;
            const value = new FormulaReader(raw, vars).evaluate();
            if (value === null || !Number.isFinite(value)) return null;
            cells.push({ name: cell.name, value });
        }
        const x = cells.find((c) => c.name === 'X');
        const y = cells.find((c) => c.name === 'Y');
        if (x && y) {
            vars.set('Geometry1.X1', vars.get('Geometry1.X1') ?? x.value);
            vars.set('Geometry1.Y1', vars.get('Geometry1.Y1') ?? y.value);
        }
        out.push({ type: row.type, ix: row.ix, cells });
    }
    return out;
}
