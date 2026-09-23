// 极简 stderr 日志：服务不写文件，级别由环境变量 MMD2VSDX_LOG 控制
export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

const kOrder: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };

export interface Logger {
    error(message: string): void;
    info(message: string): void;
    debug(message: string): void;
}

/** 解析日志级别；认不出来就返回 null，由调用方决定报错还是取默认值。 */
export function parseLogLevel(raw: string | undefined): LogLevel | null {
    if (raw === undefined || raw.trim() === '') return null;
    const v = raw.trim().toLowerCase();
    return v === 'silent' || v === 'error' || v === 'info' || v === 'debug' ? v : null;
}

export function createLogger(level: LogLevel): Logger {
    const write = (tag: string, min: LogLevel, message: string): void => {
        if (kOrder[level] < kOrder[min]) return;
        process.stderr.write(`[mmd2vsdx] ${tag} ${message}\n`);
    };
    return {
        error: (m) => write('error', 'error', m),
        info: (m) => write('info', 'info', m),
        debug: (m) => write('debug', 'debug', m),
    };
}
