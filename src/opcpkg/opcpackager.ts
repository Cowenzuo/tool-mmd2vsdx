// mmd2vsdx - opcpkg：opcpackager（模块门面）
//
// C++ opcpkg/opcpackager.{hpp,cpp} 平移。
// pack：XmlParts（vsdxdoc 输出）→ Package.create → 逐部件 addPart
// （PartUri.parse + contentType + UTF-8 payload，默认 Deflate）→ save。
// open：转 Package.open（测试/读取链用）。

import { Package } from './package.js';
import { PartUri } from './partUri.js';
import type { ZipLimits } from './zipArchive.js';
import type { XmlParts } from '../core/xmlparts.js';

export class OpcPackager {
    /** XmlParts 进 -> OPC 规范化 + ZIP -> .vsdx 文件。 */
    static pack(xmlParts: XmlParts, path: string): void {
        const package_ = Package.create();
        for (const part of xmlParts.parts) {
            package_.addPart(
                PartUri.parse(part.uri),
                part.contentType,
                Buffer.from(part.xml, 'utf8'),
            );
        }
        package_.save(path);
    }

    /** 读取已有 .vsdx -> Package 容器。 */
    static open(path: string, limits?: ZipLimits): Package {
        return Package.open(path, limits);
    }
}
