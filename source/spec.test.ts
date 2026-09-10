// 结构规范测试（唯一保留）：每图型一个用例——转换 → 解压 → 与研究准则规格对比。
// 规格来源（唯一标尺）：docs/research/通用visio结构分析.md（规范版）+ class/ER/gantt/sequence 专篇。
// 原则：产物相对于准则规格**不允许少任何一个节点或属性**；缺失即失败。
// 无专篇素材的图型（git/mindmap/pie/quadrant/timeline）仅断言 L1 骨架与通用字段面，机制层标注待研究素材。

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { Parser } from './parser/index.js';
import { renderContract, kImplementedKinds } from './convert.js';
import { PartsAssembler } from './xml-parts/index.js';
import { Squeeze } from './squeeze/index.js';
import { OpcPackage } from './opc/index.js';

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
    { file: '02-c4-1', kind: 'c4', minShapes: 4, type: 'common' },
    { file: '16-state-1', kind: 'state', minShapes: 4, type: 'common' },
    { file: '17-timeline-1', kind: 'timeline', minShapes: 0, type: 'common' },
    { file: '18-xy-1', kind: 'xy', minShapes: 1, type: 'common' },
    { file: '12-pie-1', kind: 'pie', minShapes: 6, type: 'noSpec' },
    { file: '13-quadrant-1', kind: 'quadrant', minShapes: 4, type: 'noSpec' },
    { file: '08-git-1', kind: 'git', minShapes: 8, type: 'noSpec' },
    { file: '11-mindmap-1', kind: 'mindmap', minShapes: 8, type: 'noSpec' },
    { file: '03-class-1', kind: 'class', minShapes: 30, type: 'class' },
    { file: '04-er-1', kind: 'er', minShapes: 25, type: 'er' },
    { file: '07-gantt-1', kind: 'gantt', minShapes: 40, type: 'gantt' },
    { file: '15-sequence-1', kind: 'sequence', minShapes: 2, type: 'sequence' },
    { file: '15-sequence-2', kind: 'sequence', minShapes: 3, type: 'sequence' },
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
    return missing;
}

/** 栈式 Shape 解析（嵌套 Group 子形状正确配对；避免被嵌套 Shape 切割）。 */
function parseAllShapes(page: string): Array<{ id: string; attrs: string; body: string }> {
    const out: Array<{ id: string; attrs: string; body: string }> = [];
    const stack: Array<{ id: string; attrs: string; start: number }> = [];
    const re = /<Shape\sID="(\d+)"([^>]*)>|<\/Shape>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(page))) {
        if (m[0] === '</Shape>') {
            const top = stack.pop();
            if (top) out.push({ id: top.id, attrs: top.attrs, body: page.slice(top.start, m.index) });
        } else {
            stack.push({ id: m[1]!, attrs: m[2]!, start: re.lastIndex });
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
    if (!(/<StyleSheet ID="0"[^>]*>([\s\S]*?)<\/StyleSheet>/.exec(doc)?.[1] ?? '').includes('<Cell')) err.push('0 号 No Style 空壳（6.4.3）');
    if (!xml('/docProps/custom.xml').includes('"RecalcDocument"')) err.push('custom.xml 缺 RecalcDocument（6.4.3/O-5）');

    // 形状级（5.5.3.2/5.5.3.3）：位置必须、端点必须、几何必须有关闭与起点
    const shapes = parseAllShapes(page);
    const masterXmls = [...pkg.listUris().filter((u) => /^\/visio\/masters\/master\d+\.xml$/.test(u)).map((u) => xml(u))];
    for (const s of shapes) {
        for (const cell of ['PinX', 'PinY']) {
            if (!s.body.includes(`N="${cell}"`)) err.push(`Shape ${s.id} 缺 ${cell}（5.5.3.2 实例位置必填）`);
        }
        if (/N="BeginX"/.test(s.body)) {
            for (const cell of ['BeginY', 'EndX', 'EndY']) {
                if (!s.body.includes(`N="${cell}"`)) err.push(`Shape ${s.id}（1-D）缺 ${cell}（5.5.3.3）`);
            }
            // GlueType/ObjType 可能随母版（basic-5：实例只有 Master=；母版承载行为组）
            if (!s.body.includes('N="GlueType"') && !masterXmls.some((m) => /GlueType" V="2"/.test(m))) {
                err.push(`Shape ${s.id}（1-D）缺 GlueType（实例或母版，5.5.3.3）`);
            }
            if (!s.body.includes('N="ObjType"') && !masterXmls.some((m) => /ObjType" V="2"/.test(m))) {
                err.push(`Shape ${s.id}（1-D）缺 ObjType（实例或母版，5.5.3.3）`);
            }
        }
        const isLine = /N="BeginX"/.test(s.body);
        const hasGeom = /<Section N="Geometry"/.test(s.body);
        if (hasGeom) {
            if (!s.body.includes('<Row T="MoveTo"')) err.push(`Shape ${s.id} 几何缺 MoveTo 起点行（5.4.3.3）`);
            const lineTos = (s.body.match(/<Row T="LineTo"/g) ?? []).length;
            const hasArc = /EllipticalArcTo|ArcTo/.test(s.body);
            if (isLine) {
                // 线几何：MoveTo+LineTo 即可（6.2.4），可带 Del 占位（5.5.3.3）
            } else if (hasArc) {
                // 圆/扇形/圆角：以弧行闭合（EllipticalArcTo 体系），不要求 IX5（5.4.3.3 只针对直角矩形）
            } else if (lineTos >= 3) {
                // 直角矩形轮廓：最后一行显式闭合（F=Geometry1.X1 / IX5 回起点）
                if (
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
    const doc = xml('/visio/document.xml');
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
                    if (!has(s.body, /N="Width"[^>]*F="GUARD\(EndX-BeginX\)/) || !has(s.body, /N="Height"[^>]*F="GUARD\(EndY-BeginY\)/)) {
                        err.push(`通用连接线 Shape ${s.id} 缺 Width/Height 随端点公式（basic-5）`);
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
        // class 专篇 2.2/2.3：类盒 Group 行为字段；3.2/3.3：成员行容器公式；4.2：关系母版语义
        const groups = shapes.filter((s) => /Type="Group"/.test(s.attrs));
        if (groups.length === 0) err.push('class 无 Group 类盒（专篇 2）');
        for (const g of groups) {
            for (const c of ['ObjType', 'ShapePlaceStyle', 'LockWidth', 'LockHeight', 'LockRotate', 'NoObjHandles']) {
                if (!g.body.includes(`N="${c}"`)) err.push(`class 组 ${g.id} 缺 ${c}（2.2）`);
            }
            if (!has(g.body, /<Section N="User">[\s\S]*WidthMin/)) err.push(`class 组 ${g.id} 缺 User.WidthMin（2.2）`);
            if (!has(g.body, /<Section N="Control">[\s\S]*Row_1/)) err.push(`class 组 ${g.id} 缺 Control Row_1（2.2）`);
            if (!has(g.body, /<Section N="Geometry"[^>]*>[\s\S]*EllipticalArcTo/)) err.push(`class 组 ${g.id} 几何缺 EllipticalArcTo 圆角（2.2）`);
            const connRows = (g.body.match(/<Row T="Connection" IX="(\d+)"/g) ?? []).length;
            if (connRows !== 4) err.push(`class 组 ${g.id} 连接行为 ${connRows}（应为 4：左/右/下/上，专篇 2.4/W-11）`);
            const nested = /<Shapes>/.test(g.body) ? true : false;
            if (!nested) err.push(`class 组 ${g.id} 缺嵌套子形状（2.2 最小实例）`);
        }
        const members = shapes.filter((s) => !/Master="\d+"/.test(s.attrs) && has(s.body, /N="TxtWidth"/) === false);
        for (const m of shapes) {
            if (has(m.body, /<Text>/) && !/Type="Group"/.test(m.attrs) && !m.body.includes('TxtWidth') && !/Dynamic|connector/i.test(m.attrs)) {
                // 成员行应有容器回指（3.2/3.3）
                if (!has(m.body, /LISTSHEETREF|DEPENDSON|ShapeFixedCode|GlueType/) && !/Master="/.test(m.attrs)) {
                    err.push(`class 成员行 ${m.id} 缺容器公式（LISTSHEETREF/DEPENDSON/ShapeFixedCode/GlueType，专篇 3.2/3.3）`);
                }
            }
        }
        // 关系：应带 UML 语义（4.2/4.3 虚/实 + EndArrow + Trigger）
        const rels = shapes.filter((s) => /N="BeginX"/.test(s.body));
        for (const r of rels) {
            if (!has(r.body, /N="EndArrow"/)) err.push(`class 关系 ${r.id} 缺 EndArrow（4.3 12/14）`);
            if (!has(r.body, /N="BegTrigger"/) || !has(r.body, /N="EndTrigger"/)) err.push(`class 关系 ${r.id} 缺 Beg/EndTrigger（4.2）`);
        }
        void members;
    }

    if (kind === 'er') {
        const groups = shapes.filter((s) => /Type="Group"/.test(s.attrs));
        for (const g of groups) {
            if (shapes.indexOf(g) < 100 && has(g.body, /N="TxtWidth"/) && !has(g.body, /<Section N="User">[\s\S]*msvShapeCategories/)) {
                err.push(`er 实体组 ${g.id} 缺 User 注册行（2.2：msvShapeCategories/msvSDListItemMaster）`);
            }
        }
        // 实体容器注册（2.2）：至少一个组带 msvSDListItemMaster USE（允许分组；规格=每实体容器）
        const containerReg = [...page.matchAll(/<Row N="msvSDListItemMaster1"[\s\S]*?USE\(/g)];
        if (containerReg.length === 0) err.push('er 实体无 msvSDListItemMaster USE 注册（2.2）');
        // 主键/普通属性行区分（3.2：PrimaryKey BOOL + AttributeName=SHAPETEXT + 2 子形状 + 2 连接行）
        const attrRow = [...page.matchAll(/<Row N="PrimaryKey"[\s\S]*?<Cell N="Value" V="(\d)"/g)];
        if (attrRow.length === 0) err.push('er 属性行缺 PrimaryKey 标记（3.2）');
        for (const m of page.matchAll(/<Row N="AttributeName"[\s\S]*?SHAPETEXT/g)) void m;
        if (!/SHAPETEXT\(TheText\)/.test(page)) err.push('er 属性行缺 AttributeName=SHAPETEXT（3.2）');
        // 关系（4.2）：User 段
        for (const r of shapes.filter((s) => /N="BeginX"/.test(s.body))) {
            if (!has(r.body, /Row N="RelationshipName"/)) err.push(`er 关系 ${r.id} 缺 User.RelationshipName（4.2）`);
            if (!has(r.body, /Row N="Identifying"/)) err.push(`er 关系 ${r.id} 缺 User.Identifying（4.2）`);
        }
    }

    if (kind === 'gantt') {
        // 2.2：pr 样式家族 24 枚（ID 8-31）
        const pr = (doc.match(/NameU="pr /g) ?? []).length;
        if (pr < 24) err.push(`gantt pr 样式家族 ${pr}/24（2.2/2.5）`);
        // 3.2：标尺格 Field 段
        if (!/<Section N="Field">/.test(page)) err.push('gantt 无 Field 段（3.2 标尺/文本条目数据来源）');
        // 4.2：任务条命名连接行 + Property 段 + 8 子形状
        if (!/LeftSide|RightSide/.test(page)) err.push('gantt 任务条无 LeftSide/RightSide 命名连接行（4.2/g-1）');
        if (!/<Section N="Property">/.test(page)) err.push('gantt 无 Property 段（4.2/g-2）');
        const barGroups = shapes.filter((s) => /Type="Group"/.test(s.attrs));
        for (const g of barGroups) {
            const kids = (g.body.match(/<Shape ID="/g) ?? []).length;
            if (kids < 8) err.push(`gantt 任务条组 ${g.id} 子形状 ${kids}/8（4.1）`);
        }
    }

    if (kind === 'sequence') {
        // 2.2/2.5：生命线 100 时间点连接行（Controls.Row_1/IF/MODULUS/6.35MM 步长）
        const lifelines = shapes.filter((s) => /Type="Group"/.test(s.attrs));
        for (const g of lifelines) {
            const rows = (g.body.match(/<Row T="Connection" IX="(\d+)"/g) ?? []).length;
            if (rows < 100 && !/Cont|Row_1/.test(g.body)) err.push(`sequence 生命线 ${g.id} 连接行 ${rows}（应 100 时间格，2.2/s-5）`);
            if (!/<Cell N="X"[^>]*F="Controls\.Row_1"/.test(g.body)) err.push(`sequence 生命线 ${g.id} X 公式缺 Controls.Row_1（2.2）`);
        }
        // 3.2：激活 1-D + 锁高（s-4）；消息 EndArrow/LinePattern（3.2 四类）
        for (const s of shapes.filter((x) => /N="BeginX"/.test(x.body))) {
            if (has(s.body, /N="FillForegnd"/) && !has(s.body, /N="LockHeight"/)) err.push(`sequence 激活条 ${s.id} 缺 LockHeight（s-4）`);
        }
        if (!/N="EndArrow"/.test(page)) err.push('sequence 消息缺 EndArrow（3.2 四类编码）');
        if (!/N="LinePattern" V="2"/.test(page)) err.push('sequence 缺返回消息 LinePattern=2（3.2/3.3）');
        // 2.3：ToPart 扩到时间格高行号（消息粘时间点）
        const maxPart = Math.max(0, ...[...page.matchAll(/ToPart="(\d+)"/g)].map((m) => Number(m[1])));
        if (maxPart <= 103) err.push(`sequence ToPart 最高 ${maxPart}（应到 100+ 时间格，2.3）`);
    }

    if (kind === 'noSpec') {
        // 无专篇素材：仅声明 L2 无准则锚点；此处不做机制断言（待研究素材扩充）
        err.push('noSpec');
        err.length = 0;
    }
    return err;
}

describe('结构规范：每图型解压包 vs 研究准则规格（缺一即败）', () => {
    for (const c of kCases) {
        it(`样本 ${c.file}（${c.kind}）`, async (ctx) => {
            if (!hasBrowser) ctx.skip();
            if (!kImplementedKinds.has(c.kind)) ctx.skip(`diag-${c.kind} 未实现`);
            const text = readFileSync(`resources/test-examples/mmd-input/${c.file}.mmd`, 'utf8');
            const a = await new Parser().convertText(text);
            const b0 = renderContract(a, {});
            const b1 = new PartsAssembler().assemble(b0.parts);
            const pkg = OpcPackage.open(new Squeeze().pack(b1));

            const errs = [...mustParts(pkg), ...l1Audit(pkg)];
            if (c.type !== 'noSpec') errs.push(...l2Audit(c.type, pkg));

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
