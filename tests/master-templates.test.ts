// M1 装配机制单测：官方模板提取物 → 目录记录 → 打包，逐项验证"verbatim 等价 + MasterType 保真"。
// 准则：模板内容与 docs/research 素材包逐字节一致；目录条目 MasterType 与官方一致；打包后 ID/rId 重写但内容原样。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildMasterCatalog, buildRecord } from '../source/common/masters/assets.js';
import { MasterPacker } from '../source/common/masters/packer.js';
import { kClassTemplates } from '../source/common/masters/templates/class.js';
import { kErTemplates } from '../source/common/masters/templates/er.js';
import { kSequenceTemplates } from '../source/common/masters/templates/sequence.js';

const root = 'docs/research/标准研究模板-手动创建vsdx并解压';

/** 从素材包读官方条目信息：NameU → { masterType, file, content }（按 rels 映射）。 */
function loadPack(dir: string): Map<string, { masterType: string; file: string; content: string }> {
    const base = `${root}/${dir}/visio/masters`;
    const ms = readFileSync(`${base}/masters.xml`, 'utf8');
    const rels = readFileSync(`${base}/_rels/masters.xml.rels`, 'utf8');
    const relMap = new Map<string, string>();
    for (const m of rels.matchAll(/Id=['"]([^'"]+)['"][^>]*Target=['"]([^'"]+)['"]/g)) relMap.set(m[1]!, m[2]!);
    const out = new Map<string, { masterType: string; file: string; content: string }>();
    for (const m of ms.matchAll(/<Master\s([^>]*)>([\s\S]*?)<\/Master>/g)) {
        const nameU = /NameU=['"]([^'"]+)['"]/.exec(m[1]!)?.[1];
        const masterType = /MasterType=['"]([0-9]+)['"]/.exec(m[1]!)?.[1];
        const relId = /Rel[^>]*r:id=['"]([^'"]+)['"]/.exec(m[2]!)?.[1] ?? /Rel[^>]*id=['"]([^'"]+)['"]/.exec(m[2]!)?.[1];
        if (!nameU || !masterType || !relId) continue;
        const file = relMap.get(relId);
        if (!file) continue;
        out.set(nameU, { masterType, file, content: readFileSync(`${base}/${file}`, 'utf8') });
    }
    return out;
}

describe('M1 装配机制：官方母版模板', () => {
    /** 多包合并（先给的包优先，后包只补缺失条目——同名条目各包内容一致）。 */
    function mergePacks(dirs: string[]): Map<string, { masterType: string; file: string; content: string }> {
        const out = new Map<string, { masterType: string; file: string; content: string }>();
        for (const d of dirs) for (const [k, v] of loadPack(d)) if (!out.has(k)) out.set(k, v);
        return out;
    }

    it('四类模板模块：条目集合与官方包一致、内容逐字节等价、MasterType 正确', () => {
        // class 模板库 = 官方 class 包（11 条：含 Rectangle/Dynamic connector 通用件）
        //              ∪ class-all-in-one 包（16 条：全部类图模板，含 7 类线型母版）
        // sequence 模板库 = sequence 包（11 条：含 Rectangle/Dynamic connector 通用件）
        //              ∪ seq-all-in-one 包（12 条：时序专用件，含 Alternative fragment/
        //                Interaction operand/Other fragment）
        // 两包合并为权威全集；条目与内容逐字节比对。
        // er 模板库 = er-all-in-one 包（5 条：Entity/PKAttr/PKSep/Attr/Relationship，MasterType=541 关系）。
        for (const [dir, tpl] of [
            ['class', kClassTemplates],
            ['er-all-in-one', kErTemplates],
            ['sequence', kSequenceTemplates],
        ] as const) {
            const packs = dir === 'class'
                ? mergePacks(['class', 'class-all-in-one'])
                : dir === 'sequence'
                    ? mergePacks(['sequence', 'seq-all-in-one'])
                    : loadPack(dir);
            expect(Object.keys(tpl).length, `${dir} 条目数`).toBe(packs.size);
            for (const [nameU, entry] of Object.entries(tpl)) {
                const official = packs.get(nameU);
                expect(official, `${dir}:${nameU} 官方条目存在`).toBeDefined();
                expect(entry.masterType, `${dir}:${nameU} MasterType`).toBe(Number(official!.masterType));
                expect(entry.contentXml, `${dir}:${nameU} 内容 verbatim`).toBe(official!.content);
            }
        }
    });

    it('buildRecord：条目 MasterType 保真（34/29/541/1/2）', () => {
        const rec = buildRecord(kClassTemplates, '', 100)!;
        expect(rec).not.toBeNull();
        expect(/NameU="Member"[^>]*MasterType="34"/.test(rec.mastersXml)).toBe(true);
        expect(/NameU="Dependency"[^>]*MasterType="541"/.test(rec.mastersXml)).toBe(true);
        const seqRec = buildRecord(kSequenceTemplates, '', 250)!;
        expect(/NameU="Message"[^>]*MasterType="29"/.test(seqRec.mastersXml)).toBe(true);
        expect(/NameU="Activation"[^>]*MasterType="1"/.test(seqRec.mastersXml)).toBe(true);
    });

    it('MasterPacker：打包内容与官方 verbatim、masters.xml 条目 MasterType 保真', () => {
        const catalog = buildMasterCatalog()!;
        expect(catalog).not.toBeNull();
        const packed = new MasterPacker(catalog).pack(['Class', 'Member', 'Separator', 'Dependency', 'Message', 'Object lifeline']);
        const partsXml = new Map(packed.parts.filter((p) => /^\/visio\/masters\/master\d+\.xml$/.test(p.uri)).map((p) => [p.uri, p.xml]));
        // 每个官方内容必须恰好出现一次于打包内容中（verbatim）
        const classPack = loadPack('class');
        const seqPack = loadPack('sequence');
        for (const nameU of ['Class', 'Member', 'Separator', 'Dependency']) {
            const contents = [...partsXml.values()].filter((x) => x === classPack.get(nameU)!.content);
            expect(contents.length, `class:${nameU} 内容出现次数`).toBe(1);
        }
        for (const nameU of ['Message', 'Object lifeline']) {
            const contents = [...partsXml.values()].filter((x) => x === seqPack.get(nameU)!.content);
            expect(contents.length, `sequence:${nameU} 内容出现次数`).toBe(1);
        }
        // masters.xml 条目：NameU + MasterType 保真；ID 从 100 起连续
        const mastersXml = packed.parts.find((p) => p.uri === '/visio/masters/masters.xml')!.xml;
        for (const [nameU, mt] of [['Class', '2'], ['Member', '34'], ['Separator', '34'], ['Dependency', '541'], ['Message', '29'], ['Object lifeline', '2']] as const) {
            expect(new RegExp(`NameU="${nameU}"[^>]*MasterType="${mt}"`).test(mastersXml), `masters.xml ${nameU} MT=${mt}`).toBe(true);
        }
        for (let i = 0; i < 6; i++) {
            expect(new RegExp(`Master ID="${100 + i}"`).test(mastersXml), `ID=${100 + i} 连续`).toBe(true);
        }
    });
});
