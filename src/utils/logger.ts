/**
 * Structured Logger
 *
 * Provides structured logging with levels, timestamps, and request tracing.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  traceId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private traceId: string | null = null;

  constructor(minLevel: LogLevel = "info") {
    this.minLevel = minLevel;
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Get current minimum log level
   */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * Set the current trace ID for request correlation
   */
  setTraceId(traceId: string | null): void {
    this.traceId = traceId;
  }

  /**
   * Get the current trace ID
   */
  getTraceId(): string | null {
    return this.traceId;
  }

  /**
   * Generate a new trace ID
   */
  generateTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Create a child logger with a specific trace ID
   */
  child(traceId: string): ChildLogger {
    return new ChildLogger(this, traceId);
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  /**
   * Log at error level
   */
  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    const fullContext: LogContext = { ...context };
    if (this.traceId) {
      fullContext.traceId = this.traceId;
    }
    if (Object.keys(fullContext).length > 0) {
      entry.context = fullContext;
    }

    this.output(entry);
  }

  /**
   * Output the log entry
   */
  private output(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const contextStr = entry.context
      ? ` ${JSON.stringify(entry.context)}`
      : "";

    const logLine = `${prefix} ${entry.message}${contextStr}`;

    switch (entry.level) {
      case "debug":
      case "info":
        console.log(logLine);
        break;
      case "warn":
        console.warn(logLine);
        break;
      case "error":
        console.error(logLine);
        break;
    }
  }
}

/**
 * Child logger bound to a specific trace ID
 */
class ChildLogger {
  constructor(
    private readonly parent: Logger,
    private readonly traceId: string
  ) {}

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, { ...context, traceId: this.traceId });
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, { ...context, traceId: this.traceId });
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, { ...context, traceId: this.traceId });
  }

  error(message: string, context?: LogContext): void {
    this.parent.error(message, { ...context, traceId: this.traceId });
  }
}

// Singleton logger instance
const logLevel = (process.env["LOG_LEVEL"] as LogLevel) ?? "info";
export const logger = new Logger(logLevel);

export { Logger, ChildLogger };
