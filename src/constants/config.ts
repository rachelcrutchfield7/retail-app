const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: supabaseKey,
  supabaseKey,
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  sentryDsn: process.env.SENTRY_DSN ?? '',
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  stripePaymentsEnabled: process.env.EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED === 'true',
} as const;

export function hasSupabaseConfig(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}
