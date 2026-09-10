// mmd2vsdx - testmasters / M5 金标准闸门：真实母版模式 16 样本与 C++ 基线产物
// 逐部件结构对比（规则见 goldenCompare.ts：数值属性容差、F 公式精确）。
// 覆盖：部件清单一致 + 每 xml 部件 parse 级等价。
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { jsonToDiagram } from '../src/mmdtransform/jsonToDiagram.js';
import { translate as translatorTranslate } from '../src/vsdxdoc/vsdxTranslator.js';
import { OpcPackager } from '../src/opcpkg/opcpackager.js';
import { Package } from '../src/opcpkg/package.js';
import { goldenDir, goldenVsdxFiles, snapshotDir, stencilAssetsAvailable } from './helpers.js';
import { diffXmlParts } from './goldenCompare.js';

// 公开克隆不含模具资产（合规红线）→ 金标准闸门自动跳过；本地/私有 CI 全绿。
describe.skipIf(!stencilAssetsAvailable)('M5 金标准闸门：真实母版模式产物 vs C++ 基线（16 样本）', () => {
    const files = goldenVsdxFiles();
    expect(files).toHaveLength(16);
    for (const name of files) {
        it(`${name} 部件清单一致且全部 xml 部件结构等价`, () => {
            const base = name.replace(/\.vsdx$/i, '');
            const payload = JSON.parse(
                readFileSync(path.join(snapshotDir, base + '.json'), 'utf8'));
            const diagram = jsonToDiagram({ status: 'ok', ...payload });
            // 默认选项 = 真实母版打包
            const parts = translatorTranslate(diagram);
            const goldenPkg = Package.open(path.join(goldenDir, name));
            const goldenUris = goldenPkg.partUris().map((u) => u.string());
            const oursUris = parts.parts.map((p) => p.uri);

            // 部件清单一致（顺序无关）
            expect([...oursUris].sort(), `${name} 部件清单`).toEqual([...goldenUris].sort());

            for (const uri of goldenUris) {
                const goldenXml = goldenPkg.part(goldenPkg.partUris().find((u) => u.string() === uri)!).payload.toString('utf8');
                const ours = parts.parts.find((p) => p.uri === uri);
                expect(ours, `${name} ${uri} 存在`).toBeDefined();
                const diff = diffXmlParts(goldenXml, ours!.xml, `${name} ${uri}`);
                expect(diff, `${name} ${uri}`).toBeNull();
            }
        });
    }
});

describe.skipIf(!stencilAssetsAvailable)('roundtrip 冒烟：真实母版产物经 OpcPackager 开卷自洽', () => {
    it('flowchart 母版产物打包→开卷→validate', () => {
        const payload = JSON.parse(
            readFileSync(path.join(snapshotDir, '05-flowchart-1.json'), 'utf8'));
        const diagram = jsonToDiagram({ status: 'ok', ...payload });
        const parts = translatorTranslate(diagram);
        const { mkdtempSync, rmSync } = awaitImports();
        const dir = mkdtempSync(path.join(tmpdir(), 'mmd2vsdx-m5-'));
        try {
            const out = path.join(dir, '05.vsdx');
            OpcPackager.pack(parts, out);
            const pkg = OpcPackager.open(out);
            expect(pkg.partUris().length).toBe(parts.parts.length);
            expect(() => pkg.validate()).not.toThrow();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

function awaitImports(): { mkdtempSync: typeof mkdtempSync; rmSync: typeof rmSync } {
    return { mkdtempSync, rmSync };
}
