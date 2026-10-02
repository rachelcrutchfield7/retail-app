import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const approvedSupabaseProjectRef = 'ycwgsdigvpmprqreoqiz';
const approvedSupabaseUrl = `https://${approvedSupabaseProjectRef}.supabase.co`;
const approvedPaymentsTestSupabaseProjectRef = 'jqzaxzylijbwjdzoqsen';
const approvedPaymentsTestSupabaseUrl = `https://${approvedPaymentsTestSupabaseProjectRef}.supabase.co`;
const approvedPreviewSupabaseUrls = new Set([approvedSupabaseUrl, approvedPaymentsTestSupabaseUrl]);
const approvedPreviewSupabaseHosts = new Set([
  `${approvedSupabaseProjectRef}.supabase.co`,
  `${approvedPaymentsTestSupabaseProjectRef}.supabase.co`,
]);
const publicWebsiteHost = 'retailpetapp.com';
const localHostPattern = /(^|\.)localhost$|^127\.|^0\.0\.0\.0$|^10\.0\.2\.2$/;
const placeholderUrlPattern = /example\.supabase\.co/i;
const unsafePublicKeyPatterns = [
  'service_role',
  ['sb', 'secret'].join('_'),
  'supabase_admin',
  'postgresql://',
  'postgres://',
  'jwt_secret',
  'database_password',
  'database_url',
];

export function validateBetaBuildConfig(env = process.env) {
  const failures = [];
  const warnings = [];
  const appEnv = env.EXPO_PUBLIC_APP_ENV ?? '';
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const publicKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const stripePublishableKey = env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  const stripePaymentsEnabled =
    isEnabledEnvFlag(env.EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED) ||
    isEnabledEnvFlag(env.EXPO_PUBLIC_ENABLE_STRIPE_CHECKOUT);
  const stripePublishableKeyMode = getStripePublishableMode(stripePublishableKey);
  const urlResult = validateSupabaseUrl(supabaseUrl);
  const keyResult = validatePublicKey(publicKey);

  if (!appEnv) {
    failures.push('App environment is missing.');
  } else if (appEnv !== appEnv.trim()) {
    failures.push('App environment has leading or trailing whitespace.');
  } else if (appEnv !== 'beta') {
    failures.push('App environment is not beta.');
  }

  if (!urlResult.ok) {
    failures.push(...urlResult.failures);
  }

  if (!keyResult.ok) {
    failures.push(...keyResult.failures);
  }

  const normalizedSupabaseUrl = supabaseUrl.trim().toLowerCase();

  if (stripePaymentsEnabled) {
    if (normalizedSupabaseUrl !== approvedPaymentsTestSupabaseUrl) {
      failures.push(
        'Beta builds with Stripe payments enabled must use the approved ReTail payments test Supabase project URL.'
      );
    }

    if (stripePublishableKeyMode !== 'test') {
      failures.push('Beta builds with Stripe payments enabled must use a Stripe test publishable key.');
    }
  } else if (normalizedSupabaseUrl !== approvedSupabaseUrl) {
    failures.push(
      'Beta builds with Stripe payments disabled must use the approved ReTail production Supabase project URL.'
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    checks: {
      appEnvironmentIsBeta: appEnv === 'beta',
      supabaseUrlPresent: Boolean(supabaseUrl),
      supabaseUrlIsHttps: urlResult.isHttps,
      supabaseProjectMatches: urlResult.projectMatches,
      supabasePublicKeyPresent: Boolean(publicKey),
      supabasePublicKeyAccepted: keyResult.ok,
      stripePaymentsEnabled,
      stripePublishableKeyMode,
    },
  };
}

export function shouldRunBetaBuildGate(env = process.env, args = process.argv.slice(2)) {
  return args.includes('--profile-preview') || env.EAS_BUILD_PROFILE === 'preview' || env.EXPO_PUBLIC_APP_ENV === 'beta';
}

function validateSupabaseUrl(value) {
  const failures = [];
  let parsed = null;
  let isHttps = false;
  let projectMatches = false;

  if (!value) {
    failures.push('Supabase URL is missing.');
    return { ok: false, failures, isHttps, projectMatches };
  }

  if (value !== value.trim()) {
    failures.push('Supabase URL has leading or trailing whitespace.');
  }

  if (/[\r\n]/.test(value)) {
    failures.push('Supabase URL contains a newline.');
  }

  try {
    parsed = new URL(value.trim());
    isHttps = parsed.protocol === 'https:';
  } catch {
    failures.push('Supabase URL is malformed.');
  }

  const normalized = value.trim().toLowerCase();

  if (parsed) {
    const host = parsed.hostname.toLowerCase();
    projectMatches = approvedPreviewSupabaseUrls.has(normalized);

    if (!isHttps) {
      failures.push('Supabase URL must use HTTPS.');
    }

    if (localHostPattern.test(host)) {
      failures.push('Supabase URL cannot use a local address.');
    }

    if (host === publicWebsiteHost || host === `www.${publicWebsiteHost}`) {
      failures.push('Supabase URL cannot use the public ReTail website domain.');
    }

    if (!approvedPreviewSupabaseHosts.has(host)) {
      failures.push('Supabase project does not match the approved project.');
    }
  }

  if (placeholderUrlPattern.test(normalized)) {
    failures.push('Supabase URL cannot use placeholder text.');
  }

  if (!approvedPreviewSupabaseUrls.has(normalized)) {
    failures.push('Supabase URL must exactly match the approved Supabase project URL.');
    projectMatches = false;
  }

  return { ok: failures.length === 0, failures, isHttps, projectMatches };
}

function validatePublicKey(value) {
  const failures = [];

  if (!value) {
    failures.push('Supabase public key is missing.');
    return { ok: false, failures };
  }

  if (value !== value.trim()) {
    failures.push('Supabase public key has leading or trailing whitespace.');
  }

  if (/[\r\n]/.test(value)) {
    failures.push('Supabase public key contains a newline.');
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.includes('placeholder') || normalized.includes('ci-placeholder') || normalized === 'public-anon-key') {
    failures.push('Supabase public key cannot use placeholder text.');
  }

  if (unsafePublicKeyPatterns.some((pattern) => normalized.includes(pattern))) {
    failures.push('Supabase public key appears to be a server-only credential.');
  }

  return { ok: failures.length === 0, failures };
}

function isEnabledEnvFlag(value) {
  return value?.trim().toLowerCase() === 'true';
}

function getStripePublishableMode(value) {
  const normalized = value.trim();

  if (!normalized) {
    return 'missing';
  }

  if (normalized.startsWith('pk_test_')) {
    return 'test';
  }

  if (normalized.startsWith('pk_live_')) {
    return 'live';
  }

  return 'unknown';
}

function printSafeResult(result) {
  console.info(`Supabase URL present: ${result.checks.supabaseUrlPresent ? 'yes' : 'no'}`);
  console.info(`Supabase URL is HTTPS: ${result.checks.supabaseUrlIsHttps ? 'yes' : 'no'}`);
  console.info(`Supabase project matches: ${result.checks.supabaseProjectMatches ? 'yes' : 'no'}`);
  console.info(`Supabase public key present: ${result.checks.supabasePublicKeyPresent ? 'yes' : 'no'}`);
  console.info(`Supabase public key accepted: ${result.checks.supabasePublicKeyAccepted ? 'yes' : 'no'}`);
  console.info(`App environment is beta: ${result.checks.appEnvironmentIsBeta ? 'yes' : 'no'}`);
  console.info(`Stripe payments enabled: ${result.checks.stripePaymentsEnabled ? 'yes' : 'no'}`);
  console.info(`Stripe publishable key mode: ${result.checks.stripePublishableKeyMode}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!shouldRunBetaBuildGate()) {
    console.info('Beta build configuration gate skipped for non-preview build.');
    process.exit(0);
  }

  const result = validateBetaBuildConfig();
  printSafeResult(result);

  if (!result.ok) {
    console.error(`Beta build configuration failed: ${result.failures[0]}`);
    process.exit(1);
  }

  console.info('Beta build configuration gate passed.');
}
