import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { liveSupabaseTest } from './liveSupabaseTest.mjs';

import { signInWithEmail, signOut } from '../src/services/authService.ts';
import { getOrCreateConversation } from '../src/services/conversationService.ts';
import { createListing } from '../src/services/listingService.ts';
import { sendMessage } from '../src/services/messageService.ts';
import { registerDeviceToken, updateNotificationPreferences } from '../src/services/notificationService.ts';
import { createSavedSearch } from '../src/services/savedSearchService.ts';
import { updatePrivacySettings } from '../src/services/settingsService.ts';
import { supabase } from '../src/lib/supabase.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for live private beta gate closure tests.`);
  }

  return value;
}

function uniqueEmail(label) {
  return `retail.beta.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@gmail.com`;
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

async function createTestListing(label) {
  return createListing({
    title: `${label} crate`,
    description: `${label} disposable private beta test listing.`,
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
      // Best-effort cleanup so generated disposable passwords are not left in tmp.
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

function createVerifiedAuthFixture({ userId, email, pass, displayName, username }) {
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
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'display_name', ${sqlLiteral(displayName)},
    'username', ${sqlLiteral(username)},
    'account_type', 'regular'
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

function cleanupFixtureSql(userIds) {
  const ids = userIds.map(sqlUuid).join(', ');

  return `
do $$
declare
  fixture_users uuid[] := array[${ids}];
begin
  perform set_config('request.jwt.claim.sub', fixture_users[1]::text, true);
  perform set_config('retail.account_deletion_context', 'on', true);

  delete from public.report_moderation_events
  where admin_id = any(fixture_users)
     or report_id in (
       select id
       from public.reports
       where reporter_id = any(fixture_users)
          or reported_user_id = any(fixture_users)
          or message_id in (
            select id from public.messages where sender_id = any(fixture_users)
          )
     );

  delete from public.reviews
  where reviewer_id = any(fixture_users)
     or reviewee_id = any(fixture_users);

  delete from public.transactions
  where buyer_id = any(fixture_users)
     or seller_id = any(fixture_users)
     or listing_id in (select id from public.listings where seller_id = any(fixture_users));

  delete from public.messages
  where sender_id = any(fixture_users)
     or conversation_id in (
       select id
       from public.conversations
       where buyer_id = any(fixture_users)
          or seller_id = any(fixture_users)
     );

  delete from public.conversations
  where buyer_id = any(fixture_users)
     or seller_id = any(fixture_users);

  delete from public.reports
  where reporter_id = any(fixture_users)
     or reported_user_id = any(fixture_users)
     or listing_id in (select id from public.listings where seller_id = any(fixture_users));

  delete from public.favorites
  where user_id = any(fixture_users)
     or listing_id in (select id from public.listings where seller_id = any(fixture_users));

  delete from public.saved_searches where user_id = any(fixture_users);
  delete from public.notifications where user_id = any(fixture_users);
  delete from public.device_tokens where user_id = any(fixture_users);
  delete from public.notification_preferences where user_id = any(fixture_users);
  delete from public.privacy_settings where user_id = any(fixture_users);
  delete from public.blocks where blocker_id = any(fixture_users) or blocked_id = any(fixture_users);
  delete from public.listing_images
  where listing_id in (select id from public.listings where seller_id = any(fixture_users));
  delete from public.listings where seller_id = any(fixture_users);
  delete from public.audit_logs where actor_id = any(fixture_users) or target_id = any(fixture_users);
  delete from public.profiles where id = any(fixture_users);
  delete from auth.identities where user_id = any(fixture_users);
  delete from auth.users where id = any(fixture_users);
end $$;

select 'private_beta_account_deletion_fixture_cleanup_complete' as result;
`;
}

function verificationSql({
  deletedUserId,
  otherUserId,
  deletedListingId,
  otherListingId,
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
    from public.audit_logs
    where event_type = 'account_deleted'::public.audit_event_type
      and target_id = deleted_user
  ) then
    failures := array_append(failures, 'account deletion audit event missing');
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

  if array_length(failures, 1) is not null then
    raise exception 'Private beta account deletion verification failed: %', array_to_string(failures, ', ');
  end if;
end $$;

select 'private_beta_account_deletion_live_tests_passed' as result;
`;
}

liveSupabaseTest('private beta secure account deletion endpoint anonymizes and disables a disposable user', async () => {
  const deletedEmail = uniqueEmail('delete');
  const otherEmail = uniqueEmail('other');
  const deletedPassword = password();
  const otherPassword = password();
  const deletedUserId = randomUUID();
  const otherUserId = randomUUID();
  const userIds = [deletedUserId, otherUserId];
  let otherListing;

  try {
    createVerifiedAuthFixture({
      userId: otherUserId,
      email: otherEmail,
      pass: otherPassword,
      displayName: 'Other Beta Tester',
      username: `other_${Date.now().toString(36)}`,
    });
    otherListing = createListingFixture({
      sellerId: otherUserId,
      title: 'Other private beta fixture crate',
    });

    createVerifiedAuthFixture({
      userId: deletedUserId,
      email: deletedEmail,
      pass: deletedPassword,
      displayName: 'Delete Beta Tester',
      username: `delete_${Date.now().toString(36)}`,
    });
    await signInWithEmail(deletedEmail, deletedPassword);
    assert.equal(await currentUserId(), deletedUserId);
    const tokens = await currentAccessToken();
    const deletedListing = await createTestListing('Deleted');

    assert.ok(otherListing, 'Expected unrelated listing fixture.');
    createFavoriteFixture({ userId: deletedUserId, listingId: otherListing.id });
    await updateNotificationPreferences({ messages: true, favorites: true, pushMessages: false });
    await updatePrivacySettings({ showCityState: false, allowApproximateDistance: false });
    await registerDeviceToken(`expo-delete-${deletedUserId}`, 'ios');
    await createSavedSearch({
      name: 'Private beta crate alert',
      search_query: 'crate',
      radius_miles: 25,
      city: 'Springfield',
      state: 'IL',
      zip_code: '62704',
    });

    const conversation = await getOrCreateConversation(otherListing.id);
    await sendMessage({
      conversationId: conversation.id,
      body: 'Disposable private beta safety record.',
    });

    runLinkedSql(
      `
select set_config('retail.phase_e_trusted_notification_write', 'true', true);

insert into public.notifications (user_id, type, title, body, data, dedupe_key)
values (
  '${deletedUserId}'::uuid,
  'system'::public.notification_type,
  'Disposable beta notice',
  'Disposable beta account deletion test notice.',
  '{}'::jsonb,
  'private-beta-delete-${deletedUserId}'
)
on conflict do nothing;

select set_config('retail.phase_e_trusted_notification_write', 'false', true);
`,
      'private-beta-delete-setup'
    );

    const maliciousTargetAttempt = await supabase.functions.invoke('delete-account', {
      method: 'POST',
      body: { userId: otherUserId },
    });

    if (maliciousTargetAttempt.error) {
      assert.fail(`delete-account failed: ${await functionFailureDetail(maliciousTargetAttempt.error)}`);
    }

    assert.equal(maliciousTargetAttempt.data?.deleted, true);
    assert.equal(maliciousTargetAttempt.data?.authDeleted, true);
    assert.ok(maliciousTargetAttempt.data?.storageCleanup?.listingImagesRemoved >= 1);

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
      }),
      'private-beta-delete-verify'
    );
    assert.match(verificationOutput, /private_beta_account_deletion_live_tests_passed/);
  } finally {
    await signOut().catch(() => undefined);
    const cleanupOutput = runLinkedSql(cleanupFixtureSql(userIds), 'private-beta-delete-cleanup');
    assert.match(cleanupOutput, /private_beta_account_deletion_fixture_cleanup_complete/);
  }
});
