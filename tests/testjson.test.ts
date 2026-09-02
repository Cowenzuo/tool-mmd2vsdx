// mmd2vsdx - testjson：jsonToDiagram（snapshot JSON → Diagram）
// C++ src/tests/testjson.cpp 逐条平移（300 行用例蓝本）。
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { jsonToDiagram } from '../src/mmdtransform/jsonToDiagram.js';
import { MmdError, MmdErrorCode } from '../src/core/errors.js';
import { boundsHeight, boundsWidth, gitGraphIsEmpty } from '../src/core/types.js';
import { snapshotDir } from './helpers.js';

// ═══════════════════════════════════════════════════════
// Error status
// ═══════════════════════════════════════════════════════

describe('Error status JSON throws', () => {
    it('status=error → MmdError(MermaidError) 且消息保留', () => {
        const j = { status: 'error', message: 'syntax error at line 1' };
        expect(() => jsonToDiagram(j)).toThrow(MmdError);
        try {
            jsonToDiagram(j);
        } catch (e) {
            expect(e).toBeInstanceOf(MmdError);
            expect((e as MmdError).code).toBe(MmdErrorCode.MermaidError);
            expect((e as MmdError).message).toBe('syntax error at line 1');
        }
    });
});

describe('Missing status field throws', () => {
    it('无 status → 抛', () => {
        expect(() => jsonToDiagram({ nodes: [] })).toThrow(MmdError);
    });
});

// ═══════════════════════════════════════════════════════
// Empty diagram
// ═══════════════════════════════════════════════════════

describe('Empty diagram', () => {
    it('空节点/边 + direction 缺省 TB', () => {
        const d = jsonToDiagram({ status: 'ok', nodes: [], edges: [] });
        expect(d.nodes).toEqual([]);
        expect(d.edges).toEqual([]);
        expect(d.diagramType).toBe('');
        expect(d.direction).toBe('TB');
    });
});

// ═══════════════════════════════════════════════════════
// Single node
// ═══════════════════════════════════════════════════════

describe('Single node all fields', () => {
    it('全字段映射', () => {
        const d = jsonToDiagram({
            status: 'ok',
            diagramType: 'flowchart',
            direction: 'LR',
            nodes: [{
                id: 'A', label: 'Start', shape: 'diamond',
                x: 100.5, y: 200.5, width: 80.0, height: 60.0,
                styleClass: 'myClass', parentId: '',
                lifelineKind: 'actor',
            }],
            edges: [],
        });
        expect(d.diagramType).toBe('flowchart');
        expect(d.direction).toBe('LR');
        expect(d.nodes).toHaveLength(1);
        const n = d.nodes[0]!;
        expect(n.id).toBe('A');
        expect(n.label).toBe('Start');
        expect(n.shape).toBe('diamond');
        expect(n.x).toBe(100.5);
        expect(n.y).toBe(200.5);
        expect(n.width).toBe(80.0);
        expect(n.height).toBe(60.0);
        expect(n.styleClass).toBe('myClass');
        expect(n.parentId).toBe('');
        expect(n.lifelineKind).toBe('actor');
    });
});

describe('Node with missing optional fields uses defaults', () => {
    it('缺省兜底', () => {
        const d = jsonToDiagram({ status: 'ok', nodes: [{ id: 'A' }], edges: [] });
        expect(d.nodes).toHaveLength(1);
        const n = d.nodes[0]!;
        expect(n.id).toBe('A');
        expect(n.label).toBe('');
        expect(n.shape).toBe('rect');
        expect(n.x).toBe(0.0);
        expect(n.styleClass).toBe('');
        expect(n.parentId).toBe('');
        expect(n.lifelineKind).toBe('');
    });
});

// ═══════════════════════════════════════════════════════
// Edge
// ═══════════════════════════════════════════════════════

describe('Edge with all fields', () => {
    it('全字段映射', () => {
        const d = jsonToDiagram({
            status: 'ok',
            nodes: [],
            edges: [{
                from: 'A', to: 'B', label: 'yes',
                style: 'dotted',
                arrowHead: 'circle', arrowTail: 'none',
                waypoints: [{ x: 10.0, y: 20.0 }, { x: 30.0, y: 40.0 }],
            }],
        });
        expect(d.edges).toHaveLength(1);
        const e = d.edges[0]!;
        expect(e.from).toBe('A');
        expect(e.to).toBe('B');
        expect(e.label).toBe('yes');
        expect(e.style).toBe('dotted');
        expect(e.arrowHead).toBe('circle');
        expect(e.arrowTail).toBe('none');
        expect(e.waypoints).toHaveLength(2);
        expect(e.waypoints[0]!.x).toBe(10.0);
        expect(e.waypoints[1]!.y).toBe(40.0);
    });
});

describe('Edge with missing optional fields uses defaults', () => {
    it('缺省兜底', () => {
        const d = jsonToDiagram({ status: 'ok', nodes: [], edges: [{ from: 'A', to: 'B' }] });
        expect(d.edges).toHaveLength(1);
        const e = d.edges[0]!;
        expect(e.label).toBe('');
        expect(e.style).toBe('normal');
        expect(e.arrowHead).toBe('arrow');
        expect(e.arrowTail).toBe('none');
        expect(e.waypoints).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════
// Bounding box
// ═══════════════════════════════════════════════════════

describe('Bounding box from JSON', () => {
    it('bounds 映射与宽高', () => {
        const d = jsonToDiagram({
            status: 'ok', nodes: [], edges: [],
            boundingBox: { minX: 10.0, minY: 20.0, maxX: 110.0, maxY: 70.0 },
        });
        expect(d.bounds.minX).toBe(10.0);
        expect(d.bounds.maxY).toBe(70.0);
        expect(boundsWidth(d.bounds)).toBe(100.0);
        expect(boundsHeight(d.bounds)).toBe(50.0);
    });
});

// ═══════════════════════════════════════════════════════
// All enums
// ═══════════════════════════════════════════════════════

describe('NodeShape values', () => {
    it('5 种形状全映射', () => {
        const cases: Array<[string, string]> = [
            ['rect', 'rect'],
            ['roundRect', 'roundRect'],
            ['diamond', 'diamond'],
            ['circle', 'circle'],
            ['ellipse', 'ellipse'],
        ];
        for (const [input, expected] of cases) {
            const d = jsonToDiagram({ status: 'ok', nodes: [{ id: 'X', shape: input }], edges: [] });
            expect(d.nodes[0]!.shape, input).toBe(expected);
        }
    });
    it('未知 shape 回退 Rect', () => {
        const d = jsonToDiagram({ status: 'ok', nodes: [{ id: 'X', shape: 'hexagon' }], edges: [] });
        expect(d.nodes[0]!.shape).toBe('rect');
    });
});

describe('EdgeStyle values', () => {
    it('3 种线型全映射', () => {
        for (const input of ['normal', 'dotted', 'thick']) {
            const d = jsonToDiagram({
                status: 'ok', nodes: [],
                edges: [{ from: 'A', to: 'B', style: input }],
            });
            expect(d.edges[0]!.style, input).toBe(input);
        }
    });
});

describe('ArrowType values', () => {
    it('head 映射（含 openarrow）', () => {
        for (const input of ['none', 'arrow', 'circle', 'openarrow']) {
            const d = jsonToDiagram({
                status: 'ok', nodes: [],
                edges: [{ from: 'A', to: 'B', arrowHead: input }],
            });
            expect(d.edges[0]!.arrowHead, input).toBe(input);
        }
    });
    it('tail 映射', () => {
        for (const input of ['none', 'arrow', 'circle']) {
            const d = jsonToDiagram({
                status: 'ok', nodes: [],
                edges: [{ from: 'A', to: 'B', arrowTail: input }],
            });
            expect(d.edges[0]!.arrowTail, input).toBe(input);
        }
    });
});

// ═══════════════════════════════════════════════════════
// Multi-node + multi-edge
// ═══════════════════════════════════════════════════════

describe('Multi-node multi-edge real-world JSON', () => {
    it('真实形态 JSON 解析', () => {
        const d = jsonToDiagram({
            status: 'ok',
            diagramType: 'flowchart',
            direction: 'TB',
            nodes: [
                { id: 'A', label: 'Start', shape: 'rect', x: 95.5, y: 36, width: 47, height: 36, styleClass: 'flowchart-label', parentId: '' },
                { id: 'B', label: 'End', shape: 'rect', x: 144, y: 36, width: 47, height: 36, styleClass: 'flowchart-label', parentId: '' },
            ],
            edges: [{
                from: 'A', to: 'B', label: '', style: 'normal',
                arrowHead: 'arrow', arrowTail: 'none',
                waypoints: [{ x: 72, y: 36 }, { x: 120, y: 36 }],
            }],
            boundingBox: { minX: 72, minY: 18, maxX: 167.5, maxY: 54 },
        });
        expect(d.nodes).toHaveLength(2);
        expect(d.edges).toHaveLength(1);
        expect(d.nodes[0]!.x).toBe(95.5);
        expect(d.nodes[1]!.id).toBe('B');
        expect(d.edges[0]!.waypoints).toHaveLength(2);
        expect(d.bounds.minX).toBe(72.0);
        expect(d.bounds.maxY).toBe(54.0);
    });
});

// ═══════════════════════════════════════════════════════
// git / gantt / pie / quadrant / sequence 专用子结构
// ═══════════════════════════════════════════════════════

describe('gitGraph JSON parses commits/branches/arrows', () => {
    it('git 子结构全解析', () => {
        const d = jsonToDiagram({
            status: 'ok',
            diagramType: 'gitGraph',
            git: {
                commits: [
                    { id: 'init', label: 'init', branchIndex: 0, x: 10, y: 0, r: 10, merge: false },
                    { id: 'm1', label: '', branchIndex: 0, x: 160, y: 0, r: 9, merge: true },
                ],
                branches: [{ name: 'main', index: 0, y: 0, x1: 0, x2: 250, color: '#0000ec' }],
                arrows: [{
                    from: 'init', to: 'm1', kind: 'seq', branchIndex: 0,
                    waypoints: [{ x: 10, y: 0 }, { x: 160, y: 0 }],
                }],
            },
        });
        expect(d.git.commits).toHaveLength(2);
        expect(d.git.branches).toHaveLength(1);
        expect(d.git.arrows).toHaveLength(1);
        expect(d.git.commits[0]!.id).toBe('init');
        expect(d.git.commits[0]!.branchIndex).toBe(0);
        expect(d.git.commits[1]!.merge).toBe(true);
        expect(d.git.commits[1]!.r).toBe(9.0);
        expect(d.git.branches[0]!.name).toBe('main');
        expect(d.git.branches[0]!.color).toBe('#0000ec');
        expect(d.git.arrows[0]!.from).toBe('init');
        expect(d.git.arrows[0]!.to).toBe('m1');
        expect(d.git.arrows[0]!.kind).toBe('seq');
        expect(d.git.arrows[0]!.waypoints).toHaveLength(2);
        expect(gitGraphIsEmpty(d.git)).toBe(false);
    });
});

describe('gitGraph empty when git missing', () => {
    it('缺 git 段 → 空 git', () => {
        const d = jsonToDiagram({ status: 'ok', diagramType: 'flowchart' });
        expect(gitGraphIsEmpty(d.git)).toBe(true);
    });
});

describe('gantt JSON（含 isAfter 丢弃）', () => {
    it('任务解析且 isAfter 不入 IR', () => {
        const d = jsonToDiagram({
            status: 'ok',
            diagramType: 'gantt',
            gantt: {
                title: '计划', dateFormat: 'YYYY-MM-DD',
                startSerial: 46240, endSerial: 46254,
                sections: ['阶段一'],
                tasks: [{
                    name: '任务1', section: '阶段一', startSerial: 46240,
                    duration: 1, milestone: false, isAfter: false, dependsOn: [],
                }],
            },
        });
        expect(d.gantt.title).toBe('计划');
        expect(d.gantt.tasks).toHaveLength(1);
        const t = d.gantt.tasks[0]!;
        expect(t.name).toBe('任务1');
        expect(t.duration).toBe(1);
        expect(t.milestone).toBe(false);
        expect(t.dependsOn).toEqual([]);
        expect('isAfter' in t).toBe(false);
    });
});

describe('fixtures：16 份真实 snapshot JSON 全量解析不抛错', () => {
    it('全部 fixture 过 jsonToDiagram 且 type 一致', () => {
        const files = readdirSync(snapshotDir).filter((f) => f.endsWith('.json')).sort();
        expect(files).toHaveLength(16);
        for (const f of files) {
            const payload = JSON.parse(readFileSync(path.join(snapshotDir, f), 'utf8'));
            // fixtures 不含 HTTP 信封 status（make-fixtures 已剥）；调用形态同 Translator
            const j = { status: 'ok', ...payload };
            const d = jsonToDiagram(j);
            expect(d.svg, `${f} svg 原样`).toBe(payload.svg); // gantt 等渲染失败降级时 svg 可为空
            expect(d.diagramType).toBe(j.diagramType);
            expect(Number.isFinite(d.bounds.minX), `${f} bounds`).toBe(true);
        }
    });
});
