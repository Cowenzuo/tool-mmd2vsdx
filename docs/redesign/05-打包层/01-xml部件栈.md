# xml-parts（⑬ 部件栈）

## 1. 模块职能

xml-parts 是"契约 B 的收口与补全"：接收图型包产出的部件数组，补齐
公共部件（docProps 三件、[Content_Types].xml、包级/文档级关系表、
windows.xml），统一校验后交给压缩库。它只做装配与校验，不含画法。

## 2. 目录与文件

```
src/xml-parts/
├── index.ts        PartsAssembler.assemble(parts[]) → 契约B
├── docprops.ts     core/app/custom 属性部件
├── contentTypes.ts 登记表生成（Internal 条目不占 parts）
├── rels.ts         包级/文档级关系表生成
├── windows.ts      窗口现场部件
└── validate.ts     部件校验（uri 唯一、媒体类型、XML 可解析）
```

## 3. 类与职责

| 类 | 职责 | 关键方法 |
| --- | --- | --- |
| PartsAssembler | 编排补全与校验 | `assemble(parts): ContractB` |
| DocPropsWriter | 属性三件 | `write(options)` |
| RelsWriter | 关系表 | `writeDocumentRels(...)`、`writePackageRels(...)` |
| ContentTypesWriter | 登记表 | `write(parts)` |
| PartValidator | 校验 | `validate(b)` |

## 4. 关键函数表

| 函数名 | 输入 | 输出 | 作用描述 |
| --- | --- | --- | --- |
| assemble | 页面/母版部件 | 契约B | 补全五类公共部件、排序、校验 |
| buildContentTypes | 部件集 | XmlPart | Default rels/xml + 全部 Override |
| buildRelRoot | 部件集 | XmlPart | _rels/.rels（文档 + 属性三件） |
| buildDocRels | 部件集 | XmlPart | document.xml.rels（masters/pages/windows） |
| validateXml(text) | 部件文本 | 错误 | parseDocument 试解析 |

## 5. 边界与注意

- 本包不写任何页面形状、不碰母版资产；页面部件必须是合法契约 A 产物；
- 公共部件字段采用最小填写策略（docProps 只写 title/creator、custom
  带 RecalcDocument=true），依据 roadmap P-3 的归档结论；
- 待核：页面级 rels（page1.xml.rels）按需生成，见 c4-1 篇 W-4。
