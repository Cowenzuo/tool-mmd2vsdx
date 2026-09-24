// 结构规范测试（唯一保留）：每图型一个用例——转换 → 解压 → 与研究准则规格对比。
// 规格来源（唯一标尺）：docs/VSDX解压结构研究/通用visio结构分析.md（规范版）+ class/ER/gantt/sequence 专篇。
// 原则：产物相对于准则规格**不允许少任何一个节点或属性**；缺失即失败。
// 无专篇素材的图型（git/mindmap/pie/quadrant/timeline）仅断言 L1 骨架与通用字段面，机制层标注待研究素材。

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { Parser } from '../source/parser/index.js';
import { renderContract, kImplementedKinds } from '../source/convert.js';
import { PartsAssembler } from '../source/xml-parts/index.js';
import { Squeeze } from '../source/squeeze/index.js';
import { OpcPackage } from '../source/opc/index.js';
import { instantiateMasterGeometry, readMasterGeometry } from '../source/common/masters/geometry.js';

let hasBrowser = false;
beforeAll(async () => {
    try {
        const b = await chromium.launch();
        await b.close();
        hasBrowser = true;
    } catch {
        hasBrowser = false;
    }
}, 60_000);

const kCases = [
    { file: '05-flowchart-1', kind: 'flowchart', minShapes: 4, type: 'common' },
    { file: '06-flowchart-2', kind: 'flowchart', minShapes: 12, type: 'common' },
    { file: '01-block-1', kind: 'block', minShapes: 2, type: 'common' },
    { file: '03-class-1', kind: 'class', minShapes: 30, type: 'class' },
    { file: '04-er-1', kind: 'er', minShapes: 25, type: 'er' },
    { file: '15-sequence-1', kind: 'sequence', minShapes: 2, type: 'sequence' },
    { file: '15-sequence-2', kind: 'sequence', minShapes: 3, type: 'sequence' },
    { file: '15-sequence-3', kind: 'sequence', minShapes: 40, type: 'sequence' },
    { file: '15-sequence-4', kind: 'sequence', minShapes: 30, type: 'sequence' },
] as const;

// ---------- 检查器：L1 骨架（全部图型；研究 6.1.4/3.3/5.5.2/6.4.x/5.5.3.4/5.4.3.3） ----------

function mustParts(pkg: OpcPackage): string[] {
    const missing: string[] = [];
    const need = [
        '/[Content_Types].xml', '/_rels/.rels',
        '/visio/document.xml', '/visio/windows.xml',
        '/docProps/core.xml', '/docProps/app.xml', '/docProps/custom.xml',
        '/visio/masters/masters.xml', '/visio/masters/_rels/masters.xml.rels',
        '/visio/_rels/document.xml.rels',
        '/visio/pages/pages.xml', '/visio/pages/_rels/pages.xml.rels', '/visio/pages/page1.xml',
    ];
    for (const u of need) if (!pkg.has(u)) missing.push(u);           // 6.1.4 骨架恒定（除 1.4 可变件外全有）
    if (!pkg.listUris().some((u) => /^\/visio\/masters\/master\d+\.xml$/.test(u))) missing.push('masters/masterN.xml（≥1 内容文件 5.4.1）');
    // 页→母版关系件：官方样本除自产的 c4-1 外都有。缺了页面关系闭包里没有母版，
    // OLE 激活首帧会按"母版未解析"作画（docs/VSDX处理经验/02-坑位与解法.md 8.2）。
    const pageXml = pkg.get('/visio/pages/page1.xml')?.xml ?? '';
    if (/<Shape[^>]*Master="\d+"/.test(pageXml)) {
        const uri = '/visio/pages/_rels/page1.xml.rels';
        const rels = pkg.get(uri)?.xml ?? '';
        if (!rels) missing.push(`${uri}（页→母版关系件）`);
        else {
            const targets = [...rels.matchAll(/Target="\.\.\/([^"]+)"/g)].map((m) => '/visio/' + m[1]);
            if (targets.length === 0) missing.push(`${uri} 没有任何 master 关系`);
            for (const t of targets) if (!pkg.has(t)) missing.push(`${uri} 的 Target 不存在：${t}`);
        }
    }
    return missing;
}

/** 母版内容：Master ID → masterN.xml 内容（经 masters.xml 的 Rel 与 masters.xml.rels）。 */
function masterContentOf(pkg: OpcPackage, masterId: string): string {
    const masters = pkg.get('/visio/masters/masters.xml')?.xml ?? '';
    const rels = pkg.get('/visio/masters/_rels/masters.xml.rels')?.xml ?? '';
    const entry =
        new RegExp(`<Master[^>]*ID="${masterId}"[\\s\\S]*?</Master>`).exec(masters)?.[0] ??
        new RegExp(`<Master[^>]*ID="${masterId}"[^>]*/>`).exec(masters)?.[0] ??
        '';
    const relId = /<Rel[^>]*r:id="([^"]+)"/.exec(entry)?.[1] ?? /<Rel[^>]*id="([^"]+)"/.exec(entry)?.[1];
    if (!relId) return '';
    const file = new RegExp(`Id="${relId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? '';
    return file ? (pkg.get(`/visio/masters/${file}`)?.xml ?? '') : '';
}

/** 实例写出的几何行（行类型/IX 与 X/Y/A/B/C/D 数值）。 */
function writtenGeometry(body: string): Array<{ t: string; ix: string; cells: Map<string, number> }> {
    const section = /<Section N="Geometry"[^>]*>([\s\S]*?)<\/Section>/.exec(body)?.[1] ?? '';
    const out: Array<{ t: string; ix: string; cells: Map<string, number> }> = [];
    for (const row of section.matchAll(/<Row T="([^"]+)" IX="(\d+)"[^>]*>([\s\S]*?)<\/Row>/g)) {
        const cells = new Map<string, number>();
        for (const cell of (row[3] ?? '').matchAll(/<Cell N="([^"]+)" V="([^"]+)"/g)) {
            cells.set(cell[1] ?? '', Number(cell[2]));
        }
        out.push({ t: row[1] ?? '', ix: row[2] ?? '', cells });
    }
    return out;
}

/** 栈式 Shape 解析（嵌套 Group 子形状正确配对；避免被嵌套 Shape 切割）。 */
function parseAllShapes(page: string): Array<{ id: string; attrs: string; body: string; nested?: boolean }> {
    const out: Array<{ id: string; attrs: string; body: string; nested?: boolean }> = [];
    const stack: Array<{ id: string; attrs: string; start: number; nested: boolean }> = [];
    const re = /<Shape\sID="(\d+)"([^>]*)>|<\/Shape>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(page))) {
        if (m[0] === '</Shape>') {
            const top = stack.pop();
            if (top) out.push({ id: top.id, attrs: top.attrs, body: page.slice(top.start, m.index), nested: top.nested });
        } else if (/\/$/.test(m[2]!)) {
            // 自闭合空形状（官方实例常见：`<Shape ID="6" Type="Shape" MasterShape="6"/>`）——
            // 不入栈，直接成条目，否则后续栈错位导致 body 截断。
            out.push({ id: m[1]!, attrs: m[2]!.slice(0, -1), body: '', nested: stack.length > 0 });
        } else {
            stack.push({ id: m[1]!, attrs: m[2]!, start: re.lastIndex, nested: stack.length > 0 });
        }
    }
    return out;
}

function l1Audit(pkg: OpcPackage): string[] {
    const err: string[] = [];
    const xml = (u: string) => pkg.get(u)?.xml ?? '';
    const page = xml('/visio/pages/page1.xml');
    const pagesXml = xml('/visio/pages/pages.xml');
    const doc = xml('/visio/document.xml');

    // 5.5.2：pages.xml 根声明 r 命名空间（Rel r:id 良构前提）
    if (!/xmlns:r=/.test(pagesXml)) err.push('pages.xml 缺 xmlns:r（5.5.2）');
    // 3.3/3.4：所有关系表 Target 相对
    for (const u of pkg.listUris().filter((x) => x.endsWith('.rels'))) {
        for (const m of xml(u).matchAll(/<Relationship[^>]*Target="([^"]+)"/g)) {
            if (/^\//.test(m[1]!)) err.push(`${u} Target 带前导斜杠（3.4）`);
        }
    }
    // 6.1.2：主文档关系表三向
    for (const t of ['/relationships/masters', '/relationships/pages', '/relationships/windows']) {
        if (!xml('/visio/_rels/document.xml.rels').includes(t)) err.push(`document.xml.rels 缺 ${t}（6.1.2）`);
    }
    // 6.4.3/6.4.4：样式基座
    if (doc.length < 2000) err.push('document.xml 过小（6.4.3 样式基座）');
    const st = (doc.match(/<DocumentSettings[\s\S]*?<\/DocumentSettings>/) ?? [''])[0] ?? '';
    for (const n of ['GlueSettings', 'SnapSettings', 'SnapExtensions', 'SnapAngles', 'DynamicGridEnabled', 'ProtectStyles', 'ProtectShapes', 'ProtectMasters', 'ProtectBkgnds']) {
        if (!st.includes(`<${n}`)) err.push(`DocumentSettings 缺子元素 ${n}（6.4.4）`);
    }
    // 0 号 No Style：官方 class 基座（ID6 Theme/ID7 Connector 完整）时 ID0 带完整定义亦然合法；
    // 合成基座（其它图型）时 0 号为空壳。二者均要求 ID0 存在。
    if (!/StyleSheet ID=['"]0['"]/.test(doc)) err.push('0 号 No Style 缺失（6.4.3）');
    if (!xml('/docProps/custom.xml').includes('"RecalcDocument"')) err.push('custom.xml 缺 RecalcDocument（6.4.3/O-5）');

    // 形状级（5.5.3.2/5.5.3.3）：位置必须、端点必须、几何必须有关闭与起点
    const shapes = parseAllShapes(page);
    const masterXmls = [...pkg.listUris().filter((u) => /^\/visio\/masters\/master\d+\.xml$/.test(u)).map((u) => xml(u))];
    // 母版 ID → MasterType（Link lines/Activation 等 MT=1 一维家族走母版自足语义，无 GlueType）
    const mtById = new Map<string, string>();
    for (const m of xml('/visio/masters/masters.xml').matchAll(/<Master ID="(\d+)"[^>]*MasterType="(\d+)"/g)) mtById.set(m[1]!, m[2]!);
    for (const s of shapes) {
        const isNested = s.nested === true;
        const isMasterInst = /Master="\d+"/.test(s.attrs);
        const refId = /Master="(\d+)"/.exec(s.attrs)?.[1] ?? '';
        const refMasterMt = mtById.get(refId) ?? '';
        const coveredByMaster = (pattern: RegExp) => masterXmls.some((m) => pattern.test(m));
        const glueLessFamily = refMasterMt === '1'; // Link lines / Activation：官方母版无 GlueType
        for (const cell of ['PinX', 'PinY']) {
            if (isNested) continue; // 嵌套 MasterShape 覆写：位置由母版承载，实例只写差异行（官方样本）
            if (!s.body.includes(`N="${cell}"`) && !(isMasterInst && coveredByMaster(new RegExp(`N=['"]${cell}['"]`)))) {
                err.push(`Shape ${s.id} 缺 ${cell}（5.5.3.2 实例位置必填，母版实例可承载）`);
            }
        }
        if (/N="BeginX"/.test(s.body)) {
            for (const cell of ['BeginY', 'EndX', 'EndY']) {
                if (!s.body.includes(`N="${cell}"`)) err.push(`Shape ${s.id}（1-D）缺 ${cell}（5.5.3.3）`);
            }
            // GlueType/ObjType 随母版（basic-5：实例只有 Master=；母版承载行为组；
            // 取值因母版而异——连接线 2、Link lines 4；MT=1 家族官方母版无 GlueType → 豁免）
            if (!glueLessFamily && !s.body.includes('N="GlueType"') && !masterXmls.some((m) => /N=['"]GlueType['"]/.test(m))) {
                err.push(`Shape ${s.id}（1-D）缺 GlueType（实例或母版，5.5.3.3）`);
            }
            if (!s.body.includes('N="ObjType"') && !masterXmls.some((m) => /N=['"]ObjType['"]/.test(m))) {
                err.push(`Shape ${s.id}（1-D）缺 ObjType（实例或母版，5.5.3.3）`);
            }
        }
        const isLine = /N="BeginX"/.test(s.body);
        const hasGeom = /<Section N="Geometry"/.test(s.body);
        if (hasGeom) {
            const moveOk = isNested || s.body.includes('<Row T="MoveTo"') || (isMasterInst && coveredByMaster(/<Row T=['"]MoveTo['"]/));
            if (!moveOk) err.push(`Shape ${s.id} 几何缺 MoveTo 起点行（5.4.3.3，母版实例可承载）`);
            const lineTos = (s.body.match(/<Row T="LineTo"/g) ?? []).length;
            const hasArc = /EllipticalArcTo|ArcTo/.test(s.body);
            if (isLine) {
                // 线几何：MoveTo+LineTo 即可（6.2.4），可带 Del 占位（5.5.3.3）
            } else if (hasArc) {
                // 圆/扇形/圆角：以弧行闭合（EllipticalArcTo 体系），不要求 IX5（5.4.3.3 只针对直角矩形）
            } else if (lineTos >= 3) {
                // 直角矩形轮廓：最后一行显式闭合（F=Geometry1.X1 / IX5 回起点）；
                // 母版实例豁免（官方 Entity/Class 盒实例仅写差异行，闭合由母版承载）
                if (
                    !isMasterInst &&
                    !s.body.includes('Geometry1.X1') &&
                    !/<Cell N="X" V="0" U="MM" F="Geometry1\.X1"/.test(s.body) &&
                    !/<Row T="LineTo" IX="5"/.test(s.body)
                ) {
                    err.push(`Shape ${s.id} 矩形几何无显式闭合行（5.4.3.3）`);
                }
            }
        }
        // Connection 段方向列（5.4.3.3）：出现非零方向
        for (const sec of s.body.matchAll(/<Section N="Connection">([\s\S]*?)<\/Section>/g)) {
            const flags = [...sec[1]!.matchAll(/<Cell N="DirX" V="([-0-9.]+)"\/>\s*<Cell N="DirY" V="([-0-9.]+)"/g)];
            if (flags.length === 5 && flags.every((mm) => mm[1] === '0' && mm[2] === '0')) err.push(`Shape ${s.id} Connection 方向列恒零（5.4.3.3）`);
        }
    }
    // Connects（5.5.3.4）：ToPart=100+IX、本体粘附=3、FromPart 恒配、无悬空端点
    for (const m of page.matchAll(/<Connect FromSheet="(\d+)" FromCell="(\w+)" FromPart="(\w+)" ToSheet="(\d+)" ToCell="([^"]+)" ToPart="(\d+)"/g)) {
        const n = /X(\d+)/.exec(m[5]!)?.[1];
        if (n && Number(m[6]) !== 100 + Number(n) - 1) err.push(`Connects ToPart=${m[6]}≠100+行号（5.5.3.4）`);
        if (m[5] === 'PinY' && Number(m[6]) !== 3) err.push('Connects PinY 未配 ToPart=3（basic-5 本体粘附）');
        if (m[2] === 'BeginX' && m[3] !== '9') err.push('Connects BeginX 未配 FromPart=9（5.5.3.4）');
        if (m[2] === 'EndX' && m[3] !== '12') err.push('Connects EndX 未配 FromPart=12（5.5.3.4）');
        const from = shapes.find((s) => s.id === m[1]);
        if (from && !from.body.includes(`N="${m[2]}"`)) err.push(`悬空 Connects：Shape ${m[1]} 无 ${m[2]} cell`);
        const to = shapes.find((s) => s.id === m[4]);
        if (!to) err.push(`悬空 Connects ToSheet=${m[4]}`);
    }
    // 单位（O-3/6.2.4）：X/Y 无≥50 裸值、枚举无 U
    for (const m of page.matchAll(/<Cell N="(X|Y)" V="(-?\d{2,}(?:\.\d+)?)"[^>]*\/>/g)) {
        if (!/U="/.test(m[0]) && Math.abs(Number(m[2])) >= 50) err.push(`X/Y 像素直写：${m[2]}（O-3）`);
        if (/U="IN"/.test(m[0]) && Math.abs(Number(m[2])) >= 50) err.push(`X/Y 像素挂 IN：${m[2]}（O-3）`);
    }
    for (const m of page.matchAll(/<Cell N="(LinePattern|FillPattern)" V="[^"]*" U="IN"/g)) err.push(`枚举误挂 U：${m[1]}（6.2.3.3）`);
    return err;
}

// ---------- 检查器：L2 类型规格（研究定义；缺失即失败） ----------

function l2Audit(kind: string, pkg: OpcPackage): string[] {
    const err: string[] = [];
    const xml = (u: string) => pkg.get(u)?.xml ?? '';
    const page = xml('/visio/pages/page1.xml');
    const shapes = parseAllShapes(page);
    const has = (s: string, re: RegExp) => re.test(s);

    if (kind === 'common') {
        // 节点（5.5.3.2 最小式）：Master 引用 + 文本；连接线（basic-5 基准）双端自动 WALKGLUE。
        // 实例=Master= 引用 + 差异 cell；母版承载几何/1-D 行为组/NoFill/文本公式（官方 flowchart 模具）。
        const masterXmls = [...pkg.listUris().filter((u) => /^\/visio\/masters\/master\d+\.xml$/.test(u))
            .map((u) => xml(u))];
        // 连接线母版：1-D 特征齐全（BeginX 缓存 + GUARD(EndX-BeginX) + SETATREF 文本句柄 + TEXTWIDTH 公式）
        const connMaster = masterXmls.find((m) =>
            /Cell N="BeginX"/.test(m)
            && /GUARD\(EndX-BeginX\)/.test(m)
            && /TxtPinX"[^>]*SETATREF/.test(m)
            && /MAX\(TEXTWIDTH\(TheText\)/.test(m)) ?? '';
        for (const s of shapes) {
            if (has(s.body, /N="BeginX"/)) {
                // 实例差异 cell（basic-5 同款：端点公式/触发器/WalkPreference/ConFixedCode/EndArrow/TxtPin 缓存）
                for (const c of ['ConFixedCode', 'EndArrow', 'WalkPreference', 'BegTrigger', 'EndTrigger']) {
                    if (!s.body.includes(`N="${c}"`)) err.push(`通用连接线 Shape ${s.id} 缺 ${c}（basic-5）`);
                }
                // 独立样式（5.4.3.4：Connector 样式三件套 = 无填充线；与面形状 3 号区分）
                for (const c of ['LineStyle', 'FillStyle', 'TextStyle']) {
                    if (!new RegExp(`${c}="5"`).test(s.attrs)) err.push(`通用连接线 Shape ${s.id} 缺 ${c}=5（Connector 样式）`);
                }
                // 双端自动（basic-5：Begin/End 均 _WALKGLUE，参数顺序镜像；WalkPreference=3；ConFixedCode=6）
                if (!has(s.body, /N="BeginX"[^>]*F="_WALKGLUE\(BegTrigger,EndTrigger,WalkPreference\)"/)) {
                    err.push(`通用连接线 Shape ${s.id} BeginX 缺 _WALKGLUE(BegTrigger,…)（basic-5 双端自动镜像顺序）`);
                }
                if (!has(s.body, /N="EndX"[^>]*F="_WALKGLUE\(EndTrigger,BegTrigger,WalkPreference\)"/)) {
                    err.push(`通用连接线 Shape ${s.id} EndX 缺 _WALKGLUE(EndTrigger,…)（basic-5 双端自动镜像顺序）`);
                }
                if (!/<Cell N="WalkPreference" V="3"/.test(s.body)) err.push(`通用连接线 Shape ${s.id} WalkPreference≠3（basic-5）`);
                if (!/<Cell N="ConFixedCode" V="6"/.test(s.body)) err.push(`通用连接线 Shape ${s.id} ConFixedCode≠6（basic-5 双端自动）`);
                // 路由样式（basic-3/4 实证 ShapeRouteStyle=5=Flowchart 上→下绕行避让；
                // 官方语义 0=页面默认/不避让——必须显式写，basic-5 省略属无障碍物样本）
                if (!/<Cell N="ShapeRouteStyle" V="5"/.test(s.body)) err.push(`通用连接线 Shape ${s.id} 缺 ShapeRouteStyle=5（basic-3/4 绕行避让）`);
                if (!has(s.body, /N="BegTrigger"[^>]*F="_XFTRIGGER/) || !has(s.body, /N="EndTrigger"[^>]*F="_XFTRIGGER/)) {
                    err.push(`通用连接线 Shape ${s.id} 缺 _XFTRIGGER 触发（5.5.3.3 素材）`);
                }
                // 文本闭环（basic-6）：TxtPinX/TxtPinY 缓存（文本柄位置）+ Control.TextPosition；
                // 有文字（basic-6）：补 TxtHeight/TxtLocPinY 缓存 + XCon='0' Inh（柄锁定不再自动居中）；
                // 无文字（basic-5）：TxtWidth/TxtLocPinX 不写（走母版公式）
                const hasText = has(s.body, /<Text>/);
                if (!has(s.body, /N="TxtPinX"[^>]*F="Inh"/) || !has(s.body, /N="TxtPinY"[^>]*F="Inh"/)) {
                    err.push(`通用连接线 Shape ${s.id} 缺 TxtPinX/Y Inh 缓存（basic-6 文本闭环）`);
                }
                if (hasText) {
                    if (!has(s.body, /N="TxtHeight"/) || !has(s.body, /N="TxtLocPinY"/)) {
                        err.push(`通用连接线 Shape ${s.id}（有文字）缺 TxtHeight/TxtLocPinY 缓存（basic-6）`);
                    }
                    if (!/<Cell N="XCon" V="0"[^>]*F="Inh"/.test(s.body)) {
                        err.push(`通用连接线 Shape ${s.id}（有文字）XCon 应为 0/Inh（basic-6 柄锁定）`);
                    }
                }
                // 母版承载（官方模具 Dynamic connector）：行为组/NoFill/文本公式
                // ——已引用母版的实例母版文件必须带；但几何/Width/Height 实例自己写
                // （basic-6 实证：母线是 WALKGLUE 走线，几何必须实例化——母版几何是占位，
                // 不写会显示占位形状、文本柄错乱漂移）
                if (/Master="\d+"/.test(s.attrs)) {
                    if (!connMaster) err.push(`连接线 Shape ${s.id} 引用母版但母版文件缺失（5.4.3）`);
                    else {
                        if (!/<Cell N="GlueType" V="2"/.test(connMaster)) err.push(`连接线母版缺 GlueType=2（5.4.3.4 母版表）`);
                        if (!/<Cell N="NoFill" V="1"/.test(connMaster)) err.push(`连接线母版几何缺 NoFill=1（5.4.3.4 只描线不填充）`);
                        if (!/<TxtWidth"[^>]*MAX\(TEXTWIDTH\(TheText\)/.test(connMaster) && !/MAX\(TEXTWIDTH\(TheText\),/.test(connMaster)) err.push(`连接线母版缺 TxtWidth 公式（master2）`);
                    }
                    // 实例必须带（basic-5/6）：Width/Height + Geometry 段（MoveTo+LineTo×2）
                    // 退化维例外：纯竖直走线按 Visio 保存态写 GUARD(0.2DL)（宽度为 0 会被下游按宽度归一化），
                    // 水平同理取 GUARD(-0.2DL)（金标准实测，docs/VSDX处理经验/02-坑位与解法.md 8.x）
                    if (
                        !has(s.body, /N="Width"[^>]*F="GUARD\(EndX-BeginX\)"/) &&
                        !has(s.body, /N="Width"[^>]*F="GUARD\(0\.2DL\)"/)
                    ) {
                        err.push(`通用连接线 Shape ${s.id} 缺 Width 随端点公式（basic-5）`);
                    }
                    if (
                        !has(s.body, /N="Height"[^>]*F="GUARD\(EndY-BeginY\)/) &&
                        !has(s.body, /N="Height"[^>]*F="GUARD\(-0\.2DL\)"/)
                    ) {
                        err.push(`通用连接线 Shape ${s.id} 缺 Height 随端点公式（basic-5）`);
                    }
                    const gir = /<Section N="Geometry"[\s\S]*?<\/Section>/.exec(s.body)?.[0] ?? '';
                    if (!/<Row T="MoveTo"/.test(gir)) err.push(`通用连接线 Shape ${s.id} 实例几何缺 MoveTo（basic-6 实例化几何）`);
                    // 纯竖线（|dx|<1e-6）两行即可（basic-4 shape 3 实证）；否则 L 型必带 IX=3
                    const ddx = Math.abs((+((/N="BeginX" V="([^"]+)"/.exec(s.body))?.[1] ?? 0)) - (+((/N="EndX" V="([^"]+)"/.exec(s.body))?.[1] ?? 0)));
                    if (ddx > 1e-6 && !/<Row T="LineTo" IX="3"/.test(gir)) {
                        err.push(`通用连接线 Shape ${s.id} 实例几何缺第二段 IX=3（basic-6 L 型）`);
                    }
                } else {
                    // 自足式兜底（无母版资产时）：母版全部 cell 落实例
                    for (const c of ['LockHeight', 'GlueType', 'ObjType']) {
                        if (!s.body.includes(`N="${c}"`)) err.push(`通用连接线 Shape ${s.id}（自足式）缺 ${c}（5.5.3.3/6.2.3.3）`);
                    }
                    if (!/<Cell N="NoFill" V="1"/.test(s.body)) err.push(`通用连接线 Shape ${s.id} 几何缺 NoFill=1（5.4.3.4）`);
                    if (!/<Row T="MoveTo"/.test(s.body)) err.push(`通用连接线 Shape ${s.id} 几何缺 MoveTo（5.4.3.3）`);
                    if (!has(s.body, /<Section N="Control">/)) err.push(`通用连接线 Shape ${s.id} 缺 Control 段（5.4.3.4）`);
                    const gir = /<Section N="Geometry"[\s\S]*?<\/Section>/.exec(s.body)?.[0] ?? '';
                    if (!/<Row T="LineTo" IX="3"/.test(gir)) err.push(`通用连接线 Shape ${s.id} 几何缺第二段 IX=3（basic-5 L 型）`);
                }
            } else {
                // 节点（Master 引用实例）：Master= 必须（5.5.3.2）；尺寸覆盖必须（6.2.3.2，
                // 母版占位 40×30mm 远大于布局间距，缺覆盖会整页重叠）
                if (shapes.length > 0 && !/Master="/.test(s.attrs)) err.push(`通用节点 Shape ${s.id} 缺 Master= 引用（5.5.3.2）`);
                for (const c of ['Width', 'Height', 'LocPinX', 'LocPinY']) {
                    if (!s.body.includes(`N="${c}"`)) err.push(`通用节点 Shape ${s.id} 缺 ${c} 尺寸覆盖（6.2.3.2 防重叠）`);
                }
                // 写实态（P-7 / 坑位 8.1）：几何与连接点落到实例上，形态照抄 Visio 重存
                // ——绝对值加 F="Inh"，连接点每行只写 X/Y。缺了会让原始 XML 消费者按母版占位作画。
                const nodeGeo = /<Section N="Geometry"[\s\S]*?<\/Section>/.exec(s.body)?.[0] ?? '';
                const nodeConn = /<Section N="Connection"[\s\S]*?<\/Section>/.exec(s.body)?.[0] ?? '';
                if (!nodeConn) err.push(`通用节点 Shape ${s.id} 缺 Connection 段（P-7 写实态）`);
                // 几何必须等于"该形状母版几何按自身 W/H 实例化"（批 1 修正：一刀切矩形会让 Diamond 变方框）
                const nodeMasterId = /Master="(\d+)"/.exec(s.attrs)?.[1] ?? '';
                const nodeContent = nodeMasterId ? masterContentOf(pkg, nodeMasterId) : '';
                const nodeGeoModel = nodeContent ? readMasterGeometry(nodeContent) : null;
                const nw = Number(/N="Width" V="([^"]+)"/.exec(s.body)?.[1] ?? '0');
                const nh = Number(/N="Height" V="([^"]+)"/.exec(s.body)?.[1] ?? '0');
                if (nodeGeoModel) {
                    const want = instantiateMasterGeometry(nodeGeoModel, nw, nh);
                    const got = writtenGeometry(s.body);
                    if (want === null) err.push(`通用节点 Shape ${s.id} 母版几何含未支持公式（应整体不写）`);
                    else if (got.length !== want.length) err.push(`通用节点 Shape ${s.id} 几何行数 ${got.length} != 母版实例化 ${want.length}（P-7 批 1）`);
                    else {
                        want.forEach((w, i) => {
                            const g = got[i]!;
                            if (g.t !== w.type || g.ix !== w.ix) err.push(`通用节点 Shape ${s.id} 几何第 ${i} 行类型/IX 不符（P-7 批 1）`);
                            for (const c of w.cells) {
                                const v = g.cells.get(c.name);
                                if (v === undefined || Math.abs(v - c.value) > 1e-6) {
                                    err.push(`通用节点 Shape ${s.id} 几何 ${c.name} 与母版实例化不符（${v ?? '缺'} vs ${c.value}）`);
                                }
                            }
                        });
                    }
                } else if (nodeGeo) {
                    err.push(`通用节点 Shape ${s.id} 母版无几何却写了实例几何段（P-7 写实态）`);
                }
                if (nodeConn) {
                    const connRows = [...nodeConn.matchAll(/<Row T="Connection"/g)].length;
                    if (connRows !== 5) err.push(`通用节点 Shape ${s.id} 连接点 ${connRows}/5（P-7 四边中点加中心）`);
                    if (/N="DirX"/.test(nodeConn)) err.push(`通用节点 Shape ${s.id} 连接点带了方向列（P-7：只写 X/Y）`);
                }
            }
        }
        // 双端自动 Connects 记录（basic-5：两端 ToCell='PinY' ToPart='3'）
        const lineIds = shapes.filter((s) => has(s.body, /N="BeginX"/)).map((s) => s.id);
        const walkRecs = [...page.matchAll(/<Connect FromSheet="(\d+)" FromCell="(?:BeginX|EndX)"[^>]*ToCell="PinY" ToPart="3"/g)];
        for (const lid of lineIds) {
            const n = walkRecs.filter((m) => m[1] === lid).length;
            if (n !== 2) err.push(`连接线 ${lid} 走线吸附记录 ${n}/2（basic-5：两端 ToCell=PinY ToPart=3）`);
        }
    }

    if (kind === 'class') {
        // 母版实例化口径（docs/redesign/07 准则）：每语义角色 Master= 引用 ≥1；
        // 实例 = 最小差异（Relationships SUM(DEPENDSON)、TxtPinY Inh、User/Control/Connection/Geometry
        // 覆写 + 嵌套 MasterShape 覆写）；行为组（ObjType/几何/箭头）由母版承载；
        // 关系线双端 PAR 钉接 + _XFTRIGGER + Connects ToPart=100+IX；EndArrow 不写实例。
        const masterRefs = [...page.matchAll(/<Shape[^>]*Master="(\d+)"/g)].map((m) => m[1]);
        expect(masterRefs.length, 'Master 引用数 ≥ 官方样本 27').toBeGreaterThanOrEqual(27);
        // 角色覆盖（masters.xml 内 NameU 集合）
        const nameUs = [...xml('/visio/masters/masters.xml').matchAll(/NameU="([^"]+)"[^>]*MasterType="(\d+)"/g)];
        const byName = new Map(nameUs.map((m) => [m[1]!, m[2]!]));
        // 关系载体 = 官方 Inheritance 母版（Actions 菜单承载全部 6 类风格；K13 修订见报告 08 §2.6.7）
        for (const [n, mt] of [['Class', '2'], ['Member', '34'], ['Separator', '34'], ['Inheritance', '541']] as const) {
            expect(byName.get(n), `class 母版 ${n} 存在`).toBe(mt);
        }
        // 类盒 Group 实例：Master + Relationships(DEPENDSON 成员) + 嵌套 MasterShape 覆写
        const groups = shapes.filter((s) => /Type="Group"/.test(s.attrs) && /Master="\d+"/.test(s.attrs));
        expect(groups.length, '类盒 Group 实例数').toBeGreaterThanOrEqual(5);
        const groupsWithDep = groups.filter((g) => /\bSUM\(DEPENDSON\b/.test(g.body));
        expect(groupsWithDep.length, '类盒 Relationships SUM(DEPENDSON) 数（=类盒数）').toBeGreaterThanOrEqual(5);
        expect(groups.filter((g) => !/\bSUM\(DEPENDSON\b/.test(g.body)).every((g) => /N="BeginX"/.test(g.body)), '无 DEPENDSON 的 Group=关系线').toBe(true);
        expect(groups.every((g) => /MasterShape="6"/.test(g.body) && /MasterShape="9"/.test(g.body)), '嵌套 MasterShape 6..9 覆写').toBe(true);
        expect(groupsWithDep.every((g) => /N="TxtPinY"[^>]*F="Inh"/.test(g.body)), '类盒 TxtPinY Inh').toBe(true);
        expect(groupsWithDep.every((g) => /<Row N="EntityName"/.test(g.body)), '类盒 User.EntityName').toBe(true);
        // 成员行：Member 母版实例 + LISTSHEETREF 家族 + User 行族（分隔线行另计，无 NoLine）
        const members = shapes.filter((s) => has(s.body, /LISTSHEETREF/) && /<Row N="MemberName"/.test(s.body));
        expect(members.length, '成员行 LISTSHEETREF 数').toBeGreaterThanOrEqual(20);
        expect(members.every((s) => /N="ShapeFixedCode" V="1"/.test(s.body)), '成员行 ShapeFixedCode=1').toBe(true);
        expect(members.every((s) => /N="NoLine" V="1"/.test(s.body)), '成员行 NoLine=1').toBe(true);
        expect(members.every((s) => /<Row N="MemberName"/.test(s.body)), '成员行 User.MemberName').toBe(true);
        // 关系线：PAR 钉接 + _XFTRIGGER + 各类线型实例化到各自官方母版（class-all-in-one：每类一个母版，MasterType=541）
        // 官方语义：实例不写 BeginArrow/EndArrow/LinePattern（各线型母版自带，如 Inheritance=GUARD(0)/GUARD(14)/GUARD(IF(...))）。
        const rels = shapes.filter((s) => /N="BeginX"/.test(s.body));
        const supports = rels.filter((r) => has(r.body, /PAR\(PNT/));
        expect(supports.length, '关系线 PAR 钉接').toBeGreaterThanOrEqual(4);
        // 每类线型母版应被引用（masters.xml 注册 + 页面实例 Master= 指向）
        const masterIdByName = new Map<string, string>();
        const masterRows = [...xml('/visio/masters/masters.xml').matchAll(/<Master\sID="(\d+)"\sNameU="([^"]+)"[^>]*?MasterType="(\d+)"/g)];
        for (const m of masterRows) masterIdByName.set(m[2]!, m[1]!);
        // 实际出现的关系线实例，其 Master 指向 541 类线型母版（官方 7 类之一）
        const relMasterIds = new Set(rels.map((r) => /Master="(\d+)"/.exec(r.attrs)?.[1]).filter(Boolean));
        const relMasterNames = [...relMasterIds].map((id) => [...masterIdByName.entries()].find(([, v]) => v === id)?.[0] ?? '?');
        expect(relMasterNames.every((n) => ['Inheritance', 'Interface Realization', 'Dependency', 'Directed Association', 'Aggregation', 'Composition', 'Association'].includes(n)), `关系线 Master 均属官方线型母版（实际=${relMasterNames.join(',')}）`).toBe(true);
        for (const n of relMasterNames) {
            if (n === '?') continue;
            expect(byName.get(n), `class 线型母版 ${n} 存在`).toBe('541');
        }
        // 实例不写箭头/线型字段（各线型母版承载）
        expect(rels.every((r) => !has(r.body, /N="EndArrow"/)), '关系线实例不写 EndArrow（各线型母版承载）').toBe(true);
        expect(rels.every((r) => !has(r.body, /N="LinePattern"/)), '关系线实例不写 LinePattern（各线型母版承载）').toBe(true);
        expect(rels.every((r) => /BegTrigger"[^>]*_XFTRIGGER/.test(r.body) && /EndTrigger"[^>]*_XFTRIGGER/.test(r.body)), '关系线触发器').toBe(true);
        const connMatches = [...page.matchAll(/<Connect FromSheet="(\d+)" FromCell="(\w+)" FromPart="(\w+)" ToSheet="(\d+)" ToCell="([^"]+)" ToPart="(\d+)"/g)];
        expect(connMatches.filter((m) => m[3] === '9').length, 'BeginX FromPart=9 记录').toBe(supports.length);
        expect(connMatches.filter((m) => m[3] === '12').length, 'EndX FromPart=12 记录').toBe(supports.length);
        // 方向感知端口：Begin/End 的 PAR 端口与 Connects ToPart=100+IX（Xk→IX=k-1）一致
        for (const r of supports) {
            const portByCell = new Map<string, string>();
            for (const mm of r.body.matchAll(/<Cell N="(BeginX|EndX)"[^>]*F="PAR\(PNT\(Sheet\.\d+!Connections\.(X\d+)/g)) portByCell.set(mm[1]!, mm[2]!);
            expect(portByCell.size, '关系线 PAR 端口对').toBe(2);
            for (const [cellName, part] of [['BeginX', '9'], ['EndX', '12']] as const) {
                const port = portByCell.get(cellName);
                if (!port) continue;
                const ix = Number(port.slice(1)) - 1;
                const toPart = String(100 + ix);
                expect(connMatches.filter((m) => m[2] === cellName && m[3] === part && m[5] === `Connections.${port}` && m[6] === toPart).length,
                    `Connects ${cellName}→${port} p${toPart}`).toBeGreaterThanOrEqual(1);
            }
        }
    }

    if (kind === 'er') {
        // 母版实例化口径（er-all-in-one）：Entity/属性行/分隔线/关系全部 Master= 实例；
        // 容器注册行（msvSDListItemMaster USE("Primary Key Attribute")）由母版承载；
        // 属性行 ItemIndex 行序（PK 行 ObjType 不写——主键语义由母版 User.PrimaryKey 承载，官方实例无 ObjType）；
        // 关系线双端 PAR + Connects（端边由 mmd 边选择/轴优选取边，端口 X1..X4 与 ToPart 对应）。
        const masterRefs = [...page.matchAll(/<Shape[^>]*Master="(\d+)"/g)].map((m) => m[1]);
        expect(masterRefs.length, 'Master 引用数 ≥ 官方样本 17').toBeGreaterThanOrEqual(17);
        const nameUs = [...xml('/visio/masters/masters.xml').matchAll(/NameU="([^"]+)"[^>]*MasterType="(\d+)"/g)];
        const byName = new Map(nameUs.map((m) => [m[1]!, m[2]!]));
        for (const [n, mt] of [['Entity', '2'], ['Primary Key Attribute', '2'], ['Primary Key Separator', '2'], ['Attribute', '2'], ['Relationship', '541']] as const) {
            expect(byName.get(n), `er 母版 ${n} 存在`).toBe(mt);
        }
        const masterIdByName = new Map<string, string>();
        for (const m of xml('/visio/masters/masters.xml').matchAll(/<Master\sID="(\d+)"\sNameU="([^"]+)"[^>]*?MasterType="(\d+)"/g)) masterIdByName.set(m[2]!, m[1]!);
        // 母版内容承载列表项注册（官方 Entity 母版 User.msvSDListItemMaster USE）
        const masterContents = pkg.listUris().filter((u) => /^\/visio\/masters\/master\d+\.xml$/.test(u)).map((u) => xml(u));
        expect(masterContents.some((m) => /USE\("Primary Key Attribute"\)/.test(m)), 'Entity 母版列表项注册 USE("Primary Key Attribute")').toBe(true);
        // 实体 Group 实例（容器特征：嵌套 MasterShape 6..8 覆写且无 BeginX；按 Master=Entity 精确过滤——
        // 属性行组亦有 MasterShape 6/7 覆写，不能按子形状号混入）
        const entityMasterId = masterIdByName.get('Entity');
        const groups = shapes.filter((s) => /Type="Group"/.test(s.attrs) && /Master="\d+"/.test(s.attrs) && /MasterShape="6"/.test(s.body) && !/N="BeginX"/.test(s.body) && entityMasterId !== undefined && new RegExp(`Master="${entityMasterId}"`).test(s.attrs));
        expect(groups.length, '实体 Group 实例数').toBeGreaterThanOrEqual(7);
        expect(groups.every((g) => /\bSUM\(DEPENDSON\b/.test(g.body)), '实体 Relationships SUM(DEPENDSON)').toBe(true);
        expect(groups.every((g) => /MasterShape="8"/.test(g.body)), '嵌套 MasterShape 6..8 覆写').toBe(true);
        expect(groups.every((g) => /N="TxtPinY"[^>]*F="Inh"/.test(g.body)), '实体 TxtPinY Inh').toBe(true);
        // 属性行：LISTSHEETREF + ItemIndex（官方行高 0.3889/表头 0.4362；几何/连接段 IX=0）
        const attrRows = shapes.filter((s) => has(s.body, /LISTSHEETREF/) && /<Row N="ItemIndex"/.test(s.body));
        expect(attrRows.length, '属性行（LISTSHEETREF+ItemIndex）').toBeGreaterThanOrEqual(20);
        expect(attrRows.every((s) => /<Row N="ContainerMargin"/.test(s.body)), '属性行 ContainerMargin').toBe(true);
        expect(attrRows.every((s) => !/N="ObjType"/.test(s.body)), '属性行不写 ObjType（主键语义母版承载）').toBe(true);
        expect(attrRows.every((s) => /MasterShape="6"[^>]*/.test(s.body) || /MasterShape="7"/.test(s.body)), '属性行嵌套 MasterShape 6/7 覆写').toBe(true);
        // 官方公式：实体 Height = HdrHgt + 属性行数*rowH（分隔线为 0 高行不计；高度随属性数动态变化，
        // Visio 打开保留——实测 0~5 属性实体均按此值保留）
        expect(groups.every((g) => {
            const h = Number(/N="Height" V="([\d.]+)"/.exec(g.body)?.[1] ?? 0);
            const memberIds = [...g.body.matchAll(/Sheet\.(\d+)!SheetRef\(\)/g)].map((m) => m[1]!);
            const nAttrs = memberIds.filter((mid) => {
                const s = shapes.find((x) => x.id === mid);
                return s !== undefined && !/Primary Key Separator/.test(s.attrs);
            }).length;
            const expectH = 0.4361626369900174 + nAttrs * 0.388939397515191;
            return h > 0 && Math.abs(h - expectH) < 1e-4;
        }), '实体 Height=官方内容公式（HdrHgt+n*rowH，分隔线 0 高）').toBe(true);
        // 官方实体实例无根 Geometry 段（边框由子形状 #6 承载；自写根段=多画一圈矩形）
        expect(groups.every((g) => !/<Section N="Geometry"/.test(g.body.split('<Shapes>')[0]!)), '实体无根 Geometry 段').toBe(true);
        // 官方行堆叠：行与行紧贴（属性→属性=rowH；属性→分隔线=rowH/2；分隔线→属性=rowH/2）
        expect(groups.every((g) => {
            const memberIds = [...g.body.matchAll(/Sheet\.(\d+)!SheetRef\(\)/g)].map((m) => m[1]!);
            const rows = memberIds.map((mid) => {
                const s = shapes.find((x) => x.id === mid)!;
                return { y: Number(/N="PinY" V="([\d.]+)"/.exec(s.body)?.[1] ?? NaN), sep: /Primary Key Separator/.test(s.attrs) };
            }).filter((r) => Number.isFinite(r.y));
            for (let i = 1; i < rows.length; i++) {
                const gap = Math.abs(rows[i - 1]!.y - rows[i]!.y);
                const want = rows[i - 1]!.sep || rows[i]!.sep ? 0.1944696987575955 : 0.388939397515191;
                if (Math.abs(gap - want) > 1e-4) return false;
            }
            return true;
        }), '属性行/分隔线紧贴堆叠（0 高分隔线）').toBe(true);
        // 关系线：PAR 钉接 + 触发器 + 无 EndArrow + W/H 随端点 GUARD + L 形几何 + Connects
        const rels = shapes.filter((s) => /N="BeginX"/.test(s.body));
        expect(rels.some((r) => has(r.body, /PAR\(PNT/)), '关系线 PAR 钉接').toBe(true);
        expect(rels.every((r) => !has(r.body, /N="EndArrow"/)), '关系线实例不写 EndArrow（母版承载）').toBe(true);
        expect(rels.every((r) => /BegTrigger"[^>]*_XFTRIGGER/.test(r.body) && /EndTrigger"[^>]*_XFTRIGGER/.test(r.body)), '关系线触发器').toBe(true);
        expect(rels.every((r) => /N="Width"[^>]*F="GUARD\(EndX-BeginX\)"/.test(r.body) && /N="Height"[^>]*F="GUARD\(EndY-BeginY\)"/.test(r.body)), '关系线 W/H GUARD(EndX-BeginX)').toBe(true);
        // 官方 L 形实例几何：LineTo IX=2 (Y=H)、IX=3 (X=W,Y=H)，段带 IX=0 覆写（母版段覆写坑）
        expect(rels.every((r) => /<Section N="Geometry" IX="0">/.test(r.body) && /<Row T="LineTo" IX="2"/.test(r.body) && /<Row T="LineTo" IX="3"/.test(r.body)), '关系线 L 形几何 + IX=0').toBe(true);
        // 端标记子形状 6..9（Begin 对 Con1Y / End 对 Con2X/Con2Y）
        expect(rels.every((r) => /MasterShape="6"/.test(r.body) && /MasterShape="9"/.test(r.body) && /<Row N="Con1Y"/.test(r.body) && /<Row N="Con2X"/.test(r.body)), '关系线端标记 6..9 + Con 行族').toBe(true);
        const connMatches = [...page.matchAll(/<Connect FromSheet="(\d+)" FromCell="(\w+)" FromPart="(\w+)" ToSheet="(\d+)" ToCell="([^"]+)" ToPart="(\d+)"/g)];
        // 端边集合 = 官方端口（X1=左100/X2=右101/X3=下102/X4=上103）；每条关系 Begin 与 End 各一条
        const portOk = (m: RegExpMatchArray) => {
            const pm = /Connections\.X(\d)/.exec(m[5]!);
            return !!pm && Number(m[6]) === 99 + Number(pm[1]);
        };
        expect(connMatches.filter((m) => m[2] === 'EndX' && m[3] === '12' && portOk(m)).length, 'EndX→端口 p100+行号').toBe(rels.length);
        expect(connMatches.filter((m) => m[2] === 'BeginX' && m[3] === '9' && portOk(m)).length, 'BeginX→端口 p100+行号').toBe(rels.length);
        const err = [] as string[];
        void err;
    }

    if (kind === 'sequence') {
        // 母版实例化口径（官方 sequence 包）：
        //  - 生命线实例带 4 个嵌套子形状 MS6..9（官方实例如此；不写会被 Visio 现场实例化并与页面形状 ID 冲突）；
        //  - 时间格 = 0.25IN 网格（母版公式：行 IX=k → Y=-(k+1)*0.25IN，长度由 Controls.Row_1.Y 钳制）；
        //  - 消息双 Geometry 段（IX=0 主线 + IX=1 箭头）；Return 为负 W/H（官方符号）；
        //  - Connects ToPart=100+存储行号、ToCell=Connections.X{行+1}（Visio 公式 1-based，X0 无效）。
        const masterRefs = [...page.matchAll(/<Shape[^>]*Master="(\d+)"/g)].map((m) => m[1]);
        expect(masterRefs.length, 'Master 引用数（样本规模相关，≥7）').toBeGreaterThanOrEqual(7);
        const nameUs = [...xml('/visio/masters/masters.xml').matchAll(/NameU="([^"]+)"[^>]*MasterType="(\d+)"/g)];
        const byName = new Map(nameUs.map((m) => [m[1]!, m[2]!]));
        for (const [n, mt] of [['Object lifeline', '2'], ['Message', '29'], ['Return Message', '29']] as const) {
            expect(byName.get(n), `sequence 母版 ${n} 存在`).toBe(mt);
        }
        for (const [n, mt] of [['Actor lifeline', '2'], ['Activation', '1'], ['Loop fragment', '2'], ['Optional fragment', '2']] as const) {
            if (byName.has(n)) expect(byName.get(n), `sequence 母版 ${n} MasterType`).toBe(mt);
        }
        // 生命线：Connection 行从 IX=0 起、0.25IN 网格、F=Inh；嵌套子形状 MS6..9 必须写出
        // （激活条的 Connection 亦从 IX=0 起，故须用 Control.Row_1 区分生命线）
        const lifelines = shapes.filter((s) => /Master="\d+"/.test(s.attrs) && /<Row T="Connection" IX="0"/.test(s.body) && /<Row N="Row_1"/.test(s.body));
        expect(lifelines.length, '生命线实例数').toBeGreaterThanOrEqual(2);
        expect(lifelines.every((s) => /<Section N="Control">/.test(s.body)), '生命线 Control 段').toBe(true);
        expect(lifelines.every((s) => /MasterShape="6"/.test(s.body) && /MasterShape="9"/.test(s.body)), '生命线嵌套子形状 MS6..9（防 Visio 现场实例化）').toBe(true);
        expect(lifelines.every((s) => /<Row T="Connection" IX="0">\s*<Cell N="Y" V="-0\.25" U="MM" F="Inh"\/>/.test(s.body)), '时间格行 IX=0 → Y=-0.25IN（0.25 网格）').toBe(true);
        expect(lifelines.every((s) => /N="Y" V="-0\.5" U="MM" F="Inh"/.test(s.body)), '时间格行 IX=1 → Y=-0.5IN').toBe(true);
        // 消息：PAR 钉接 + 触发器 + 双 Geometry 段
        const msgs = shapes.filter((s) => /Master="\d+"/.test(s.attrs) && /N="BeginX"[^>]*PAR\(PNT/.test(s.body) && /TextPosition/.test(s.body));
        expect(msgs.length, '消息 PAR 钉接数').toBeGreaterThanOrEqual(3);
        expect(msgs.every((s) => /_XFTRIGGER/.test(s.body)), '消息触发器').toBe(true);
        expect(msgs.every((s) => /<Section N="Geometry" IX="0">/.test(s.body) && /<Section N="Geometry" IX="1">/.test(s.body)), '消息双 Geometry 段（主线+箭头）').toBe(true);
        // Return：负 W/H（官方符号；由 Begin/End 方向决定）
        const returns = shapes.filter((s) => /NameU="Return Message/.test(s.attrs));
        if (returns.length > 0) {
            expect(returns.every((s) => /N="Width" V="-/.test(s.body) && /N="Height" V="-/.test(s.body)), 'Return 负 W/H（官方符号）').toBe(true);
        }
        // Connects：ToPart=100+存储行号；ToCell=Connections.X{行+1}
        const connMatches = [...page.matchAll(/<Connect FromSheet="(\d+)" FromCell="(\w+)" FromPart="(\w+)" ToSheet="(\d+)" ToCell="([^"]+)" ToPart="(\d+)"/g)];
        const portOk = (m: RegExpMatchArray) => {
            const pm = /Connections\.X(\d+)/.exec(m[5]!);
            return !!pm && Number(m[6]) === 99 + Number(pm[1]);
        };
        expect(connMatches.length, 'Connects 记录数').toBeGreaterThanOrEqual(4);
        expect(connMatches.every((m) => portOk(m)), 'Connects ToPart=100+存储行号（Xk ↔ 行 k-1）').toBe(true);
        expect(connMatches.filter((m) => m[2] === 'BeginX' && m[3] === '9').length, 'BeginX FromPart=9').toBeGreaterThanOrEqual(3);
        // 激活条（样本 15-2 有）
        if (/Activation/.test(xml('/visio/masters/masters.xml'))) {
            const acts = shapes.filter((s) => /Master="\d+"/.test(s.attrs) && /N="BeginX"/.test(s.body) && !/_XFTRIGGER/.test(s.body));
            expect(acts.length, '激活条实例数').toBeGreaterThanOrEqual(1);
            expect(acts.every((s) => /N="Width"[^>]*U="MM"/.test(s.body)), '激活条 Width=时间跨度（沿本地 X）').toBe(true);
        }
        // 片段（样本 15-2 有 loop）
        if (/Loop fragment/.test(xml('/visio/masters/masters.xml'))) {
            // 注意：生命线也带 MS6..9，故片段必须按 NameU 过滤，不能只看 MasterShape
            const frags = shapes.filter((s) => /Master="\d+"/.test(s.attrs) && /NameU="[^"]*fragment/.test(s.attrs));
            expect(frags.length, '片段实例数').toBeGreaterThanOrEqual(1);
            expect(frags.every((s) => /<Section N="Geometry" IX="0">/.test(s.body)), '片段根 Geometry IX=0').toBe(true);
            // 两段带：MS6=类型关键词（不写文本，继承母版「循环」/「选择」）、MS7=参数带（写 mermaid 标签）
            expect(frags.every((s) => {
                const kid6 = /<Shape ID="\d+" MasterShape="6"[^>]*>(?:(?!<\/Shape>)[\s\S])*?<\/Shape>/.exec(s.body)?.[0] ?? '';
                const kid7 = /<Shape ID="\d+" MasterShape="7"[^>]*>(?:(?!<\/Shape>)[\s\S])*?<\/Shape>/.exec(s.body)?.[0] ?? '';
                return !/<Text[ >]/.test(kid6) && /<Text[ >]/.test(kid7);
            }), '片段两段带：MS6 无文本（继承关键词）、MS7 带标签文本').toBe(true);
        }
        // 自消息（样本 15-3 有）：官方 Self Message 母版、跨 2 格（Height=-0.5IN）、两端钉接不同行
        const selfs = shapes.filter((s) => /NameU="Self Message/.test(s.attrs));
        if (selfs.length > 0) {
            expect(selfs.every((s) => /Master="\d+"/.test(s.attrs)), '自消息用官方 Self Message 母版').toBe(true);
            expect(selfs.every((s) => /N="Height" V="-0\.5"/.test(s.body)), '自消息跨 2 格（Height=-0.5IN）').toBe(true);
            expect(selfs.every((s) => {
                const xk = [...s.body.matchAll(/Connections\.X(\d+)/g)].map((m) => m[1]);
                return new Set(xk).size >= 2;
            }), '自消息两端钉接不同时间格行').toBe(true);
        }
        // alt（样本 15-4 有）：Alternative fragment 容器（仅 MS6 折角标题带）+ Interaction operand 分支
        if (/Alternative fragment/.test(xml('/visio/masters/masters.xml'))) {
            const alts = shapes.filter((s) => /NameU="Alternative fragment/.test(s.attrs));
            expect(alts.length, 'Alternative fragment 实例数').toBeGreaterThanOrEqual(1);
            expect(alts.every((s) => /Master="\d+"/.test(s.attrs) && /MasterShape="6"/.test(s.body)), 'alt 容器带 MS6 折角标题带').toBe(true);
            expect(alts.every((s) => !/MasterShape="7"/.test(s.body)), 'alt 容器无 MS7（官方母版只有 MS6）').toBe(true);
            const ops = shapes.filter((s) => /NameU="Interaction operand/.test(s.attrs));
            expect(ops.length, 'Interaction operand 分支数').toBeGreaterThanOrEqual(2);
            expect(ops.every((s) => /Master="\d+"/.test(s.attrs) && /<Text[ >]/.test(s.body)), '操作数带分支条件文本').toBe(true);
            // 首条分支 NoShow=1（不画分隔虚线）；其余显式 NoShow=0（母版公式依赖 LISTORDER()）
            expect(ops.filter((s) => /N="NoShow" V="1"/.test(s.body)).length, '首条操作数隐藏分隔线').toBeGreaterThanOrEqual(1);
            expect(ops.every((s) => /N="NoShow" V="[01]"/.test(s.body)), '操作数显式写 NoShow').toBe(true);
        }
        // note（样本 15-4 有）：官方 Note 母版 + 折角子形状 MS6 必须显式写出（否则多 Note ID 冲突被吞）
        const notes = shapes.filter((s) => /NameU="Note/.test(s.attrs));
        if (notes.length > 0) {
            expect(notes.every((s) => /Master="\d+"/.test(s.attrs) && /MasterShape="6"/.test(s.body)), '备注带折角子形状 MS6').toBe(true);
            expect(notes.every((s) => /N="TxtWidth"/.test(s.body)), '备注写死 TxtWidth（防母版折行撑高）').toBe(true);
        }
        // 页面尺寸：DrawingResizeType=2（不随图形缩放），Visio 打开后页面尺寸 = 写入值
        expect(xml('/visio/pages/pages.xml'), 'sequence 页面禁用自动缩放（DrawingResizeType=2）').toMatch(/N="DrawingResizeType" V="2"/);
        const err = [] as string[];
        void err;
    }

    return err;
}

describe('结构规范：每图型解压包 vs 研究准则规格（缺一即败）', () => {
    for (const c of kCases) {
        it(`样本 ${c.file}（${c.kind}）`, async (ctx) => {
            if (!hasBrowser) ctx.skip();
            if (!kImplementedKinds.has(c.kind)) ctx.skip(`diag-${c.kind} 未实现`);
            const text = readFileSync(`resources/mmd-input/${c.file}.mmd`, 'utf8');
            const a = await new Parser().convertText(text);
            const b0 = renderContract(a, {});
            const b1 = new PartsAssembler().assemble(b0.parts);
            const pkg = OpcPackage.open(new Squeeze().pack(b1));

            const errs = [...mustParts(pkg), ...l1Audit(pkg), ...l2Audit(c.type, pkg)];

            // 形状数下限（准则：图型内容不允许少节点）
            const page = pkg.get('/visio/pages/page1.xml')?.xml ?? '';
            const shapes = (page.match(/<Shape /g) ?? []).length;
            if (shapes < c.minShapes) errs.push(`形状数 ${shapes} < 规格下限 ${c.minShapes}`);
            console.log(`\n[SPEC:${c.file}] errors=${errs.length}`);
            for (const e of errs) console.log('   - ' + e);
            expect(errs, '结构规格缺失').toHaveLength(0);
        }, 120_000);
    }
});

describe('支持范围：不支持的图型直接报错（不兜底降级）', () => {
    it('gantt 输入抛出「不支持的图型」', async (ctx) => {
        if (!hasBrowser) ctx.skip();
        const p = new Parser();
        try {
            await expect(
                p.convertText('gantt\n    title x\n    section s\n    a: 2026-01-01, 1d'),
            ).rejects.toThrow(/不支持的图型/);
        } finally {
            await p.shutdown();
        }
    }, 120_000);
});
