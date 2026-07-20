import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { liveSupabaseTest } from './liveSupabaseTest.mjs';

import { clearDeletedAccountLocalState } from '../src/services/accountService.ts';
import { signInWithEmail, signOut } from '../src/services/authService.ts';
import { getOrCreateConversation } from '../src/services/conversationService.ts';
import { createListing } from '../src/services/listingService.ts';
import { sendImageMessage, sendMessage } from '../src/services/messageService.ts';
import { registerDeviceToken, updateNotificationPreferences } from '../src/services/notificationService.ts';
import { createSavedSearch } from '../src/services/savedSearchService.ts';
import { updatePrivacySettings } from '../src/services/settingsService.ts';
import { updateProfile } from '../src/services/profileService.ts';
import {
  getActiveRealtimeSubscriptionCountForTests,
  subscribeToUserNotifications,
} from '../src/services/realtimeService.ts';
import { supabase } from '../src/lib/supabase.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtureName = 'private_beta_gate_closure';
const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for live private beta gate closure tests.`);
  }

  return value;
}

function runSlug() {
  return `pbgc_${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

function uniqueEmail(label, slug) {
  return `retail.beta.${label}.${slug}.${Math.random().toString(36).slice(2, 8)}@gmail.com`;
}

function password() {
  return `Aa1!${Math.random().toString(36).slice(2)}Z9!`;
}

function createFreshClient() {
  return createClient(
    requiredEnv('EXPO_PUBLIC_SUPABASE_URL'),
    requiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}

function createStaleSessionClient(accessToken) {
  return createClient(
    requiredEnv('EXPO_PUBLIC_SUPABASE_URL'),
    requiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
}

async function currentAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('Expected an active disposable session.');
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Expected an active disposable user.');
  }

  return data.user.id;
}

async function functionFailureDetail(error) {
  const context = error?.context;

  if (context && typeof context.text === 'function') {
    try {
      return await context.clone().text();
    } catch {
      return error.message;
    }
  }

  return error?.message ?? 'Unknown function error';
}

async function tinyImageBlob() {
  const response = await fetch(tinyPng);

  if (!response.ok) {
    throw new Error('Could not create tiny PNG fixture.');
  }

  return response.blob();
}

async function uploadAvatarFixture(userId, slug) {
  const blob = await tinyImageBlob();
  const avatarPath = `${userId}/${slug}.png`;
  const { error } = await supabase.storage.from('avatars').upload(avatarPath, blob, {
    contentType: 'image/png',
    upsert: false,
  });

  if (error) {
    throw new Error(`Avatar fixture upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
  await updateProfile({ avatar_url: data.publicUrl });
  return avatarPath;
}

async function createTestListing(label, slug) {
  return createListing({
    title: `${label} ${slug} crate`,
    description: `${label} disposable private beta test listing for ${slug}.`,
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'sale',
    price: 12,
    images: [tinyPng],
    city: 'Springfield',
    state: 'IL',
    zip_code: '62704',
    pickup_available: true,
    porch_pickup_available: true,
    meetup_available: false,
    shipping_available: false,
    safety_confirmed: true,
  });
}

function runLinkedSql(sql, label) {
  const filePath = join(tmpdir(), `retail-${label}-${Date.now()}.sql`);
  writeFileSync(filePath, sql);

  let result;

  try {
    result = spawnSync(
      'pnpm',
      ['dlx', 'supabase@latest', 'db', 'query', '--linked', '--file', filePath],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          NO_COLOR: '1',
        },
        maxBuffer: 1024 * 1024 * 8,
      }
    );
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      // Best-effort cleanup so generated disposable credentials are not left in tmp.
    }
  }

  assert.equal(
    result.status,
    0,
    [
      `${label} SQL failed.`,
      result.stdout.replaceAll(requiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'), '[redacted]'),
      result.stderr.replaceAll(requiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'), '[redacted]'),
    ].filter(Boolean).join('\n')
  );

  return result.stdout;
}

function linkedSqlRows(output) {
  const jsonStart = output.indexOf('{');

  if (jsonStart < 0) {
    return [];
  }

  return JSON.parse(output.slice(jsonStart)).rows ?? [];
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
  return `${sqlLiteral(value)}::uuid`;
}

function sqlUuidArray(values) {
  return `array[${values.map(sqlUuid).join(', ')}]`;
}

function createVerifiedAuthFixture({ userId, email, pass, displayName, username, testRunId }) {
  runLinkedSql(
    `
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token,
  email_change_confirm_status,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  is_sso_user,
  is_anonymous,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  ${sqlUuid(userId)},
  'authenticated',
  'authenticated',
  ${sqlLiteral(email)},
  crypt(${sqlLiteral(pass)}, gen_salt('bf', 10)),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  0,
  jsonb_build_object(
    'provider', 'email',
    'providers', jsonb_build_array('email'),
    'test_fixture', ${sqlLiteral(fixtureName)},
    'test_run_id', ${sqlLiteral(testRunId)}
  ),
  jsonb_build_object(
    'display_name', ${sqlLiteral(displayName)},
    'username', ${sqlLiteral(username)},
    'account_type', 'regular',
    'test_fixture', ${sqlLiteral(fixtureName)},
    'test_run_id', ${sqlLiteral(testRunId)}
  ),
  false,
  false,
  false,
  now(),
  now()
);

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  gen_random_uuid(),
  ${sqlLiteral(userId)},
  ${sqlUuid(userId)},
  jsonb_build_object(
    'sub', ${sqlLiteral(userId)},
    'email', ${sqlLiteral(email)},
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
);

insert into public.profiles (
  id,
  account_type,
  display_name,
  username,
  city,
  state,
  zip_code
)
values (
  ${sqlUuid(userId)},
  'regular',
  ${sqlLiteral(displayName)},
  ${sqlLiteral(username)},
  'Springfield',
  'IL',
  '62704'
);
`,
    `private-beta-auth-${userId}`
  );
}

function createListingFixture({ sellerId, title }) {
  const output = runLinkedSql(
    `
set role authenticated;
select set_config('request.jwt.claim.sub', ${sqlLiteral(sellerId)}, false);

select created.id
from public.create_listing(
  requested_category_id => (select id from public.categories where slug = 'dogs' limit 1),
  requested_title => ${sqlLiteral(title)},
  requested_description => 'Disposable private beta account deletion fixture.',
  requested_condition => 'good'::public.listing_condition,
  requested_listing_type => 'sale'::public.listing_type,
  requested_price => 12,
  requested_city => 'Springfield',
  requested_state => 'IL',
  requested_zip_code => '62704',
  requested_pickup_available => true,
  requested_porch_pickup_available => true,
  requested_meetup_available => false,
  requested_shipping_available => false,
  requested_safety_confirmed => true
)
as created;
`,
    `private-beta-listing-${sellerId}`
  );

  const listingId = linkedSqlRows(output)[0]?.id;
  assert.ok(listingId, 'Expected fixture listing id.');
  return { id: listingId };
}

function createFavoriteFixture({ userId, listingId }) {
  runLinkedSql(
    `
set role authenticated;
select set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, false);

insert into public.favorites (user_id, listing_id)
values (${sqlUuid(userId)}, ${sqlUuid(listingId)})
on conflict do nothing;
`,
    `private-beta-favorite-${userId}`
  );
}

function cleanupMarkedFixturesSql(targetRunId = null) {
  const runFilter = targetRunId
    ? `and coalesce(u.raw_app_meta_data ->> 'test_run_id', u.raw_user_meta_data ->> 'test_run_id') = ${sqlLiteral(targetRunId)}`
    : '';

  return cleanupUsersSelectedBySql(`
select u.id
from auth.users u
where (
    u.raw_app_meta_data ->> 'test_fixture' = ${sqlLiteral(fixtureName)}
    or u.raw_user_meta_data ->> 'test_fixture' = ${sqlLiteral(fixtureName)}
  )
  ${runFilter}
`);
}

function cleanupExactFixtureSql(userIds) {
  return cleanupUsersSelectedBySql(`select unnest(${sqlUuidArray(userIds)}) as id`);
}

function cleanupUsersSelectedBySql(userSelectSql) {
  return `
select set_config('storage.allow_delete_query', 'true', true);

drop table if exists pg_temp.private_beta_cleanup_users;
create temporary table private_beta_cleanup_users as
${userSelectSql};

delete from storage.objects object
using private_beta_cleanup_users fixture
where object.owner_id = fixture.id::text
   or object.name like fixture.id::text || '/%';

do $$
declare
  target_user_id uuid;
begin
  for target_user_id in select id from private_beta_cleanup_users loop
    perform set_config('request.jwt.claim.sub', target_user_id::text, true);
    perform set_config('retail.account_deletion_context', 'on', true);

    delete from public.report_moderation_events
    where admin_id = target_user_id
       or report_id in (
         select id
         from public.reports
         where reporter_id = target_user_id
            or reported_user_id = target_user_id
            or assigned_admin_id = target_user_id
            or listing_id in (select id from public.listings where seller_id = target_user_id)
            or message_id in (select id from public.messages where sender_id = target_user_id)
       );

    delete from public.reviews
    where reviewer_id = target_user_id
       or reviewee_id = target_user_id
       or listing_id in (select id from public.listings where seller_id = target_user_id);

    delete from public.transactions
    where buyer_id = target_user_id
       or seller_id = target_user_id
       or listing_id in (select id from public.listings where seller_id = target_user_id);

    delete from public.reports
    where reporter_id = target_user_id
       or reported_user_id = target_user_id
       or assigned_admin_id = target_user_id
       or listing_id in (select id from public.listings where seller_id = target_user_id)
       or message_id in (select id from public.messages where sender_id = target_user_id);

    delete from public.messages
    where sender_id = target_user_id
       or conversation_id in (
         select id from public.conversations where buyer_id = target_user_id or seller_id = target_user_id
       );

    delete from public.conversations
    where buyer_id = target_user_id or seller_id = target_user_id;

    delete from public.favorites where user_id = target_user_id;
    delete from public.saved_searches where user_id = target_user_id;
    delete from public.notifications where user_id = target_user_id;
    delete from public.device_tokens where user_id = target_user_id;
    delete from public.notification_preferences where user_id = target_user_id;
    delete from public.privacy_settings where user_id = target_user_id;
    delete from public.blocks where blocker_id = target_user_id or blocked_id = target_user_id;
    delete from public.listing_images where listing_id in (select id from public.listings where seller_id = target_user_id);
    delete from public.favorites where listing_id in (select id from public.listings where seller_id = target_user_id);
    delete from public.listings where seller_id = target_user_id;
    delete from public.rate_limit_events where user_id = target_user_id;
    delete from public.audit_logs where actor_id = target_user_id or target_id = target_user_id;
    delete from public.profiles where id = target_user_id;
    delete from auth.identities where user_id = target_user_id;
    delete from auth.users where id = target_user_id;
  end loop;
end $$;

select 'private_beta_gate_marked_fixture_cleanup_complete' as result;
`;
}

function storageCountSql({ deletedUserId, avatarPath, messageAttachmentPath }) {
  return `
select
  (
    select count(*)
    from storage.objects
    where bucket_id = 'avatars'
      and owner_id = ${sqlLiteral(deletedUserId)}
      and name = ${sqlLiteral(avatarPath)}
  )::integer as avatar_objects,
  (
    select count(*)
    from storage.objects
    where bucket_id = 'listings'
      and owner_id = ${sqlLiteral(deletedUserId)}
      and name like ${sqlLiteral(`${deletedUserId}/%`)}
  )::integer as listing_objects,
  (
    select count(*)
    from storage.objects
    where bucket_id = 'message-images'
      and owner_id = ${sqlLiteral(deletedUserId)}
      and name = ${sqlLiteral(messageAttachmentPath)}
  )::integer as message_image_objects;
`;
}

function zeroFixtureVerificationSql({ userIds, testRunId }) {
  return `
with fixture_users(id) as (
  select unnest(${sqlUuidArray(userIds)}) as id
  union
  select u.id
  from auth.users u
  where (
      u.raw_app_meta_data ->> 'test_fixture' = ${sqlLiteral(fixtureName)}
      or u.raw_user_meta_data ->> 'test_fixture' = ${sqlLiteral(fixtureName)}
    )
    and coalesce(u.raw_app_meta_data ->> 'test_run_id', u.raw_user_meta_data ->> 'test_run_id') = ${sqlLiteral(testRunId)}
), counts as (
  select 'auth_users' as source, count(*)::bigint as remaining from auth.users u join fixture_users f on f.id = u.id
  union all select 'auth_identities', count(*) from auth.identities i join fixture_users f on f.id = i.user_id
  union all select 'profiles', count(*) from public.profiles p join fixture_users f on f.id = p.id
  union all select 'listings', count(*) from public.listings l join fixture_users f on f.id = l.seller_id
  union all select 'listing_images', count(*) from public.listing_images li join public.listings l on l.id = li.listing_id join fixture_users f on f.id = l.seller_id
  union all select 'favorites', count(*) from public.favorites fav join fixture_users f on f.id = fav.user_id
  union all select 'saved_searches', count(*) from public.saved_searches ss join fixture_users f on f.id = ss.user_id
  union all select 'notifications', count(*) from public.notifications n join fixture_users f on f.id = n.user_id
  union all select 'device_tokens', count(*) from public.device_tokens dt join fixture_users f on f.id = dt.user_id
  union all select 'notification_preferences', count(*) from public.notification_preferences np join fixture_users f on f.id = np.user_id
  union all select 'privacy_settings', count(*) from public.privacy_settings ps join fixture_users f on f.id = ps.user_id
  union all select 'blocks', count(*) from public.blocks b join fixture_users f on f.id in (b.blocker_id, b.blocked_id)
  union all select 'reports', count(*) from public.reports r join fixture_users f on f.id = r.reporter_id or f.id = r.reported_user_id or f.id = r.assigned_admin_id
  union all select 'report_moderation_events', count(*) from public.report_moderation_events rme join fixture_users f on f.id = rme.admin_id
  union all select 'reviews', count(*) from public.reviews rv join fixture_users f on f.id in (rv.reviewer_id, rv.reviewee_id)
  union all select 'transactions', count(*) from public.transactions t join fixture_users f on f.id in (t.buyer_id, t.seller_id)
  union all select 'conversations', count(*) from public.conversations c join fixture_users f on f.id in (c.buyer_id, c.seller_id)
  union all select 'messages', count(*) from public.messages m join fixture_users f on f.id = m.sender_id
  union all select 'rate_limit_events', count(*) from public.rate_limit_events rle join fixture_users f on f.id = rle.user_id
  union all select 'audit_logs', count(*) from public.audit_logs al join fixture_users f on f.id = al.actor_id or f.id = al.target_id
  union all select 'storage_objects', count(*) from storage.objects so join fixture_users f on so.owner_id = f.id::text or so.name like f.id::text || '/%'
)
select * from counts where remaining <> 0 order by source;
`;
}

function verificationSql({
  deletedUserId,
  otherUserId,
  deletedListingId,
  otherListingId,
  avatarPath,
  messageAttachmentPath,
}) {
  return `
do $$
declare
  deleted_user uuid := '${deletedUserId}'::uuid;
  other_user uuid := '${otherUserId}'::uuid;
  deleted_listing uuid := '${deletedListingId}'::uuid;
  other_listing uuid := '${otherListingId}'::uuid;
  failures text[] := '{}';
  deleted_profile public.profiles%rowtype;
begin
  select * into deleted_profile from public.profiles where id = deleted_user;

  if not found then
    failures := array_append(failures, 'deleted profile missing');
  elsif deleted_profile.display_name <> 'Deleted User'
    or deleted_profile.deleted_at is null
    or deleted_profile.is_banned is distinct from true
    or deleted_profile.bio is not null
    or deleted_profile.avatar_url is not null
    or deleted_profile.city is not null
    or deleted_profile.state is not null
    or deleted_profile.zip_code is not null
    or deleted_profile.latitude is not null
    or deleted_profile.longitude is not null then
    failures := array_append(failures, 'profile not anonymized');
  end if;

  if exists (
    select 1
    from public.listings
    where id = deleted_listing
      and (status <> 'archived'::public.listing_status or deleted_at is null)
  ) then
    failures := array_append(failures, 'deleted user listing not archived');
  end if;

  if exists (select 1 from public.favorites where user_id = deleted_user) then
    failures := array_append(failures, 'favorites retained');
  end if;

  if exists (select 1 from public.saved_searches where user_id = deleted_user) then
    failures := array_append(failures, 'saved searches retained');
  end if;

  if exists (select 1 from public.device_tokens where user_id = deleted_user) then
    failures := array_append(failures, 'device tokens retained');
  end if;

  if exists (select 1 from public.notification_preferences where user_id = deleted_user) then
    failures := array_append(failures, 'notification preferences retained');
  end if;

  if exists (select 1 from public.privacy_settings where user_id = deleted_user) then
    failures := array_append(failures, 'privacy settings retained');
  end if;

  if exists (select 1 from public.notifications where user_id = deleted_user) then
    failures := array_append(failures, 'notifications retained');
  end if;

  if not exists (
    select 1
    from public.conversations
    where buyer_id = deleted_user or seller_id = deleted_user
  ) then
    failures := array_append(failures, 'conversation safety record missing');
  end if;

  if not exists (
    select 1
    from public.messages
    where sender_id = deleted_user
  ) then
    failures := array_append(failures, 'message safety record missing');
  end if;

  if not exists (
    select 1
    from public.messages
    where sender_id = deleted_user
      and attachment_path = '${messageAttachmentPath}'
  ) then
    failures := array_append(failures, 'message image safety record missing');
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where event_type = 'account_deleted'::public.audit_event_type
      and target_id = deleted_user
  ) then
    failures := array_append(failures, 'account deletion audit event missing');
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'avatars'
      and name = '${avatarPath}'
  ) then
    failures := array_append(failures, 'avatar object retained');
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'listings'
      and owner_id = deleted_user::text
      and name like deleted_user::text || '/%'
  ) then
    failures := array_append(failures, 'listing image object retained');
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'message-images'
      and owner_id = deleted_user::text
      and name = '${messageAttachmentPath}'
  ) then
    failures := array_append(failures, 'message image object was not retained');
  end if;

  if not exists (
    select 1
    from public.listings
    where id = other_listing
      and seller_id = other_user
      and deleted_at is null
  ) then
    failures := array_append(failures, 'unrelated listing changed');
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = other_user
      and deleted_at is null
      and display_name = 'Other Beta Tester'
  ) then
    failures := array_append(failures, 'unrelated profile changed');
  end if;

  if array_length(failures, 1) is not null then
    raise exception 'Private beta account deletion verification failed: %', array_to_string(failures, ', ');
  end if;
end $$;

select 'private_beta_account_deletion_live_tests_passed' as result;
`;
}

liveSupabaseTest('private beta secure account deletion endpoint anonymizes and disables a disposable user', async () => {
  const slug = runSlug();
  const deletedEmail = uniqueEmail('delete', slug);
  const otherEmail = uniqueEmail('other', slug);
  const deletedPassword = password();
  const otherPassword = password();
  const deletedUserId = randomUUID();
  const otherUserId = randomUUID();
  const userIds = [deletedUserId, otherUserId];
  let otherListing;
  let unsubscribeNotifications = () => undefined;

  const preflightOutput = runLinkedSql(cleanupMarkedFixturesSql(), 'private-beta-preflight-cleanup');
  assert.match(preflightOutput, /private_beta_gate_marked_fixture_cleanup_complete/);

  try {
    createVerifiedAuthFixture({
      userId: otherUserId,
      email: otherEmail,
      pass: otherPassword,
      displayName: 'Other Beta Tester',
      username: `other_${slug.slice(-16)}`,
      testRunId: slug,
    });
    otherListing = createListingFixture({
      sellerId: otherUserId,
      title: `Other ${slug} private beta fixture crate`,
    });

    createVerifiedAuthFixture({
      userId: deletedUserId,
      email: deletedEmail,
      pass: deletedPassword,
      displayName: 'Delete Beta Tester',
      username: `delete_${slug.slice(-15)}`,
      testRunId: slug,
    });
    await signInWithEmail(deletedEmail, deletedPassword);
    assert.equal(await currentUserId(), deletedUserId);
    const tokens = await currentAccessToken();
    const deletedListing = await createTestListing('Deleted', slug);
    const avatarPath = await uploadAvatarFixture(deletedUserId, slug);

    assert.ok(otherListing, 'Expected unrelated listing fixture.');
    createFavoriteFixture({ userId: deletedUserId, listingId: otherListing.id });
    await updateNotificationPreferences({ messages: true, favorites: true, pushMessages: false });
    await updatePrivacySettings({ showCityState: false, allowApproximateDistance: false });
    await registerDeviceToken(`expo-delete-${slug}`, 'ios');
    await createSavedSearch({
      name: `Private beta ${slug} crate alert`,
      search_query: 'crate',
      radius_miles: 25,
      city: 'Springfield',
      state: 'IL',
      zip_code: '62704',
    });

    const conversation = await getOrCreateConversation(otherListing.id);
    await sendMessage({
      conversationId: conversation.id,
      body: `Disposable private beta safety record ${slug}.`,
    });
    const imageMessage = await sendImageMessage(
      conversation.id,
      tinyPng,
      `Disposable private beta image safety record ${slug}.`
    );
    assert.ok(imageMessage.attachment_path, 'Expected a persisted message image attachment path.');

    unsubscribeNotifications = subscribeToUserNotifications(deletedUserId, () => undefined);
    assert.ok(getActiveRealtimeSubscriptionCountForTests() > 0, 'Expected a live realtime subscription before deletion.');

    runLinkedSql(
      `
select set_config('retail.phase_e_trusted_notification_write', 'true', true);

insert into public.notifications (user_id, type, title, body, data, dedupe_key)
values (
  '${deletedUserId}'::uuid,
  'system'::public.notification_type,
  'Disposable beta notice',
  'Disposable beta account deletion test notice.',
  jsonb_build_object('test_fixture', '${fixtureName}', 'test_run_id', '${slug}'),
  'private-beta-delete-${slug}'
)
on conflict do nothing;

select set_config('retail.phase_e_trusted_notification_write', 'false', true);
`,
      'private-beta-delete-setup'
    );

    const beforeStorageRows = linkedSqlRows(runLinkedSql(
      storageCountSql({
        deletedUserId,
        avatarPath,
        messageAttachmentPath: imageMessage.attachment_path,
      }),
      'private-beta-storage-before'
    ));
    assert.equal(beforeStorageRows[0]?.avatar_objects, 1);
    assert.ok(beforeStorageRows[0]?.listing_objects >= 1);
    assert.equal(beforeStorageRows[0]?.message_image_objects, 1);

    const directServerRpc = await supabase.rpc('prepare_account_deletion_for_user', {
      target_user_id: otherUserId,
    });
    assert.ok(directServerRpc.error, 'Authenticated users must not call server-only account preparation.');

    const directOldRpc = await supabase.rpc('prepare_current_account_deletion');
    assert.ok(directOldRpc.error, 'Authenticated users must not call obsolete account preparation.');

    const maliciousTargetAttempt = await supabase.functions.invoke('delete-account', {
      method: 'POST',
      body: { userId: otherUserId },
    });

    if (maliciousTargetAttempt.error) {
      assert.fail(`delete-account failed: ${await functionFailureDetail(maliciousTargetAttempt.error)}`);
    }

    assert.equal(maliciousTargetAttempt.data?.deleted, true);
    assert.equal(maliciousTargetAttempt.data?.authDeleted, true);
    assert.ok(maliciousTargetAttempt.data?.storageCleanup?.avatarsRemoved >= 1);
    assert.ok(maliciousTargetAttempt.data?.storageCleanup?.listingImagesRemoved >= 1);
    assert.equal(maliciousTargetAttempt.data?.storageCleanup?.messageImagesRetained, true);

    const secondAttempt = await supabase.functions.invoke('delete-account', {
      method: 'POST',
      body: { userId: otherUserId },
    });
    assert.ok(secondAttempt.error || secondAttempt.data?.deleted === true);

    const freshClient = createFreshClient();
    const signInAfterDeletion = await freshClient.auth.signInWithPassword({
      email: deletedEmail,
      password: deletedPassword,
    });
    assert.ok(signInAfterDeletion.error || !signInAfterDeletion.data.session);

    const refreshAfterDeletion = await freshClient.auth.refreshSession({
      refresh_token: tokens.refreshToken,
    });
    assert.ok(refreshAfterDeletion.error || !refreshAfterDeletion.data.session);

    const staleSessionClient = createStaleSessionClient(tokens.accessToken);
    const protectedMutation = await staleSessionClient
      .from('favorites')
      .insert({ user_id: deletedUserId, listing_id: otherListing.id });
    assert.ok(protectedMutation.error);

    const verificationOutput = runLinkedSql(
      verificationSql({
        deletedUserId,
        otherUserId,
        deletedListingId: deletedListing.id,
        otherListingId: otherListing.id,
        avatarPath,
        messageAttachmentPath: imageMessage.attachment_path,
      }),
      'private-beta-delete-verify'
    );
    assert.match(verificationOutput, /private_beta_account_deletion_live_tests_passed/);

    await clearDeletedAccountLocalState();
    const localSessionAfterDeletion = await supabase.auth.getSession();
    assert.equal(localSessionAfterDeletion.data.session, null);
    assert.equal(getActiveRealtimeSubscriptionCountForTests(), 0);
  } finally {
    unsubscribeNotifications();
    await signOut().catch(() => undefined);
    const cleanupOutput = runLinkedSql(cleanupExactFixtureSql(userIds), 'private-beta-delete-cleanup');
    assert.match(cleanupOutput, /private_beta_gate_marked_fixture_cleanup_complete/);
    const zeroRows = linkedSqlRows(runLinkedSql(
      zeroFixtureVerificationSql({ userIds, testRunId: slug }),
      'private-beta-delete-zero-fixtures'
    ));
    assert.deepEqual(zeroRows, []);
  }
});
