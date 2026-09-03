// mmd2vsdx - testapp：编排层（convertText/convertFile/convertDir/serve）
// 与 M6 闸门：真实文本全链（默认母版）+ roundtrip 自洽 + 性能冒烟。
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { application } from '../src/app/application.js';
import { OpcPackager } from '../src/opcpkg/opcpackager.js';
import { Package } from '../src/opcpkg/package.js';
import { translate as vsdxTranslate } from '../src/vsdxdoc/vsdxTranslator.js';
import { jsonToDiagram } from '../src/mmdtransform/jsonToDiagram.js';
import { snapshotDir, makeTempDir, stencilAssetsAvailable } from './helpers.js';
import { diffXmlParts } from './goldenCompare.js';

afterAll(async () => {
    await application.shutdown();
});

describe('convertText 与 ConvertResult', () => {
    it('真实文本 → ok + base64 可开卷（真实母版；无资产环境自动跳过）',
        { timeout: 60000, skip: !stencilAssetsAvailable }, async () => {
        const r = await application.convertText('graph TB; A[开始] --> B[结束]');
        expect(r.ok).toBe(true);
        expect(r.vsdxBase64.length).toBeGreaterThan(1000);
        expect(r.diagramType).toBe('flowchart');
        expect(r.pageCount).toBe(1);
        const dir = makeTempDir('mmd2vsdx-app-');
        try {
            const file = path.join(dir, 'a.vsdx');
            writeFileSync(file, Buffer.from(r.vsdxBase64, 'base64'));
            const pkg = Package.open(file);
            expect(pkg.partUris().some((u) => u.string() === 'visio/masters/masters.xml')).toBe(true);
            expect(() => pkg.validate()).not.toThrow();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('真实文本 → ok + base64 可开卷（masterless 本地内容路径，任何环境可跑）',
        { timeout: 60000 }, async () => {
        const r = await application.convertText('graph TB; A[开始] --> B[结束]',
            { useConnectorMaster: false });
        expect(r.ok).toBe(true);
        expect(r.vsdxBase64.length).toBeGreaterThan(1000);
        expect(r.pageCount).toBe(1);
        const dir = makeTempDir('mmd2vsdx-app-');
        try {
            const file = path.join(dir, 'a.vsdx');
            writeFileSync(file, Buffer.from(r.vsdxBase64, 'base64'));
            const pkg = Package.open(file);
            expect(pkg.partUris().some((u) => u.string() === 'visio/masters/masters.xml')).toBe(false);
            expect(() => pkg.validate()).not.toThrow();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe.skipIf(!stencilAssetsAvailable)('convertFile / convertDir', () => {
    it('目录批量串行输出（顺序=输入序）', { timeout: 120000 }, async () => {
        const dir = makeTempDir('mmd2vsdx-cd-');
        const out = path.join(dir, 'out');
        try {
            const input = path.join(dir, 'in');
            mkdirSync(input);
            writeFileSync(path.join(input, 'b.mmd'), 'graph TB; B1-->B2');
            writeFileSync(path.join(input, 'a.mmd'), 'pie\n"x" 1\n"y" 2');
            const outputs = await application.convertDir(input, out);
            expect(outputs.map((o) => path.basename(o))).toEqual(['a.mmd'.replace('.mmd', '.vsdx'), 'b.mmd'.replace('.mmd', '.vsdx')]);
            for (const o of outputs) {
                expect(() => Package.open(o)).not.toThrow();
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe.skipIf(!stencilAssetsAvailable)('serve 形态', () => {
    it('health + convert（业务错误 200+status:error）', { timeout: 90000 }, async () => {
        const server = await application.serve(0);
        const address = server.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        try {
            const health = await fetch(`http://127.0.0.1:${port}/health`);
            expect(health.status).toBe(200);
            expect(((await health.json()) as { status: string }).status).toBe('ok');
            const res = await fetch(`http://127.0.0.1:${port}/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'graph TB; A-->B' }),
            });
            expect(res.status).toBe(200);
            const body = (await res.json()) as { status: string; vsdx?: string };
            expect(body.status).toBe('ok');
            expect(body.vsdx!.length).toBeGreaterThan(1000);
        } finally {
            server.close();
        }
    });
});

describe.skipIf(!stencilAssetsAvailable)('roundtrip：真实母版产物 生成→读取→再生成 结构等价', () => {
    for (const name of ['05-flowchart-1', '07-gantt-1']) {
        it(`${name} 两次打包部件与 XML 结构自洽`, () => {
            const payload = JSON.parse(
                readFileSync(path.join(snapshotDir, name + '.json'), 'utf8'));
            const parts = vsdxTranslate(jsonToDiagram({ status: 'ok', ...payload }));
            const dir = makeTempDir('mmd2vsdx-rt-');
            try {
                const f1 = path.join(dir, '1.vsdx');
                OpcPackager.pack(parts, f1);
                const pkg = Package.open(f1);
                // 由开卷产物重建 XmlParts 再打包
                const rebuilt = { parts: pkg.partUris().map((u) => ({
                    uri: u.string(),
                    contentType: pkg.part(u).contentType,
                    xml: pkg.part(u).payload.toString('utf8'),
                })) };
                const f2 = path.join(dir, '2.vsdx');
                OpcPackager.pack(rebuilt, f2);
                const pkg2 = Package.open(f2);
                const u1 = pkg.partUris().map((u) => u.string()).sort();
                const u2 = pkg2.partUris().map((u) => u.string()).sort();
                expect(u1).toEqual(u2);
                for (const uri of u1) {
                    const a = pkg.part(pkg.partUris().find((u) => u.string() === uri)!).payload.toString('utf8');
                    const b = pkg2.part(pkg2.partUris().find((u) => u.string() === uri)!).payload.toString('utf8');
                    expect(diffXmlParts(a, b, `${name} ${uri}`), `${name} ${uri}`).toBeNull();
                }
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        });
    }
});

describe.skipIf(!stencilAssetsAvailable)('性能冒烟（fixture 驱动，不含浏览器）', () => {
    it('单图翻译+打包 ≤ 2s', () => {
        const payload = JSON.parse(
            readFileSync(path.join(snapshotDir, '06-flowchart-2.json'), 'utf8'));
        const start = Date.now();
        const parts = vsdxTranslate(jsonToDiagram({ status: 'ok', ...payload }));
        const elapsed = Date.now() - start;
        expect(parts.parts.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(2000);
        console.log(`perf: fixture 06 translate+serialize ${elapsed}ms`);
    });
});
