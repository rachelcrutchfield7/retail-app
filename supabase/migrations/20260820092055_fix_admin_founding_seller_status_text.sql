create or replace function public.get_admin_founding_seller_status(
  target_user_id uuid
)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  email text,
  account_type text,
  benefit_id uuid,
  status text,
  free_sales_limit integer,
  fee_free_sales_used integer,
  currently_reserved integer,
  fee_free_sales_remaining integer,
  granted_at timestamptz,
  source text,
  notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'RETAIL_FOUNDING_SELLER_TARGET_REQUIRED' using errcode = '22023';
  end if;

  return query
  select
    p.id as profile_id,
    p.display_name,
    p.username,
    u.email::text,
    p.account_type::text,
    b.id as benefit_id,
    coalesce(b.status::text, 'not_enrolled') as status,
    coalesce(b.free_sales_limit, 3) as free_sales_limit,
    coalesce(count(uses.id) filter (where uses.status = 'applied'), 0)::integer as fee_free_sales_used,
    coalesce(count(uses.id) filter (where uses.status = 'reserved' and uses.expires_at >= now()), 0)::integer as currently_reserved,
    greatest(
      coalesce(b.free_sales_limit, 3)
        - coalesce(count(uses.id) filter (where uses.status = 'applied'), 0)::integer
        - coalesce(count(uses.id) filter (where uses.status = 'reserved' and uses.expires_at >= now()), 0)::integer,
      0
    )::integer as fee_free_sales_remaining,
    b.granted_at,
    b.source,
    b.notes
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.founding_seller_benefits b on b.user_id = p.id
  left join public.founding_seller_benefit_uses uses on uses.benefit_id = b.id
  where p.id = target_user_id
  group by p.id, p.display_name, p.username, u.email, p.account_type, b.id, b.status, b.free_sales_limit, b.granted_at, b.source, b.notes;
end;
$$;

create or replace function public.search_admin_founding_seller_profiles(
  search_text text
)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  email text,
  account_type text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_search text := btrim(coalesce(search_text, ''));
  search_uuid uuid;
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if char_length(safe_search) < 2 then
    raise exception 'RETAIL_ADMIN_SEARCH_TOO_SHORT' using errcode = '22023';
  end if;

  begin
    search_uuid := safe_search::uuid;
  exception
    when invalid_text_representation then
      search_uuid := null;
  end;

  return query
  select
    p.id as profile_id,
    p.display_name,
    p.username,
    u.email::text,
    p.account_type::text,
    coalesce(b.status::text, 'not_enrolled') as status
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.founding_seller_benefits b on b.user_id = p.id
  where p.deleted_at is null
    and (
      p.id = search_uuid
      or p.display_name ilike '%' || safe_search || '%'
      or p.username ilike '%' || safe_search || '%'
      or u.email ilike '%' || safe_search || '%'
    )
  order by
    case when p.id = search_uuid then 0 else 1 end,
    p.display_name asc nulls last,
    p.username asc nulls last
  limit 12;
end;
$$;

create or replace function public.list_admin_founding_sellers(
  requested_status text default null
)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  email text,
  account_type text,
  benefit_id uuid,
  status text,
  free_sales_limit integer,
  fee_free_sales_used integer,
  currently_reserved integer,
  fee_free_sales_remaining integer,
  granted_at timestamptz,
  source text,
  notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_status text := nullif(btrim(coalesce(requested_status, '')), '');
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if safe_status is not null and safe_status not in ('active', 'paused', 'revoked') then
    raise exception 'RETAIL_FOUNDING_SELLER_STATUS_INVALID' using errcode = '22023';
  end if;

  return query
  select
    p.id as profile_id,
    p.display_name,
    p.username,
    u.email::text,
    p.account_type::text,
    b.id as benefit_id,
    b.status::text as status,
    b.free_sales_limit,
    coalesce(count(uses.id) filter (where uses.status = 'applied'), 0)::integer as fee_free_sales_used,
    coalesce(count(uses.id) filter (where uses.status = 'reserved' and uses.expires_at >= now()), 0)::integer as currently_reserved,
    greatest(
      b.free_sales_limit
        - coalesce(count(uses.id) filter (where uses.status = 'applied'), 0)::integer
        - coalesce(count(uses.id) filter (where uses.status = 'reserved' and uses.expires_at >= now()), 0)::integer,
      0
    )::integer as fee_free_sales_remaining,
    b.granted_at,
    b.source,
    b.notes
  from public.founding_seller_benefits b
  join public.profiles p on p.id = b.user_id
  join auth.users u on u.id = p.id
  left join public.founding_seller_benefit_uses uses on uses.benefit_id = b.id
  where p.deleted_at is null
    and (safe_status is null or b.status::text = safe_status)
  group by p.id, p.display_name, p.username, u.email, p.account_type, b.id, b.status, b.free_sales_limit, b.granted_at, b.source, b.notes
  order by
    case b.status::text
      when 'active' then 0
      when 'paused' then 1
      else 2
    end,
    p.display_name asc nulls last,
    p.username asc nulls last;
end;
$$;

revoke all on function public.get_admin_founding_seller_status(uuid) from public, anon;
grant execute on function public.get_admin_founding_seller_status(uuid) to authenticated, service_role;

revoke all on function public.search_admin_founding_seller_profiles(text) from public, anon;
grant execute on function public.search_admin_founding_seller_profiles(text) to authenticated, service_role;

revoke all on function public.list_admin_founding_sellers(text) from public, anon;
grant execute on function public.list_admin_founding_sellers(text) to authenticated, service_role;
