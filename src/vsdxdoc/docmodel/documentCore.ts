// mmd2vsdx - vsdxdoc/docmodel：documentCore（装配态核心）
//
// C++ docmodel/render_internal.hpp 平移（DocumentCore 部分）。
// TS 差异（05 §1.3/§5.4）：
//   - 节点即对象引用：documentXml/pagesXml 以根 XmlNode 持有；
//   - 页面部件 addPage 即写包（空壳树），build 期按 dirtyPages 选择性回刷
//     （xmlPartsBuilder flush；单程 translate 下全脏 = 全量回刷）；
//   - uniquePageName/nextPagePartUri/markPageDirty 语义照抄。
// 环约束：与 model.ts 互引必须保持 import type（编译期擦除、运行时零边），
// 任一侧改值导入即构成运行时环（TDZ/初始化序风险），禁止。

import type { XmlNode } from '../../xml/xmlNode.js';
import type { Package } from '../../opcpkg/package.js';
import { PartUri } from '../../opcpkg/partUri.js';
import type { CreateOptions } from '../../core/vsdx.js';
import { kVisioNamespace, kDocumentUri, kPagesUri } from '../../xml/constants.js';
import type { MasterClient } from '../masters/masterClient.js';
import { masterlessClient } from '../masters/masterClient.js';
import type { PageModel } from './model.js';

export type { PageId } from '../../core/vsdx.js';

export class DocumentCore {
    package: Package;
    options: CreateOptions;
    /** 母版查询客户端（装配期设定：useConnectorMaster=false → masterless）。 */
    masterClient: MasterClient = masterlessClient;
    visioNamespace: string = kVisioNamespace;
    documentUri: PartUri = PartUri.parse(kDocumentUri);
    pagesUri: PartUri = PartUri.parse(kPagesUri);
    /** document.xml 根元素（VisioDocument）。 */
    documentRoot: XmlNode | null = null;
    /** pages.xml 根元素（Pages）。 */
    pagesRoot: XmlNode | null = null;
    dirtyPages: Set<number> = new Set();
    pages: PageModel[] = [];
    nextPageId = 0;
    needsRecalculation = false;
    documentXmlDirty = true;
    pagesXmlDirty = true;
    pagesRelsDirty = false;

    constructor(package_: Package, options: CreateOptions) {
        this.package = package_;
        this.options = options;
    }

    page(id: number): PageModel {
        const found = this.pages.find((item) => item.id === id);
        if (!found) throw new RangeError('VSDX page not found');
        return found;
    }

    /** 页面名唯一化（C++ uniquePageName：空名→"Page"，冲突加 ".N" 后缀）。 */
    uniquePageName(requested: string, except?: number): string {
        let name = requested;
        if (name.length === 0) name = 'Page';
        const exists = (value: string) =>
            this.pages.some((p) => (except === undefined || p.id !== except) && p.name === value);
        if (!exists(name)) return name;
        for (let suffix = 2; ; suffix++) {
            const candidate = name + '.' + suffix;
            if (!exists(candidate)) return candidate;
        }
    }

    /** 下一个空闲页面部件 URI（visio/pages/pageN.xml）。 */
    nextPagePartUri(): PartUri {
        for (let index = 1; ; index++) {
            const uri = PartUri.parse('visio/pages/page' + index + '.xml');
            if (!this.package.contains(uri)) return uri;
        }
    }

    markPageDirty(id: number): void {
        this.dirtyPages.add(id);
    }
}
