// mmd2vsdx - testir：core 数据层（IR 类型默认值/枚举/错误）
// C++ src/tests/testir.cpp 平移为 vitest（覆盖意图与断言逐条对照）。
import { describe, expect, it } from 'vitest';
import {
    defaultCluster,
    defaultDiagram,
    defaultEdge,
    defaultNode,
    boundsHeight,
    boundsWidth,
    kDiagramTypeOrder,
} from '../src/core/types.js';
import type { BoundingBox, Point } from '../src/core/types.js';
import { MmdError, MmdErrorCode, isMmdError } from '../src/core/errors.js';

// ═══════════════════════════════════════════════════════
// Node
// ═══════════════════════════════════════════════════════

describe('Node default values', () => {
    it('matches C++ Node default member initializers', () => {
        const n = defaultNode();
        expect(n.id).toBe('');
        expect(n.label).toBe('');
        expect(n.shape).toBe('rect');
        expect(n.x).toBe(0.0);
        expect(n.y).toBe(0.0);
        expect(n.width).toBe(0.0);
        expect(n.height).toBe(0.0);
        expect(n.styleClass).toBe('');
        expect(n.fillColor).toBe('');
        expect(n.parentId).toBe('');
        expect(n.lifelineKind).toBe('');
        expect(n.dividers).toEqual([]);
    });
});

describe('Node with data', () => {
    it('keeps assigned fields (C++ Node with data case)', () => {
        const n = {
            ...defaultNode(),
            id: 'A',
            label: 'Hello',
            shape: 'diamond' as const,
            x: 100.5,
            y: 200.5,
            width: 80.0,
            height: 60.0,
            styleClass: 'myClass',
            parentId: 'cluster0',
            dividers: [10.0, -10.0],
        };
        expect(n.id).toBe('A');
        expect(n.label).toBe('Hello');
        expect(n.shape).toBe('diamond');
        expect(n.x).toBe(100.5);
        expect(n.y).toBe(200.5);
        expect(n.width).toBe(80.0);
        expect(n.height).toBe(60.0);
        expect(n.styleClass).toBe('myClass');
        expect(n.parentId).toBe('cluster0');
        expect(n.dividers).toHaveLength(2);
        expect(n.dividers[1]).toBe(-10.0);
    });
});

// ═══════════════════════════════════════════════════════
// Edge
// ═══════════════════════════════════════════════════════

describe('Edge default values', () => {
    it('matches C++ Edge default member initializers', () => {
        const e = defaultEdge();
        expect(e.from).toBe('');
        expect(e.to).toBe('');
        expect(e.label).toBe('');
        expect(e.style).toBe('normal');
        expect(e.arrowHead).toBe('arrow');
        expect(e.arrowTail).toBe('none');
        expect(e.waypoints).toEqual([]);
        expect(e.fromMultiplicity).toBe('');
        expect(e.toMultiplicity).toBe('');
    });
});

describe('Edge with waypoints and multiplicity', () => {
    it('keeps assigned fields (C++ Edge case)', () => {
        const e = {
            ...defaultEdge(),
            from: 'A',
            to: 'B',
            label: 'yes',
            style: 'dotted' as const,
            arrowHead: 'circle' as const,
            waypoints: [
                { x: 10, y: 20 },
                { x: 30, y: 40 },
                { x: 50, y: 60 },
            ],
            fromMultiplicity: 'ZERO_OR_ONE',
            toMultiplicity: 'ONE_OR_MORE',
        };
        expect(e.from).toBe('A');
        expect(e.to).toBe('B');
        expect(e.label).toBe('yes');
        expect(e.style).toBe('dotted');
        expect(e.arrowHead).toBe('circle');
        expect(e.arrowTail).toBe('none');
        expect(e.waypoints).toHaveLength(3);
        // noUncheckedIndexedAccess 下长度断言后仍需显式非空
        expect(e.waypoints[0]!.x).toBe(10);
        expect(e.waypoints[1]!.y).toBe(40);
        expect(e.waypoints[2]!.x).toBe(50);
        expect(e.fromMultiplicity).toBe('ZERO_OR_ONE');
        expect(e.toMultiplicity).toBe('ONE_OR_MORE');
    });
});

// ═══════════════════════════════════════════════════════
// Cluster / Diagram
// ═══════════════════════════════════════════════════════

describe('Cluster default values', () => {
    it('matches C++ Cluster defaults', () => {
        const c = defaultCluster();
        expect(c.id).toBe('');
        expect(c.label).toBe('');
        expect(c.x).toBe(0.0);
        expect(c.y).toBe(0.0);
        expect(c.width).toBe(0.0);
        expect(c.height).toBe(0.0);
    });
});

describe('Diagram default values', () => {
    it('matches C++ Diagram defaults incl. bounds and empty specialized data', () => {
        const d = defaultDiagram();
        expect(d.nodes).toEqual([]);
        expect(d.edges).toEqual([]);
        expect(d.clusters).toEqual([]);
        expect(d.diagramType).toBe('');
        expect(d.direction).toBe('');
        expect(d.svg).toBe('');
        expect(boundsWidth(d.bounds)).toBe(0.0);
        expect(boundsHeight(d.bounds)).toBe(0.0);
        // 专用语义空态（C++ gantt.empty()/git.empty()/...）
        expect(d.gantt.tasks).toEqual([]);
        expect(d.git.commits).toEqual([]);
        expect(d.pie.slices).toEqual([]);
        expect(d.quadrant.points).toEqual([]);
        expect(d.sequence.activations).toEqual([]);
        expect(d.sequence.fragments).toEqual([]);
        // 默认子结构默认值（抽验）
        expect(d.gantt.dateFormat).toBe('YYYY-MM-DD');
        expect(d.git.branches).toEqual([]);
        expect(d.quadrant.crossX).toBe(0.0);
        expect(d.sequence.fragments).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════
// 枚举（DiagramType 顺序 = C++ 枚举数值序 0..10）
// ═══════════════════════════════════════════════════════

describe('DiagramType enum order', () => {
    it('keeps the C++ enum ordering (Auto=0 .. Mindmap=10)', () => {
        expect(kDiagramTypeOrder).toEqual([
            'auto', //  0 = C++ DiagramType::Auto
            'basic', // 1 = Basic
            'flowchart', // 2 = Flowchart
            'class', //   3 = Class
            'sequence', // 4 = Sequence
            'er', //      5 = ER
            'gantt', //   6 = Gantt
            'timeline', // 7 = Timeline
            'calendar', // 8 = Calendar
            'git', //     9 = Git
            'mindmap', // 10 = Mindmap
        ]);
    });
});

// ═══════════════════════════════════════════════════════
// Error（统一异常）
// ═══════════════════════════════════════════════════════

describe('MmdError', () => {
    it('carries code (C++ Error case)', () => {
        const e = new MmdError(MmdErrorCode.JsonParseError, 'bad json');
        expect(e.code).toBe(MmdErrorCode.JsonParseError);
        expect(e.message).toBe('bad json');
    });

    it('derives from Error (C++ Error derives from std::runtime_error)', () => {
        const e = new MmdError(MmdErrorCode.SubprocessCrashed, 'crash');
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe('MmdError');
        expect(isMmdError(e)).toBe(true);
        expect(isMmdError(new Error('plain'))).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════
// Point / BoundingBox
// ═══════════════════════════════════════════════════════

describe('Point and BoundingBox', () => {
    it('holds geometry values (C++ test case)', () => {
        const p: Point = { x: 3, y: 4 };
        expect(p.x).toBe(3);
        expect(p.y).toBe(4);

        const b: BoundingBox = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
        expect(boundsWidth(b)).toBe(100);
        expect(boundsHeight(b)).toBe(50);
    });
});
