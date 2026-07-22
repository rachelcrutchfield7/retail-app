export type SafeDiagnostic = {
  id: string;
  name: string;
  message: string;
};

const credentialPatterns = [
  /\b(sb_publishable|sb_secret)_[A-Za-z0-9_-]+/gi,
  /\b(service[_-]?role|supabase_admin)\b/gi,
  /\b(sk_(live|test)_[A-Za-z0-9]+)\b/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /https:\/\/[a-z0-9-]+\.supabase\.co/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /\/(?:Users|var|private|tmp|home)\/[^\s)]+/gi,
];

export function sanitizeDiagnosticText(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? 'Unknown startup error');
  const redacted = credentialPatterns.reduce(
    (message, pattern) => message.replace(pattern, '[redacted]'),
    raw
  );

  return redacted.slice(0, 240);
}

export function createDiagnosticId(seed = `${Date.now()}-${Math.random()}`): string {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }

  return `RET-${Math.abs(hash).toString(36).padStart(6, '0').slice(0, 6).toUpperCase()}`;
}

export function createSafeDiagnostic(error: unknown, seed?: string): SafeDiagnostic {
  return {
    id: createDiagnosticId(seed),
    name: error instanceof Error ? error.name : 'StartupError',
    message: sanitizeDiagnosticText(error),
  };
}

export function shouldShowBetaDiagnostic(appEnv: string): boolean {
  return appEnv === 'beta';
}
