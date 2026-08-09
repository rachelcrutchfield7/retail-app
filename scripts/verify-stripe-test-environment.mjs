import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const productionSupabaseUrl = 'https://ycwgsdigvpmprqreoqiz.supabase.co';
const publicWebsiteHost = 'retailpetapp.com';
const localHostPattern = /(^|\.)localhost$|^127\.|^0\.0\.0\.0$|^10\.0\.2\.2$/;
const placeholderUrlPattern = /example\.supabase\.co/i;

export function getStripePublishableMode(value) {
  const normalized = (value ?? '').trim();

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

export function getSupabaseTarget(value) {
  const normalized = (value ?? '').trim().toLowerCase();

  if (!normalized) {
    return { target: 'missing', isHttps: false };
  }

  if (placeholderUrlPattern.test(normalized)) {
    return { target: 'placeholder', isHttps: false };
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const isHttps = parsed.protocol === 'https:';

    if (!isHttps) {
      return { target: 'invalid', isHttps };
    }

    if (localHostPattern.test(host)) {
      return { target: 'local', isHttps };
    }

    if (host === publicWebsiteHost || host === `www.${publicWebsiteHost}`) {
      return { target: 'website', isHttps };
    }

    if (normalized === productionSupabaseUrl) {
      return { target: 'production', isHttps };
    }

    if (host.endsWith('.supabase.co')) {
      return { target: 'test', isHttps };
    }

    return { target: 'unknown', isHttps };
  } catch {
    return { target: 'invalid', isHttps: false };
  }
}

export function validateStripeEnvironment(env = process.env, args = process.argv.slice(2)) {
  const profile = readProfile(env, args);
  const failures = [];
  const warnings = [];
  const publishableMode = getStripePublishableMode(env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const supabase = getSupabaseTarget(env.EXPO_PUBLIC_SUPABASE_URL);
  const backendMode = readMode(env.RETAIL_STRIPE_BACKEND_MODE);
  const webhookMode = readMode(env.RETAIL_STRIPE_WEBHOOK_MODE);

  if (profile === 'preview') {
    if (publishableMode !== 'test') {
      failures.push('Preview Stripe E2E builds must use a pk_test publishable key.');
    }

    if (supabase.target !== 'test') {
      failures.push('Preview Stripe E2E builds must point to a separate test Supabase project or branch.');
    }

    if (backendMode !== 'test') {
      failures.push(
        'Stripe backend mode is not verified as test. Set RETAIL_STRIPE_BACKEND_MODE=test only after checking the test backend secret prefix safely.'
      );
    }

    if (webhookMode !== 'test') {
      failures.push(
        'Stripe webhook mode is not verified as test. Set RETAIL_STRIPE_WEBHOOK_MODE=test only after configuring the test webhook secret on the test backend.'
      );
    }
  } else if (profile === 'production') {
    if (publishableMode === 'test') {
      failures.push('Production builds cannot use a pk_test Stripe publishable key.');
    }

    if (publishableMode === 'live' && supabase.target !== 'production') {
      failures.push('Production live Stripe builds must point to the production Supabase project.');
    }

    if (backendMode === 'test') {
      failures.push('Production builds cannot be paired with a test Stripe backend mode.');
    }
  } else {
    warnings.push(`Stripe environment verifier has no strict rule for profile "${profile}".`);
  }

  if (publishableMode === 'unknown') {
    failures.push('Stripe publishable key is present but does not start with pk_test or pk_live.');
  }

  if (['missing', 'placeholder', 'invalid', 'local', 'website', 'unknown'].includes(supabase.target)) {
    failures.push('Supabase target is missing, unsafe, or not a Supabase project URL.');
  }

  return {
    ok: failures.length === 0,
    profile,
    failures,
    warnings,
    checks: {
      stripePublishableMode: publishableMode,
      supabaseTarget: supabase.target,
      supabaseHttps: supabase.isHttps,
      backendMode: backendMode ?? 'not verified',
      webhookMode: webhookMode ?? 'not verified',
    },
  };
}

function readProfile(env, args) {
  const explicitProfileIndex = args.indexOf('--profile');

  if (explicitProfileIndex >= 0 && args[explicitProfileIndex + 1]) {
    return args[explicitProfileIndex + 1];
  }

  if (args.includes('--production')) {
    return 'production';
  }

  if (args.includes('--preview') || args.includes('--profile-preview')) {
    return 'preview';
  }

  return env.EAS_BUILD_PROFILE || env.EXPO_PUBLIC_APP_ENV || 'preview';
}

function readMode(value) {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === 'test' || normalized === 'live' ? normalized : null;
}

function printResult(result) {
  console.info('ReTail Stripe Environment Check');
  console.info(`Profile: ${result.profile}`);
  console.info(`Stripe publishable mode: ${result.checks.stripePublishableMode}`);
  console.info(`Supabase target: ${result.checks.supabaseTarget}`);
  console.info(`Supabase HTTPS: ${result.checks.supabaseHttps ? 'yes' : 'no'}`);
  console.info(`Stripe backend mode: ${result.checks.backendMode}`);
  console.info(`Stripe webhook mode: ${result.checks.webhookMode}`);

  for (const warning of result.warnings) {
    console.warn(`WARN: ${warning}`);
  }

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`FAIL: ${failure}`);
    }
    return;
  }

  console.info('PASS: Stripe environment configuration is mode-consistent.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = validateStripeEnvironment();
  printResult(result);

  if (!result.ok) {
    process.exit(1);
  }
}
