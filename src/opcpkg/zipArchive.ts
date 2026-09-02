// mmd2vsdx - opcpkg：zipArchive（ZIP 读写：手写 PKZIP 容器 + node:zlib）
//
// C++ opcpkg/ziparchive.{hpp,cpp}（711 行）平移（04 §4.4、坑位 ⑪-11.1）。
// 对齐要点（逐条照抄 C++）：
//   - 写：version=20、flags 恒 0x0800（UTF-8）、modTime/modDate 恒 0（DOS）→
//     字节级确定性输出；无 ZIP64/加密/data descriptor；
//   - 压缩：node:zlib deflateRawSync（raw，-MAX_WBITS 语义）→ 无 zlib 头；
//   - 读：EOCD 反向搜索（支持注释）、中央目录逐条校验、local/central 一致性、
//     data descriptor 两形态（bit3）、CRC 校验（node:zlib.crc32 = IEEE 含最终 XOR）、
//     条目名安全（UnsafeEntryName：空/尾斜杠/.. / 绝对段/非法 UTF-8）、
//     ZIP64 哨兵与 extra 0x0001 → UnsupportedFeature、重叠区检测；
//   - ZipLimits 与"超限删半成品"（TS 组装后写盘：超限不落盘，语义等价）；
//   - 已知偏差（注明）：Node 同步 inflate 无法回报"输入消耗量"，
//     C++ 的 total_in==compressedSize 尾部垃圾拒收以输出长度 + 解压失败近似
//     （金标准产物与本实现产物均无尾部垃圾，路径不受影响）。

import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { PartUri } from './partUri.js';

// ── 常量（C++ ziparchive.cpp 顶部照抄） ──

const kLocalHeaderSignature = 0x04034b50;
const kCentralHeaderSignature = 0x02014b50;
const kEndOfCentralDirectorySignature = 0x06054b50;
const kDataDescriptorSignature = 0x08074b50;
const kUtf8Flag = 0x0800;
const kDataDescriptorFlag = 0x0008;
const kEncryptionFlags = 0x2041;
const kAllowedFlags = 0x080e;
const kLocalHeaderSize = 30;
const kCentralHeaderSize = 46;
const kEndOfCentralDirectorySize = 22;

export enum ZipErrorCode {
    IoError,
    InvalidArchive,
    UnsupportedFeature,
    UnsafeEntryName,
    DuplicateEntry,
    CrcMismatch,
    LimitExceeded,
}

export class ZipError extends Error {
    readonly code: ZipErrorCode;

    constructor(code: ZipErrorCode, message: string) {
        super(message);
        this.name = 'ZipError';
        this.code = code;
    }
}

export const ZipCompression = { Store: 0, Deflate: 8 } as const;
export type ZipCompressionValue = (typeof ZipCompression)[keyof typeof ZipCompression];

export interface ZipLimits {
    maxEntries: number;
    maxArchiveBytes: number;
    maxEntryBytes: number;
    maxTotalUncompressedBytes: number;
}

export interface ZipEntry {
    name: string;
    data: Buffer;
    compression: ZipCompressionValue;
}

export function defaultZipLimits(): ZipLimits {
    return {
        maxEntries: 4096,
        maxArchiveBytes: 512 * 1024 * 1024,
        maxEntryBytes: 256 * 1024 * 1024,
        maxTotalUncompressedBytes: 1024 * 1024 * 1024,
    };
}

interface CentralEntry {
    name: string;
    flags: number;
    compression: ZipCompressionValue;
    crc: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
}

interface WrittenEntry {
    name: Buffer; // UTF-8 字节
    compressedData: Buffer;
    compression: ZipCompressionValue;
    crc: number;
    uncompressedSize: number;
    localHeaderOffset: number;
}

// ── 低层工具 ──

function invalid(message: string): never {
    throw new ZipError(ZipErrorCode.InvalidArchive, message);
}

function unsupported(message: string): never {
    throw new ZipError(ZipErrorCode.UnsupportedFeature, message);
}

function limit(message: string): never {
    throw new ZipError(ZipErrorCode.LimitExceeded, message);
}

function requireRange(offset: number, size: number, available: number, context: string): void {
    if (offset > available || size > available - offset) {
        invalid('ZIP data is truncated while reading ' + context);
    }
}

function read16(bytes: Buffer, offset: number, context: string): number {
    requireRange(offset, 2, bytes.length, context);
    return bytes.readUInt16LE(offset);
}

function read32(bytes: Buffer, offset: number, context: string): number {
    requireRange(offset, 4, bytes.length, context);
    return bytes.readUInt32LE(offset);
}

function checked32(value: number, context: string): number {
    if (value > 0xffffffff) limit(context + ' exceeds the ZIP32 limit');
    return value >>> 0;
}

function checked16(value: number, context: string): number {
    if (value > 0xffff) limit(context + ' exceeds the ZIP16 limit');
    return value;
}

const kUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

function isValidUtf8Bytes(bytes: Buffer): boolean {
    try {
        kUtf8Decoder.decode(bytes);
        return true;
    } catch {
        return false;
    }
}

function isAscii(bytes: Buffer): boolean {
    for (const b of bytes) {
        if (b >= 0x80) return false;
    }
    return true;
}

/** 条目名校验（C++ validateEntryName 照抄）：PartUri 规则 + UTF-8 编码约束。 */
function validateEntryName(name: string, utf8Flag: boolean): void {
    if (name.length === 0 || name.endsWith('/')) {
        throw new ZipError(ZipErrorCode.UnsafeEntryName,
            'ZIP entry does not name an OPC part: ' + name);
    }
    try {
        PartUri.parse(name);
    } catch (error) {
        throw new ZipError(ZipErrorCode.UnsafeEntryName,
            'Unsafe ZIP entry name \'' + name + '\': ' + (error as Error).message);
    }
    const bytes = Buffer.from(name, 'utf8');
    if (utf8Flag) {
        if (!isValidUtf8Bytes(bytes)) {
            throw new ZipError(ZipErrorCode.UnsafeEntryName,
                'ZIP entry name is not valid UTF-8: ' + name);
        }
    } else if (!isAscii(bytes)) {
        unsupported('ZIP entry uses a legacy non-UTF-8 filename encoding');
    }
}

/** extra 字段校验：畸形拒绝、ZIP64 (id 0x0001) 拒绝。 */
function validateExtraFields(bytes: Buffer, offset: number, size: number, context: string): void {
    requireRange(offset, size, bytes.length, context);
    const end = offset + size;
    let cursor = offset;
    while (cursor < end) {
        if (end - cursor < 4) invalid('Malformed ZIP extra field in ' + context);
        const identifier = read16(bytes, cursor, context);
        const dataSize = read16(bytes, cursor + 2, context);
        cursor += 4;
        if (dataSize > end - cursor) invalid('Malformed ZIP extra field in ' + context);
        if (identifier === 0x0001) unsupported('ZIP64 extra fields are not supported');
        cursor += dataSize;
    }
}

/** C++ crcFor：IEEE CRC32（node zlib.crc32 同语义，含最终 XOR）。 */
function crcFor(data: Buffer): number {
    return crc32(data) >>> 0;
}

/** 解压（raw deflate）；长度不符/失败 → InvalidArchive（消息同 C++）。 */
function inflateRaw(compressed: Buffer, uncompressedSize: number, name: string): Buffer {
    if (compressed.length > 0xffffffff || uncompressedSize > 0xffffffff) {
        limit('ZIP entry is too large for zlib: ' + name);
    }
    let output: Buffer;
    try {
        output = inflateRawSync(compressed);
    } catch {
        invalid('Invalid Deflate stream for ZIP entry: ' + name);
    }
    if (output.length !== uncompressedSize) {
        invalid('Invalid Deflate stream for ZIP entry: ' + name);
    }
    return output;
}

/** 压缩（raw deflate，默认级别与策略 = C++ Z_DEFAULT_COMPRESSION/Z_DEFAULT_STRATEGY）。 */
function deflateRaw(input: Buffer, name: string): Buffer {
    if (input.length > 0xffffffff) limit('ZIP entry is too large for zlib: ' + name);
    let output: Buffer;
    try {
        output = deflateRawSync(input);
    } catch {
        throw new ZipError(ZipErrorCode.IoError, 'Could not compress ZIP entry: ' + name);
    }
    return output;
}

/** 读文件（C++ readFile：大小上限 IoError/LimitExceeded 消息照抄）。 */
function readFile(path: string, limits: ZipLimits): Buffer {
    let size: number;
    try {
        size = statSync(path).size;
    } catch {
        throw new ZipError(ZipErrorCode.IoError, 'Cannot open ZIP archive: ' + path);
    }
    if (size > limits.maxArchiveBytes) {
        limit('ZIP archive exceeds the configured size limit');
    }
    let bytes: Buffer;
    try {
        bytes = readFileSync(path);
    } catch {
        throw new ZipError(ZipErrorCode.IoError, 'Cannot read ZIP archive: ' + path);
    }
    return bytes;
}

// ── 读 ──

function findEndOfCentralDirectory(bytes: Buffer): number {
    if (bytes.length < kEndOfCentralDirectorySize) invalid('ZIP archive is too small');
    const searchStart = bytes.length > 65535 + kEndOfCentralDirectorySize
        ? bytes.length - (65535 + kEndOfCentralDirectorySize)
        : 0;
    for (let offset = bytes.length - kEndOfCentralDirectorySize; ; offset--) {
        if (read32(bytes, offset, 'end of central directory') === kEndOfCentralDirectorySignature) {
            const commentLength = read16(bytes, offset + 20, 'ZIP comment');
            if (offset + kEndOfCentralDirectorySize + commentLength === bytes.length) {
                return offset;
            }
        }
        if (offset === searchStart) break;
    }
    invalid('ZIP end of central directory was not found');
}

function validateFlags(flags: number, compression: ZipCompressionValue): void {
    if ((flags & kEncryptionFlags) !== 0) unsupported('Encrypted ZIP entries are not supported');
    if ((flags & ~kAllowedFlags) !== 0) {
        unsupported('ZIP entry uses unsupported general purpose flags');
    }
    if (compression === ZipCompression.Store && (flags & 0x0006) !== 0) {
        invalid('Stored ZIP entry has Deflate option flags');
    }
}

function parseCompression(value: number): ZipCompressionValue {
    if (value === ZipCompression.Store) return ZipCompression.Store;
    if (value === ZipCompression.Deflate) return ZipCompression.Deflate;
    unsupported('ZIP compression method ' + value + ' is not supported');
}

export function readZip(path: string, limits?: ZipLimits): ZipEntry[] {
    const lim = limits ?? defaultZipLimits();
    const bytes = readFile(path, lim);
    const eocd = findEndOfCentralDirectory(bytes);

    const disk = read16(bytes, eocd + 4, 'EOCD disk number');
    const centralDisk = read16(bytes, eocd + 6, 'EOCD central disk');
    const entriesOnDisk = read16(bytes, eocd + 8, 'EOCD disk entries');
    const entryCount = read16(bytes, eocd + 10, 'EOCD total entries');
    const centralSize = read32(bytes, eocd + 12, 'EOCD central size');
    const centralOffset = read32(bytes, eocd + 16, 'EOCD central offset');

    if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
        unsupported('Multi-disk ZIP archives are not supported');
    }
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
        unsupported('ZIP64 archives are not supported');
    }
    if (entryCount > lim.maxEntries) limit('ZIP archive contains too many entries');
    if (centralOffset + centralSize !== eocd) {
        invalid('ZIP central directory location is inconsistent');
    }

    const centralEntries: CentralEntry[] = [];
    const names = new Set<string>();
    let cursor = centralOffset;
    let totalUncompressed = 0;

    for (let index = 0; index < entryCount; index++) {
        requireRange(cursor, kCentralHeaderSize, bytes.length, 'central directory entry');
        if (read32(bytes, cursor, 'central directory signature') !== kCentralHeaderSignature) {
            invalid('Invalid ZIP central directory signature');
        }
        const flags = read16(bytes, cursor + 8, 'central flags');
        const compression = parseCompression(read16(bytes, cursor + 10, 'central method'));
        validateFlags(flags, compression);
        const crc = read32(bytes, cursor + 16, 'central CRC');
        const compressedSize = read32(bytes, cursor + 20, 'central compressed size');
        const uncompressedSize = read32(bytes, cursor + 24, 'central uncompressed size');
        const nameLength = read16(bytes, cursor + 28, 'central name length');
        const extraLength = read16(bytes, cursor + 30, 'central extra length');
        const commentLength = read16(bytes, cursor + 32, 'central comment length');
        const diskStart = read16(bytes, cursor + 34, 'central disk start');
        const localHeaderOffset = read32(bytes, cursor + 42, 'local header offset');

        if (diskStart !== 0) unsupported('Multi-disk ZIP entries are not supported');
        if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
            localHeaderOffset === 0xffffffff) {
            unsupported('ZIP64 entry values are not supported');
        }
        const variableSize = nameLength + extraLength + commentLength;
        requireRange(cursor + kCentralHeaderSize, variableSize, bytes.length,
            'central directory variable data');
        const nameBytes = bytes.subarray(cursor + kCentralHeaderSize, cursor + kCentralHeaderSize + nameLength);
        let name: string;
        try {
            name = kUtf8Decoder.decode(nameBytes);
        } catch {
            throw new ZipError(ZipErrorCode.UnsafeEntryName,
                'ZIP entry name is not valid UTF-8: ' + nameBytes.toString('latin1'));
        }
        validateEntryName(name, (flags & kUtf8Flag) !== 0);
        validateExtraFields(bytes, cursor + kCentralHeaderSize + nameLength, extraLength,
            'central entry ' + name);
        if (names.has(name)) {
            throw new ZipError(ZipErrorCode.DuplicateEntry, 'Duplicate ZIP entry: ' + name);
        }
        names.add(name);
        if (uncompressedSize > lim.maxEntryBytes) {
            limit('ZIP entry exceeds the configured size limit: ' + name);
        }
        totalUncompressed += uncompressedSize;
        if (totalUncompressed > lim.maxTotalUncompressedBytes) {
            limit('ZIP archive exceeds the total uncompressed size limit');
        }
        centralEntries.push({
            name, flags, compression, crc, compressedSize, uncompressedSize, localHeaderOffset,
        });
        cursor += kCentralHeaderSize + variableSize;
    }
    if (cursor !== centralOffset + centralSize) {
        invalid('ZIP central directory size is inconsistent');
    }

    const occupiedRanges: Array<[number, number]> = [];
    const result: ZipEntry[] = [];

    for (const entry of centralEntries) {
        const local = entry.localHeaderOffset;
        requireRange(local, kLocalHeaderSize, bytes.length, 'local file header');
        if (read32(bytes, local, 'local header signature') !== kLocalHeaderSignature) {
            invalid('Invalid local header for ZIP entry: ' + entry.name);
        }
        const localFlags = read16(bytes, local + 6, 'local flags');
        const localMethod = parseCompression(read16(bytes, local + 8, 'local method'));
        const localCrc = read32(bytes, local + 14, 'local CRC');
        const localCompressedSize = read32(bytes, local + 18, 'local compressed size');
        const localUncompressedSize = read32(bytes, local + 22, 'local uncompressed size');
        const localNameLength = read16(bytes, local + 26, 'local name length');
        const localExtraLength = read16(bytes, local + 28, 'local extra length');

        if (localFlags !== entry.flags || localMethod !== entry.compression) {
            invalid('Central and local headers disagree for ZIP entry: ' + entry.name);
        }
        const localNameBytes = bytes.subarray(local + kLocalHeaderSize, local + kLocalHeaderSize + localNameLength);
        let localName: string;
        try {
            localName = kUtf8Decoder.decode(localNameBytes);
        } catch {
            localName = '';
        }
        if (localName !== entry.name) {
            invalid('Central and local filenames disagree for ZIP entry: ' + entry.name);
        }
        validateExtraFields(bytes, local + kLocalHeaderSize + localNameLength, localExtraLength,
            'local entry ' + entry.name);

        const hasDescriptor = (entry.flags & kDataDescriptorFlag) !== 0;
        if (!hasDescriptor &&
            (localCrc !== entry.crc ||
             localCompressedSize !== entry.compressedSize ||
             localUncompressedSize !== entry.uncompressedSize)) {
            invalid('Central and local sizes or CRC disagree for ZIP entry: ' + entry.name);
        }
        if (hasDescriptor &&
            ((localCrc !== 0 && localCrc !== entry.crc) ||
             (localCompressedSize !== 0 && localCompressedSize !== entry.compressedSize) ||
             (localUncompressedSize !== 0 && localUncompressedSize !== entry.uncompressedSize))) {
            invalid('Invalid local descriptor placeholders for ZIP entry: ' + entry.name);
        }

        const dataOffset = local + kLocalHeaderSize + localNameLength + localExtraLength;
        requireRange(dataOffset, entry.compressedSize, bytes.length, 'compressed data for ' + entry.name);
        let rangeEnd = dataOffset + entry.compressedSize;

        if (hasDescriptor) {
            requireRange(rangeEnd, 12, bytes.length, 'data descriptor for ' + entry.name);
            const withoutSignature =
                read32(bytes, rangeEnd, 'descriptor CRC') === entry.crc &&
                read32(bytes, rangeEnd + 4, 'descriptor compressed size') === entry.compressedSize &&
                read32(bytes, rangeEnd + 8, 'descriptor uncompressed size') === entry.uncompressedSize;
            let withSignature = false;
            if (!withoutSignature &&
                read32(bytes, rangeEnd, 'data descriptor signature') === kDataDescriptorSignature) {
                requireRange(rangeEnd + 4, 12, bytes.length, 'data descriptor for ' + entry.name);
                withSignature =
                    read32(bytes, rangeEnd + 4, 'descriptor CRC') === entry.crc &&
                    read32(bytes, rangeEnd + 8, 'descriptor compressed size') === entry.compressedSize &&
                    read32(bytes, rangeEnd + 12, 'descriptor uncompressed size') === entry.uncompressedSize;
            }
            if (!withoutSignature && !withSignature) {
                invalid('Data descriptor disagrees for ZIP entry: ' + entry.name);
            }
            rangeEnd += withSignature ? 16 : 12;
        }
        if (rangeEnd > centralOffset) {
            invalid('ZIP entry overlaps the central directory: ' + entry.name);
        }
        occupiedRanges.push([local, rangeEnd]);

        let data: Buffer;
        if (entry.compression === ZipCompression.Store) {
            if (entry.compressedSize !== entry.uncompressedSize) {
                invalid('Stored ZIP entry has inconsistent sizes: ' + entry.name);
            }
            data = Buffer.from(bytes.subarray(dataOffset, dataOffset + entry.compressedSize));
        } else {
            data = inflateRaw(bytes.subarray(dataOffset, dataOffset + entry.compressedSize),
                entry.uncompressedSize, entry.name);
        }
        if (crcFor(data) !== entry.crc) {
            throw new ZipError(ZipErrorCode.CrcMismatch,
                'CRC mismatch for ZIP entry: ' + entry.name);
        }
        result.push({ name: entry.name, data, compression: entry.compression });
    }

    occupiedRanges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < occupiedRanges.length; i++) {
        if (occupiedRanges[i]![0] < occupiedRanges[i - 1]![1]) {
            invalid('ZIP local entries overlap');
        }
    }
    return result;
}

// ── 写 ──

export function writeZip(path: string, entries: ZipEntry[], limits?: ZipLimits): void {
    const lim = limits ?? defaultZipLimits();
    if (entries.length > lim.maxEntries || entries.length > 0xffff) {
        limit('ZIP archive contains too many entries');
    }

    const names = new Set<string>();
    const prepared: WrittenEntry[] = [];
    let totalUncompressed = 0;

    for (const entry of entries) {
        validateEntryName(entry.name, true);
        if (names.has(entry.name)) {
            throw new ZipError(ZipErrorCode.DuplicateEntry, 'Duplicate ZIP entry: ' + entry.name);
        }
        names.add(entry.name);
        if (entry.data.length > lim.maxEntryBytes) {
            limit('ZIP entry exceeds the configured size limit: ' + entry.name);
        }
        totalUncompressed += entry.data.length;
        if (totalUncompressed > lim.maxTotalUncompressedBytes) {
            limit('ZIP archive exceeds the total uncompressed size limit');
        }
        if (entry.compression !== ZipCompression.Store &&
            entry.compression !== ZipCompression.Deflate) {
            unsupported('Requested ZIP compression method is not supported');
        }
        const uncompressedSize = checked32(entry.data.length, 'ZIP entry size');
        const crc = crcFor(entry.data);
        const compressedData = entry.compression === ZipCompression.Store
            ? entry.data
            : deflateRaw(entry.data, entry.name);
        checked32(compressedData.length, 'Compressed ZIP entry size');
        prepared.push({
            name: Buffer.from(entry.name, 'utf8'),
            compressedData,
            compression: entry.compression,
            crc,
            uncompressedSize,
            localHeaderOffset: 0,
        });
    }

    // 整包内存组装（与 C++ 语义等价：超限不落盘；≤512MB 上限内无压力）
    const chunks: Buffer[] = [];
    let position = 0;

    for (const entry of prepared) {
        entry.localHeaderOffset = checked32(position, 'ZIP local header offset');
        const nameLength = checked16(entry.name.length, 'ZIP entry name');
        const compressedSize = checked32(entry.compressedData.length, 'Compressed ZIP entry size');

        const header = Buffer.alloc(kLocalHeaderSize);
        header.writeUInt32LE(kLocalHeaderSignature, 0);
        header.writeUInt16LE(20, 4); // version needed
        header.writeUInt16LE(kUtf8Flag, 6);
        header.writeUInt16LE(entry.compression, 8);
        header.writeUInt16LE(0, 10); // mod time
        header.writeUInt16LE(0, 12); // mod date
        header.writeUInt32LE(entry.crc, 14);
        header.writeUInt32LE(compressedSize, 18);
        header.writeUInt32LE(entry.uncompressedSize, 22);
        header.writeUInt16LE(nameLength, 26);
        header.writeUInt16LE(0, 28); // extra length
        chunks.push(header, entry.name, entry.compressedData);
        position += kLocalHeaderSize + nameLength + entry.compressedData.length;
    }

    const centralOffset = checked32(position, 'ZIP central directory offset');

    for (const entry of prepared) {
        const nameLength = checked16(entry.name.length, 'ZIP entry name');
        const compressedSize = checked32(entry.compressedData.length, 'Compressed ZIP entry size');

        const header = Buffer.alloc(kCentralHeaderSize);
        header.writeUInt32LE(kCentralHeaderSignature, 0);
        header.writeUInt16LE(20, 4); // version made by
        header.writeUInt16LE(20, 6); // version needed
        header.writeUInt16LE(kUtf8Flag, 8);
        header.writeUInt16LE(entry.compression, 10);
        header.writeUInt16LE(0, 12); // mod time
        header.writeUInt16LE(0, 14); // mod date
        header.writeUInt32LE(entry.crc, 16);
        header.writeUInt32LE(compressedSize, 20);
        header.writeUInt32LE(entry.uncompressedSize, 24);
        header.writeUInt16LE(nameLength, 28);
        header.writeUInt16LE(0, 30); // extra length
        header.writeUInt16LE(0, 32); // comment length
        header.writeUInt16LE(0, 34); // disk number start
        header.writeUInt16LE(0, 36); // internal attrs
        header.writeUInt32LE(0, 38); // external attrs
        header.writeUInt32LE(entry.localHeaderOffset, 42);
        chunks.push(header, entry.name);
        position += kCentralHeaderSize + nameLength;
    }

    const centralSize = checked32(position - centralOffset, 'ZIP central directory size');
    const entryCount = checked16(prepared.length, 'ZIP entry count');

    const eocd = Buffer.alloc(kEndOfCentralDirectorySize);
    eocd.writeUInt32LE(kEndOfCentralDirectorySignature, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // central disk
    eocd.writeUInt16LE(entryCount, 8);
    eocd.writeUInt16LE(entryCount, 10);
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralOffset, 16);
    eocd.writeUInt16LE(0, 20); // comment length
    chunks.push(eocd);

    const total = Buffer.concat(chunks);
    if (total.length > lim.maxArchiveBytes) {
        limit('ZIP archive exceeds the configured size limit');
    }
    try {
        writeFileSync(path, total);
    } catch {
        throw new ZipError(ZipErrorCode.IoError, 'Cannot create ZIP archive: ' + path);
    }
}
