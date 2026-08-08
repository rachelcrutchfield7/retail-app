import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const phaseC = read('supabase/migrations/20260717174159_phase_c_protected_fields_least_privilege.sql');
const phaseD = read('supabase/migrations/20260719003237_phase_d_messaging_blocking_storage_security.sql');
const phaseE = read('supabase/migrations/20260719120708_phase_e_transactions_reviews_reports_notifications_security.sql');
const phaseF = read('supabase/migrations/20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql');
const adminFix = read('supabase/migrations/20260802000000_fix_admin_report_moderation_actions.sql');
const consent = read('supabase/migrations/20260808172854_signup_consent_and_marketing_preferences.sql');
const audit = read('docs/security/PRELAUNCH_SECURITY_AUDIT_01.md');
const matrix = read('docs/security/AUTHORIZATION_MATRIX.md');
const remediation = read('docs/security/PRELAUNCH_SECURITY_REMEDIATION_PLAN.md');

test('prelaunch audit documents required artifacts and no-fix posture', () => {
  assert.match(audit, /This is an audit-only pass/);
  assert.match(audit, /No production behavior was changed/);
  assert.match(matrix, /Resource \/ Action \| Anonymous \| Owner \| Other User \| Rescue Owner \| Admin/);
  assert.match(remediation, /Do not combine these into one broad cleanup migration/);
});

test('admin moderation functions require server-side admin authorization', () => {
  assert.match(adminFix, /create or replace function public\.admin_moderate_report/);
  assert.match(adminFix, /caller_id uuid := auth\.uid\(\)/);
  assert.match(adminFix, /not private\.is_admin\(caller_id\)/);
  assert.match(adminFix, /grant execute on function public\.admin_moderate_report[\s\S]+to authenticated/);
  assert.doesNotMatch(adminFix, /grant execute on function public\.admin_moderate_report[\s\S]+to anon/);

  assert.match(phaseC, /create or replace function public\.admin_set_rescue_verification/);
  assert.match(phaseC, /not private\.is_admin\(caller_id\)/);

  assert.match(phaseF, /create or replace function public\.admin_update_report/);
  assert.match(phaseF, /not private\.is_admin\(caller_id\)/);
});

test('owner and participant RPCs derive authority from auth.uid', () => {
  for (const functionName of [
    'create_listing',
    'update_my_listing',
    'archive_my_listing',
    'delete_my_listing',
    'mark_my_listing_sold',
    'mark_my_listing_donated',
    'update_my_profile',
    'update_my_rescue_profile',
  ]) {
    assert.match(phaseC, new RegExp(`create or replace function public\\.${functionName}`));
  }

  assert.match(phaseC, /seller_id = caller_id/);
  assert.match(phaseC, /where id = caller_id/);
  assert.match(phaseC, /where id = target_listing_id\s+and seller_id = caller_id/);
  assert.match(phaseD, /private\.is_conversation_participant/);
  assert.match(phaseD, /not private\.is_blocked_between/);
});

test('listing and message storage policies validate ownership, participation, and MIME type', () => {
  assert.match(phaseD, /create policy "Phase D listing owners can manage listing images"/);
  assert.match(phaseD, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(phaseD, /l\.seller_id = auth\.uid\(\)/);
  assert.match(phaseD, /lower\(storage\.extension\(name\)\) in \('jpg', 'jpeg', 'png', 'webp'\)/);

  assert.match(phaseD, /create policy "Phase D participants can upload message images"/);
  assert.match(phaseD, /private\.message_attachment_path_is_valid/);
  assert.match(phaseD, /private\.is_conversation_participant/);
  assert.match(phaseD, /not private\.is_blocked_between/);
});

test('consent history is own-read and append-only through auth.uid RPCs', () => {
  assert.match(consent, /alter table public\.user_consents enable row level security/);
  assert.match(consent, /alter table public\.user_consents force row level security/);
  assert.match(consent, /revoke all on table public\.user_consents from public, anon, authenticated/);
  assert.match(consent, /grant select on table public\.user_consents to authenticated/);
  assert.match(consent, /create policy "Users read their own consent history"/);
  assert.match(consent, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(consent, /caller_id uuid := auth\.uid\(\)/);
  assert.doesNotMatch(consent, /record_my_policy_acceptance\([^)]*target_user_id/i);
  assert.match(consent, /raise exception 'RETAIL_CONSENT_HISTORY_IS_APPEND_ONLY'/);
});

test('notification and device-token direct table access remains RPC controlled in migrations', () => {
  assert.match(phaseE, /revoke all on table public\.device_tokens from public, anon, authenticated/);
  assert.match(phaseE, /revoke all on table public\.notification_preferences from public, anon, authenticated/);
  assert.match(phaseE, /create or replace function public\.register_my_device_token/);
  assert.match(phaseE, /caller_id uuid := auth\.uid\(\)/);
  assert.match(phaseE, /where dt\.user_id = caller_id/);
  assert.match(phaseE, /create or replace function public\.update_my_notification_preferences/);
  assert.match(phaseE, /values \(\s+caller_id,/);
  assert.match(phaseE, /on conflict \(user_id\)/);
});
