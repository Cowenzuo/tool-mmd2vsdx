// mmd2vsdx - vsdxdoc/masters：stencilAssets（母版资产运行时供应）
//
// 资产供应设计（03 审核 G-9 落地；规避官方模具再分发风险）：
//   - npm 包不随分模具资产。运行期按优先级取资产：
//       1) assetFile —— 预生成资产 JSON（assets/stencils/stencil-data.json 形态；
//          私自分发形态 B：把该文件单独分发，不经过公开渠道）；
//       2) stencilDir —— 官方模具目录（*.vssx/*.vstx 原件；私自分发形态 A）；
//       3) search !== false —— 自动搜寻本机 Visio 安装目录（Windows 常见布局），
//          现场提取；提取结果缓存到用户缓存目录（按模具文件指纹失效）；
//   - 提取逻辑 = scripts/gen-stencils.mjs 的 TS 化（宽容 zip 读取 + styles 提取 +
//     masters/rels/contents 收编），内部 stencil 名按 masters.xml 内容指纹判定
//     （不依赖文件名——本机官方文件名为英文全称，与仓库内部名不同）；
//   - 就绪前 masterLibrary 读取抛 [assets] 引导错误（含修复指引）。
// 同步架构约束：渲染链（diagramImporter→masterLibrary）保持同步——本模块在
// 装配发生前完成加载（application.convert* 前置 ensure），运行时模块幂等。

import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** 资产加载配置（CLI 旗标与库 API 共用）。 */
export interface StencilAssetsConfig {
    /** 预生成资产文件路径（stencil-data.json 形态）。 */
    assetFile?: string;
    /** 官方模具目录（含 .vssx/.vstx，现场提取）。 */
    stencilDir?: string;
    /** 是否允许自动搜寻本机 Visio（默认 true；显式路径时忽略）。 */
    search?: boolean;
    /** 提取缓存目录（默认用户缓存 mmd2vsdx/）。 */
    cacheDir?: string;
}

// ── 模块态（单例；加载成功后 masterLibrary 经 stencilDataRecord() 读取） ──

let loaded_: Record<string, string> | null = null;
let loadedKey_ = '';
/** 最近一次提取/搜寻的模具目录（缓存指纹的定位依据；进程内有效）。 */
let lastExtractDir_: string | null = null;

function configKey(config: StencilAssetsConfig): string {
    const parts: string[] = [];
    if (config.assetFile) parts.push('asset=' + path.resolve(config.assetFile));
    if (config.stencilDir) parts.push('dir=' + path.resolve(config.stencilDir));
    parts.push('search=' + (config.search !== false));
    return parts.join('|');
}

/** 已就绪的资产记录（key=内部 stencil 名，value=gzip(base64))。 */
export function stencilDataRecord(): Record<string, string> {
    if (!loaded_) {
        throw new Error(
            '[assets] 母版资产未就绪：首次转换会自动搜寻本机 Visio；或用 ' +
            '--stencil-dir <模具目录> / --stencil-asset <资产文件> 显式导入 ' +
            '（库 API：configureStencils）；详见 docs/usage.md §母版资产供给');
    }
    return loaded_;
}

/** 测试/热切换用：清空已加载状态。 */
export function resetStencilAssetsForTests(): void {
    loaded_ = null;
    loadedKey_ = '';
    lastExtractDir_ = null;
}

/**
 * 幂等加载资产。语义：
 *   - 已加载且本次为"缺省调用"（无显式路径/开关）→ 直接返回，不换源
 *     （application.convertText 每次默认 ensure({})，不得覆盖已显式配置的来源）；
 *   - 显式配置（assetFile/stencilDir/search=false）与上次不同 → 重载切换；
 * @returns 来源描述（诊断用）：asset:<path> | dir:<path> | cache:<path>
 */
export async function ensureStencilAssets(config: StencilAssetsConfig = {}): Promise<string> {
    const key = configKey(config);
    const explicit = config.assetFile !== undefined ||
        config.stencilDir !== undefined || config.search === false;
    if (loaded_) {
        if (!explicit || loadedKey_ === key) return loadedKey_;
    }
    const source = await resolveAndLoad(config);
    loadedKey_ = key;
    return source;
}

// ── 解析与加载 ──

async function resolveAndLoad(config: StencilAssetsConfig): Promise<string> {
    if (config.assetFile) return loadAssetFile(path.resolve(config.assetFile));
    if (config.stencilDir) return extractFromDir(path.resolve(config.stencilDir));
    if (config.search !== false) {
        const dir = searchVisioStencilDir();
        if (dir) {
            lastExtractDir_ = dir;
            const cached = tryReadCache(config.cacheDir);
            if (cached) {
                loaded_ = cached;
                return 'cache';
            }
            const source = await extractFromDir(dir);
            writeCacheRecord(loaded_!, config.cacheDir); // 缓存成功静默
            return source;
        }
    }
    throw new Error(
        '[assets] 未找到母版资产：本机未发现 Visio 官方模具，且未指定路径。' +
        '请用 --stencil-dir <模具目录>（官方 .vssx/.vstx 原件）或 ' +
        '--stencil-asset <资产文件>（预生成 stencil-data.json，可私下分发）导入；' +
        '或安装 Visio 后重试自动搜寻。');
}

function loadAssetFile(file: string): string {
    let text: string;
    try {
        text = readFileSync(file, 'utf8');
    } catch {
        throw new Error(`[assets] 无法读取资产文件：${file}`);
    }
    try {
        const record = JSON.parse(text) as Record<string, string>;
        if (typeof record !== 'object' || record === null || Object.keys(record).length === 0) {
            throw new Error('empty record');
        }
        loaded_ = record;
        return 'asset:' + file;
    } catch (e) {
        throw new Error(`[assets] 资产文件格式非法：${file}（${(e as Error).message}）`);
    }
}

// ── 内部 stencil 名指纹（对 masters.xml 的 NameU 集合判定，不依赖文件名） ──

const kStencilProbes: Record<string, string[]> = {
    basic_shape: ['Rectangle', 'Circle', 'Diamond'],
    flowchart: ['Process', 'Decision', 'Subprocess', 'Dynamic connector'],
    uml_class: ['Class', 'Member', 'Separator'],
    uml_sequence: ['Actor lifeline', 'Activation', 'Message.21'],
    er_database: ['Entity', 'Relationship'],
    gantt: ['Gantt Chart frame', 'Task bar', 'Milestone'],
    timeline: ['Block timeline', 'Line timeline'],
    calendar: ['Month', 'Week', 'Appointment'],
};

/** 按母版 NameU 集合判定内部 stencil 名（全命中；未识别返回 null）。 */
export function probeStencilKind(masterNames: string[]): string | null {
    const set = new Set(masterNames);
    for (const [kind, probes] of Object.entries(kStencilProbes)) {
        if (probes.every((p) => set.has(p))) return kind;
    }
    return null;
}

// ── 轻量 zip 读取（gen-stencils.mjs readZipEntries 平移 + 越界防护） ──

function readZipEntries(buf: Buffer): Array<{ name: string; data: Buffer }> {
    if (buf.length < 22) throw new Error('zip too small');
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50 &&
            i + 22 + buf.readUInt16LE(i + 20) === buf.length) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('EOCD not found');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries: Array<{ name: string; data: Buffer }> = [];
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central sig');
        const method = buf.readUInt16LE(p + 10);
        const csize = buf.readUInt32LE(p + 20);
        const usize = buf.readUInt32LE(p + 24);
        const nlen = buf.readUInt16LE(p + 28);
        const elen = buf.readUInt16LE(p + 30);
        const clen = buf.readUInt16LE(p + 32);
        const lp = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nlen);
        const dataStart = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28);
        if (dataStart + csize > buf.length) throw new Error('truncated entry ' + name);
        const raw = buf.subarray(dataStart, dataStart + csize);
        let data: Buffer;
        if (method === 0) data = Buffer.from(raw);
        else if (method === 8) data = inflateRawSync(raw);
        else throw new Error('unsupported method ' + method + ' for ' + name);
        if (data.length !== usize) throw new Error('size mismatch ' + name);
        entries.push({ name, data });
        p += 46 + nlen + elen + clen;
    }
    return entries;
}

// ── styles 提取（gen-stencils extractStyles 平移） ──

function extractStyles(documentXml: string): string | null {
    const parts: string[] = [];
    for (const tag of ['StyleSheets', 'Colors', 'FaceNames']) {
        const m = new RegExp('<' + tag + '>.*?</' + tag + '>', 's').exec(documentXml);
        if (m) parts.push(m[0]);
    }
    if (parts.length === 0) return null;
    return '<VisioStyles>' + parts.join('') + '</VisioStyles>';
}

function gzipB64(text: string): string {
    return gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64');
}

/** 单份模具文件 → { kind, encoded }（kind=内部名；无法识别抛错）。 */
export function extractStencilFile(file: string): { kind: string; encoded: string } {
    let buf: Buffer;
    try {
        buf = readFileSync(file);
    } catch (e) {
        throw new Error(`[assets] 无法读取模具文件：${file}（${(e as Error).message}）`);
    }
    let entries: Array<{ name: string; data: Buffer }>;
    try {
        entries = readZipEntries(buf);
    } catch (e) {
        throw new Error(`[assets] 模具文件不是合法 ZIP/OPC：${file}（${(e as Error).message}）`);
    }
    const byName = new Map(entries.map((e) => [e.name, e.data.toString('utf8')]));
    const mastersXml = byName.get('visio/masters/masters.xml');
    if (!mastersXml) throw new Error(`[assets] 模具缺少 masters.xml：${file}`);

    // 指纹判定内部名（读 NameU 集合）
    const nameUs: string[] = [];
    for (const m of mastersXml.matchAll(/<Master[^>]*\bNameU="([^"]+)"/g)) {
        nameUs.push(m[1]!);
    }
    const kind = probeStencilKind(nameUs);
    if (!kind) {
        throw new Error(`[assets] 无法识别模具内容（未匹配已知母版集）：${file}`);
    }

    const relsXml = byName.get('visio/masters/_rels/masters.xml.rels') ?? null;
    const contents: Record<string, string> = {};
    if (relsXml) {
        const relRe = /<Relationship[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g;
        const targetSet = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = relRe.exec(relsXml)) !== null) targetSet.add(m[2]!);
        for (const target of targetSet) {
            const xml = byName.get('visio/masters/' + target);
            if (xml !== undefined) contents[target] = xml;
        }
    }
    const stylesXml = byName.has('visio/document.xml')
        ? extractStyles(byName.get('visio/document.xml')!)
        : null;
    const record: Record<string, unknown> = { mastersXml, contents };
    if (relsXml !== null) record.relsXml = relsXml;
    if (stylesXml !== null) record.stylesXml = stylesXml;
    return { kind, encoded: gzipB64(JSON.stringify(record)) };
}

/** 目录全量提取：收齐 8 个内部名才成功；未识别/损坏的单文件跳过（非致命——
 *  官方 Visio Content 目录混有可访问性/网络等无关模具，属正常）。 */
async function extractFromDir(dir: string): Promise<string> {
    let files: string[];
    try {
        files = readdirSync(dir).filter((f) => /\.(vssx|vstx)$/i.test(f)).sort();
    } catch {
        throw new Error(`[assets] 无法读取模具目录：${dir}`);
    }
    if (files.length === 0) {
        throw new Error(`[assets] 模具目录中没有 .vssx/.vstx 文件：${dir}`);
    }
    const byKind = new Map<string, string>();
    for (const f of files) {
        try {
            const { kind, encoded } = extractStencilFile(path.join(dir, f));
            if (!byKind.has(kind)) byKind.set(kind, encoded);
        } catch {
            // 未识别/坏文件：跳过（收不齐时统一报缺失）
        }
    }
    const missing: string[] = [];
    for (const kind of Object.keys(kStencilProbes)) {
        if (!byKind.has(kind)) missing.push(kind);
    }
    if (missing.length > 0) {
        throw new Error(
            `[assets] 模具目录 ${dir} 缺少内部模具：${missing.join(', ')}` +
            '（需覆盖 8 类：基础形状/流程/类/时序/ER/甘特/时间线/日历；' +
            '目录中其它无关模具已忽略）');
    }
    loaded_ = Object.fromEntries(byKind);
    return 'dir:' + dir;
}

// ── 本机自动搜寻（Windows 常见 Visio Content 布局） ──

function candidateVisioContentDirs(): string[] {
    const candidates: string[] = [];
    const roots = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    const rootsX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const lcids = ['1033', '2052', '1028', '1041'];
    for (const base of [roots, rootsX86]) {
        for (const office of [
            path.join(base, 'Microsoft Office', 'root', 'Office16'),
            path.join(base, 'Microsoft Office', 'root', 'Office15'),
            path.join(base, 'Microsoft Office', 'Office16'),
            path.join(base, 'Microsoft Office', 'Office15'),
        ]) {
            const content = path.join(office, 'Visio Content');
            if (existsSync(content)) {
                for (const lcid of lcids) {
                    const dir = path.join(content, lcid);
                    if (existsSync(dir)) candidates.push(dir);
                }
                candidates.push(content);
            }
        }
    }
    return candidates;
}

function searchVisioStencilDir(): string | null {
    for (const dir of candidateVisioContentDirs()) {
        try {
            const hasStencils = readdirSync(dir).some((f) => /\.(vssx|vstx)$/i.test(f));
            if (hasStencils) return dir;
        } catch {
            // 无权限/不存在 → 下一候选
        }
    }
    return null;
}

// ── 提取缓存（用户目录；指纹 = 模具文件 size+mtime 摘要） ──

function defaultCacheDir(): string {
    const base = process.env['LOCALAPPDATA']
        ?? (process.platform === 'win32' ? path.join(homedir(), 'AppData', 'Local') : undefined)
        ?? path.join(homedir(), '.cache');
    return path.join(base, 'mmd2vsdx');
}

function dirFingerprint(dir: string): string | null {
    try {
        const h = createHash('sha1');
        for (const f of readdirSync(dir).filter((x) => /\.(vssx|vstx)$/i.test(x)).sort()) {
            const st = statSync(path.join(dir, f));
            h.update(f + ':' + st.size + ':' + Math.trunc(st.mtimeMs));
        }
        return h.digest('hex');
    } catch {
        return null;
    }
}

function tryReadCache(cacheDir?: string): Record<string, string> | null {
    try {
        if (!lastExtractDir_) return null;
        const fp = dirFingerprint(lastExtractDir_);
        if (!fp) return null;
        const file = path.join(cacheDir ?? defaultCacheDir(), 'stencil-data.json');
        if (!existsSync(file)) return null;
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
            fingerprint?: string; data?: Record<string, string>;
        };
        if (parsed.data && parsed.fingerprint === fp) return parsed.data;
        return null;
    } catch {
        return null;
    }
}

function writeCacheRecord(record: Record<string, string>, cacheDir?: string): void {
    try {
        if (!lastExtractDir_) return;
        const fp = dirFingerprint(lastExtractDir_);
        if (!fp) return;
        const dir = cacheDir ?? defaultCacheDir();
        mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'stencil-data.json');
        writeFileSync(file, JSON.stringify({ fingerprint: fp, data: record }));
    } catch {
        // 缓存失败不致命（下次重新提取）
    }
}
