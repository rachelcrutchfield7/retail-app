-- ReTail community promotion:
-- 100 Listings in 72 Hours
--
-- Backend tracking only.
-- Campaign starts inactive and must be explicitly configured/activated.
-- One qualifying listing counts once toward the community total.
-- Sellers earn one giveaway entry for every 3 qualifying listings.
-- Entries are capped at 5 per seller (15+ qualifying listings).

create table if not exists public.community_listing_campaigns (
  campaign_key text primary key,
  name text not null,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  target_listing_count integer not null default 100
    check (target_listing_count > 0),
  listings_required_for_entry integer not null default 3
    check (listings_required_for_entry > 0),
  max_entries_per_seller integer not null default 5
    check (max_entries_per_seller > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_listing_campaign_dates_valid check (
    not is_active
    or (
      starts_at is not null
      and ends_at is not null
      and ends_at > starts_at
    )
  )
);

insert into public.community_listing_campaigns (
  campaign_key,
  name,
  is_active,
  starts_at,
  ends_at,
  target_listing_count,
  listings_required_for_entry,
  max_entries_per_seller
)
values (
  'community_100_listings_72_hours_v1',
  '100 Listings in 72 Hours',
  false,
  null,
  null,
  100,
  3,
  5
)
on conflict (campaign_key) do nothing;


create table if not exists public.community_listing_campaign_qualifying_listings (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null
    references public.community_listing_campaigns(campaign_key)
    on delete restrict,
  seller_id uuid not null
    references public.profiles(id)
    on delete restrict,
  listing_id uuid not null
    references public.listings(id)
    on delete restrict,
  listing_published_at timestamptz not null,
  qualified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint community_listing_campaign_listing_unique
    unique (campaign_key, listing_id)
);

create index if not exists community_listing_campaign_seller_idx
  on public.community_listing_campaign_qualifying_listings (
    campaign_key,
    seller_id,
    qualified_at
  );


create table if not exists public.community_listing_campaign_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null
    references public.community_listing_campaigns(campaign_key)
    on delete restrict,
  seller_id uuid not null
    references public.profiles(id)
    on delete restrict,
  qualifying_listing_count integer not null
    check (qualifying_listing_count >= 0),
  entry_count integer not null
    check (entry_count >= 1 and entry_count <= 5),
  qualified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_listing_campaign_entry_unique
    unique (campaign_key, seller_id)
);


alter table public.community_listing_campaigns
  enable row level security;

alter table public.community_listing_campaign_qualifying_listings
  enable row level security;

alter table public.community_listing_campaign_entries
  enable row level security;


revoke all on table public.community_listing_campaigns
  from public, anon, authenticated;

revoke all on table public.community_listing_campaign_qualifying_listings
  from public, anon, authenticated;

revoke all on table public.community_listing_campaign_entries
  from public, anon, authenticated;


grant select, insert, update, delete
  on table public.community_listing_campaigns
  to service_role;

grant select, insert, update, delete
  on table public.community_listing_campaign_qualifying_listings
  to service_role;

grant select, insert, update, delete
  on table public.community_listing_campaign_entries
  to service_role;


create or replace function public.refresh_community_listing_campaign(
  p_campaign_key text,
  p_seller_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.community_listing_campaigns;
  qualified_count integer := 0;
begin
  select *
  into campaign_row
  from public.community_listing_campaigns
  where campaign_key = p_campaign_key
    and is_active = true
    and starts_at is not null
    and ends_at is not null
    and now() >= starts_at
    and now() < ends_at
  for update;

  if not found then
    return 0;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_seller_id
      and p.deleted_at is null
  ) then
    return 0;
  end if;

  insert into public.community_listing_campaign_qualifying_listings (
    campaign_key,
    seller_id,
    listing_id,
    listing_published_at
  )
  select
    campaign_row.campaign_key,
    l.seller_id,
    l.id,
    coalesce(l.published_at, l.created_at)
  from public.listings l
  where l.seller_id = p_seller_id
    and l.listing_type = 'sale'
    and l.status = 'active'
    and l.deleted_at is null
    and coalesce(l.published_at, l.created_at) >= campaign_row.starts_at
    and coalesce(l.published_at, l.created_at) < campaign_row.ends_at
  on conflict (campaign_key, listing_id) do nothing;

  select count(*)::integer
  into qualified_count
  from public.community_listing_campaign_qualifying_listings q
  where q.campaign_key = campaign_row.campaign_key
    and q.seller_id = p_seller_id;

  if qualified_count >= campaign_row.listings_required_for_entry then
    insert into public.community_listing_campaign_entries (
      campaign_key,
      seller_id,
      qualifying_listing_count,
      entry_count
    )
    values (
      campaign_row.campaign_key,
      p_seller_id,
      qualified_count,
      least(
        floor(
          qualified_count::numeric /
          campaign_row.listings_required_for_entry
        )::integer,
        campaign_row.max_entries_per_seller
      )
    )
    on conflict (campaign_key, seller_id) do update
    set qualifying_listing_count = greatest(
          public.community_listing_campaign_entries.qualifying_listing_count,
          excluded.qualifying_listing_count
        ),
        entry_count = greatest(
          public.community_listing_campaign_entries.entry_count,
          excluded.entry_count
        ),
        updated_at = now();
  end if;

  return qualified_count;
end;
$$;


create or replace function public.capture_community_listing_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_key_value text;
begin
  if new.listing_type <> 'sale'
     or new.status <> 'active'
     or new.deleted_at is not null then
    return new;
  end if;

  for campaign_key_value in
    select c.campaign_key
    from public.community_listing_campaigns c
    where c.is_active = true
      and c.starts_at is not null
      and c.ends_at is not null
      and now() >= c.starts_at
      and now() < c.ends_at
  loop
    perform public.refresh_community_listing_campaign(
      campaign_key_value,
      new.seller_id
    );
  end loop;

  return new;
end;
$$;


drop trigger if exists capture_community_listing_campaign
  on public.listings;

create trigger capture_community_listing_campaign
after insert or update of listing_type, status, deleted_at, published_at
on public.listings
for each row
execute function public.capture_community_listing_campaign();


create or replace function public.community_listing_campaign_progress(
  p_campaign_key text
)
returns table (
  qualifying_listing_count integer,
  target_listing_count integer,
  participant_count integer,
  listings_required_for_entry integer,
  max_entries_per_seller integer,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
begin
  if caller_role <> 'service_role'
     and (caller_id is null or not private.is_admin(caller_id)) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  return query
  select
    (
      select count(*)::integer
      from public.community_listing_campaign_qualifying_listings q
      where q.campaign_key = c.campaign_key
    ),
    c.target_listing_count,
    (
      select count(*)::integer
      from public.community_listing_campaign_entries e
      where e.campaign_key = c.campaign_key
    ),
    c.listings_required_for_entry,
    c.max_entries_per_seller,
    c.starts_at,
    c.ends_at,
    c.is_active
  from public.community_listing_campaigns c
  where c.campaign_key = p_campaign_key;
end;
$$;


create or replace function public.admin_community_listing_campaign_entries(
  p_campaign_key text
)
returns table (
  seller_id uuid,
  qualifying_listing_count integer,
  entry_count integer,
  qualified_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
begin
  if caller_role <> 'service_role'
     and (caller_id is null or not private.is_admin(caller_id)) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  return query
  select
    e.seller_id,
    e.qualifying_listing_count,
    e.entry_count,
    e.qualified_at
  from public.community_listing_campaign_entries e
  where e.campaign_key = p_campaign_key
  order by e.qualified_at, e.seller_id;
end;
$$;


revoke all on function public.refresh_community_listing_campaign(text, uuid)
  from public, anon, authenticated;

revoke all on function public.capture_community_listing_campaign()
  from public, anon, authenticated;

revoke all on function public.community_listing_campaign_progress(text)
  from public, anon, authenticated;

revoke all on function public.admin_community_listing_campaign_entries(text)
  from public, anon, authenticated;


grant execute on function public.refresh_community_listing_campaign(text, uuid)
  to service_role;

grant execute on function public.community_listing_campaign_progress(text)
  to authenticated, service_role;

grant execute on function public.admin_community_listing_campaign_entries(text)
  to authenticated, service_role;
