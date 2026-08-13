-- ReTail beta UX: rescue donation eligibility and server-side listing sort options.

create or replace function public.get_public_listing_feed_sorted(
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null,
  city_filter text default null,
  state_filter text default null,
  sort_order text default 'recent'
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed_sort as (
    select case
      when sort_order in ('recent', 'price_asc', 'price_desc', 'distance', 'favorites') then sort_order
      else 'recent'
    end as value
  ),
  base_rows as (
    select *
    from public.get_public_listing_feed(
      1,
      10000,
      category_filter,
      search_query,
      min_price_filter,
      max_price_filter,
      condition_filter,
      listing_type_filter,
      city_filter,
      state_filter
    )
  )
  select base_rows.*
  from base_rows, allowed_sort
  order by
    case when allowed_sort.value = 'price_asc' then case when listing_type = 'sale' then coalesce(price, 0) else 0 end end asc,
    case when allowed_sort.value = 'price_desc' then case when listing_type = 'sale' then 0 else 1 end end asc,
    case when allowed_sort.value = 'price_desc' then case when listing_type = 'sale' then coalesce(price, 0) else -1 end end desc,
    case when allowed_sort.value = 'favorites' then favorite_count end desc,
    published_at desc nulls last,
    created_at desc
  limit greatest(1, least(page_size, 50))
  offset greatest(page_number - 1, 0) * greatest(1, least(page_size, 50));
$$;

create or replace function public.get_nearby_listings_sorted(
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null,
  sort_order text default 'recent'
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed_sort as (
    select case
      when sort_order in ('recent', 'price_asc', 'price_desc', 'distance', 'favorites') then sort_order
      else 'recent'
    end as value
  ),
  base_rows as (
    select *
    from public.get_nearby_listings(
      1,
      10000,
      category_filter,
      search_query,
      min_price_filter,
      max_price_filter,
      condition_filter,
      listing_type_filter
    )
  )
  select base_rows.*
  from base_rows, allowed_sort
  order by
    case when allowed_sort.value = 'price_asc' then case when listing_type = 'sale' then coalesce(price, 0) else 0 end end asc,
    case when allowed_sort.value = 'price_desc' then case when listing_type = 'sale' then 0 else 1 end end asc,
    case when allowed_sort.value = 'price_desc' then case when listing_type = 'sale' then coalesce(price, 0) else -1 end end desc,
    case when allowed_sort.value = 'favorites' then favorite_count end desc,
    published_at desc nulls last,
    created_at desc
  limit greatest(1, least(page_size, 50))
  offset greatest(page_number - 1, 0) * greatest(1, least(page_size, 50));
$$;

revoke all on function public.get_public_listing_feed_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.get_public_listing_feed_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text,
  text
) to anon, authenticated;

revoke all on function public.get_nearby_listings_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text
) from public, anon, authenticated;
grant execute on function public.get_nearby_listings_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text
) to authenticated;

create or replace function public.create_or_get_conversation(target_listing_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  listing_row public.listings%rowtype;
  caller_profile public.profiles%rowtype;
begin
  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.status = 'active'::public.listing_status
    and l.deleted_at is null;

  if not found then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
    raise exception 'Listing is not available';
  end if;

  if caller_id = listing_row.seller_id then
    raise exception 'Users cannot message themselves' using errcode = '42501';
  end if;

  select *
  into caller_profile
  from public.profiles p
  where p.id = caller_id
    and p.deleted_at is null
    and p.is_banned = false;

  if not found then
    raise exception 'RETAIL_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  if listing_row.listing_type = 'donation'::public.listing_type then
    if caller_profile.account_type <> 'rescue'::public.account_type then
      raise exception 'RETAIL_RESCUE_DONATION_RESERVED' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.rescue_profiles rp
      where rp.owner_id = caller_id
        and rp.deleted_at is null
        and rp.is_active = true
        and rp.is_verified = true
        and rp.verification_status = 'verified'
    ) then
      raise exception 'RETAIL_VERIFIED_RESCUE_REQUIRED' using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.listing_id = target_listing_id
      and c.buyer_id = caller_id
      and c.seller_id = listing_row.seller_id
      and c.deleted_at is null
  ) then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
  end if;

  perform set_config('retail.phase_f_conversation_rate_checked', 'true', true);
  return public.create_or_get_conversation_phase_f_base(target_listing_id);
exception
  when others then
    perform set_config('retail.phase_f_conversation_rate_checked', 'false', true);
    raise;
end;
$$;

revoke all on function public.create_or_get_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.create_or_get_conversation(uuid)
  to authenticated;
