import { config } from '../constants/config';

type LogLevel = 'debug' | 'info' | 'warning' | 'error';
type LogContext = Record<string, unknown>;

export type LogEntry = {
  level: LogLevel;
  message: string;
  context?: LogContext;
  createdAt: string;
};

const sensitiveKeyPattern = /(password|token|secret|email|phone|message|comment|details|latitude|longitude)/i;
const entries: LogEntry[] = [];

function redactContext(context?: LogContext): LogContext | undefined {
  if (!context) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[redacted]' : value,
    ])
  );
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const entry: LogEntry = {
    level,
    message,
    context: redactContext(context),
    createdAt: new Date().toISOString(),
  };

  entries.push(entry);

  if (config.appEnv !== 'production' && level !== 'debug') {
    const method = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
    method(`[ReTail ${level}] ${message}`, entry.context ?? {});
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warning: (message: string, context?: LogContext) => write('warning', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};

export function getLogEntries(): LogEntry[] {
  return [...entries];
}
