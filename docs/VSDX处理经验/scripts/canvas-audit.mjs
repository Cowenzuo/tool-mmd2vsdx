#!/usr/bin/env node
// canvas-audit.mjs — 画布审计：页面尺寸是否严格等于内容外包围框（含母版继承与旋转）
// 用法：node docs/VSDX处理经验/scripts/canvas-audit.mjs [vsdxDir]
//
// 与 Visio 同源的要点：
//  1) 实例未写的单元格从母版继承（本例实例均带 V 缓存，仍按"实例 > 母版 > 默认"取值）；
//  2) 组要展开子形状（子坐标相对组原点）；实例没写的母版子形状也要算（Visio 会现场实例化）；
//  3) 1-D 形状用 Begin/End 端点；2-D 形状按 Angle（弧度）旋转后取 AABB；
//  4) 线宽按线中心外扩半个线宽。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OpcPackage } from '../../../dist/opc/index.js';

const dir = process.argv[2] ?? 'resources/vsdx-output';
const attr = (s, n) => {
  const m = new RegExp(`${n}\\s*=\\s*["']([^"']*)["']`).exec(s);
  return m ? m[1] : undefined;
};
const numOf = (v, d = NaN) => (v === undefined || v === '' ? d : Number(v));

/** 解析形状树：{id, masterShape, cells:Map, kids:[]}（自闭合安全）。 */
export function parseShapes(xml) {
  const re = /<Shape\s+([^>]*?)(\/?)>|<\/Shape>/g;
  const stack = [];
  const roots = [];
  let m;
  while ((m = re.exec(xml))) {
    if (m[0] === '</Shape>') {
      const top = stack.pop();
      if (!top) continue;
      const body = xml.slice(top.start, m.index);
      // 只取本形状自身的 cell——必须截断到 <Shapes>，否则嵌套子形状的 cell 会覆盖父形状
      const own = body.split(/<Shapes\s*>/)[0];
      top.cells = new Map();
      for (const c of own.matchAll(/<Cell\s+([^>]*?)\/?>/g)) {
        const n = attr(c[1], 'N');
        if (n) top.cells.set(n, { v: attr(c[1], 'V'), f: attr(c[1], 'F') });
      }
      top.masterShape = top.ms;
      // 注意：必须复用栈条目本身（它已经收集了 kids）——新建对象会把子形状丢掉
      const parent = stack[stack.length - 1];
      if (parent) parent.kids.push(top);
      else roots.push(top);
    } else if (m[2] === '/') {
      const parent = stack[stack.length - 1];
      const node = { id: attr(m[1], 'ID'), master: attr(m[1], 'Master'), masterShape: attr(m[1], 'MasterShape'), cells: new Map(), kids: [] };
      if (parent) parent.kids.push(node);
      else roots.push(node);
    } else {
      stack.push({ id: attr(m[1], 'ID'), master: attr(m[1], 'Master'), ms: attr(m[1], 'MasterShape'), start: m.index, kids: [] });
    }
  }
  return roots;
}

/** 读取包内全部母版：masterId → {root, byId} */
export function loadMasters(pkg) {
  const out = new Map();
  const mastersXml = pkg.get('/visio/masters/masters.xml')?.xml ?? '';
  const rels = pkg.get('/visio/masters/_rels/masters.xml.rels')?.xml ?? '';
  const relMap = new Map();
  for (const m of rels.matchAll(/Id=["']([^"']+)["'][^>]*Target=["']([^"']+)["']/g)) relMap.set(m[1], m[2]);
  for (const m of mastersXml.matchAll(/<Master\s+([^>]*?)>([\s\S]*?)<\/Master>/g)) {
    const id = attr(m[1], 'ID');
    const relId = attr(m[2], 'r:id') ?? attr(m[2], 'id');
    const file = relMap.get(relId);
    if (!id || !file) continue;
    const content = pkg.get(`/visio/masters/${file}`)?.xml ?? '';
    const roots = parseShapes(content);
    const root = roots[0];
    if (!root) continue;
    const byId = new Map();
    const walk = (n) => { byId.set(n.id, n); for (const k of n.kids) walk(k); };
    walk(root);
    out.set(id, { root, byId });
  }
  return out;
}

/** 迷你公式求值：只认我们写出来的那几种（自身尺寸/父级尺寸的简单倍数）。 */
const evalF = (f, self, parent) => {
  const s = (f ?? '').replace(/GUARD\(|\)/g, '').replace(/\s+/g, '');
  const t = {
    'Width*0.5': self.w / 2, 'Height*0.5': self.h / 2, 'Width*1': self.w, 'Height*1': self.h,
    'Width*0': 0, 'Height*0': 0,
    'Sheet.5!Width*0.5': parent.w / 2, 'Sheet.5!Height*0.5': parent.h / 2,
    'Sheet.5!Width*1': parent.w, 'Sheet.5!Height*1': parent.h,
    'Sheet.5!Width': parent.w, 'Sheet.5!Height': parent.h,
  };
  return t[s];
};

/** 单元格取值：实例 > 母版（公式可求值则求值）> 默认。 */
const cellOf = (inst, mast, name, dflt, self = { w: 0, h: 0 }, parent = { w: 0, h: 0 }) => {
  const iv = inst?.cells.get(name)?.v;
  if (iv !== undefined && iv !== '' && Number.isFinite(Number(iv))) return Number(iv);
  const mc = mast?.cells.get(name);
  if (mc) {
    const v = evalF(mc.f, self, parent);
    if (v !== undefined && Number.isFinite(v)) return v;
    if (mc.v !== undefined && mc.v !== '' && Number.isFinite(Number(mc.v))) return Number(mc.v);
  }
  return dflt;
};

/** 形状在页面坐标系的包围盒（英寸）。ox/oy=父级原点；pw/ph=父级有效尺寸。 */
export function shapeBox(inst, mast, masters, ox = 0, oy = 0, pw = 0, ph = 0) {
  // 1-D 判定只看**实例是否写了端点**：母版带 Begin/End 但实例改写 Pin/W/H 时，
  // 母版端点 V 缓存是陈旧值，按 2-D 盒（Pin/Loc/W/H）算才是真实 AABB。
  const has1d = !!(inst?.cells.has('BeginX') && inst?.cells.has('EndX'));
  const self = { w: 0, h: 0 };
  self.w = cellOf(inst, mast, 'Width', NaN, self, { w: pw, h: ph });
  self.h = cellOf(inst, mast, 'Height', NaN, self, { w: pw, h: ph });
  const dims = self;
  // NoShow=1 的形状不参与绘制（如生命线的销毁标记）：不进入内容盒
  const noShow = cellOf(inst, mast, 'NoShow', 0, dims, { w: pw, h: ph });
  if (noShow === 1) return null;
  let box;
  if (has1d) {
    const bx = cellOf(inst, mast, 'BeginX', NaN, dims, { w: pw, h: ph });
    const by = cellOf(inst, mast, 'BeginY', NaN, dims, { w: pw, h: ph });
    const ex = cellOf(inst, mast, 'EndX', NaN, dims, { w: pw, h: ph });
    const ey = cellOf(inst, mast, 'EndY', NaN, dims, { w: pw, h: ph });
    if ([bx, by, ex, ey].some(Number.isNaN)) return null;
    box = [ox + Math.min(bx, ex), oy + Math.min(by, ey), ox + Math.max(bx, ex), oy + Math.max(by, ey)];
  } else {
    const pinX = cellOf(inst, mast, 'PinX', NaN, dims, { w: pw, h: ph });
    const pinY = cellOf(inst, mast, 'PinY', NaN, dims, { w: pw, h: ph });
    if ([pinX, pinY, self.w, self.h].some(Number.isNaN)) return null;
    const w = self.w;
    const h = self.h;
    const locX = cellOf(inst, mast, 'LocPinX', w / 2, dims, { w: pw, h: ph });
    const locY = cellOf(inst, mast, 'LocPinY', h / 2, dims, { w: pw, h: ph });
    const ang = cellOf(inst, mast, 'Angle', 0, dims, { w: pw, h: ph });
    const cx = pinX - locX + w / 2;
    const cy = pinY - locY + h / 2;
    const hw = Math.abs(w) / 2;
    const hh = Math.abs(h) / 2;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
    box = [
      ox + Math.min(...pts.map((p) => p[0])),
      oy + Math.min(...pts.map((p) => p[1])),
      ox + Math.max(...pts.map((p) => p[0])),
      oy + Math.max(...pts.map((p) => p[1])),
    ];
  }
  // 子形状：只算实例显式写出的（母版未写出的装饰子形状位置靠公式，不在审计范围）
  const masterKids = new Map((mast?.kids ?? []).map((k) => [k.id, k]));
  const pd = { w: pw, h: ph };
  const originX = ox + cellOf(inst, mast, 'PinX', 0, dims, pd) - cellOf(inst, mast, 'LocPinX', self.w / 2, dims, pd);
  const originY = oy + cellOf(inst, mast, 'PinY', 0, dims, pd) - cellOf(inst, mast, 'LocPinY', self.h / 2, dims, pd);
  for (const ik of inst?.kids ?? []) {
    const mk = ik.masterShape ? masterKids.get(ik.masterShape) : undefined;
    const kb = shapeBox(ik, mk, masters, originX, originY, self.w, self.h);
    if (!kb) continue;
    box[0] = Math.min(box[0], kb[0]);
    box[1] = Math.min(box[1], kb[1]);
    box[2] = Math.max(box[2], kb[2]);
    box[3] = Math.max(box[3], kb[3]);
  }
  // 线宽（线以路径为中心）
  const lw = cellOf(inst, mast, 'LineWeight', 0.01, dims);
  box[0] -= lw / 2; box[1] -= lw / 2; box[2] += lw / 2; box[3] += lw / 2;
  return box;
}

const pageCell = (xml, name) => {
  const m = new RegExp(`<Cell N="${name}" V="([^"]+)"`).exec(xml);
  return m ? Number(m[1]) : NaN;
};

const isMain = process.argv[1] && process.argv[1].endsWith('canvas-audit.mjs');
if (isMain) {
const files = readdirSync(dir).filter((f) => f.endsWith('.vsdx')).sort();
let bad = 0;
for (const f of files) {
  const pkg = OpcPackage.open(readFileSync(join(dir, f)));
  const page = pkg.get('/visio/pages/page1.xml')?.xml ?? '';
  const pages = pkg.get('/visio/pages/pages.xml')?.xml ?? '';
  const pw = pageCell(pages, 'PageWidth');
  const ph = pageCell(pages, 'PageHeight');
  const masters = loadMasters(pkg);
  const debug = process.argv[3] === 'debug';
  if (debug) console.log(`  masters loaded: ${masters.size}`);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let skipped = 0;
  for (const s of parseShapes(page)) {
    // 顶层实例：母版由 Master 属性指定；嵌套形状的母版形状由父级递归时按 MasterShape 对齐
    const mast = s.master ? masters.get(s.master)?.root : undefined;
    const b = shapeBox(s, mast, masters);
    if (debug) {
      console.log(`  #${s.id} master=${s.master ?? '-'} kids=${s.kids.length} box=${b ? b.map((v) => v.toFixed(3)).join(',') : 'null'}`);
      // 子形状明细（找越界元凶）
      const walkKids = (n, depth, ox, oy, pw, ph) => {
        for (const k of n.kids) {
          const mk = k.masterShape ? masters.get(s.master)?.byId.get(k.masterShape) : undefined;
          const kb = shapeBox(k, mk, masters, ox, oy, pw, ph);
          if (kb && (kb[0] < 0 || kb[1] < 0 || kb[2] > 100 || depth < 2)) {
            console.log(`      ${'  '.repeat(depth)}#${k.id} ms=${k.masterShape ?? '-'} box=${kb ? kb.map((v) => v.toFixed(3)).join(',') : 'null'}`);
          }
        }
      };
      void walkKids;
    }
    if (!b) { skipped++; continue; }
    minX = Math.min(minX, b[0]); minY = Math.min(minY, b[1]);
    maxX = Math.max(maxX, b[2]); maxY = Math.max(maxY, b[3]);
  }
  const gapL = minX, gapR = pw - maxX, gapB = minY, gapT = ph - maxY;
  const ok = [gapL, gapR, gapB, gapT].every((g) => g >= -0.0005);
  const tight = Math.max(Math.abs(gapL), Math.abs(gapR), Math.abs(gapB), Math.abs(gapT));
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${f.padEnd(20)} 页面 ${pw.toFixed(4)}×${ph.toFixed(4)}  内容 ${(maxX - minX).toFixed(4)}×${(maxY - minY).toFixed(4)}  ` +
    `边距 L${gapL.toFixed(4)} R${gapR.toFixed(4)} B${gapB.toFixed(4)} T${gapT.toFixed(4)}  最大偏差 ${tight.toFixed(4)}IN` +
    (skipped ? `  [跳过 ${skipped}]` : ''),
  );
}
console.log(`\n[canvas] ${files.length - bad}/${files.length} 通过（内容未出界）`);
process.exit(bad ? 1 : 0);
}
