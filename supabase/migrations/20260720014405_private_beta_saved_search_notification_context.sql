-- ReTail Private Beta Gate Closure
-- Preserve saved-search alert delivery after Phase F write guards.
--
-- Creating a listing can create saved-search notifications for other users and
-- update their last_notified_at timestamp. That update is trusted internal
-- bookkeeping, not a user-initiated saved-search edit.

create or replace function private.enforce_phase_f_saved_search_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  active_count integer;
  target_user_id uuid;
  excluded_saved_search_id uuid;
  trusted_notification_write boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.trusted_saved_search_notification_write', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'UPDATE' and trusted_notification_write then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.name is distinct from old.name
      or new.search_query is distinct from old.search_query
      or new.category_id is distinct from old.category_id
      or new.category_slug is distinct from old.category_slug
      or new.category_name is distinct from old.category_name
      or new.min_price is distinct from old.min_price
      or new.max_price is distinct from old.max_price
      or new.condition is distinct from old.condition
      or new.listing_type is distinct from old.listing_type
      or new.radius_miles is distinct from old.radius_miles
      or new.city is distinct from old.city
      or new.state is distinct from old.state
      or new.zip_code is distinct from old.zip_code
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.notifications_enabled is distinct from old.notifications_enabled
      or new.created_at is distinct from old.created_at
      or new.deleted_at is distinct from old.deleted_at then
      raise exception 'RETAIL_SAVED_SEARCH_IMMUTABLE'
        using errcode = '42501';
    end if;

    return new;
  end if;

  caller_id := private.require_active_account();

  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
    excluded_saved_search_id := old.id;
  else
    target_user_id := new.user_id;
    excluded_saved_search_id := case when tg_op = 'UPDATE' then old.id else null end;
  end if;

  if target_user_id is distinct from caller_id then
    raise exception 'RETAIL_SAVED_SEARCH_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('saved_search_change_hour', 'global', 30, interval '1 hour');

  if tg_op in ('INSERT', 'UPDATE') then
    perform private.ensure_public_search_bounds(1, 20, new.search_query);

    if new.radius_miles is null or new.radius_miles <= 0 or new.radius_miles > 100 then
      raise exception 'RETAIL_SEARCH_LIMIT_EXCEEDED'
        using errcode = '22023';
    end if;

    if new.deleted_at is null then
      select count(*)
      into active_count
      from public.saved_searches ss
      where ss.user_id = caller_id
        and ss.deleted_at is null
        and (excluded_saved_search_id is null or ss.id <> excluded_saved_search_id);

      if active_count >= 50 then
        raise exception 'RETAIL_SAVED_SEARCH_LIMIT_EXCEEDED'
          using errcode = '42901';
      end if;
    end if;

    return new;
  end if;

  return old;
end;
$$;

revoke all on function private.enforce_phase_f_saved_search_write()
  from public, anon, authenticated;

create or replace function public.create_saved_search_notifications_for_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_search_row record;
begin
  if new.status <> 'active'::public.listing_status or new.deleted_at is not null then
    return new;
  end if;

  for saved_search_row in
    select ss.*
    from public.saved_searches ss
    where ss.deleted_at is null
      and ss.notifications_enabled = true
      and ss.user_id <> new.seller_id
      and (
        ss.search_query is null
        or pg_catalog.btrim(ss.search_query) = ''
        or new.title ilike '%' || ss.search_query || '%'
        or new.description ilike '%' || ss.search_query || '%'
        or coalesce(new.brand, '') ilike '%' || ss.search_query || '%'
      )
      and (ss.category_id is null or ss.category_id = new.category_id)
      and (ss.min_price is null or coalesce(new.price, 0) >= ss.min_price)
      and (ss.max_price is null or coalesce(new.price, 0) <= ss.max_price)
      and (ss.condition is null or ss.condition = new.condition)
      and (ss.listing_type is null or ss.listing_type = new.listing_type)
      and (
        ss.latitude is null
        or ss.longitude is null
        or new.latitude is null
        or new.longitude is null
        or public.approximate_distance_miles(ss.latitude, ss.longitude, new.latitude, new.longitude) <= ss.radius_miles
      )
      and (
        (ss.latitude is not null and ss.longitude is not null and new.latitude is not null and new.longitude is not null)
        or ss.city is null
        or ss.state is null
        or (lower(ss.city) = lower(new.city) and lower(ss.state) = lower(new.state))
      )
  loop
    perform private.create_notification_for_event(
      saved_search_row.user_id,
      'saved_search'::public.notification_type,
      'New saved search match',
      '"' || new.title || '" matches "' || saved_search_row.name || '".',
      '/listing/' || new.id::text,
      jsonb_build_object(
        'savedSearchId', saved_search_row.id,
        'listingId', new.id
      ),
      'saved-search:' || saved_search_row.id::text || ':' || new.id::text
    );
  end loop;

  perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'true', true);

  update public.saved_searches ss
  set last_notified_at = now()
  where ss.deleted_at is null
    and ss.notifications_enabled = true
    and ss.user_id <> new.seller_id
    and (
      ss.search_query is null
      or pg_catalog.btrim(ss.search_query) = ''
      or new.title ilike '%' || ss.search_query || '%'
      or new.description ilike '%' || ss.search_query || '%'
      or coalesce(new.brand, '') ilike '%' || ss.search_query || '%'
    )
    and (ss.category_id is null or ss.category_id = new.category_id)
    and (ss.min_price is null or coalesce(new.price, 0) >= ss.min_price)
    and (ss.max_price is null or coalesce(new.price, 0) <= ss.max_price)
    and (ss.condition is null or ss.condition = new.condition)
    and (ss.listing_type is null or ss.listing_type = new.listing_type);

  perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'false', true);

  return new;
exception
  when others then
    perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.create_saved_search_notifications_for_listing()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
