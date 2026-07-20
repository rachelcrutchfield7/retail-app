-- ReTail Private Beta Gate Closure Final Correction
-- Make account-deletion database preparation callable only by trusted server code.

drop function if exists public.prepare_current_account_deletion();

create or replace function public.prepare_account_deletion_for_user(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
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
  if target_user_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('retail-account-deletion:' || target_user_id::text, 0)
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', target_user_id::text, true);
  perform pg_catalog.set_config('retail.account_deletion_context', 'on', true);

  select exists (
    select 1
    from public.profiles profile
    where profile.id = target_user_id
  )
  into profile_exists;

  update public.listings listing
  set status = 'archived'::public.listing_status,
      deleted_at = coalesce(listing.deleted_at, now()),
      updated_at = now()
  where listing.seller_id = target_user_id
    and listing.status in (
      'draft'::public.listing_status,
      'active'::public.listing_status,
      'pending'::public.listing_status
    );
  get diagnostics archived_listings = row_count;

  delete from public.favorites favorite
  where favorite.user_id = target_user_id;
  get diagnostics removed_favorites = row_count;

  delete from public.saved_searches saved_search
  where saved_search.user_id = target_user_id;
  get diagnostics removed_saved_searches = row_count;

  delete from public.notifications notification
  where notification.user_id = target_user_id;
  get diagnostics removed_notifications = row_count;

  delete from public.device_tokens device_token
  where device_token.user_id = target_user_id;
  get diagnostics removed_device_tokens = row_count;

  delete from public.notification_preferences preference
  where preference.user_id = target_user_id;
  get diagnostics removed_notification_preferences = row_count;

  delete from public.privacy_settings privacy
  where privacy.user_id = target_user_id;
  get diagnostics removed_privacy_settings = row_count;

  delete from public.blocks block
  where block.blocker_id = target_user_id;
  get diagnostics removed_owned_blocks = row_count;

  update public.profiles profile
  set display_name = 'Deleted User',
      username = ('deleted_' || pg_catalog.substr(pg_catalog.md5(target_user_id::text), 1, 24))::public.citext,
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
  where profile.id = target_user_id;
  get diagnostics profile_updated = row_count;

  if not exists (
    select 1
    from public.audit_logs audit
    where audit.event_type = 'account_deleted'::public.audit_event_type
      and audit.target_table = 'profiles'
      and audit.target_id = target_user_id
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
      case when profile_exists then target_user_id else null end,
      'account_deleted'::public.audit_event_type,
      'profiles',
      target_user_id,
      pg_catalog.jsonb_build_object(
        'source', 'secure_account_deletion',
        'authDeletion', 'edge_function_required',
        'preparation', 'server_only',
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
    'profileAnonymized', profile_updated > 0,
    'archivedListings', archived_listings,
    'removedConvenienceRecords',
      removed_favorites
      + removed_saved_searches
      + removed_notifications
      + removed_device_tokens
      + removed_notification_preferences
      + removed_privacy_settings
      + removed_owned_blocks
  );
end;
$$;

revoke all on function public.prepare_account_deletion_for_user(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_account_deletion_for_user(uuid)
  to service_role;

notify pgrst, 'reload schema';
