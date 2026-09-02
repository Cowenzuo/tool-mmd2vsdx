// mmd2vsdx - vsdxdoc：vsdxTranslator（模块门面）
//
// C++ vsdxtranslator.{hpp,cpp} 平移：translate(Diagram, options) =
// DiagramImporter.translate → XmlPartsBuilder.build。

import type { Diagram } from '../core/types.js';
import type { CreateOptions } from '../core/vsdx.js';
import type { XmlParts } from '../core/xmlparts.js';
import { translate as importerTranslate } from './translate/diagramImporter.js';
import { build as buildXmlParts } from './serialize/xmlPartsBuilder.js';

export function translate(diagram: Diagram, options?: Partial<CreateOptions>): XmlParts {
    const core = importerTranslate(diagram, options);
    return buildXmlParts(core);
}
