// 复制运行期原样保留的资产到 dist：src/snapshot/extract/*.mjs（浏览器注入脚本，
// 由 renderer 在编译产物旁读取并拼接；tsc 不处理非 TS 文件，需显式复制）。
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src', 'snapshot', 'extract');
const dstDir = join(root, 'dist', 'snapshot', 'extract');

mkdirSync(dirname(dstDir), { recursive: true });
cpSync(srcDir, dstDir, { recursive: true });
console.log(`[copy-assets] ${srcDir} -> ${dstDir}`);
