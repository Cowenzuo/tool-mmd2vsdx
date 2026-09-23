// 输出路径策略：允许根、realpath 归一（含 Windows 大小写）、三级回退、覆盖规则
// 对应 docs/接口协议.md 的路径规则一节
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { ServiceError } from './errors.js';

export interface PathPolicy {
    /** 允许写入的根目录，绝对路径。 */
    roots: string[];
    /** 三级回退的兜底目录：配置根目录，没有配置就是「工作目录/vsdx-output」。 */
    defaultDir: string;
    /** 进程工作目录。 */
    cwd: string;
}

export interface PathPolicyOptions {
    /** 环境变量 MMD2VSDX_OUTPUT_DIR 或调用方显式指定。 */
    outputDir?: string | undefined;
    /** 工作目录，默认 process.cwd()。 */
    cwd?: string | undefined;
}

export function createPathPolicy(opts: PathPolicyOptions = {}): PathPolicy {
    const cwd = resolve(opts.cwd ?? process.cwd());
    const configured = opts.outputDir && opts.outputDir.trim() ? resolve(opts.outputDir) : null;
    const roots = configured && configured !== cwd ? [configured, cwd] : [cwd];
    return { roots, defaultDir: configured ?? join(cwd, 'vsdx-output'), cwd };
}

/** 路径归一：对最近的已存在祖先做 realpath，再拼回剩余段；Windows 下统一小写。 */
export function normalizePath(p: string): string {
    let cur = resolve(p);
    const tail: string[] = [];
    for (;;) {
        if (existsSync(cur)) break;
        const parent = dirname(cur);
        if (parent === cur) break;
        tail.unshift(basename(cur));
        cur = parent;
    }
    let real = cur;
    try {
        real = realpathSync.native(cur);
    } catch {
        /* 保持原样 */
    }
    const joined = tail.length > 0 ? join(real, ...tail) : real;
    return process.platform === 'win32' ? joined.toLowerCase() : joined;
}

/** target 是否落在 root 之内（含等于）。 */
export function isInside(root: string, target: string): boolean {
    const r = normalizePath(root);
    const t = normalizePath(target);
    return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep);
}

/** 三级回退定输出路径：参数 → 配置根目录 → 工作目录下 vsdx-output；越界拒绝。 */
export function resolveOutputPath(policy: PathPolicy, requested?: string, suggestedName = 'diagram.vsdx'): string {
    const target = requested && requested.trim()
        ? (isAbsolute(requested) ? requested : resolve(policy.cwd, requested))
        : join(policy.defaultDir, suggestedName);
    const abs = resolve(target);
    if (!policy.roots.some((r) => isInside(r, abs))) {
        throw new ServiceError(
            'path_denied',
            `输出路径不在允许目录内：${abs}`,
            `允许根：${policy.roots.join('、')}；需要别的目录时用环境变量 MMD2VSDX_OUTPUT_DIR 指定`,
        );
    }
    return abs;
}

/** 产物目录：缺省用兜底目录，越界拒绝，建好目录。 */
export function resolveOutputDir(policy: PathPolicy, requested?: string): string {
    const abs = requested && requested.trim()
        ? (isAbsolute(requested) ? requested : resolve(policy.cwd, requested))
        : policy.defaultDir;
    const dir = resolve(abs);
    if (!policy.roots.some((r) => isInside(r, dir))) {
        throw new ServiceError(
            'path_denied',
            `输出目录不在允许目录内：${dir}`,
            `允许根：${policy.roots.join('、')}；需要别的目录时用环境变量 MMD2VSDX_OUTPUT_DIR 指定`,
        );
    }
    try {
        mkdirSync(dir, { recursive: true });
    } catch (e) {
        throw new ServiceError('path_denied', `无法创建输出目录：${dir}`, String((e as Error).message));
    }
    return dir;
}

/** 目标可写性：目录建好，已存在且未允许覆盖时报错。 */
export function prepareTarget(absPath: string, overwrite: boolean): void {
    if (existsSync(absPath)) {
        if (!overwrite) {
            throw new ServiceError(
                'path_denied',
                `目标文件已存在：${absPath}`,
                '传 overwrite=true 允许覆盖，或换一个输出路径',
            );
        }
        if (!statSync(absPath).isFile()) {
            throw new ServiceError('path_denied', `目标不是文件：${absPath}`, '指定一个文件名');
        }
    }
    try {
        mkdirSync(dirname(absPath), { recursive: true });
    } catch (e) {
        throw new ServiceError('path_denied', `无法创建输出目录：${dirname(absPath)}`, String((e as Error).message));
    }
}

/** 把标题变成安全的文件名主体。 */
export function suggestFileName(title: string | undefined): string {
    const base = (title ?? '').trim() || 'diagram';
    const slug = base
        .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return `${slug || 'diagram'}.vsdx`;
}
