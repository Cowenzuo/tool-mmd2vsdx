// OPC 底层：ZIP 归档读写（确定性输出：版本 20、flags 0x800、DOS 时间 0）
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
    name: string;
    data: Buffer;
}

const kUtf8Flag = 0x0800;
const kDeflate = 8;

const CRT_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRT_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function dosTime0(): { time: number; date: number } {
    return { time: 0, date: 0x21 };
}

/** 写 zip：按条目顺序写入，local header 与 central directory。 */
export function writeZip(entries: ZipEntry[]): Buffer {
    const local: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    const { time, date } = dosTime0();
    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, 'utf8');
        const raw = deflateRawSync(e.data);
        const crc = crc32(e.data);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(kUtf8Flag, 6);
        lh.writeUInt16LE(kDeflate, 8);
        lh.writeUInt16LE(time, 10);
        lh.writeUInt16LE(date, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(raw.length, 18);
        lh.writeUInt32LE(e.data.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        local.push(lh, nameBuf, raw);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4); // version made by
        ch.writeUInt16LE(20, 6); // version needed
        ch.writeUInt16LE(kUtf8Flag, 8);
        ch.writeUInt16LE(kDeflate, 10);
        ch.writeUInt16LE(time, 12);
        ch.writeUInt16LE(date, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(raw.length, 20);
        ch.writeUInt32LE(e.data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt16LE(0, 30); // extra
        ch.writeUInt16LE(0, 32); // comment
        ch.writeUInt16LE(0, 34); // disk start
        ch.writeUInt16LE(0, 36); // internal attrs
        ch.writeUInt32LE(0, 38); // external attrs
        ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf);
        offset += lh.length + nameBuf.length + raw.length;
    }
    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...local, cd, eocd]);
}

/** 读 zip：解析 central directory 与各条目。 */
export function readZip(buf: Buffer): ZipEntry[] {
    const eocd = findEocd(buf);
    if (eocd < 0) throw new Error('[zip] 未找到 EOCD');
    const count = buf.readUInt16LE(eocd + 10);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    const entries: ZipEntry[] = [];
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('[zip] central 目录损坏');
        const method = buf.readUInt16LE(p + 10);
        const crc = buf.readUInt32LE(p + 16);
        const compSize = buf.readUInt32LE(p + 20);
        const uncompSize = buf.readUInt32LE(p + 24);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
        const lh = localOffset;
        if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('[zip] local 头部损坏');
        const lNameLen = buf.readUInt16LE(lh + 26);
        const lExtraLen = buf.readUInt16LE(lh + 28);
        const dataStart = lh + 30 + lNameLen + lExtraLen;
        const raw = buf.subarray(dataStart, dataStart + compSize);
        let data: Buffer;
        if (method === 0) data = Buffer.from(raw);
        else if (method === 8) data = inflateRawSync(raw);
        else throw new Error(`[zip] 不支持的压缩方式 ${method}`);
        if (data.length !== uncompSize) throw new Error('[zip] 尺寸不一致');
        if (crc32(data) !== crc) throw new Error('[zip] CRC 校验失败');
        entries.push({ name, data });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function findEocd(buf: Buffer): number {
    for (let p = buf.length - 22; p >= 0; p--) {
        if (buf.readUInt32LE(p) === 0x06054b50) return p;
    }
    return -1;
}
