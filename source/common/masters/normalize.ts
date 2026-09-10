// 母版组：内容规范化（docs/开发过程/01-结构设计.md）
//
// 设计定位：资产内容在装配时可按图型需要做幂等修正（连接线 1-D 身份、
// 生命线行规模等）。当前资产原样可用，本组先提供幂等通道与登记。

/** 连接线母版规范化：现为幂等通道（资产内容已含 1-D 身份）。 */
export function normalizeConnectorMaster(xml: string): string {
    return xml;
}

/** 生命线母版规范化：现为幂等通道。 */
export function normalizeLifelineMaster(xml: string): string {
    return xml;
}
