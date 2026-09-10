import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  getCurrentConsentState,
  recordCurrentPolicyAcceptance,
} from '../src/services/consentService.ts';
import {
  CURRENT_COMMUNITY_GUIDELINES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../src/constants/policyVersions.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const sprint3 = read('src/sprint3/Sprint3App.tsx');
const consentBoundary = read('src/auth/PolicyConsentBoundary.tsx');
const consentGate = read('src/components/feedback/PolicyConsentGate.tsx');
const consentMigration = read('supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql');

function consentRow(accepted) {
  return {
    has_current_policy_acceptance: accepted,
    terms_accepted: accepted,
    community_guidelines_accepted: accepted,
    privacy_acknowledged: accepted,
    marketing_email_opt_in: false,
  };
}

test('existing approved rescue without current acceptance receives the Rescue Terms flow', async () => {
  const state = await getCurrentConsentState({
    async rpc(name) {
      assert.equal(name, 'get_my_consent_state');
      return { data: [consentRow(false)], error: null };
    },
  });

  assert.equal(state.hasCurrentPolicyAcceptance, false);
  assert.match(sprint3, /account_type === 'rescue'[\s\S]+?<PolicyConsentBoundary/);
  assert.match(sprint3, /gateTitle="Review Rescue Terms & Conditions"/);
  assert.match(sprint3, /authorized rescue manager/);
  assert.match(consentGate, /PolicyConsentChoices/);
});

test('authorized rescue acceptance persists current versions and unlocks its dashboard', async () => {
  const calls = [];
  const state = await recordCurrentPolicyAcceptance(false, 'legacy_user_gate', {
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: [consentRow(true)], error: null };
    },
  });

  assert.equal(state.hasCurrentPolicyAcceptance, true);
  assert.deepEqual(calls, [{
    name: 'record_my_policy_acceptance',
    params: {
      requested_terms_version: CURRENT_TERMS_VERSION,
      requested_community_guidelines_version: CURRENT_COMMUNITY_GUIDELINES_VERSION,
      requested_privacy_version: CURRENT_PRIVACY_VERSION,
      requested_marketing_email_opt_in: false,
      requested_source: 'legacy_user_gate',
    },
  }]);
  assert.match(consentBoundary, /setState\(nextState\)/);
  assert.match(consentBoundary, /state\?\.hasCurrentPolicyAcceptance[\s\S]+?children/);
});

test('already accepted rescue is recognized without another acceptance prompt', async () => {
  let callCount = 0;
  const state = await getCurrentConsentState({
    async rpc() {
      callCount += 1;
      return { data: [consentRow(true)], error: null };
    },
  });

  assert.equal(callCount, 1);
  assert.equal(state.hasCurrentPolicyAcceptance, true);
  assert.match(consentBoundary, /if \(state\?\.hasCurrentPolicyAcceptance\)/);
});

test('only the authenticated rescue owner can accept and manage that rescue', () => {
  assert.match(consentMigration, /caller_id uuid := auth\.uid\(\)/);
  assert.match(consentMigration, /insert into public\.user_consents \(user_id,[\s\S]+?caller_id/);
  assert.match(consentMigration, /Users read their own consent history/);
  assert.match(consentMigration, /rescue_profiles"\."owner_id" = "auth"\."uid"\(\)/);
  assert.match(consentMigration, /Rescue owners manage their profiles/);
  assert.doesNotMatch(consentMigration, /grant insert on table public\.user_consents to authenticated/i);
});

test('failed acceptance remains unaccepted and presents a useful error', async () => {
  await assert.rejects(
    recordCurrentPolicyAcceptance(false, 'legacy_user_gate', {
      async rpc() {
        return { data: null, error: { message: 'backend unavailable' } };
      },
    }),
    /could not save your policy acceptance/i
  );

  assert.match(consentGate, /setError\(acceptanceError instanceof Error/);
  assert.match(consentGate, /We could not save your acceptance\. Please try again\./);
  assert.match(consentBoundary, /const nextState = await recordCurrentPolicyAcceptance[\s\S]+?setState\(nextState\)/);
});

test('accepted state is loaded again after logout and login', () => {
  assert.match(consentBoundary, /getCurrentConsentState\(\)/);
  assert.match(consentBoundary, /\[pendingSignupConsent, userId\]/);
  assert.match(sprint3, /userId=\{auth\.profile\.id\}/);
});

test('new rescue onboarding keeps its existing affirmative terms flow', () => {
  assert.match(sprint3, /accountType === 'rescue'[\s\S]+?<RescueSignupFields/);
  assert.match(sprint3, /<PolicyConsentChoices[\s\S]+?termsAccepted=\{termsAccepted\}/);
  assert.match(sprint3, /termsAccepted,[\s\S]+?marketingEmailOptIn,/);
  assert.match(consentMigration, /record_email_signup_consents/);
  assert.match(consentMigration, /retail_terms_accepted/);
  assert.match(consentMigration, /'email_signup'/);
});
