type RuntimeEnv = Record<string, string | undefined>;
export type AppEnvironment = 'development' | 'beta' | 'production' | 'test';

const unsafePublicSupabasePatterns = [
  'service_role',
  ['sb_', 'secret_'].join(''),
  'supabase_admin',
  'postgresql://',
  'postgres://',
  'jwt_secret',
  'database_password',
  'database_url',
];

const supportedAppEnvironments = new Set<AppEnvironment>(['development', 'beta', 'production', 'test']);
const releaseLikeAppEnvironments = new Set<AppEnvironment>(['beta', 'production']);
const localUrlPattern = /(^|\.)localhost$|^127\.|^0\.0\.0\.0$|^10\.0\.2\.2$/;
const placeholderUrlPattern = /example\.supabase\.co/i;

export function readConfigFromEnv(env: RuntimeEnv = process.env) {
  return {
    appEnv: env.EXPO_PUBLIC_APP_ENV ?? 'development',
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    googleMapsApiKey: env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    posthogKey: env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
    sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    stripePublishableKey: env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    stripePaymentsEnabled: env.EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED === 'true',
  } as const;
}

export const config = readConfigFromEnv();

export function hasSupabaseConfig(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey && isClientSafeSupabaseKey(config.supabaseAnonKey));
}

export function hasSupabaseConfigFromEnv(env: RuntimeEnv): boolean {
  const runtimeConfig = readConfigFromEnv(env);
  return Boolean(
    runtimeConfig.supabaseUrl &&
    runtimeConfig.supabaseAnonKey &&
    isClientSafeSupabaseKey(runtimeConfig.supabaseAnonKey)
  );
}

export function getMissingRequiredConfig(): string[] {
  const missing: string[] = [];

  if (!config.supabaseUrl) {
    missing.push('EXPO_PUBLIC_SUPABASE_URL');
  }

  if (!config.supabaseAnonKey) {
    missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  return missing;
}

export function isSupportedAppEnvironment(value: string): value is AppEnvironment {
  return supportedAppEnvironments.has(value as AppEnvironment);
}

export function isReleaseLikeEnvironment(value: string = config.appEnv): boolean {
  return isSupportedAppEnvironment(value) && releaseLikeAppEnvironments.has(value);
}

export function getAppEnvironmentLabel(value: string = config.appEnv): string {
  if (value === 'beta') {
    return 'Private Beta';
  }

  if (value === 'production') {
    return 'Production';
  }

  if (value === 'test') {
    return 'Test';
  }

  if (value === 'development') {
    return 'Development';
  }

  return 'Unsupported Environment';
}

export function getEnvironmentValidationError(env: RuntimeEnv = process.env): string | null {
  const runtimeConfig = readConfigFromEnv(env);

  if (!isSupportedAppEnvironment(runtimeConfig.appEnv)) {
    return `Unsupported app environment: ${runtimeConfig.appEnv}`;
  }

  if (isReleaseLikeEnvironment(runtimeConfig.appEnv)) {
    if (isLocalOrPlaceholderUrl(runtimeConfig.supabaseUrl)) {
      return 'Release builds cannot use local or placeholder Supabase URLs.';
    }

    if (runtimeConfig.supabaseAnonKey.includes('ci-placeholder')) {
      return 'Release builds cannot use CI placeholder Supabase credentials.';
    }
  }

  return null;
}

export function isClientSafeSupabaseKey(value: string): boolean {
  return getUnsafePublicSupabaseCredentialReason(value) === null;
}

export function getUnsafePublicSupabaseCredentialReason(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return 'missing';
  }

  if (unsafePublicSupabasePatterns.some((blockedPattern) => normalized.includes(blockedPattern))) {
    return 'server-only Supabase credential';
  }

  return null;
}

function isLocalOrPlaceholderUrl(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  if (placeholderUrlPattern.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return localUrlPattern.test(parsed.hostname);
  } catch {
    return true;
  }
}
