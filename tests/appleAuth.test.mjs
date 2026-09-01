import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  getAppleSignInAvailability,
  signInWithApple,
} from '../src/services/appleAuthService.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const baseSession = {
  access_token: 'apple-access-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: 'apple-user-id',
    email: 'relay@example.privaterelay.appleid.com',
    user_metadata: {
      full_name: 'Apple Tester',
    },
  },
};

const baseProfile = {
  id: 'apple-user-id',
  account_type: 'regular',
  display_name: 'Apple Tester',
  username: 'apple_tester',
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

function createAppleAuth(responseOrError) {
  const calls = {
    signIn: 0,
    options: null,
  };

  return {
    calls,
    client: {
      AppleAuthenticationScope: {
        FULL_NAME: 'FULL_NAME',
        EMAIL: 'EMAIL',
      },
      async signInAsync(options) {
        calls.signIn += 1;
        calls.options = options;
        if (responseOrError instanceof Error) {
          throw responseOrError;
        }
        return responseOrError;
      },
    },
  };
}

function createDependencies({
  appleResponse = {
    identityToken: 'apple-id-token',
    authorizationCode: 'apple-authorization-code',
    email: 'relay@example.privaterelay.appleid.com',
    fullName: {
      givenName: 'Apple',
      middleName: null,
      familyName: 'Tester',
    },
  },
  supabaseError = null,
  profile = baseProfile,
  profileCreated = false,
} = {}) {
  const apple = createAppleAuth(appleResponse);
  const calls = {
    supabase: [],
    updateUser: [],
    ensureProfile: 0,
    recordPolicyAcceptance: [],
  };

  return {
    calls,
    appleCalls: apple.calls,
    dependencies: {
      platform: 'ios',
      appleAuth: apple.client,
      createNonce: () => 'apple-nonce',
      createState: () => 'apple-state',
      supabaseAuth: {
        async signInWithIdToken(input) {
          calls.supabase.push(input);
          return {
            data: supabaseError ? null : { session: baseSession },
            error: supabaseError,
          };
        },
        async updateUser(input) {
          calls.updateUser.push(input);
          return { data: {}, error: null };
        },
      },
      async ensureProfile() {
        calls.ensureProfile += 1;
        return { profile, created: profileCreated };
      },
      async recordPolicyAcceptance(marketingEmailOptIn) {
        calls.recordPolicyAcceptance.push(marketingEmailOptIn);
        return {};
      },
      async hashNonce(nonce) {
        return `hashed-${nonce}`;
      },
    },
  };
}

test('Apple sign-in is only presented on iOS', () => {
  assert.deepEqual(getAppleSignInAvailability('ios'), { available: true });
  assert.deepEqual(getAppleSignInAvailability('android'), { available: false, reason: 'unsupported_platform' });
  assert.deepEqual(getAppleSignInAvailability('web'), { available: false, reason: 'unsupported_platform' });
});

test('Apple cancellation is treated as a normal outcome', async () => {
  const cancellation = new Error('The request was cancelled');
  cancellation.code = 'ERR_REQUEST_CANCELED';
  const { dependencies, calls } = createDependencies({ appleResponse: cancellation });

  const session = await signInWithApple(dependencies);

  assert.equal(session, null);
  assert.equal(calls.supabase.length, 0);
  assert.equal(calls.ensureProfile, 0);
});

test('missing Apple identity token produces a safe error', async () => {
  const { dependencies } = createDependencies({
    appleResponse: {
      identityToken: null,
      authorizationCode: 'apple-authorization-code',
      email: null,
      fullName: null,
    },
  });

  await assert.rejects(
    signInWithApple(dependencies),
    /Apple sign-in could not be completed/
  );
});

test('successful Apple auth uses Supabase ID-token flow and preserves first-login name metadata', async () => {
  const { dependencies, calls, appleCalls } = createDependencies({ profileCreated: true });

  const session = await signInWithApple(dependencies);

  assert.equal(session?.user.accountType, 'regular');
  assert.equal(session?.requiresProfileSetup, true);
  assert.equal(appleCalls.signIn, 1);
  assert.deepEqual(appleCalls.options.requestedScopes, ['FULL_NAME', 'EMAIL']);
  assert.equal(appleCalls.options.nonce, 'hashed-apple-nonce');
  assert.equal(appleCalls.options.state, 'apple-state');
  assert.deepEqual(calls.supabase, [{
    provider: 'apple',
    token: 'apple-id-token',
    nonce: 'apple-nonce',
    access_token: 'apple-authorization-code',
  }]);
  assert.deepEqual(calls.updateUser, [{
    data: {
      full_name: 'Apple Tester',
      display_name: 'Apple Tester',
      username: 'Apple Tester',
      email: 'relay@example.privaterelay.appleid.com',
    },
  }]);
  assert.equal(calls.ensureProfile, 1);
});

test('subsequent Apple sign-ins do not overwrite profile metadata when Apple returns no name or email', async () => {
  const { dependencies, calls } = createDependencies({
    appleResponse: {
      identityToken: 'apple-id-token',
      authorizationCode: null,
      email: null,
      fullName: null,
    },
  });

  const session = await signInWithApple(dependencies);

  assert.equal(session?.user.id, 'apple-user-id');
  assert.deepEqual(calls.updateUser, []);
  assert.deepEqual(calls.supabase, [{
    provider: 'apple',
    token: 'apple-id-token',
    nonce: 'apple-nonce',
  }]);
});

test('Apple signup requires policy consent before starting native auth', async () => {
  const { dependencies, appleCalls } = createDependencies();

  await assert.rejects(
    signInWithApple({
      ...dependencies,
      signupConsent: { termsAccepted: false, marketingEmailOptIn: false },
    }),
    /Please agree to ReTail's Terms of Service and Community Guidelines/
  );

  assert.equal(appleCalls.signIn, 0);
});

test('successful Apple signup records selected policy consent', async () => {
  const { dependencies, calls } = createDependencies();

  await signInWithApple({
    ...dependencies,
    signupConsent: { termsAccepted: true, marketingEmailOptIn: true },
  });

  assert.deepEqual(calls.recordPolicyAcceptance, [true]);
});

test('Supabase Apple ID-token errors are normalized', async () => {
  const { dependencies } = createDependencies({
    supabaseError: { code: 'provider_disabled', message: 'Apple provider disabled' },
  });

  await assert.rejects(
    signInWithApple(dependencies),
    /Apple sign-in could not be completed/
  );
});

test('Auth modal and app shell expose Apple sign-in without changing Google sign-in', () => {
  const authModal = read('src/components/feedback/AuthModal.tsx');
  const appShell = read('src/AppShell.tsx');

  assert.match(authModal, /AppleSignInButton/);
  assert.match(authModal, /onAppleSignIn/);
  assert.match(authModal, /GoogleSignInButton/);
  assert.match(appShell, /completeAppleAuth/);
  assert.match(appShell, /completeGoogleAuth/);
});

test('active Sprint4 production auth path exposes Apple wherever iOS Google auth is offered', () => {
  const appEntry = read('App.tsx');
  const sprint4 = read('src/sprint4/Sprint4App.tsx');
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const componentExports = read('src/components/index.ts');

  assert.match(appEntry, /<Sprint4App \/>/);
  assert.match(sprint4, /ProfileScreen[\s\S]+from '\.\.\/sprint3\/Sprint3App'/);
  assert.match(componentExports, /AppleSignInButton/);

  assert.match(sprint3, /AppleSignInButton/);
  assert.match(sprint3, /getAppleSignInAvailability\(Platform\.OS\)/);
  assert.match(sprint3, /isAppleSignInCancellation/);
  assert.match(sprint3, /const continueWithApple = async \(\) =>/);
  assert.match(sprint3, /auth\.signInWithApple\(\{\s*mode: authMode,\s*termsAccepted,\s*marketingEmailOptIn,\s*\}\)/);

  const regularSignupSocialBlock = sprint3.match(
    /\{\(appleSignInAvailability\.available \|\| googleSignInAvailability\.available\) && accountType === 'regular' \? \([\s\S]*?<Text style=\{styles\.filterLabel\}>or continue with email<\/Text>/,
  )?.[0] ?? '';
  assert.match(regularSignupSocialBlock, /<AppleSignInButton[\s\S]*mode="register"/);
  assert.match(regularSignupSocialBlock, /<GoogleSignInButton[\s\S]*label="Sign up with Google"/);
  assert.ok(
    regularSignupSocialBlock.indexOf('<AppleSignInButton') < regularSignupSocialBlock.indexOf('<GoogleSignInButton'),
    'Apple signup should be at least as prominent as Google signup'
  );

  const loginSocialBlock = sprint3.match(
    /\{authMode === 'login' && \(appleSignInAvailability\.available \|\| googleSignInAvailability\.available\) \? \([\s\S]*?<Text style=\{styles\.filterLabel\}>or continue with email<\/Text>/,
  )?.[0] ?? '';
  assert.match(loginSocialBlock, /<AppleSignInButton[\s\S]*mode="login"/);
  assert.match(loginSocialBlock, /<GoogleSignInButton[\s\S]*label="Continue with Google"/);
  assert.ok(
    loginSocialBlock.indexOf('<AppleSignInButton') < loginSocialBlock.indexOf('<GoogleSignInButton'),
    'Apple login should be at least as prominent as Google login'
  );
});

test('active Apple auth path preserves platform gating, email auth, Google auth, and policy consent', () => {
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const appleButton = read('src/components/feedback/AppleSignInButton.tsx');
  const authContext = read('src/auth/AuthContext.tsx');

  assert.deepEqual(getAppleSignInAvailability('android'), { available: false, reason: 'unsupported_platform' });
  assert.match(appleButton, /if \(Platform\.OS !== 'ios'\) \{\s*return null;\s*\}/);

  assert.match(sprint3, /const submitAuth = async \(\) =>/);
  assert.match(sprint3, /await auth\.signUp/);
  assert.match(sprint3, /await auth\.signIn\(\{ email, password \}\)/);
  assert.match(sprint3, /const continueWithGoogle = async \(\) =>/);
  assert.match(sprint3, /const continueWithApple = async \(\) =>/);
  assert.match(sprint3, /disabled=\{busy \|\| googleBusy \|\| appleBusy \|\| auth\.loading\}/);

  assert.match(authContext, /signInWithAppleAccount/);
  assert.match(authContext, /signupConsent: input\.mode === 'register'/);
  assert.match(authContext, /termsAccepted: input\.termsAccepted === true/);
  assert.match(authContext, /marketingEmailOptIn: input\.marketingEmailOptIn === true/);
});

test('Expo iOS config enables the Sign in with Apple capability', () => {
  const appConfig = read('app.config.js');

  assert.match(appConfig, /usesAppleSignIn:\s*true/);
  assert.match(appConfig, /'expo-apple-authentication'/);
  assert.match(appConfig, /bundleIdentifier:\s*'com\.raecrutchfield\.retail'/);
});
