// 请求排队：渲染是串行的，这里管等待队列与上限（到顶回 429）
// 上限语义与 /health 的 queue、maxQueue 一致，见 docs/接口协议.md 第 7 节
import { ServiceError } from '../service/errors.js';

class QueueFullError extends ServiceError {
    constructor(max: number) {
        super('queue_full', `排队请求已达上限 ${max} 个`, '退避后重试；不要并发轰炸，服务内部本来就串行');
    }
}

export class RenderQueue {
    private tail: Promise<void> = Promise.resolve();
    private waiting = 0;
    private running = 0;

    constructor(private readonly max: number) {}

    /** 排队中的请求数。 */
    get depth(): number {
        return this.waiting;
    }

    /** 正在渲染的请求数，取值 0 或 1。 */
    get inFlight(): number {
        return this.running;
    }

    get maxDepth(): number {
        return this.max;
    }

    /** 入队执行；队列满时立刻抛 QueueFullError。 */
    async run<T>(task: () => Promise<T>): Promise<T> {
        if (this.waiting >= this.max) throw new QueueFullError(this.max);
        this.waiting++;
        const prev = this.tail;
        let release: () => void = () => undefined;
        this.tail = new Promise<void>((resolve) => {
            release = resolve;
        });
        try {
            await prev;
            this.waiting--;
            this.running = 1;
            return await task();
        } finally {
            this.running = 0;
            release();
        }
    }
}
