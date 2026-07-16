type RuntimeEnv = Record<string, string | undefined>;

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
