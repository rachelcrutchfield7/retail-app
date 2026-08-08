import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGoogleSignInAvailability,
  signInWithGoogle,
} from '../src/services/googleAuthService.ts';

const configuredAndroid = {
  googleSignInEnabled: true,
  googleSignInIosEnabled: false,
  googleWebClientId: 'web-client-id.apps.googleusercontent.com',
  googleAndroidClientId: 'android-client-id.apps.googleusercontent.com',
  googleIosClientId: '',
};

const baseSession = {
  access_token: 'test-access-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: 'google-user-id',
    email: 'google@example.com',
    user_metadata: {
      full_name: 'Google Tester',
    },
  },
};

const baseProfile = {
  id: 'google-user-id',
  account_type: 'regular',
  display_name: 'Google Tester',
  username: 'google_tester',
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

function createGoogleClient(responseOrError) {
  const calls = {
    configure: 0,
    hasPlayServices: 0,
    signIn: 0,
    signOut: 0,
  };

  return {
    calls,
    client: {
      configure() {
        calls.configure += 1;
      },
      async hasPlayServices() {
        calls.hasPlayServices += 1;
        return true;
      },
      async signIn() {
        calls.signIn += 1;
        if (responseOrError instanceof Error) {
          throw responseOrError;
        }
        return responseOrError;
      },
      async signOut() {
        calls.signOut += 1;
        return null;
      },
    },
  };
}

function createDependencies({
  googleResponse = { type: 'success', data: { idToken: 'google-id-token' } },
  supabaseError = null,
  profile = baseProfile,
  profileCreated = false,
  runtimeConfig = configuredAndroid,
} = {}) {
  const google = createGoogleClient(googleResponse);
  const calls = {
    supabase: 0,
    ensureProfile: 0,
  };

  return {
    calls,
    dependencies: {
      platform: 'android',
      runtimeConfig,
      googleClient: google.client,
      statusCodes: {
        SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
        IN_PROGRESS: 'IN_PROGRESS',
        PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
      },
      supabaseAuth: {
        async signInWithIdToken(input) {
          calls.supabase += 1;
          assert.equal(input.provider, 'google');
          assert.equal(input.token, 'google-id-token');
          return {
            data: supabaseError ? null : { session: baseSession },
            error: supabaseError,
          };
        },
      },
      async ensureProfile() {
        calls.ensureProfile += 1;
        return { profile, created: profileCreated };
      },
    },
    googleCalls: google.calls,
  };
}

test('missing Google configuration disables sign-in without crashing', () => {
  assert.deepEqual(
    getGoogleSignInAvailability('android', {
      ...configuredAndroid,
      googleWebClientId: '',
    }),
    { available: false, reason: 'missing_web_client_id' }
  );
  assert.deepEqual(
    getGoogleSignInAvailability('android', {
      ...configuredAndroid,
      googleAndroidClientId: '',
    }),
    { available: false, reason: 'missing_android_client_id' }
  );
});

test('Google cancellation is treated as a normal outcome', async () => {
  const { dependencies, calls } = createDependencies({
    googleResponse: { type: 'cancelled', data: null },
  });

  const session = await signInWithGoogle(dependencies);

  assert.equal(session, null);
  assert.equal(calls.supabase, 0);
  assert.equal(calls.ensureProfile, 0);
});

test('missing Google ID token produces a safe error', async () => {
  const { dependencies } = createDependencies({
    googleResponse: { type: 'success', data: { idToken: null } },
  });

  await assert.rejects(
    signInWithGoogle(dependencies),
    /Google sign-in could not be completed/
  );
});

test('Supabase ID-token errors are normalized', async () => {
  const { dependencies } = createDependencies({
    supabaseError: { code: 'provider_disabled', message: 'provider disabled' },
  });

  await assert.rejects(
    signInWithGoogle(dependencies),
    /Google sign-in could not be completed/
  );
});

test('successful Google auth loads the existing ReTail profile', async () => {
  const { dependencies, calls, googleCalls } = createDependencies();

  const session = await signInWithGoogle(dependencies);

  assert.equal(session?.user.accountType, 'regular');
  assert.equal(session?.user.email, 'google@example.com');
  assert.equal(session?.requiresProfileSetup, false);
  assert.equal(calls.supabase, 1);
  assert.equal(calls.ensureProfile, 1);
  assert.equal(googleCalls.configure, 1);
  assert.equal(googleCalls.hasPlayServices, 1);
});

test('existing rescue account type is preserved when Supabase returns that profile', async () => {
  const { dependencies } = createDependencies({
    profile: {
      ...baseProfile,
      account_type: 'rescue',
      is_verified: true,
    },
  });

  const session = await signInWithGoogle(dependencies);

  assert.equal(session?.user.accountType, 'rescue');
});

test('new Google users remain regular users unless an existing profile says otherwise', async () => {
  const { dependencies } = createDependencies({
    profile: {
      ...baseProfile,
      account_type: 'regular',
      is_verified: false,
    },
    profileCreated: true,
  });

  const session = await signInWithGoogle(dependencies);

  assert.equal(session?.user.accountType, 'regular');
  assert.equal(session?.requiresProfileSetup, true);
});
