const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const config = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey,
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? '',
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  stripePaymentsEnabled: process.env.EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED === 'true',
} as const;

export function hasSupabaseConfig(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey && isClientSafeSupabaseKey(config.supabaseAnonKey));
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
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return ![
    'service_role',
    ['sb_', 'secret_'].join(''),
    'supabase_admin',
    'postgresql://',
    'postgres://',
    'jwt_secret',
    'database_password',
  ].some((blockedPattern) => normalized.includes(blockedPattern));
}
