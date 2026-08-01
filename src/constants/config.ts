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
const approvedSupabaseProjectRef = 'ycwgsdigvpmprqreoqiz';
const approvedSupabaseUrl = `https://${approvedSupabaseProjectRef}.supabase.co`;
const publicWebsiteHost = 'retailpetapp.com';
const localUrlPattern = /(^|\.)localhost$|^127\.|^0\.0\.0\.0$|^10\.0\.2\.2$/;
const placeholderUrlPattern = /example\.supabase\.co/i;

const bundledRuntimeEnv: RuntimeEnv = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: process.env.EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED,
  EXPO_PUBLIC_ENABLE_STRIPE_CHECKOUT: process.env.EXPO_PUBLIC_ENABLE_STRIPE_CHECKOUT,
  RETAIL_PLATFORM_FEE_PERCENT: process.env.RETAIL_PLATFORM_FEE_PERCENT,
  RETAIL_PLATFORM_MIN_FEE_CENTS: process.env.RETAIL_PLATFORM_MIN_FEE_CENTS,
  RETAIL_PLATFORM_FEE_THRESHOLD_CENTS: process.env.RETAIL_PLATFORM_FEE_THRESHOLD_CENTS,
};

export function readConfigFromEnv(env: RuntimeEnv) {
  return {
    appEnv: env.EXPO_PUBLIC_APP_ENV ?? 'development',
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    googleMapsApiKey: env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    posthogKey: env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
    sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    stripePublishableKey: env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    stripePaymentsEnabled:
      env.EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED === 'true' ||
      env.EXPO_PUBLIC_ENABLE_STRIPE_CHECKOUT === 'true',
    stripePlatformFeePercent: Number(env.RETAIL_PLATFORM_FEE_PERCENT ?? '10'),
    stripePlatformMinFeeCents: Number(env.RETAIL_PLATFORM_MIN_FEE_CENTS ?? '0'),
    stripePlatformFeeThresholdCents: Number(env.RETAIL_PLATFORM_FEE_THRESHOLD_CENTS ?? '500'),
  } as const;
}

export const config = readConfigFromEnv(bundledRuntimeEnv);

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

export function getEnvironmentValidationError(env: RuntimeEnv = bundledRuntimeEnv): string | null {
  const runtimeConfig = readConfigFromEnv(env);

  if (!isSupportedAppEnvironment(runtimeConfig.appEnv)) {
    return `Unsupported app environment: ${runtimeConfig.appEnv}`;
  }

  if (isReleaseLikeEnvironment(runtimeConfig.appEnv)) {
    if (isLocalOrPlaceholderUrl(runtimeConfig.supabaseUrl)) {
      return 'Release builds cannot use local or placeholder Supabase URLs.';
    }

    if (isPublicWebsiteUrl(runtimeConfig.supabaseUrl)) {
      return 'Release builds cannot use the public ReTail website domain as the Supabase API URL.';
    }

    if (runtimeConfig.supabaseUrl.trim().toLowerCase() !== approvedSupabaseUrl) {
      return 'Release builds must use the approved ReTail Supabase project URL.';
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

function isPublicWebsiteUrl(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === publicWebsiteHost || host === `www.${publicWebsiteHost}`;
  } catch {
    return false;
  }
}
