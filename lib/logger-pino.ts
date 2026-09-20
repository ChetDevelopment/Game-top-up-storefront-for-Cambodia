const isDev = process.env.NODE_ENV === "development";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

interface LogEntry {
  level: LogLevel;
  time: string;
  msg: string;
  reqId?: string;
  module?: string;
  error?: string;
  stack?: string;
  [key: string]: unknown;
}

class StructuredLogger {
  private minLevel: number;

  private static readonly LEVELS: Record<LogLevel, number> = {
    fatal: 60,
    error: 50,
    warn: 40,
    info: 30,
    debug: 20,
    trace: 10,
  };

  constructor(level: LogLevel = "info") {
    this.minLevel = StructuredLogger.LEVELS[level];
  }

  private shouldLog(level: LogLevel): boolean {
    return (StructuredLogger.LEVELS[level] ?? 100) >= this.minLevel;
  }

  private emit(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;
    if (isDev) {
      const prefix =
        entry.level === "error" ? "\x1b[31m" :
        entry.level === "warn" ? "\x1b[33m" :
        entry.level === "info" ? "\x1b[36m" :
        entry.level === "debug" ? "\x1b[90m" : "";
      const reset = "\x1b[0m";
      const tag = entry.module ? `[${entry.module}]` : "";
      console.log(`${prefix}[${entry.level.toUpperCase()}]${reset} ${tag} ${entry.msg}${entry.error ? ` error=${entry.error}` : ""}${entry.reqId ? ` reqId=${entry.reqId}` : ""}`);
      return;
    }
    console.log(JSON.stringify(entry));
  }

  fatal(msg: string, ctx?: Record<string, unknown>): void {
    this.emit({ level: "fatal", time: new Date().toISOString(), msg, ...ctx });
  }

  error(msg: string, ctx?: Record<string, unknown>): void {
    this.emit({ level: "error", time: new Date().toISOString(), msg, ...ctx });
  }

  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.emit({ level: "warn", time: new Date().toISOString(), msg, ...ctx });
  }

  info(msg: string, ctx?: Record<string, unknown>): void {
    this.emit({ level: "info", time: new Date().toISOString(), msg, ...ctx });
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.emit({ level: "debug", time: new Date().toISOString(), msg, ...ctx });
  }

  child(module: string): StructuredLogger {
    const child = new StructuredLogger(
      Object.keys(StructuredLogger.LEVELS).find(
        (k) => StructuredLogger.LEVELS[k as LogLevel] === this.minLevel
      ) as LogLevel ?? "info"
    );
    child.emit = (entry) => this.emit({ ...entry, module });
    return child;
  }
}

const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isDev ? "debug" : "info");
export const logger = new StructuredLogger(logLevel);

export function createModuleLogger(module: string): StructuredLogger {
  return logger.child(module);
}
