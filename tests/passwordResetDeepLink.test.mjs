import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  getEmailConfirmationRedirectUrl,
  getPasswordRecoveryRedirectUrl,
  handleEmailConfirmationCallbackUrl,
  handlePasswordRecoveryCallbackUrl,
  resetPassword,
  updateRecoveredPassword,
} from '../src/services/authService.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

function recoverySession(overrides = {}) {
  return {
    access_token: 'recovery-access-token',
    expires_at: 1800000000,
    user: {
      id: 'recovery-user',
      email: 'recovery@example.com',
      email_confirmed_at: '2026-08-22T00:00:00.000Z',
      user_metadata: {
        display_name: 'Recovery User',
        username: 'recovery_user',
        account_type: 'regular',
      },
    },
    ...overrides,
  };
}

test('forgot password sends Supabase recovery email with explicit ReTail reset redirect', async () => {
  const calls = [];

  await resetPassword('Person@Example.com', {
    async resetPasswordForEmail(email, options) {
      calls.push({ email, options });
      return { data: {}, error: null };
    },
  });

  assert.deepEqual(calls, [
    {
      email: 'person@example.com',
      options: {
        redirectTo: 'https://retailpetapp.com/auth/reset-password',
      },
    },
  ]);
  assert.equal(getPasswordRecoveryRedirectUrl(), 'https://retailpetapp.com/auth/reset-password');
});

test('email confirmation callback ignores recovery tokens', async () => {
  const recoveryUrl = `${getEmailConfirmationRedirectUrl()}#access_token=access-token&refresh_token=refresh-token&type=recovery`;

  const session = await handleEmailConfirmationCallbackUrl(recoveryUrl, {
    async setSession() {
      throw new Error('Email confirmation should not consume password recovery tokens');
    },
  });

  assert.equal(session, null);
});

test('password recovery callback accepts Supabase hash token callbacks', async () => {
  const recoveryUrl = `${getPasswordRecoveryRedirectUrl()}#access_token=access-token&refresh_token=refresh-token&type=recovery`;
  const setSessionCalls = [];

  const session = await handlePasswordRecoveryCallbackUrl(recoveryUrl, {
    async setSession(input) {
      setSessionCalls.push(input);
      return {
        data: {
          session: recoverySession({
            access_token: input.access_token,
          }),
        },
        error: null,
      };
    },
  });

  assert.deepEqual(setSessionCalls, [{ access_token: 'access-token', refresh_token: 'refresh-token' }]);
  assert.equal(session?.user.id, 'recovery-user');
});

test('password recovery callback accepts Supabase PKCE code callbacks', async () => {
  const recoveryUrl = `${getPasswordRecoveryRedirectUrl()}?code=recovery-code&type=recovery`;
  const exchangeCalls = [];

  const session = await handlePasswordRecoveryCallbackUrl(recoveryUrl, {
    async exchangeCodeForSession(code) {
      exchangeCalls.push(code);
      return {
        data: {
          session: recoverySession({
            access_token: 'pkce-recovery-access-token',
          }),
        },
        error: null,
      };
    },
  });

  assert.deepEqual(exchangeCalls, ['recovery-code']);
  assert.equal(session?.accessToken, 'pkce-recovery-access-token');
});

test('password recovery callback accepts app-scheme reset links', async () => {
  const recoveryUrl = 'retail://auth/reset-password#access_token=access-token&refresh_token=refresh-token&type=recovery';

  const session = await handlePasswordRecoveryCallbackUrl(recoveryUrl, {
    async setSession() {
      return {
        data: {
          session: recoverySession(),
        },
        error: null,
      };
    },
  });

  assert.equal(session?.user.email, 'recovery@example.com');
});

test('password recovery callback rejects expired or invalid recovery links safely', async () => {
  const recoveryUrl = `${getPasswordRecoveryRedirectUrl()}?error_code=otp_expired`;

  await assert.rejects(
    handlePasswordRecoveryCallbackUrl(recoveryUrl),
    /This password reset link is invalid or has expired/
  );
});

test('recovered password update enforces strong password rules before Supabase update', async () => {
  let updateCalls = 0;

  await assert.rejects(
    updateRecoveredPassword('weak', {
      async updateUser() {
        updateCalls += 1;
        return { data: { user: null }, error: null };
      },
    }),
    /Use at least 8 characters/
  );

  assert.equal(updateCalls, 0);
});

test('recovered password update submits only the new password to Supabase', async () => {
  const calls = [];

  await updateRecoveredPassword('Secure123!', {
    async updateUser(input) {
      calls.push(input);
      return { data: { user: { id: 'recovery-user' } }, error: null };
    },
  });

  assert.deepEqual(calls, [{ password: 'Secure123!' }]);
});

test('password reset source does not log recovery tokens or auth secrets', () => {
  const authService = read('src/services/authService.ts');
  const resetScreen = read('src/sprint4/Sprint4App.tsx');
  const recoverySources = `${authService}\n${resetScreen}`;

  assert.doesNotMatch(recoverySources, /console\.(log|info|debug)\([^)]*(access_token|refresh_token|password)/);
  assert.doesNotMatch(recoverySources, /logger\.(info|debug)\([^)]*(access_token|refresh_token|password)/);
});
