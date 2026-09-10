-- Radius-only discovery changes must not consume the anti-abuse allowance for
-- changing a user's marketplace city/area. Rescue Hub intentionally shares the
-- marketplace search preference, so this keeps both surfaces in sync while
-- allowing the supported 10/25/50/100 mile controls to work normally.
create or replace function public.set_marketplace_search_area(
  requested_search_area_id uuid,
  requested_radius_miles integer default 25
)
returns table(
  search_area_id uuid,
  radius_miles integer,
  label text,
  city text,
  state text,
  region_name text,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_radius integer := coalesce(requested_radius_miles, 25);
  selected_area record;
  existing_search_area_id uuid;
  existing_radius_miles integer;
  recent_successful_area_changes integer := 0;
  area_changed boolean := false;
  preference_changed boolean := false;
begin
  if caller_id is null or not public.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if normalized_radius not in (10, 25, 50, 100) then
    raise exception 'RETAIL_INVALID_SEARCH_RADIUS' using errcode = '22023';
  end if;

  select msa.id, msa.label, msa.city, msa.state, msa.region_name
  into selected_area
  from public.marketplace_search_areas msa
  where msa.id = requested_search_area_id
    and msa.is_active = true;

  if selected_area.id is null then
    raise exception 'RETAIL_SEARCH_AREA_NOT_FOUND' using errcode = 'P0001';
  end if;

  select pref.search_area_id, pref.radius_miles
  into existing_search_area_id, existing_radius_miles
  from public.marketplace_search_preferences pref
  where pref.user_id = caller_id;

  area_changed :=
    existing_search_area_id is null
    or existing_search_area_id is distinct from selected_area.id;

  preference_changed :=
    area_changed
    or existing_radius_miles is distinct from normalized_radius;

  if area_changed then
    select count(*)::integer
    into recent_successful_area_changes
    from public.marketplace_search_area_change_events event
    where event.user_id = caller_id
      and event.created_at >= now() - interval '24 hours';

    if recent_successful_area_changes >= 3 then
      raise exception 'RETAIL_SEARCH_AREA_RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.marketplace_search_preferences (
    user_id,
    search_area_id,
    radius_miles,
    created_at,
    updated_at,
    last_changed_at
  )
  values (
    caller_id,
    selected_area.id,
    normalized_radius,
    now(),
    now(),
    now()
  )
  on conflict (user_id) do update
  set search_area_id = excluded.search_area_id,
      radius_miles = excluded.radius_miles,
      updated_at = now(),
      last_changed_at = case
        when public.marketplace_search_preferences.search_area_id is distinct from excluded.search_area_id
          or public.marketplace_search_preferences.radius_miles is distinct from excluded.radius_miles
        then now()
        else public.marketplace_search_preferences.last_changed_at
      end;

  if area_changed then
    insert into public.marketplace_search_area_change_events (
      user_id,
      search_area_id,
      radius_miles
    )
    values (
      caller_id,
      selected_area.id,
      normalized_radius
    );
  end if;

  if preference_changed then
    insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
    values (
      caller_id,
      'moderator_action',
      'marketplace_search_preferences',
      caller_id,
      jsonb_build_object(
        'action', case when area_changed then 'marketplace_search_area_changed' else 'marketplace_search_radius_changed' end,
        'search_area_id', selected_area.id,
        'radius_miles', normalized_radius
      )
    );
  end if;

  return query
  select
    selected_area.id,
    normalized_radius,
    selected_area.label,
    selected_area.city,
    selected_area.state,
    selected_area.region_name,
    preference_changed;
end;
$$;

revoke all on function public.set_marketplace_search_area(uuid, integer) from public, anon;
grant execute on function public.set_marketplace_search_area(uuid, integer) to authenticated, service_role;
