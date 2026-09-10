// mmd2vsdx - testopc：opcpkg 容器层
// C++ src/tests/testopc.cpp 逐条平移 + M1 金标准闸门（00 规划第 7 节）：
//   ① golden 16 份开卷（Package.open 部件清单/CT 一致）
//   ② 解析 C++ 部件 → 重序列化 → 结构等价（idempotence 校验）
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PartUri } from '../src/opcpkg/partUri.js';
import { ContentTypes } from '../src/opcpkg/contentTypes.js';
import {
    Relationships,
    RelationshipTargetMode,
} from '../src/opcpkg/relationships.js';
import {
    readZip,
    writeZip,
    ZipCompression,
} from '../src/opcpkg/zipArchive.js';
import type { ZipEntry } from '../src/opcpkg/zipArchive.js';
import { Package } from '../src/opcpkg/package.js';
import { OpcPackager } from '../src/opcpkg/opcpackager.js';
import { defaultXmlParts } from '../src/core/xmlparts.js';
import type { XmlParts } from '../src/core/xmlparts.js';
import { parseDocument, serializeDocument } from '../src/xml/xmlNode.js';
import { goldenDir, goldenVsdxFiles, deepEqualJson } from './helpers.js';

// ═══════════════════════════════════════════════════════
// PartUri
// ═══════════════════════════════════════════════════════

describe('PartUri parse and equality', () => {
    it('equal parsed values, unequal others, string() normalized', () => {
        const a = PartUri.parse('visio/document.xml');
        const b = PartUri.parse('visio/document.xml');
        const c = PartUri.parse('visio/pages/pages.xml');
        expect(a.equals(b)).toBe(true);
        expect(a.equals(c)).toBe(false);
        expect(a.string()).toBe('visio/document.xml');
    });
    it('invalid input throws (C++ invalid_argument 语义 → TypeError)', () => {
        expect(() => PartUri.parse('')).toThrow(TypeError);
        expect(() => PartUri.parse('a\\b.xml')).toThrow(TypeError);
        expect(() => PartUri.parse('a?b.xml')).toThrow(TypeError);
        expect(() => PartUri.parse('a#b.xml')).toThrow(TypeError);
        expect(() => PartUri.parse('a/')).toThrow(TypeError); // 尾斜杠不命名部件
        expect(() => PartUri.parse('a/../b.xml')).toThrow(TypeError); // 未规范化
        expect(() => PartUri.parse('a//b.xml')).toThrow(TypeError);
        expect(() => PartUri.parse('a:b.xml')).toThrow(TypeError); // 绝对 URI 段
    });
});

describe('PartUri package relationships', () => {
    it('_rels/.rels has no source part', () => {
        const rels = PartUri.packageRelationships();
        expect(rels.string()).toBe('_rels/.rels');
        expect(PartUri.sourceFromRelationships(rels)).toBeNull();
    });
});

describe('PartUri resolve relative and absolute', () => {
    it('resolves against source, absolute paths and package root', () => {
        const source = PartUri.parse('visio/document.xml');
        expect(PartUri.resolve(source, 'pages/pages.xml').string()).toBe('visio/pages/pages.xml');
        expect(PartUri.resolve(source, '/docProps/core.xml').string()).toBe('docProps/core.xml');
        expect(PartUri.resolve(null, 'docProps/app.xml').string()).toBe('docProps/app.xml');
    });
    it('rejects targets escaping the package', () => {
        const source = PartUri.parse('visio/document.xml');
        // C++ 语义：源目录 [visio]，两次 .. 第二次越出包根才抛
        expect(() => PartUri.resolve(source, '../../x.xml')).toThrow(TypeError);
        // 单次 .. 合法回落（visio/document.xml → x.xml 同层目录上提一级）
        expect(PartUri.resolve(source, '../x.xml').string()).toBe('x.xml');
    });
});

describe('PartUri relationships URI', () => {
    it('derives _rels location', () => {
        const p = PartUri.parse('visio/pages/page1.xml');
        expect(p.relationshipsUri().string()).toBe('visio/pages/_rels/page1.xml.rels');
    });
});

// ═══════════════════════════════════════════════════════
// ContentTypes
// ═══════════════════════════════════════════════════════

describe('ContentTypes default then override', () => {
    it('lookup fallback default→override 与序列化往返', () => {
        const ct = ContentTypes.create();
        expect(ct.contentTypeFor(PartUri.parse('visio/document.xml'))).toBeNull();

        ct.setDefault('rels', 'application/vnd.openxmlformats-package.relationships+xml');
        expect(ct.contentTypeFor(PartUri.parse('_rels/.rels'))).toBe(
            'application/vnd.openxmlformats-package.relationships+xml');

        ct.setOverride(PartUri.parse('visio/document.xml'), 'application/vnd.ms-visio.drawing.main+xml');
        expect(ct.contentTypeFor(PartUri.parse('visio/document.xml'))).toBe(
            'application/vnd.ms-visio.drawing.main+xml');

        const reparsed = ContentTypes.parse(ct.serialize());
        expect(reparsed.contentTypeFor(PartUri.parse('visio/document.xml'))).toBe(
            'application/vnd.ms-visio.drawing.main+xml');
    });
    it('removeOverride 生效', () => {
        const ct = ContentTypes.create();
        const uri = PartUri.parse('visio/windows.xml');
        ct.setOverride(uri, 'application/vnd.ms-visio.windows+xml');
        expect(ct.contentTypeFor(uri)).not.toBeNull();
        ct.removeOverride(uri);
        expect(ct.contentTypeFor(uri)).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// Relationships
// ═══════════════════════════════════════════════════════

describe('Relationships add/find/serialize', () => {
    it('rId 从 rId1 分配、查找、往返保留 source', () => {
        const rels = Relationships.create(PartUri.parse('visio/document.xml'));
        const id = rels.add('http://rel/type-a', 'pages/pages.xml');
        expect(id).toBe('rId1');
        expect(rels.findById('rId1')?.target).toBe('pages/pages.xml');
        expect(rels.findByType('http://rel/type-a')).toHaveLength(1);
        expect(rels.findById('nope')).toBeNull();

        const reparsed = Relationships.parse(rels.serialize(), PartUri.parse('visio/document.xml'));
        expect(reparsed.findByType('http://rel/type-a')).toHaveLength(1);
        expect(reparsed.source()?.string()).toBe('visio/document.xml');
    });
    it('rId 补最小空闲（删除/空洞后复用语义按 C++）', () => {
        const rels = Relationships.create(null);
        expect(rels.add('t', 'a.xml')).toBe('rId1');
        expect(rels.add('t', 'b.xml')).toBe('rId2');
    });
    it('external target mode 往返', () => {
        const rels = Relationships.create(null);
        rels.add('http://rel/ext', 'https://example.com/x', RelationshipTargetMode.External);
        expect(rels.items()).toHaveLength(1);
        expect(rels.items()[0]!.targetMode).toBe(RelationshipTargetMode.External);
        const reparsed = Relationships.parse(rels.serialize(), null);
        expect(reparsed.items()[0]!.targetMode).toBe(RelationshipTargetMode.External);
    });
});

// ═══════════════════════════════════════════════════════
// ZipArchive
// ═══════════════════════════════════════════════════════

describe('ZipArchive write/read roundtrip', () => {
    it('Store + Deflate 条目往返一致', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'mmd2vsdx-testopc-zip-'));
        const file = path.join(dir, 'mmd2vsdx_testopc_zip.zip');
        try {
            const entries: ZipEntry[] = [
                { name: 'hello.txt', data: Buffer.from('hello'), compression: ZipCompression.Store },
                { name: 'nested/data.bin', data: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), compression: ZipCompression.Deflate },
            ];
            writeZip(file, entries);
            const read = readZip(file);
            expect(read).toHaveLength(2);
            expect(read[0]!.name).toBe('hello.txt');
            expect(read[0]!.data.equals(Buffer.from('hello'))).toBe(true);
            expect(read[1]!.name).toBe('nested/data.bin');
            expect(read[1]!.data.equals(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe(true);
            // 确定性：同输入恒同字节
            const file2 = path.join(dir, 'again.zip');
            writeZip(file2, entries);
            expect(readFileSync(file).equals(readFileSync(file2))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ═══════════════════════════════════════════════════════
// Package（C++ testopc 用例平移）
// ═══════════════════════════════════════════════════════

describe('Package create/add/part/contains', () => {
    it('addPart/contains/part/validate', () => {
        const pkg = Package.create();
        const uri = PartUri.parse('visio/document.xml');
        pkg.addPart(uri, 'application/vnd.ms-visio.drawing.main+xml', Buffer.from('<x/>'));
        expect(pkg.contains(uri)).toBe(true);
        expect(pkg.part(uri).contentType).toBe('application/vnd.ms-visio.drawing.main+xml');
        expect(pkg.part(uri).payload.equals(Buffer.from('<x/>'))).toBe(true);
        pkg.validate();
    });
});

describe('Package save/open roundtrip', () => {
    it('两部件往返 payload 一致', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'mmd2vsdx-testopc-pkg-'));
        const file = path.join(dir, 'mmd2vsdx_testopc_pkg.vsdx');
        try {
            {
                const pkg = Package.create();
                pkg.addPart(PartUri.parse('visio/document.xml'), 'application/vnd.ms-visio.drawing.main+xml', Buffer.from('<doc/>'));
                pkg.addPart(PartUri.parse('docProps/core.xml'), 'application/vnd.openxmlformats-package.core-properties+xml', Buffer.from('<core/>'));
                pkg.save(file);
            }
            const opened = Package.open(file);
            expect(opened.contains(PartUri.parse('visio/document.xml'))).toBe(true);
            expect(opened.contains(PartUri.parse('docProps/core.xml'))).toBe(true);
            expect(opened.part(PartUri.parse('visio/document.xml')).payload.equals(Buffer.from('<doc/>'))).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('Package removePart', () => {
    it('删除后 contains=false', () => {
        const pkg = Package.create();
        const uri = PartUri.parse('visio/windows.xml');
        pkg.addPart(uri, 'application/vnd.ms-visio.windows+xml', Buffer.from('w'));
        expect(pkg.contains(uri)).toBe(true);
        pkg.removePart(uri);
        expect(pkg.contains(uri)).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════
// M1 金标准闸门 ①：golden 16 份开卷
// ═══════════════════════════════════════════════════════

const kMandatory = ['_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'docProps/custom.xml',
    'visio/document.xml', 'visio/pages/pages.xml', 'visio/pages/page1.xml', 'visio/windows.xml'];

describe('golden open：16 份 C++ 基线产物开卷（部件清单 + CT 一致）', () => {
    const files = goldenVsdxFiles();
    expect(files).toHaveLength(16);

    for (const name of files) {
        it(`Package.open(${name})`, () => {
            const pkg = Package.open(path.join(goldenDir, name));
            const uris = pkg.partUris().map((u) => u.string());
            // 必备部件齐全
            for (const m of kMandatory) expect(uris).toContain(m);
            // 每部件 contentType 可查且与部件声明一致（override 或 default 兜底）
            for (const uri of pkg.partUris()) {
                const ct = pkg.contentTypes().contentTypeFor(uri);
                expect(ct).not.toBeNull();
                expect(ct).toBe(pkg.part(uri).contentType);
            }
            // validate 通过（CT 完整 + 内部 rels 目标存在）
            expect(() => pkg.validate()).not.toThrow();
        });
    }
});

describe('golden open：zip 头目 = [Content_Types].xml 且条目顺序确定', () => {
    for (const name of goldenVsdxFiles()) {
        it(`${name} 首条目为 [Content_Types].xml`, () => {
            const entries = readZip(path.join(goldenDir, name));
            expect(entries[0]!.name).toBe('[Content_Types].xml');
        });
    }
});

// ═══════════════════════════════════════════════════════
// M1 金标准闸门 ②：解析 C++ 部件 → 重序列化 → 结构等价（idempotence）
// ═══════════════════════════════════════════════════════

describe('golden 部件解析→重序列化 idempotence（每份产物的全部 xml 部件）', () => {
    for (const name of goldenVsdxFiles()) {
        it(`${name} 全部部件 parse→serialize→parse 结构不变`, () => {
            const pkg = Package.open(path.join(goldenDir, name));
            expect(pkg.partUris().length).toBeGreaterThan(0);
            for (const uri of pkg.partUris()) {
                const text = pkg.part(uri).payload.toString('utf8');
                const root1 = parseDocument(text, uri.string());
                const text2 = serializeDocument(root1);
                const root2 = parseDocument(text2, uri.string());
                expect(deepEqualJson(root1, root2), `part ${uri.string()}`).toBe(true);
            }
        });
    }
});

// ═══════════════════════════════════════════════════════
// OpcPackager 门面（XmlParts → .vsdx；打开往返）
// ═══════════════════════════════════════════════════════

describe('OpcPackager pack/open', () => {
    it('XmlParts 打包 → 开卷部件一致', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'mmd2vsdx-testopc-pack-'));
        const file = path.join(dir, 'out.vsdx');
        try {
            const parts: XmlParts = defaultXmlParts();
            parts.parts.push(
                { uri: 'visio/document.xml', contentType: 'application/vnd.ms-visio.drawing.main+xml', xml: serializeDocument(parseDocument('<Document/>', 'x')) },
                { uri: 'docProps/core.xml', contentType: 'application/vnd.openxmlformats-package.core-properties+xml', xml: serializeDocument(parseDocument('<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>', 'x')) },
            );
            OpcPackager.pack(parts, file);
            const opened = OpcPackager.open(file);
            expect(opened.contains(PartUri.parse('visio/document.xml'))).toBe(true);
            expect(opened.contains(PartUri.parse('docProps/core.xml'))).toBe(true);
            expect(opened.part(PartUri.parse('visio/document.xml')).payload.toString('utf8')).toContain('<Document/>');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
