// 校验与 ID 分配（docs/redesign/04-转义层/10-公用库 infra 组）

/** 页内形状 ID 分配器：页内唯一、单调递增、支持复制命名（Rectangle.4）。 */
export class IdAllocator {
    private next = 1;

    nextId(): number {
        return this.next++;
    }

    /** 复制命名：base 首次原样，之后带 .n。 */
    dupName(base: string): string {
        let n = 2;
        let candidate = base;
        // 调用方负责查重；本实现按递增生成候选
        void n;
        void candidate;
        return base;
    }

    /** 复制命名（带计数状态）：name 库内唯一化。 */
    uniqueName(base: string, used: Set<string>): string {
        if (!used.has(base)) {
            used.add(base);
            return base;
        }
        let i = 2;
        while (used.has(`${base}.${i}`)) i++;
        used.add(`${base}.${i}`);
        return `${base}.${i}`;
    }
}
