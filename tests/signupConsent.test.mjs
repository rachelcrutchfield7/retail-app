import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { signUpWithEmail } from '../src/services/authService.ts';
import {
  getCurrentConsentState,
  recordCurrentPolicyAcceptance,
  shouldFinalizePendingSignupConsent,
  updateMarketingEmailPreference,
} from '../src/services/consentService.ts';
import {
  CURRENT_COMMUNITY_GUIDELINES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../src/constants/policyVersions.ts';
import { signInWithGoogle } from '../src/services/googleAuthService.ts';
import { userFromSupabase } from '../src/services/supabaseData.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

function emailSignupDependencies(calls) {
  return {
    async signUp(input) {
      calls.push(input);
      return {
        data: {
          user: {
            id: 'new-email-user',
            email: input.email,
            user_metadata: input.options.data,
          },
          session: null,
        },
        error: null,
      };
    },
  };
}

test('email signup without required consent is blocked before Supabase signup', async () => {
  const calls = [];

  await assert.rejects(
    signUpWithEmail(
      'person@example.com',
      'Secure123!',
      'Person Name',
      'regular',
      'person_name',
      undefined,
      { termsAccepted: false, marketingEmailOptIn: false },
      emailSignupDependencies(calls)
    ),
    /Please agree to ReTail's Terms of Service and Community Guidelines/
  );

  assert.equal(calls.length, 0);
});

test('email signup records required acceptance and marketing false in pending metadata', async () => {
  const calls = [];

  await signUpWithEmail(
    'person@example.com',
    'Secure123!',
    'Person Name',
    'regular',
    'person_name',
    undefined,
    { termsAccepted: true, marketingEmailOptIn: false },
    emailSignupDependencies(calls)
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.data.retail_terms_accepted, true);
  assert.equal(calls[0].options.data.retail_community_guidelines_accepted, true);
  assert.equal(calls[0].options.data.retail_privacy_acknowledged, true);
  assert.equal(calls[0].options.data.retail_marketing_email_opt_in, false);
  assert.equal(calls[0].options.data.retail_consent_source, 'email_signup');
});

test('email signup preserves an explicit marketing opt-in', async () => {
  const calls = [];

  await signUpWithEmail(
    'marketing@example.com',
    'Secure123!',
    'Marketing Person',
    'regular',
    'marketing_person',
    undefined,
    { termsAccepted: true, marketingEmailOptIn: true },
    emailSignupDependencies(calls)
  );

  assert.equal(calls[0].options.data.retail_marketing_email_opt_in, true);
});

test('Google signup without required acceptance never initiates native Google auth', async () => {
  let nativeSignInCalls = 0;

  await assert.rejects(
    signInWithGoogle({
      platform: 'android',
      signupConsent: { termsAccepted: false, marketingEmailOptIn: false },
      googleClient: {
        configure() {},
        async hasPlayServices() { return true; },
        async signIn() { nativeSignInCalls += 1; return { type: 'cancelled' }; },
        async signOut() { return null; },
      },
    }),
    /Please agree to ReTail's Terms of Service and Community Guidelines/
  );

  assert.equal(nativeSignInCalls, 0);
});

test('successful Google signup records the selected consent before continuing', async () => {
  let recordedMarketingChoice = null;
  const profile = {
    id: 'google-signup-user',
    account_type: 'regular',
    display_name: 'Google Person',
    username: 'google_person',
    buyer_rating: 0,
    seller_rating: 0,
    review_count: 0,
    listings_count: 0,
    completed_sales_count: 0,
    is_verified: false,
    is_admin: false,
    is_banned: false,
    stripe_connect_charges_enabled: false,
    stripe_connect_payouts_enabled: false,
    stripe_connect_details_submitted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const session = await signInWithGoogle({
    platform: 'android',
    runtimeConfig: {
      googleSignInEnabled: true,
      googleSignInIosEnabled: false,
      googleWebClientId: 'web-client.apps.googleusercontent.com',
      googleAndroidClientId: 'android-client.apps.googleusercontent.com',
      googleIosClientId: '',
    },
    signupConsent: { termsAccepted: true, marketingEmailOptIn: true },
    googleClient: {
      configure() {},
      async hasPlayServices() { return true; },
      async signIn() { return { type: 'success', data: { idToken: 'google-token' } }; },
      async signOut() { return null; },
    },
    statusCodes: {},
    supabaseAuth: {
      async signInWithIdToken() {
        return {
          data: {
            session: {
              access_token: 'access-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: profile.id,
                email: 'google@example.com',
                user_metadata: { full_name: profile.display_name },
              },
            },
          },
          error: null,
        };
      },
    },
    async ensureProfile() { return { profile, created: true }; },
    async recordPolicyAcceptance(marketingEmailOptIn) {
      recordedMarketingChoice = marketingEmailOptIn;
    },
  });

  assert.equal(session?.requiresProfileSetup, true);
  assert.equal(recordedMarketingChoice, true);
});

test('current acceptance prevents a repeated consent gate', async () => {
  const state = await getCurrentConsentState({
    async rpc(name) {
      assert.equal(name, 'get_my_consent_state');
      return {
        data: [{
          has_current_policy_acceptance: true,
          terms_accepted: true,
          community_guidelines_accepted: true,
          privacy_acknowledged: true,
          marketing_email_opt_in: false,
        }],
        error: null,
      };
    },
  });

  assert.equal(state.hasCurrentPolicyAcceptance, true);
  assert.equal(state.marketingEmailOptIn, false);
});

test('new email user with required signup consent finalizes pending consent instead of showing redundant gate', async () => {
  const user = userFromSupabase({
    id: 'new-email-user',
    email: 'person@example.com',
    email_confirmed_at: new Date().toISOString(),
    user_metadata: {
      display_name: 'Person Name',
      username: 'person_name',
      account_type: 'regular',
      retail_policy_consent_pending: true,
      retail_terms_accepted: true,
      retail_terms_version: CURRENT_TERMS_VERSION,
      retail_community_guidelines_accepted: true,
      retail_community_guidelines_version: CURRENT_COMMUNITY_GUIDELINES_VERSION,
      retail_privacy_acknowledged: true,
      retail_privacy_version: CURRENT_PRIVACY_VERSION,
      retail_marketing_email_opt_in: false,
      retail_consent_source: 'email_signup',
    },
  });
  const missingDurableState = {
    hasCurrentPolicyAcceptance: false,
    termsAccepted: false,
    communityGuidelinesAccepted: false,
    privacyAcknowledged: false,
    marketingEmailOptIn: false,
  };

  assert.equal(user.pendingSignupConsent?.hasCurrentPolicyAcceptance, true);
  assert.equal(user.pendingSignupConsent?.marketingEmailOptIn, false);
  assert.equal(user.pendingSignupConsent?.source, 'email_signup');
  assert.equal(shouldFinalizePendingSignupConsent(missingDurableState, user.pendingSignupConsent), true);
});

test('existing accepted user is not re-finalized even if signup metadata remains present', () => {
  const acceptedState = {
    hasCurrentPolicyAcceptance: true,
    termsAccepted: true,
    communityGuidelinesAccepted: true,
    privacyAcknowledged: true,
    marketingEmailOptIn: false,
  };
  const pendingSignupConsent = {
    hasCurrentPolicyAcceptance: true,
    marketingEmailOptIn: false,
    source: 'email_signup',
  };

  assert.equal(shouldFinalizePendingSignupConsent(acceptedState, pendingSignupConsent), false);
});

test('legacy users without current signup consent still require the consent gate', () => {
  const missingDurableState = {
    hasCurrentPolicyAcceptance: false,
    termsAccepted: false,
    communityGuidelinesAccepted: false,
    privacyAcknowledged: false,
    marketingEmailOptIn: false,
  };

  assert.equal(shouldFinalizePendingSignupConsent(missingDurableState, undefined), false);
});

test('stale or incomplete signup metadata does not bypass required current consent', () => {
  const user = userFromSupabase({
    id: 'stale-signup-user',
    email: 'stale@example.com',
    user_metadata: {
      retail_policy_consent_pending: true,
      retail_terms_accepted: true,
      retail_terms_version: '2025-01-01',
      retail_community_guidelines_accepted: true,
      retail_community_guidelines_version: CURRENT_COMMUNITY_GUIDELINES_VERSION,
      retail_privacy_acknowledged: true,
      retail_privacy_version: CURRENT_PRIVACY_VERSION,
      retail_marketing_email_opt_in: true,
      retail_consent_source: 'email_signup',
    },
  });

  assert.equal(user.pendingSignupConsent, undefined);
});

test('legacy or new Google accounts without acceptance require the one-time gate', async () => {
  const state = await getCurrentConsentState({
    async rpc() {
      return {
        data: [{
          has_current_policy_acceptance: false,
          terms_accepted: false,
          community_guidelines_accepted: false,
          privacy_acknowledged: false,
          marketing_email_opt_in: false,
        }],
        error: null,
      };
    },
  });

  assert.equal(state.hasCurrentPolicyAcceptance, false);
  assert.match(read('src/auth/PolicyConsentBoundary.tsx'), /PolicyConsentGate/);
  assert.match(read('src/auth/AuthContext.tsx'), /requiresProfileSetup/);
});

test('policy acceptance and marketing preference updates use append-only RPCs', async () => {
  const calls = [];
  const client = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'record_my_policy_acceptance') {
        return {
          data: [{
            has_current_policy_acceptance: true,
            terms_accepted: true,
            community_guidelines_accepted: true,
            privacy_acknowledged: true,
            marketing_email_opt_in: true,
          }],
          error: null,
        };
      }
      return { data: params.requested_granted, error: null };
    },
  };

  const accepted = await recordCurrentPolicyAcceptance(true, 'legacy_user_gate', client);
  const optedIn = await updateMarketingEmailPreference(true, client);
  const optedOut = await updateMarketingEmailPreference(false, client);

  assert.equal(accepted.hasCurrentPolicyAcceptance, true);
  assert.equal(accepted.marketingEmailOptIn, true);
  assert.equal(optedIn, true);
  assert.equal(optedOut, false);
  assert.deepEqual(calls.map((call) => call.name), [
    'record_my_policy_acceptance',
    'update_my_marketing_email_preference',
    'update_my_marketing_email_preference',
  ]);
  assert.equal(calls[1].params.requested_granted, true);
  assert.equal(calls[2].params.requested_granted, false);
});

test('signup marketing preference is optional and unchecked by default', () => {
  const sprintSignup = read('src/sprint3/Sprint3App.tsx');
  const authModal = read('src/components/feedback/AuthModal.tsx');

  assert.match(sprintSignup, /useState\(false\).*termsAccepted/s);
  assert.match(sprintSignup, /useState\(false\).*marketingEmailOptIn/s);
  assert.match(authModal, /useState\(false\).*termsAccepted/s);
  assert.match(authModal, /useState\(false\).*marketingEmailOptIn/s);
  assert.match(read('src/components/forms/PolicyConsentChoices.tsx'), /Optional:.*Email me ReTail news/s);
});

test('Settings records both marketing opt-in and opt-out events separately from notification preferences', () => {
  const settingsScreen = read('src/sprint4/Sprint4App.tsx');
  const settingsHook = read('src/hooks/useSettings.ts');

  assert.match(settingsScreen, /label="Marketing emails"/);
  assert.match(settingsScreen, /Receive ReTail news, launch updates, tips, and promotions/);
  assert.match(settingsHook, /updateMarketingEmailPreference\(granted\)/);
  assert.match(read('src/services/consentService.ts'), /update_my_marketing_email_preference/);
});

test('shared-content creation services use the centralized current-policy guard', () => {
  for (const file of [
    'src/services/listingService.ts',
    'src/services/messageService.ts',
    'src/services/reviewService.ts',
    'src/services/rescueService.ts',
    'src/services/reportService.ts',
  ]) {
    assert.match(read(file), /requireCurrentPolicyAcceptance\(\)/, `${file} should enforce current policy acceptance`);
  }
});

test('account deletion page provides app and external deletion pathways', () => {
  const page = read('marketing-site/src/pages/account-deletion.astro');

  assert.match(page, /Delete Your ReTail Account/);
  assert.match(page, /Crutchfield Interactive LLC/);
  assert.match(page, /support@retailpetapp\.com/);
  assert.match(page, /Request Account Deletion/);
  assert.match(page, /Open Profile/);
  assert.match(page, /Open Settings/);
  assert.match(page, /Find Delete Account/);
  assert.match(page, /href="\/privacy"/);
});

test('consent migration is append-only, private by default, and opts out deleted accounts', () => {
  const migration = read('supabase/migrations/20260808172854_signup_consent_and_marketing_preferences.sql');

  assert.match(migration, /create table public\.user_consents/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Users read their own consent history/);
  assert.match(migration, /before update or delete on public\.user_consents/);
  assert.match(migration, /record_retail_email_signup_consents/);
  assert.match(migration, /'account_deletion'/);
  assert.match(migration, /before delete on auth\.users/);
  assert.doesNotMatch(migration, /grant insert on table public\.user_consents to authenticated/);
});
