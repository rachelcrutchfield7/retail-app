import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_admin_notifications_v2.sql'))
  .sort()
  .at(-1);

assert.ok(migrationName, 'admin notifications v2 migration is missing');

const sql = readFileSync(
  `supabase/migrations/${migrationName}`,
  'utf8'
);

test('admin notifications use a trusted server-only creator', () => {
  assert.match(sql, /private\.create_admin_action_notification/);
  assert.match(sql, /private\.is_admin\(target_admin_id\)/);
  assert.match(sql, /adminAction', true/);
  assert.match(sql, /retail\.phase_e_trusted_notification_write/);
  assert.match(
    sql,
    /revoke all on function private\.create_admin_action_notification/
  );
});

test('pending rescue applications generate admin alerts', () => {
  assert.match(sql, /private\.notify_admins_of_pending_rescue/);
  assert.match(sql, /verification_status is distinct from 'pending'/);
  assert.match(sql, /'rescues'/);
  assert.match(sql, /admin:rescue-pending:/);
  assert.match(
    sql,
    /after insert or update of verification_status[\s\S]*on public\.rescue_profiles/
  );
});

test('new reports generate moderation alerts', () => {
  assert.match(sql, /private\.notify_admins_of_new_report/);
  assert.match(sql, /'New safety report'/);
  assert.match(sql, /'reports'/);
  assert.match(sql, /admin:report:/);
  assert.match(sql, /after insert[\s\S]*on public\.reports/);
});

test('new support cases generate support alerts', () => {
  assert.match(sql, /private\.notify_admins_of_new_support_case/);
  assert.match(sql, /'New support case'/);
  assert.match(sql, /'support'/);
  assert.match(sql, /admin:support:/);
  assert.match(sql, /after insert[\s\S]*on public\.support_cases/);
});

test('admin notification list is server-authorized', () => {
  assert.match(sql, /public\.get_admin_action_notifications/);
  assert.match(sql, /private\.require_active_account\(\)/);
  assert.match(sql, /private\.is_admin\(caller_id\)/);
  assert.match(sql, /n\.data @> '\{"adminAction": true\}'::jsonb/);
});

test('mark all read affects only admin action notifications', () => {
  assert.match(sql, /public\.mark_all_admin_notifications_read/);
  assert.match(sql, /n\.is_read = false/);
  assert.match(sql, /n\.data @> '\{"adminAction": true\}'::jsonb/);
  assert.match(sql, /read_at = coalesce\(n\.read_at, now\(\)\)/);
});

test('public and anon cannot execute admin notification RPCs', () => {
  assert.match(
    sql,
    /revoke all on function public\.get_admin_action_notifications\(integer\)[\s\S]*from public, anon/
  );
  assert.match(
    sql,
    /revoke all on function public\.mark_all_admin_notifications_read\(\)[\s\S]*from public, anon/
  );
});
