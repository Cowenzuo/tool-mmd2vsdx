// mmd2vsdx - testtranslate：vsdxdoc 翻译（Diagram → DocumentCore / XmlParts）
// C++ src/tests/testtranslate.cpp 平移（母版双路径：useConnectorMaster=false 走
// 本地内容路径等价 C++ 无母版模式；真实母版打包/形状 Master 引用在本文件
// useConnectorMaster=true 用例 + golden 16 样本结构等价闸门分别验证）。
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { translate as importerTranslate } from '../src/vsdxdoc/translate/diagramImporter.js';
import { translate as translatorTranslate } from '../src/vsdxdoc/vsdxTranslator.js';
import { defaultDiagram, defaultNode, defaultEdge } from '../src/core/types.js';
import type { Diagram } from '../src/core/types.js';
import { jsonToDiagram } from '../src/mmdtransform/jsonToDiagram.js';
import { OpcPackager } from '../src/opcpkg/opcpackager.js';
import { snapshotDir } from './helpers.js';

const noMasters = { useConnectorMaster: false } as const;

function makeFlowchartDiagram(): Diagram {
    const d = defaultDiagram();
    d.diagramType = 'flowchart';
    d.direction = 'TB';
    d.bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
    d.nodes.push({
        ...defaultNode(),
        id: 'A', label: 'Start', shape: 'rect', x: 50, y: 20, width: 40, height: 20,
    });
    d.nodes.push({
        ...defaultNode(),
        id: 'B', label: 'End', shape: 'diamond', x: 50, y: 80, width: 40, height: 20,
    });
    d.edges.push({
        ...defaultEdge(),
        from: 'A', to: 'B', label: 'go', style: 'normal', arrowHead: 'arrow',
        waypoints: [{ x: 50, y: 30 }, { x: 50, y: 70 }],
    });
    return d;
}

function findPart(parts: Array<{ uri: string; xml: string }>, uri: string) {
    return parts.find((p) => p.uri === uri) ?? null;
}

// ═══════════════════════════════════════════════════════
// DiagramImporter::translate -> DocumentCore
// ═══════════════════════════════════════════════════════

describe('translate builds one page with shapes and connectors', () => {
    it('一页两形状一连接线，页面尺寸为正', () => {
        const core = importerTranslate(makeFlowchartDiagram(), noMasters);
        expect(core.pages).toHaveLength(1);
        const page = core.pages[0]!;
        expect(page.shapes.size).toBe(2);
        expect(page.connectors.size).toBe(1);
        expect(page.width).toBeGreaterThan(0);
        expect(page.height).toBeGreaterThan(0);
    });
});

describe('shape data preserved through translate', () => {
    it('按插入序 id=1,2 且字段保留', () => {
        const core = importerTranslate(makeFlowchartDiagram(), noMasters);
        const page = core.pages[0]!;
        const s1 = page.shapes.get(1);
        expect(s1).toBeDefined();
        expect(s1!.logicalId).toBe('A');
        expect(s1!.text).toBe('Start');
        expect(s1!.kind).toBe('rect');
        const s2 = page.shapes.get(2);
        expect(s2).toBeDefined();
        expect(s2!.logicalId).toBe('B');
        expect(s2!.kind).toBe('diamond');
    });
});

describe('connector links source and target shape ids', () => {
    it('连接线绑定 1→2', () => {
        const core = importerTranslate(makeFlowchartDiagram(), noMasters);
        const page = core.pages[0]!;
        expect(page.connectors.size).toBe(1);
        const c = page.connectors.values().next().value as { source: number; target: number; text: string; arrowHead: string };
        expect(c.source).toBe(1);
        expect(c.target).toBe(2);
        expect(c.text).toBe('go');
        expect(c.arrowHead).toBe('arrow');
    });
});

describe('outputScale flips y and scales coordinates', () => {
    it('scale=1、左边距下边距 1 → point=(101,51)', () => {
        const d = defaultDiagram();
        d.diagramType = 'flowchart';
        d.bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
        d.nodes.push({
            ...defaultNode(),
            id: 'N', label: 'N', shape: 'rect', x: 100, y: 50, width: 40, height: 20,
        });
        const core = importerTranslate(d, {
            useConnectorMaster: false, outputScale: 96.0, marginLeft: 1, marginBottom: 1,
        });
        const page = core.pages[0]!;
        const s = page.shapes.values().next().value as { x: number; y: number };
        expect(s.x).toBeCloseTo(101.0, 6);
        expect(s.y).toBeCloseTo(51.0, 6);
    });
});

describe('invalid outputScale throws', () => {
    it('0 与 -1 抛 TypeError', () => {
        const d = makeFlowchartDiagram();
        expect(() => importerTranslate(d, { ...noMasters, outputScale: 0 })).toThrow(TypeError);
        expect(() => importerTranslate(d, { ...noMasters, outputScale: -1 })).toThrow(TypeError);
    });
});

// ═══════════════════════════════════════════════════════
// VsdxTranslator::translate -> XmlParts（模块门面，无母版模式）
// ═══════════════════════════════════════════════════════

describe('VsdxTranslator produces expected XmlParts', () => {
    it('核心部件齐全（无母版模式不含 masters.xml）', () => {
        const parts = translatorTranslate(makeFlowchartDiagram(), noMasters);
        expect(parts.parts.length).toBeGreaterThan(0);
        expect(findPart(parts.parts, 'visio/document.xml')).not.toBeNull();
        expect(findPart(parts.parts, 'visio/pages/pages.xml')).not.toBeNull();
        expect(findPart(parts.parts, 'visio/pages/page1.xml')).not.toBeNull();
        expect(findPart(parts.parts, 'visio/masters/masters.xml')).toBeNull(); // M5
        expect(findPart(parts.parts, 'docProps/core.xml')).not.toBeNull();
        expect(findPart(parts.parts, 'docProps/app.xml')).not.toBeNull();
        expect(findPart(parts.parts, 'docProps/custom.xml')).not.toBeNull();
        expect(findPart(parts.parts, 'visio/windows.xml')).not.toBeNull();
        const doc = findPart(parts.parts, 'visio/document.xml')!;
        expect(doc.xml.includes('VisioDocument')).toBe(true);
        expect(doc.xml.includes('StyleSheets')).toBe(true);
    });
});

describe('VsdxTranslator empty diagram still produces valid parts', () => {
    it('空节点图仍产出部件', () => {
        const d = defaultDiagram();
        d.diagramType = 'flowchart';
        const parts = translatorTranslate(d, noMasters);
        expect(findPart(parts.parts, 'visio/document.xml')).not.toBeNull();
        expect(findPart(parts.parts, 'visio/pages/page1.xml')).not.toBeNull();
    });
});

describe('class diagram with dividers translates', () => {
    it('类图页面含 Person 文本', () => {
        const d = defaultDiagram();
        d.diagramType = 'class';
        d.bounds = { minX: 0, minY: 0, maxX: 300, maxY: 150 };
        for (const [id, label, y] of [['C1', 'Person', 50], ['C2', 'Student', 150]] as const) {
            d.nodes.push({
                ...defaultNode(),
                id, label, shape: 'rect', x: 100, y, width: 120, height: 80,
                dividers: [10.0, -10.0],
            });
        }
        d.edges.push({
            ...defaultEdge(),
            from: 'C2', to: 'C1', label: '', arrowHead: 'openarrow',
        });
        const parts = translatorTranslate(d, noMasters);
        const page = findPart(parts.parts, 'visio/pages/page1.xml')!;
        expect(page.xml.includes('Person')).toBe(true);
    });
});

describe('真实母版模式（M5）：useConnectorMaster=true 打包母版', () => {
    it('flowchart 打包 masters.xml + masterN + 页面形状带 Master 属性', () => {
        const parts = translatorTranslate(makeFlowchartDiagram(), { useConnectorMaster: true });
        const masters = findPart(parts.parts, 'visio/masters/masters.xml');
        expect(masters, 'masters.xml 存在').not.toBeNull();
        expect(masters!.xml.includes('<Master ')).toBe(true);
        const masterFiles = parts.parts.filter((p) =>
            p.uri.startsWith('visio/masters/master') && p.uri.endsWith('.xml'));
        expect(masterFiles.length).toBeGreaterThanOrEqual(2);
        const page1 = findPart(parts.parts, 'visio/pages/page1.xml')!;
        expect(page1.xml).toContain('Master='); // 形状带母版实例引用
        // 文档关系含 masters
        const docRels = findPart(parts.parts, 'visio/_rels/document.xml.rels')!;
        expect(docRels.xml).toContain('masters/masters.xml');
    });
});

// ═══════════════════════════════════════════════════════
// M2 闭环：fixture JSON → Diagram → XmlParts → 可开卷 .vsdx
// ═══════════════════════════════════════════════════════

const kGenericFixtures = [
    '01-block-1', '02-c4-1', '03-class-1', '04-er-1',
    '05-flowchart-1', '06-flowchart-2', '07-gantt-1', '08-git-1', '11-mindmap-1',
    '12-pie-1', '13-quadrant-1', '15-sequence-1', '15-sequence-2',
    '16-state-1', '17-timeline-1', '18-xy-1',
];

describe('M2 闭环：16 份 fixture → 可开卷 .vsdx', () => {
    for (const name of kGenericFixtures) {
        it(`${name} 转换/打包/开卷全通过`, () => {
            const dir = mkdtempSync(path.join(tmpdir(), 'mmd2vsdx-m2-'));
            try {
                const payload = JSON.parse(
                    readFileSync(path.join(snapshotDir, name + '.json'), 'utf8'));
                const diagram = jsonToDiagram({ status: 'ok', ...payload });
                const parts = translatorTranslate(diagram, noMasters);
                expect(findPart(parts.parts, 'visio/pages/page1.xml'), 'page1 存在').not.toBeNull();
                const out = path.join(dir, name + '.vsdx');
                OpcPackager.pack(parts, out);
                const pkg = OpcPackager.open(out);
                const uris = pkg.partUris().map((u) => u.string());
                for (const m of ['visio/document.xml', 'visio/pages/pages.xml',
                    'visio/pages/page1.xml', 'docProps/custom.xml']) {
                    expect(uris, m).toContain(m);
                }
                expect(() => pkg.validate()).not.toThrow();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        });
    }
});
