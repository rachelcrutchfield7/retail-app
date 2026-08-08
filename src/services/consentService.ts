import { supabase } from '../lib/supabase';
import {
  CURRENT_COMMUNITY_GUIDELINES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../constants/policyVersions';
import { createServiceError } from './errors';
import { throwSupabaseError } from './supabaseData';

export type PolicyConsentSource = 'email_signup' | 'google_signup' | 'legacy_user_gate';

export type SignupConsentInput = {
  termsAccepted: boolean;
  marketingEmailOptIn: boolean;
};

export type CurrentConsentState = {
  hasCurrentPolicyAcceptance: boolean;
  termsAccepted: boolean;
  communityGuidelinesAccepted: boolean;
  privacyAcknowledged: boolean;
  marketingEmailOptIn: boolean;
};

type ConsentRpcClient = {
  rpc: (
    name: string,
    params?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }> | { data: unknown; error: unknown };
};

const requiredConsentMessage =
  "Please agree to ReTail's Terms of Service and Community Guidelines before creating your account.";

export function assertRequiredSignupConsent(termsAccepted: boolean): void {
  if (!termsAccepted) {
    throw createServiceError('POLICY_ACCEPTANCE_REQUIRED', 'Required signup policy consent was not granted', requiredConsentMessage);
  }
}

export function pendingSignupConsentMetadata(consent: SignupConsentInput, source: 'email_signup') {
  assertRequiredSignupConsent(consent.termsAccepted);

  return {
    retail_policy_consent_pending: true,
    retail_terms_accepted: true,
    retail_terms_version: CURRENT_TERMS_VERSION,
    retail_community_guidelines_accepted: true,
    retail_community_guidelines_version: CURRENT_COMMUNITY_GUIDELINES_VERSION,
    retail_privacy_acknowledged: true,
    retail_privacy_version: CURRENT_PRIVACY_VERSION,
    retail_marketing_email_opt_in: consent.marketingEmailOptIn,
    retail_consent_source: source,
  } as const;
}

export async function getCurrentConsentState(
  client?: ConsentRpcClient
): Promise<CurrentConsentState> {
  const { data, error } = client
    ? await client.rpc('get_my_consent_state')
    : await supabase.rpc('get_my_consent_state');

  if (error) {
    throwSupabaseError(error, 'We could not verify your ReTail policy acceptance.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return consentStateFromRow((row ?? {}) as Record<string, unknown>);
}

export async function recordCurrentPolicyAcceptance(
  marketingEmailOptIn: boolean,
  source: PolicyConsentSource,
  client?: ConsentRpcClient
): Promise<CurrentConsentState> {
  const params = {
    requested_terms_version: CURRENT_TERMS_VERSION,
    requested_community_guidelines_version: CURRENT_COMMUNITY_GUIDELINES_VERSION,
    requested_privacy_version: CURRENT_PRIVACY_VERSION,
    requested_marketing_email_opt_in: marketingEmailOptIn,
    requested_source: source,
  };
  const { data, error } = client
    ? await client.rpc('record_my_policy_acceptance', params)
    : await supabase.rpc('record_my_policy_acceptance', params);

  if (error) {
    throwSupabaseError(error, 'We could not save your policy acceptance. Please try again.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return consentStateFromRow((row ?? {}) as Record<string, unknown>);
}

export async function updateMarketingEmailPreference(
  granted: boolean,
  client?: ConsentRpcClient
): Promise<boolean> {
  const params = { requested_granted: granted };
  const { data, error } = client
    ? await client.rpc('update_my_marketing_email_preference', params)
    : await supabase.rpc('update_my_marketing_email_preference', params);

  if (error) {
    throwSupabaseError(error, 'We could not update your marketing email preference.');
  }

  if (typeof data === 'boolean') {
    return data;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row && typeof row === 'object' && 'marketing_email_opt_in' in row) {
    return (row as Record<string, unknown>).marketing_email_opt_in === true;
  }

  return granted;
}

export async function requireCurrentPolicyAcceptance(
  client?: ConsentRpcClient
): Promise<void> {
  const state = await getCurrentConsentState(client);

  if (!state.hasCurrentPolicyAcceptance) {
    throw createServiceError(
      'CURRENT_POLICY_ACCEPTANCE_REQUIRED',
      'Current policy acceptance was missing for a user-generated content action',
      "Please review and accept ReTail's current policies before continuing."
    );
  }
}

function consentStateFromRow(row: Record<string, unknown>): CurrentConsentState {
  const termsAccepted = row.terms_accepted === true;
  const communityGuidelinesAccepted = row.community_guidelines_accepted === true;
  const privacyAcknowledged = row.privacy_acknowledged === true;

  return {
    hasCurrentPolicyAcceptance:
      row.has_current_policy_acceptance === true ||
      (termsAccepted && communityGuidelinesAccepted && privacyAcknowledged),
    termsAccepted,
    communityGuidelinesAccepted,
    privacyAcknowledged,
    marketingEmailOptIn: row.marketing_email_opt_in === true,
  };
}
