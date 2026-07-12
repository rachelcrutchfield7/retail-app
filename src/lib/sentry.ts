type CapturedError = {
  error: unknown;
  context?: Record<string, unknown>;
  createdAt: string;
};

const capturedErrors: CapturedError[] = [];

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  capturedErrors.push({ error, context, createdAt: new Date().toISOString() });
}

export function getCapturedErrors(): CapturedError[] {
  return [...capturedErrors];
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  captureError(new Error(message), context);
}
