// mmd2vsdx - testassets：母版资产运行时供应（stencilAssets）
// 覆盖：资产文件加载/格式非法、未就绪引导错误、模具目录现场提取（8 类收齐）、
// 指纹判定、masterLibrary 读取闭环（stylesXmlFor）。注意：本文件不 import
// tests/helpers.ts（helpers 会抢先 ensure，破坏"未就绪"用例）。
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    ensureStencilAssets,
    resetStencilAssetsForTests,
    stencilDataRecord,
    probeStencilKind,
    extractStencilFile,
} from '../src/vsdxdoc/masters/stencilAssets.js';
import { stylesXmlFor } from '../src/vsdxdoc/masters/masterLibrary.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetFile = path.join(repoRoot, 'assets', 'stencils', 'stencil-data.json');
const visioDir = path.join(repoRoot, 'resources', 'visio');

describe('stencilAssets 资产文件加载', () => {
    it('加载仓库资产：8 个内部 stencil 键齐备', async () => {
        resetStencilAssetsForTests();
        const source = await ensureStencilAssets({ assetFile });
        expect(source).toBe('asset:' + assetFile);
        const record = stencilDataRecord();
        for (const key of ['basic_shape', 'flowchart', 'uml_class', 'uml_sequence',
            'er_database', 'gantt', 'timeline', 'calendar']) {
            expect(record[key]).toBeDefined();
            expect(record[key]!.length).toBeGreaterThan(1000); // gzip(base64) 非空
        }
    });

    it('缺失文件 / 非法 JSON → [assets] 引导错误', async () => {
        resetStencilAssetsForTests();
        await expect(ensureStencilAssets({ assetFile: 'no-such-file.json' }))
            .rejects.toThrow(/\[assets\]/);
        const bad = path.join(tmpdir(), 'bad-assets-' + Date.now() + '.json');
        writeFileSync(bad, '{oops');
        try {
            await expect(ensureStencilAssets({ assetFile: bad }))
                .rejects.toThrow(/\[assets\].*格式非法/);
        } finally {
            resetStencilAssetsForTests();
        }
    });

    it('未就绪时 masterLibrary 读取抛 [assets] 引导（闭环）', () => {
        resetStencilAssetsForTests();
        expect(() => stylesXmlFor('flowchart')).toThrow(/\[assets\].*未就绪/);
        resetStencilAssetsForTests();
    });
});

describe('stencilAssets 模具目录现场提取', () => {
    it('指纹判定：已知母版名集合 → 内部名', () => {
        expect(probeStencilKind(['Rectangle', 'Circle', 'Diamond'])).toBe('basic_shape');
        expect(probeStencilKind(['Process', 'Decision', 'Subprocess', 'Dynamic connector']))
            .toBe('flowchart');
        expect(probeStencilKind(['Rectangle'])).toBeNull();
    });

    it('单文件提取（resources/visio 开发模具）', () => {
        const f = path.join(visioDir, 'flowchart.vssx');
        const { kind, encoded } = extractStencilFile(f);
        expect(kind).toBe('flowchart');
        expect(encoded.length).toBeGreaterThan(1000);
    });

    it('目录全量提取：收齐 8 类并可供 masterLibrary 使用', async () => {
        resetStencilAssetsForTests();
        const source = await ensureStencilAssets({ stencilDir: visioDir, search: false });
        expect(source).toBe('dir:' + visioDir);
        const keys = Object.keys(stencilDataRecord()).sort();
        expect(keys.join(',')).toBe([
            'basic_shape', 'calendar', 'er_database', 'flowchart', 'gantt',
            'timeline', 'uml_class', 'uml_sequence',
        ].sort().join(','));
        // 读取闭环：stylesXmlFor 经 record 解压可用
        expect(stylesXmlFor('flowchart')).toContain('<VisioStyles>');
        // 恢复资产文件形态（供后续同进程用例）
        await ensureStencilAssets({ assetFile });
        resetStencilAssetsForTests();
        await ensureStencilAssets({ assetFile });
    });

    it('空目录 → 引导错误', async () => {
        resetStencilAssetsForTests();
        const empty = mkdtempSync(path.join(tmpdir(), 'empty-stencils-'));
        try {
            await expect(ensureStencilAssets({ stencilDir: empty, search: false }))
                .rejects.toThrow(/\[assets\]/);
        } finally {
            resetStencilAssetsForTests();
        }
    });
});

describe('stencilAssets 私自分发形态（asset 文件拷贝即用）', () => {
    it('把资产文件复制到另一目录后仍可加载（私下分发语义）', async () => {
        resetStencilAssetsForTests();
        const dir = mkdtempSync(path.join(tmpdir(), 'priv-assets-'));
        const copy = path.join(dir, 'my-stencil-data.json');
        cpSync(assetFile, copy);
        try {
            const source = await ensureStencilAssets({ assetFile: copy });
            expect(source).toBe('asset:' + copy);
            expect(Object.keys(stencilDataRecord())).toHaveLength(8);
        } finally {
            resetStencilAssetsForTests();
        }
    });
});
