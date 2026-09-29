// 离线可分发包：dist + bin + 生产依赖 + Chromium 浏览器 → release/<name>-offline-<ver>-<platform>.zip
//
// 为什么需要：目标机器可能完全没网——装不了 npm 依赖，也拉不了 Chromium。Playwright 支持把浏览器
// 装到指定目录（PLAYWRIGHT_BROWSERS_PATH），随产物一起分发；启动脚本负责把它指回包内路径。
//
// 用法：
//   node scripts/pack-offline.mjs            构建 + 打包（产物落 release/）
//   node scripts/pack-offline.mjs --no-build 复用现有 dist
//   node scripts/pack-offline.mjs --verify   打包后再解包跑一次冒烟（/health + 一次转换）
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const platform = `${process.platform}-${process.arch}`;
const stageRoot = join(root, '.pack');
const browsersDir = join(stageRoot, 'browsers');
const stageDir = join(stageRoot, `${pkg.name}-offline-${pkg.version}`);
const releaseDir = join(root, 'release');
const zipPath = join(releaseDir, `${pkg.name}-offline-${pkg.version}-${platform}.zip`);

function run(cmd, cmdArgs, opts = {}) {
    console.log(`[pack] ${cmd} ${cmdArgs.join(' ')}`);
    const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32', cwd: root, ...opts });
    if (r.status !== 0) throw new Error(`${cmd} 退出码 ${r.status}`);
}

// 1) 构建
if (!args.has('--no-build')) {
    run('npm', ['run', 'build']);
}
if (!existsSync(join(root, 'dist', 'server', 'index.js'))) {
    throw new Error('dist/ 不完整：先 npm run build');
}

// 2) 浏览器装进包内目录（启动脚本把 PLAYWRIGHT_BROWSERS_PATH 指到包内 browsers/）
//    优先取本机缓存里的 **headless shell**：服务只跑无头，shell 够用且不必联网
//    （完整 chromium 的下载在受限网络下常失败：ECONNRESET）。缓存也没有才去下载。
rmSync(browsersDir, { recursive: true, force: true });
mkdirSync(browsersDir, { recursive: true });
const cacheRoot = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : '';
const cachedShells =
    cacheRoot && existsSync(cacheRoot) ? readdirSync(cacheRoot).filter((n) => n.startsWith('chromium_headless_shell-')) : [];
if (cachedShells.length > 0) {
    for (const d of cachedShells) {
        cpSync(join(cacheRoot, d), join(browsersDir, d), { recursive: true });
        console.log(`[pack] 浏览器取自本机缓存：${d}`);
    }
} else {
    run('npx', ['playwright', 'install', 'chromium', '--only-shell'], {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir },
    });
}

// 3) 暂存目录：包元数据 + dist + bin + 文档 + 启动脚本
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
for (const f of ['README.md', 'LICENSE', 'package-lock.json']) {
    if (existsSync(join(root, f))) cpSync(join(root, f), join(stageDir, f));
}
cpSync(join(root, 'dist'), join(stageDir, 'dist'), { recursive: true });
cpSync(join(root, 'bin'), join(stageDir, 'bin'), { recursive: true });
cpSync(browsersDir, join(stageDir, 'browsers'), { recursive: true });
writeFileSync(
    join(stageDir, 'package.json'),
    `${JSON.stringify(
        {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            type: pkg.type,
            private: true,
            engines: pkg.engines,
            bin: pkg.bin,
            dependencies: pkg.dependencies,
        },
        null,
        2,
    )}\n`,
    'utf8',
);

// 4) 生产依赖（--ignore-scripts：浏览器已单独打包，不让 playwright 再去下载）
run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stageDir });

// 5) 启动脚本 + 离线部署说明
writeFileSync(
    join(stageDir, 'start.cmd'),
    [
        '@echo off',
        'setlocal',
        'rem 浏览器随包分发：指向包内 browsers/，目标机器无需联网',
        'set "PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers"',
        'node "%~dp0bin\\mmd2vsdx-server.mjs" %*',
        '',
    ].join('\r\n'),
    'utf8',
);
writeFileSync(
    join(stageDir, '离线部署说明.md'),
    [
        `# ${pkg.name} 离线部署包（${pkg.version} / ${platform}）`,
        '',
        '## 依赖',
        `- Node.js ${pkg.engines?.node ?? '>=22'}（目标机器需要装，包内不含 Node 运行时）`,
        '- 无需网络：依赖与 Chromium 都在包内',
        '',
        '## 启动',
        '```',
        'start.cmd                 :: 默认端口',
        'start.cmd --port 12138    :: 指定端口',
        '```',
        '`start.cmd` 会设置 `PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers`，让 Playwright 用包内浏览器。',
        '',
        '## 自检',
        '```',
        'curl http://127.0.0.1:12138/health      :: chromium 应为 ready',
        '```',
        '接口见 docs/接口协议.md（POST /convert，body 为 mermaid 文本，返回 vsdx 字节）。',
        '',
    ].join('\n'),
    'utf8',
);

// 6) 打 zip（Windows 用 Compress-Archive；其它平台用 zip 命令）
mkdirSync(releaseDir, { recursive: true });
rmSync(zipPath, { force: true });
if (process.platform === 'win32') {
    run('powershell', [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal -Force`,
    ]);
} else {
    run('zip', ['-qr', zipPath, '.'], { cwd: stageDir });
}
const sizeMb = (readFileSync(zipPath).length / 1024 / 1024).toFixed(1);
console.log(`[pack] 产物：${zipPath}（${sizeMb} MB）`);

// 7) 可选冒烟：解包到**系统临时目录**（必须在仓库之外——否则 Node 会向上找到仓库的
//    node_modules，掩盖"包里缺依赖"，那样等于没验），用包内浏览器起服务，/health + 转换一次
if (args.has('--verify')) {
    const verifyDir = join(tmpdir(), `mmd2vsdx-verify-${process.pid}`);
    rmSync(verifyDir, { recursive: true, force: true });
    mkdirSync(verifyDir, { recursive: true });
    run('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${verifyDir}' -Force`]);
    const child = spawn(process.execPath, [join(verifyDir, 'bin', 'mmd2vsdx-server.mjs'), '--port', '12299'], {
        // 把 LOCALAPPDATA 也隔离掉：否则 Playwright 可能回落到全局浏览器缓存，
        // "包内浏览器能不能用"就验不出来了
        env: {
            ...process.env,
            PLAYWRIGHT_BROWSERS_PATH: join(verifyDir, 'browsers'),
            LOCALAPPDATA: join(verifyDir, '.isolated-localappdata'),
        },
        stdio: 'ignore',
        windowsHide: true,
    });
    try {
        let ready = false;
        for (let i = 0; i < 120 && !ready; i++) {
            await new Promise((r) => setTimeout(r, 500));
            try {
                const j = await (await fetch('http://127.0.0.1:12299/health')).json();
                ready = j.chromium === 'ready';
            } catch {
                /* 还没起来 */
            }
        }
        if (!ready) throw new Error('离线包冒烟失败：/health 未 ready（浏览器未随包生效？）');
        const res = await fetch('http://127.0.0.1:12299/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: 'flowchart TD\n    A[开始] --> B[结束]\n',
        });
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.subarray(0, 2).toString('latin1') !== 'PK') throw new Error(`离线包冒烟失败：/convert 返回 ${buf.length} 字节且不是 zip`);
        console.log(`[pack] 冒烟通过：/health ready、/convert 返回 ${buf.length} 字节 vsdx`);
    } finally {
        child.kill();
    }
}
