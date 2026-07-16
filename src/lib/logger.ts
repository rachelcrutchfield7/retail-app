import { config } from '../constants/config';

type LogLevel = 'debug' | 'info' | 'warning' | 'error';
type LogContext = Record<string, unknown>;

export type LogEntry = {
  level: LogLevel;
  message: string;
  context?: LogContext;
  createdAt: string;
};

const sensitiveKeyPattern = /(address|auth|body|comment|credential|detail|email|jwt|latitude|longitude|message|password|phone|secret|token)/i;
const sensitiveStringPattern = /(sb_secret_[A-Za-z0-9_-]+|service[_-]?role|sk_(live|test)_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;
const entries: LogEntry[] = [];

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sensitiveStringPattern.test(value) ? '[redacted]' : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    return redactContext(value as LogContext);
  }

  return value;
}

export function redactContext(context?: LogContext): LogContext | undefined {
  if (!context) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[redacted]' : redactValue(value),
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
