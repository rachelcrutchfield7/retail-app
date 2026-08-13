-- ReTail Private Beta Gate Closure
-- Secure account deletion preparation for trusted Edge Function workflow.
--
-- The mobile app must not call the Supabase Admin API or a service-role key.
-- It invokes the JWT-protected delete-account Edge Function, which calls this
-- retry-safe preparation RPC as the authenticated user before soft-deleting the
-- Auth identity with auth.admin.deleteUser(userId, true).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- The previous user-facing RPC was not sufficient because it only anonymized
-- app data and left the Supabase Auth identity active. Remove direct access so
-- mobile clients cannot keep using it as a fallback.
drop function if exists public.delete_current_account();

create or replace function private.is_account_deletion_context()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.current_setting('retail.account_deletion_context', true), '') = 'on';
$$;

revoke all on function private.is_account_deletion_context()
  from public, anon, authenticated;

create or replace function private.require_active_account()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'RETAIL_ACCOUNT_NOT_ACTIVE'
      using errcode = '42501';
  end if;

  if private.is_account_deletion_context() then
    return caller_id;
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_NOT_ACTIVE'
      using errcode = '42501';
  end if;

  return caller_id;
end;
$$;

revoke all on function private.require_active_account()
  from public, anon, authenticated;

create or replace function private.check_rate_limit(
  requested_action text,
  requested_subject_key text,
  requested_limit integer,
  requested_window interval,
  requested_fingerprint_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_action text := nullif(pg_catalog.btrim(coalesce(requested_action, '')), '');
  safe_subject text := coalesce(nullif(pg_catalog.btrim(coalesce(requested_subject_key, '')), ''), 'global');
  safe_fingerprint text := nullif(pg_catalog.btrim(coalesce(requested_fingerprint_hash, '')), '');
  recent_count integer;
begin
  if safe_action is null
    or char_length(safe_action) > 80
    or char_length(safe_subject) > 160
    or requested_limit is null
    or requested_limit < 1
    or requested_window is null
    or requested_window <= interval '0 seconds' then
    raise exception 'RETAIL_RATE_LIMIT_CONFIG_INVALID';
  end if;

  if safe_fingerprint is not null and safe_fingerprint !~ '^[a-f0-9]{32,128}$' then
    raise exception 'RETAIL_RATE_LIMIT_CONFIG_INVALID';
  end if;

  if private.is_account_deletion_context() then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text || ':' || safe_action || ':' || safe_subject, 0)
  );

  select count(*)
  into recent_count
  from public.rate_limit_events event
  where event.user_id = caller_id
    and event.action = safe_action
    and event.subject_key = safe_subject
    and event.created_at >= now() - requested_window;

  if recent_count >= requested_limit then
    raise exception 'RETAIL_RATE_LIMITED'
      using errcode = '42901';
  end if;

  insert into public.rate_limit_events (
    user_id,
    action,
    subject_key,
    request_fingerprint_hash,
    metadata,
    created_at,
    expires_at
  )
  values (
    caller_id,
    safe_action,
    safe_subject,
    safe_fingerprint,
    '{}'::jsonb,
    now(),
    now() + interval '60 days'
  );
end;
$$;

revoke all on function private.check_rate_limit(text, text, integer, interval, text)
  from public, anon, authenticated;

create or replace function public.prepare_current_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  profile_exists boolean := false;
  profile_updated integer := 0;
  archived_listings integer := 0;
  removed_favorites integer := 0;
  removed_saved_searches integer := 0;
  removed_notifications integer := 0;
  removed_device_tokens integer := 0;
  removed_notification_preferences integer := 0;
  removed_privacy_settings integer := 0;
  removed_owned_blocks integer := 0;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('retail-account-deletion:' || caller_id::text, 0)
  );

  perform pg_catalog.set_config('retail.account_deletion_context', 'on', true);

  select exists (
    select 1
    from public.profiles profile
    where profile.id = caller_id
  )
  into profile_exists;

  update public.listings listing
  set status = 'archived'::public.listing_status,
      deleted_at = coalesce(listing.deleted_at, now()),
      updated_at = now()
  where listing.seller_id = caller_id
    and listing.status in (
      'draft'::public.listing_status,
      'active'::public.listing_status,
      'pending'::public.listing_status
    );
  get diagnostics archived_listings = row_count;

  delete from public.favorites favorite
  where favorite.user_id = caller_id;
  get diagnostics removed_favorites = row_count;

  delete from public.saved_searches saved_search
  where saved_search.user_id = caller_id;
  get diagnostics removed_saved_searches = row_count;

  delete from public.notifications notification
  where notification.user_id = caller_id;
  get diagnostics removed_notifications = row_count;

  delete from public.device_tokens device_token
  where device_token.user_id = caller_id;
  get diagnostics removed_device_tokens = row_count;

  delete from public.notification_preferences preference
  where preference.user_id = caller_id;
  get diagnostics removed_notification_preferences = row_count;

  delete from public.privacy_settings privacy
  where privacy.user_id = caller_id;
  get diagnostics removed_privacy_settings = row_count;

  delete from public.blocks block
  where block.blocker_id = caller_id;
  get diagnostics removed_owned_blocks = row_count;

  update public.profiles profile
  set display_name = 'Deleted User',
      username = ('deleted_' || pg_catalog.substr(pg_catalog.md5(caller_id::text), 1, 24))::public.citext,
      bio = null,
      avatar_url = null,
      city = null,
      state = null,
      zip_code = null,
      latitude = null,
      longitude = null,
      is_banned = true,
      deleted_at = coalesce(profile.deleted_at, now()),
      updated_at = now()
  where profile.id = caller_id;
  get diagnostics profile_updated = row_count;

  if not exists (
    select 1
    from public.audit_logs audit
    where audit.event_type = 'account_deleted'::public.audit_event_type
      and audit.target_table = 'profiles'
      and audit.target_id = caller_id
  ) then
    insert into public.audit_logs (
      actor_id,
      event_type,
      target_table,
      target_id,
      metadata,
      created_at
    )
    values (
      case when profile_exists then caller_id else null end,
      'account_deleted'::public.audit_event_type,
      'profiles',
      caller_id,
      pg_catalog.jsonb_build_object(
        'source', 'secure_account_deletion',
        'authDeletion', 'edge_function_required',
        'profileFound', profile_exists,
        'profileUpdated', profile_updated > 0,
        'archivedListings', archived_listings,
        'removedFavorites', removed_favorites,
        'removedSavedSearches', removed_saved_searches,
        'removedNotifications', removed_notifications,
        'removedDeviceTokens', removed_device_tokens,
        'removedNotificationPreferences', removed_notification_preferences,
        'removedPrivacySettings', removed_privacy_settings,
        'removedOwnedBlocks', removed_owned_blocks,
        'retainedSafetyRecords', pg_catalog.jsonb_build_array(
          'transactions',
          'reviews',
          'messages',
          'reports',
          'report_moderation_events',
          'audit_logs'
        )
      ),
      now()
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'prepared', true,
    'profileFound', profile_exists,
    'profileAnonymized', profile_updated > 0
  );
end;
$$;

revoke all on function public.prepare_current_account_deletion()
  from public, anon, authenticated;
grant execute on function public.prepare_current_account_deletion()
  to authenticated;

notify pgrst, 'reload schema';
