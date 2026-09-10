// parser 归一化：快照 JSON → 契约 A（docs/redesign/03-解析层/01-parser）
//
// 快照契约：{nodes, edges, clusters, diagramType, direction, boundingBox}。
// 本文件为纯函数，零浏览器依赖，可单测。

import {
    defaultBoundingBox,
    defaultContractA,
    defaultGenericEdge,
    defaultGenericShape,
    fillDefaults,
    type ContractA,
    type DiagramKind,
    type MessageKind,
} from '../../contracts/index.js';

export interface SnapshotLike {
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
    clusters?: Array<Record<string, unknown>>;
    diagramType?: string;
    direction?: string;
    boundingBox?: { minX?: number; minY?: number; maxX?: number; maxY?: number };
    /** DB 提取的图型语义块（pie/quadrant/git/sequence 等）。 */
    pie?: Record<string, unknown>;
    quadrant?: Record<string, unknown>;
    git?: Record<string, unknown>;
    sequence?: Record<string, unknown>;
    mindmap?: Record<string, unknown>;
    classModel?: Record<string, unknown>;
    erModel?: Record<string, unknown>;
    gantt?: Record<string, unknown>;
}

/** kind 映射：快照 diagramType → 契约 A kind；未知兜底 flowchart。 */
export function mapKind(diagramType: string | undefined): DiagramKind {
    const t = (diagramType ?? '').toLowerCase();
    const table: Record<string, DiagramKind> = {
        flowchart: 'flowchart',
        flowchart2: 'flowchart',
        state: 'state',
        statediagram: 'state',
        c4: 'c4',
        block: 'block',
        class: 'class',
        classdiagram: 'class',
        er: 'er',
        sequence: 'sequence',
        sequencediagram: 'sequence',
        gantt: 'gantt',
        git: 'git',
        gitgraph: 'git',
        pie: 'pie',
        quadrant: 'quadrant',
        quadrantchart: 'quadrant',
        mindmap: 'mindmap',
        timeline: 'timeline',
        xy: 'xy',
    };
    return table[t] ?? 'flowchart';
}

/** 快照差集：节点 id 取不到时用顺序编号兜底。 */
export function normalizeGeneric(snap: SnapshotLike, sourceText = ''): ContractA {
    const a = fillDefaults(defaultContractA());
    a.kind = mapKind(snap.diagramType);
    a.meta.sourceText = sourceText;
    a.meta.direction = snap.direction ?? 'TB';
    const bb = snap.boundingBox;
    if (bb) {
        a.meta.bounds = {
            minX: bb.minX ?? 0,
            minY: bb.minY ?? 0,
            maxX: bb.maxX ?? 0,
            maxY: bb.maxY ?? 0,
        };
    } else {
        a.meta.bounds = defaultBoundingBox();
    }
    for (const n of snap.nodes ?? []) {
        const s = defaultGenericShape();
        s.id = String(n['id'] ?? `n${a.shapes.length}`);
        s.label = String(n['label'] ?? '');
        s.shapeKind = (['rect', 'roundRect', 'diamond', 'circle', 'ellipse'] as const).includes(
            n['shape'] as never,
        )
            ? (n['shape'] as typeof s.shapeKind)
            : 'rect';
        s.x = num(n['x']);
        s.y = num(n['y']);
        s.width = num(n['width']);
        s.height = num(n['height']);
        s.styleClass = String(n['styleClass'] ?? '');
        s.fillColor = String(n['fillColor'] ?? '');
        s.parentId = String(n['parentId'] ?? '');
        s.lifelineKind = String(n['lifelineKind'] ?? '');
        s.dividers = Array.isArray(n['dividers'])
            ? (n['dividers'] as Array<unknown>).map((v) => num(v as number))
            : [];
        a.shapes.push(s);
    }
    for (const e of snap.edges ?? []) {
        const edge = defaultGenericEdge();
        edge.from = String(e['from'] ?? '');
        edge.to = String(e['to'] ?? '');
        edge.label = String(e['label'] ?? '');
        edge.style = (['normal', 'dotted', 'thick'] as const).includes(e['style'] as never)
            ? (e['style'] as typeof edge.style)
            : 'normal';
        edge.arrowHead = (['none', 'arrow', 'circle', 'openarrow'] as const).includes(
            e['arrowHead'] as never,
        )
            ? (e['arrowHead'] as typeof edge.arrowHead)
            : 'arrow';
        edge.arrowTail = 'none';
        edge.waypoints = Array.isArray(e['waypoints'])
            ? (e['waypoints'] as Array<{ x?: number; y?: number }>).map((p) => ({
                  x: num(p?.x),
                  y: num(p?.y),
              }))
            : [];
        edge.fromMultiplicity = String(e['fromMultiplicity'] ?? '');
        edge.toMultiplicity = String(e['toMultiplicity'] ?? '');
        a.edges.push(edge);
    }
    for (const c of snap.clusters ?? []) {
        const b = { x: 0, y: 0, width: 0, height: 0 };
        b.x = num(c['x']);
        b.y = num(c['y']);
        b.width = num(c['width']);
        b.height = num(c['height']);
        a.clusters.push({ id: String(c['id'] ?? ''), label: String(c['label'] ?? ''), ...b });
    }
    // DB/语义提取块：pie / quadrant
    const pie = snap['pie'] as
        | { title?: string; cx?: number; cy?: number; r?: number; slices?: Array<{ label?: string; value?: number; color?: string }> }
        | undefined;
    if (pie) {
        a.kind = 'pie';
        a.pie = {
            title: String(pie.title ?? ''),
            cx: num(pie.cx),
            cy: num(pie.cy),
            r: num(pie.r) || 185,
            slices: (pie.slices ?? []).map((s) => ({
                label: String(s.label ?? ''),
                value: num(s.value),
                color: String(s.color ?? ''),
            })),
        };
    }
    const quadrant = snap['quadrant'] as
        | { title?: string; points?: Array<{ label?: string; x?: number; y?: number }>; axisTexts?: string[] }
        | undefined;
    if (quadrant && quadrant.points && quadrant.points.length > 0) {
        a.kind = 'quadrant';
        const axis = quadrant.axisTexts ?? [];
        a.quadrant = {
            title: String(quadrant.title ?? ''),
            xLabelLow: axis[0] ?? '',
            xLabelHigh: axis[1] ?? '',
            yLabelLow: axis[2] ?? '',
            yLabelHigh: axis[3] ?? '',
            minX: 0,
            minY: 0,
            maxX: 400,
            maxY: 400,
            crossX: 200,
            crossY: 200,
            points: (quadrant.points ?? []).map((p) => ({
                label: String(p.label ?? ''),
                cx: num(p.x),
                cy: num(p.y),
            })),
        };
    }
    const git = snap['git'] as
        | {
              branches?: string[];
              commits?: Array<{
                  id?: string;
                  label?: string;
                  tag?: string;
                  branchIndex?: number;
                  x?: number;
                  y?: number;
                  r?: number;
                  merge?: boolean;
                  highlight?: boolean;
                  reverse?: boolean;
                  parents?: string[];
              }>;
          }
        | undefined;
    if (git && git.commits && git.commits.length > 0) {
        a.kind = 'git';
        const commits = git.commits.map((c) => ({
            id: String(c.id ?? ''),
            label: String(c.label ?? ''),
            tag: String(c.tag ?? ''),
            branchIndex: num(c.branchIndex),
            x: num(c.x),
            y: num(c.y),
            r: num(c.r) || 12,
            merge: !!c.merge,
            highlight: !!c.highlight,
            reverse: !!c.reverse,
        }));
        a.git = {
            commits,
            branches: (git.branches ?? []).map((name, index) => ({
                name: String(name),
                index,
                y: 0,
                x1: 0,
                x2: 0,
                color: '#000000',
            })),
            arrows: [],
        };
        const arrows: Array<{ from: string; to: string; kind: string; branchIndex: number; waypoints: Array<{ x: number; y: number }> }> = [];
        for (const c of git.commits) {
            for (const p of c.parents ?? []) {
                arrows.push({
                    from: String(p),
                    to: String(c.id ?? ''),
                    kind: 'seq',
                    branchIndex: num(c.branchIndex),
                    waypoints: [],
                });
            }
        }
        a.git.arrows = arrows;
    }
    const sequence = snap['sequence'] as
        | {
              actors?: Array<{ id?: string; label?: string; kind?: string; x?: number }>;
              messages?: Array<{
                  from?: string;
                  to?: string;
                  label?: string;
                  kind?: string;
                  activate?: boolean;
              }>;
              activations?: Array<{
                  actorId?: string;
                  x?: number;
                  yTop?: number;
                  yBottom?: number;
                  width?: number;
              }>;
              fragments?: Array<{
                  kind?: string;
                  label?: string;
                  x?: number;
                  y?: number;
                  width?: number;
                  height?: number;
              }>;
          }
        | undefined;
    if (sequence && sequence.actors && sequence.actors.length > 0) {
        a.kind = 'sequence';
        a.sequence = {
            actors: (sequence.actors ?? []).map((s) => ({
                id: String(s.id ?? ''),
                label: String(s.label ?? ''),
                kind: s.kind === 'actor' ? 'actor' : 'object',
                x: num(s.x),
            })),            messages: (sequence.messages ?? []).map((m) => ({
                from: String(m.from ?? ''),
                to: String(m.to ?? ''),
                label: String(m.label ?? ''),
                kind: (['sync', 'return', 'self', 'async', 'note', 'activate', 'deactivate', 'loop', 'loopend', 'alt', 'altelse', 'altend', 'opt', 'optend'] as const).includes(
                    m.kind as never,
                )
                    ? (m.kind as MessageKind)
                    : 'sync',
                activate: !!m.activate,
            })),
            activations: (sequence.activations ?? []).map((v) => ({
                actorId: String(v.actorId ?? ''),
                x: num(v.x),
                yTop: num(v.yTop),
                yBottom: num(v.yBottom),
                width: num(v.width),
            })),
            fragments: (sequence.fragments ?? []).map((f) => ({
                kind: String(f.kind ?? ''),
                label: String(f.label ?? ''),
                x: num(f.x),
                y: num(f.y),
                width: num(f.width),
                height: num(f.height),
            })),
        };
    }
    const mindmap = snap['mindmap'] as
        | {
              rootId?: string;
              nodes?: Array<{
                  id?: string;
                  label?: string;
                  parentId?: string;
                  depth?: number;
                  x?: number;
                  y?: number;
                  width?: number;
                  height?: number;
              }>;
          }
        | undefined;
    if (mindmap && mindmap.nodes && mindmap.nodes.length > 0) {
        a.kind = 'mindmap';
        a.mindmap = {
            rootId: String(mindmap.rootId ?? ''),
            nodes: (mindmap.nodes ?? []).map((n) => ({
                id: String(n.id ?? ''),
                label: String(n.label ?? ''),
                parentId: String(n.parentId ?? ''),
                depth: num(n.depth),
                x: num(n.x),
                y: num(n.y),
                width: num(n.width),
                height: num(n.height),
            })),
        };
    }
    const classModel = snap['classModel'] as
        | {
              classes?: Array<{
                  id?: string;
                  name?: string;
                  stereotypes?: string[];
                  attributes?: Array<{ name?: string; visibility?: string }>;
                  operations?: Array<{ name?: string; visibility?: string }>;
              }>;
              relations?: Array<{ from?: string; to?: string; label?: string; kind?: string }>;
          }
        | undefined;
    if (classModel && classModel.classes && classModel.classes.length > 0) {
        a.kind = 'class';
        a.classModel = {
            classes: (classModel.classes ?? []).map((c) => ({
                id: String(c.id ?? ''),
                name: String(c.name ?? ''),
                stereotypes: (c.stereotypes ?? []).map((s) => String(s)),
                attributes: (c.attributes ?? []).map((m) => ({
                    name: String(m.name ?? ''),
                    visibility: String(m.visibility ?? ''),
                })),
                operations: (c.operations ?? []).map((m) => ({
                    name: String(m.name ?? ''),
                    visibility: String(m.visibility ?? ''),
                })),
            })),
            relations: (classModel.relations ?? []).map((r) => ({
                from: String(r.from ?? ''),
                to: String(r.to ?? ''),
                label: String(r.label ?? ''),
                kind: r.kind === 'realization' ? 'realization' : 'inheritance',
            })),
        };
    }
    const erModel = snap['erModel'] as
        | {
              entities?: Array<{
                  id?: string;
                  name?: string;
                  attributes?: Array<{
                      name?: string;
                      type?: string;
                      primaryKey?: boolean;
                      foreignKey?: boolean;
                      required?: boolean;
                  }>;
              }>;
              relations?: Array<{
                  from?: string;
                  to?: string;
                  label?: string;
                  multiplicityFrom?: string;
                  multiplicityTo?: string;
                  identifying?: boolean;
              }>;
          }
        | undefined;
    if (erModel && erModel.entities && erModel.entities.length > 0) {
        a.kind = 'er';
        a.erModel = {
            entities: (erModel.entities ?? []).map((e) => ({
                id: String(e.id ?? ''),
                name: String(e.name ?? ''),
                attributes: (e.attributes ?? []).map((at) => ({
                    name: String(at.name ?? ''),
                    type: String(at.type ?? ''),
                    primaryKey: !!at.primaryKey,
                    foreignKey: !!at.foreignKey,
                    required: !!at.required,
                })),
            })),
            relations: (erModel.relations ?? []).map((r) => ({
                from: String(r.from ?? ''),
                to: String(r.to ?? ''),
                label: String(r.label ?? ''),
                multiplicityFrom: String(r.multiplicityFrom ?? ''),
                multiplicityTo: String(r.multiplicityTo ?? ''),
                identifying: !!r.identifying,
            })),
        };
    }
    const gantt = snap['gantt'] as
        | {
              title?: string;
              sections?: string[];
              startSerial?: number;
              endSerial?: number;
              tasks?: Array<{
                  name?: string;
                  section?: string;
                  startSerial?: number | null;
                  duration?: number;
                  milestone?: boolean;
                  dependsOn?: string[];
              }>;
          }
        | undefined;
    if (gantt && gantt.tasks && gantt.tasks.length > 0) {
        a.kind = 'gantt';
        a.gantt = {
            title: String(gantt.title ?? ''),
            dateFormat: '',
            startSerial: num(gantt.startSerial),
            endSerial: num(gantt.endSerial),
            sections: (gantt.sections ?? []).map((s) => String(s)),
            tasks: (gantt.tasks ?? []).map((t) => ({
                name: String(t.name ?? ''),
                section: String(t.section ?? ''),
                startSerial: num(t.startSerial),
                duration: num(t.duration) || 1,
                milestone: !!t.milestone,
                dependsOn: (t.dependsOn ?? []).map((s) => String(s)),
            })),
        };
    }
    return a;
}

function num(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}
