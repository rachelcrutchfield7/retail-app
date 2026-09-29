-- Backend-only seller promotion. The campaign is intentionally inactive and undated.
create table if not exists public.seller_promotion_campaigns (
  promotion_key text primary key,
  name text not null,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  qualifying_listing_count integer not null default 3 check (qualifying_listing_count > 0),
  fee_free_sale_limit integer not null default 3 check (fee_free_sale_limit > 0),
  stale_reservation_minutes integer not null default 1440 check (stale_reservation_minutes >= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_promotion_campaign_dates_valid check (
    not is_active or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  )
);

insert into public.seller_promotion_campaigns (
  promotion_key, name, is_active, starts_at, ends_at,
  qualifying_listing_count, fee_free_sale_limit
)
values (
  'seller_listing_3_fee_free_3_v1',
  'List 3, seller fee free on first 3 completed sales',
  false, null, null, 3, 3
)
on conflict (promotion_key) do nothing;

create table if not exists public.seller_promotion_qualifying_listings (
  id uuid primary key default gen_random_uuid(),
  promotion_key text not null references public.seller_promotion_campaigns(promotion_key) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  listing_published_at timestamptz not null,
  qualified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint seller_promotion_qualifying_listing_unique unique (promotion_key, listing_id)
);

create index if not exists seller_promotion_qualifying_seller_idx
  on public.seller_promotion_qualifying_listings(promotion_key, seller_id, qualified_at);

create table if not exists public.seller_promotion_eligibility (
  id uuid primary key default gen_random_uuid(),
  promotion_key text not null references public.seller_promotion_campaigns(promotion_key) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  qualifying_listing_count integer not null check (qualifying_listing_count >= 0),
  eligible_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_promotion_eligibility_unique unique (promotion_key, seller_id)
);

create table if not exists public.seller_promotion_slots (
  id uuid primary key default gen_random_uuid(),
  promotion_key text not null references public.seller_promotion_campaigns(promotion_key) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  slot_ordinal integer not null check (slot_ordinal > 0),
  status text not null default 'available' check (status in ('available', 'reserved', 'consumed')),
  current_reservation_id uuid,
  transaction_id uuid references public.transactions(id) on delete set null,
  stripe_payment_intent_id text,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_promotion_slot_unique unique (promotion_key, seller_id, slot_ordinal),
  constraint seller_promotion_slot_consumed_consistent check (
    (status = 'consumed' and consumed_at is not null and transaction_id is not null and stripe_payment_intent_id is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);

create table if not exists public.seller_promotion_reservations (
  id uuid primary key default gen_random_uuid(),
  promotion_key text not null references public.seller_promotion_campaigns(promotion_key) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  slot_id uuid not null references public.seller_promotion_slots(id) on delete restrict,
  slot_ordinal integer not null check (slot_ordinal > 0),
  checkout_token uuid not null unique,
  transaction_id uuid references public.transactions(id) on delete set null,
  stripe_payment_intent_id text,
  normal_seller_fee_cents integer not null,
  actual_seller_fee_cents integer not null default 0,
  waived_seller_fee_cents integer not null,
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_promotion_reservation_fee_values_valid check (
    normal_seller_fee_cents >= 0
    and actual_seller_fee_cents >= 0
    and waived_seller_fee_cents >= 0
    and actual_seller_fee_cents + waived_seller_fee_cents = normal_seller_fee_cents
  ),
  constraint seller_promotion_reservation_status_consistent check (
    (status = 'reserved' and consumed_at is null and released_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null and transaction_id is not null and stripe_payment_intent_id is not null)
    or (status = 'released' and consumed_at is null and released_at is not null and release_reason is not null)
  )
);

alter table public.seller_promotion_slots
  add constraint seller_promotion_slot_current_reservation_fk
  foreign key (current_reservation_id)
  references public.seller_promotion_reservations(id)
  on delete set null;

create unique index if not exists seller_promotion_active_transaction_unique
  on public.seller_promotion_reservations(transaction_id)
  where transaction_id is not null and status in ('reserved', 'consumed');

create unique index if not exists seller_promotion_active_payment_intent_unique
  on public.seller_promotion_reservations(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null and status in ('reserved', 'consumed');

create index if not exists seller_promotion_stale_reservation_idx
  on public.seller_promotion_reservations(status, reserved_at)
  where status = 'reserved';

alter table public.transactions
  add column if not exists seller_promotion_reservation_id uuid
    references public.seller_promotion_reservations(id) on delete set null,
  add column if not exists seller_promotion_key text
    references public.seller_promotion_campaigns(promotion_key) on delete restrict,
  add column if not exists seller_promotion_slot_ordinal integer,
  add column if not exists seller_promotion_normal_fee_cents integer,
  add column if not exists seller_promotion_applied_fee_cents integer,
  add column if not exists seller_promotion_waived_fee_cents integer;

alter table public.transactions
  drop constraint if exists transactions_seller_promotion_fee_values_valid;

alter table public.transactions
  add constraint transactions_seller_promotion_fee_values_valid check (
    (seller_promotion_reservation_id is null
      and seller_promotion_key is null
      and seller_promotion_slot_ordinal is null
      and seller_promotion_normal_fee_cents is null
      and seller_promotion_applied_fee_cents is null
      and seller_promotion_waived_fee_cents is null)
    or
    (seller_promotion_reservation_id is not null
      and seller_promotion_key is not null
      and seller_promotion_slot_ordinal > 0
      and seller_promotion_normal_fee_cents >= 0
      and seller_promotion_applied_fee_cents >= 0
      and seller_promotion_waived_fee_cents >= 0
      and seller_promotion_applied_fee_cents + seller_promotion_waived_fee_cents = seller_promotion_normal_fee_cents)
  );

alter table public.seller_promotion_campaigns enable row level security;
alter table public.seller_promotion_qualifying_listings enable row level security;
alter table public.seller_promotion_eligibility enable row level security;
alter table public.seller_promotion_slots enable row level security;
alter table public.seller_promotion_reservations enable row level security;

revoke all on table public.seller_promotion_campaigns from public, anon, authenticated;
revoke all on table public.seller_promotion_qualifying_listings from public, anon, authenticated;
revoke all on table public.seller_promotion_eligibility from public, anon, authenticated;
revoke all on table public.seller_promotion_slots from public, anon, authenticated;
revoke all on table public.seller_promotion_reservations from public, anon, authenticated;

grant select, insert, update, delete on table public.seller_promotion_campaigns to service_role;
grant select, insert, update, delete on table public.seller_promotion_qualifying_listings to service_role;
grant select, insert, update, delete on table public.seller_promotion_eligibility to service_role;
grant select, insert, update, delete on table public.seller_promotion_slots to service_role;
grant select, insert, update, delete on table public.seller_promotion_reservations to service_role;

create or replace function public.refresh_seller_listing_promotion_eligibility(
  p_promotion_key text,
  p_seller_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.seller_promotion_campaigns;
  qualified_count integer := 0;
begin
  select *
  into campaign_row
  from public.seller_promotion_campaigns
  where promotion_key = p_promotion_key
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

  insert into public.seller_promotion_qualifying_listings (
    promotion_key,
    seller_id,
    listing_id,
    listing_published_at
  )
  select
    campaign_row.promotion_key,
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
  on conflict (promotion_key, listing_id) do nothing;

  select count(*)::integer
  into qualified_count
  from public.seller_promotion_qualifying_listings q
  where q.promotion_key = campaign_row.promotion_key
    and q.seller_id = p_seller_id;

  if qualified_count >= campaign_row.qualifying_listing_count then
    insert into public.seller_promotion_eligibility (
      promotion_key,
      seller_id,
      qualifying_listing_count
    )
    values (
      campaign_row.promotion_key,
      p_seller_id,
      qualified_count
    )
    on conflict (promotion_key, seller_id) do update
    set qualifying_listing_count = greatest(
          public.seller_promotion_eligibility.qualifying_listing_count,
          excluded.qualifying_listing_count
        ),
        updated_at = now();

    insert into public.seller_promotion_slots (
      promotion_key,
      seller_id,
      slot_ordinal
    )
    select campaign_row.promotion_key, p_seller_id, ordinal
    from generate_series(1, campaign_row.fee_free_sale_limit) ordinal
    on conflict (promotion_key, seller_id, slot_ordinal) do nothing;
  end if;

  return qualified_count;
end;
$$;

create or replace function public.capture_seller_listing_promotion_qualification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_key text;
begin
  if new.listing_type <> 'sale'
     or new.status <> 'active'
     or new.deleted_at is not null then
    return new;
  end if;

  for campaign_key in
    select c.promotion_key
    from public.seller_promotion_campaigns c
    where c.is_active = true
      and c.starts_at is not null
      and c.ends_at is not null
      and now() >= c.starts_at
      and now() < c.ends_at
  loop
    perform public.refresh_seller_listing_promotion_eligibility(campaign_key, new.seller_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists capture_seller_listing_promotion_qualification on public.listings;
create trigger capture_seller_listing_promotion_qualification
after insert or update of listing_type, status, deleted_at, published_at
on public.listings
for each row
execute function public.capture_seller_listing_promotion_qualification();

create or replace function public.reserve_seller_listing_promotion(
  p_promotion_key text,
  p_checkout_token uuid,
  p_seller_id uuid,
  p_normal_seller_fee_cents integer
)
returns table (
  promotion_applied boolean,
  reservation_id uuid,
  promotion_key text,
  slot_ordinal integer,
  normal_seller_fee_cents integer,
  actual_seller_fee_cents integer,
  waived_seller_fee_cents integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_row public.seller_promotion_campaigns;
  slot_row public.seller_promotion_slots;
  reservation_row public.seller_promotion_reservations;
begin
  if p_promotion_key is null
     or p_checkout_token is null
     or p_seller_id is null
     or p_normal_seller_fee_cents is null
     or p_normal_seller_fee_cents < 0 then
    raise exception 'RETAIL_SELLER_PROMOTION_INVALID_INPUT';
  end if;

  select *
  into reservation_row
  from public.seller_promotion_reservations r
  where r.checkout_token = p_checkout_token
    and r.promotion_key = p_promotion_key
    and r.seller_id = p_seller_id
    and r.status in ('reserved', 'consumed')
  for update;

  if found then
    return query select
      true,
      reservation_row.id,
      reservation_row.promotion_key,
      reservation_row.slot_ordinal,
      reservation_row.normal_seller_fee_cents,
      reservation_row.actual_seller_fee_cents,
      reservation_row.waived_seller_fee_cents;
    return;
  end if;

  select *
  into campaign_row
  from public.seller_promotion_campaigns c
  where c.promotion_key = p_promotion_key
    and c.is_active = true
    and c.starts_at is not null
    and c.ends_at is not null
    and now() >= c.starts_at
    and now() < c.ends_at
  for update;

  if not found or p_normal_seller_fee_cents = 0 then
    return query select false, null::uuid, p_promotion_key, null::integer,
      p_normal_seller_fee_cents, p_normal_seller_fee_cents, 0;
    return;
  end if;

  perform public.refresh_seller_listing_promotion_eligibility(p_promotion_key, p_seller_id);

  if not exists (
    select 1
    from public.seller_promotion_eligibility e
    where e.promotion_key = p_promotion_key
      and e.seller_id = p_seller_id
  ) then
    return query select false, null::uuid, p_promotion_key, null::integer,
      p_normal_seller_fee_cents, p_normal_seller_fee_cents, 0;
    return;
  end if;

  select *
  into slot_row
  from public.seller_promotion_slots s
  where s.promotion_key = p_promotion_key
    and s.seller_id = p_seller_id
    and s.status = 'available'
  order by s.slot_ordinal
  limit 1
  for update skip locked;

  if not found then
    return query select false, null::uuid, p_promotion_key, null::integer,
      p_normal_seller_fee_cents, p_normal_seller_fee_cents, 0;
    return;
  end if;

  insert into public.seller_promotion_reservations (
    promotion_key,
    seller_id,
    slot_id,
    slot_ordinal,
    checkout_token,
    normal_seller_fee_cents,
    actual_seller_fee_cents,
    waived_seller_fee_cents
  )
  values (
    p_promotion_key,
    p_seller_id,
    slot_row.id,
    slot_row.slot_ordinal,
    p_checkout_token,
    p_normal_seller_fee_cents,
    0,
    p_normal_seller_fee_cents
  )
  returning * into reservation_row;

  update public.seller_promotion_slots
  set status = 'reserved',
      current_reservation_id = reservation_row.id,
      transaction_id = null,
      stripe_payment_intent_id = null,
      updated_at = now()
  where id = slot_row.id
    and status = 'available';

  if not found then
    raise exception 'RETAIL_SELLER_PROMOTION_SLOT_RACE';
  end if;

  return query select
    true,
    reservation_row.id,
    reservation_row.promotion_key,
    reservation_row.slot_ordinal,
    reservation_row.normal_seller_fee_cents,
    reservation_row.actual_seller_fee_cents,
    reservation_row.waived_seller_fee_cents;
end;
$$;

create or replace function public.attach_seller_listing_promotion(
  p_checkout_token uuid,
  p_transaction_id uuid,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row public.seller_promotion_reservations;
  transaction_seller_id uuid;
begin
  if p_checkout_token is null
     or p_transaction_id is null
     or nullif(trim(p_payment_intent_id), '') is null then
    raise exception 'RETAIL_SELLER_PROMOTION_ATTACH_INVALID_INPUT';
  end if;

  select *
  into reservation_row
  from public.seller_promotion_reservations r
  where r.checkout_token = p_checkout_token
    and r.status = 'reserved'
  for update;

  if not found then
    return;
  end if;

  select t.seller_id
  into transaction_seller_id
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found or transaction_seller_id <> reservation_row.seller_id then
    raise exception 'RETAIL_SELLER_PROMOTION_TRANSACTION_MISMATCH';
  end if;

  update public.seller_promotion_reservations
  set transaction_id = p_transaction_id,
      stripe_payment_intent_id = p_payment_intent_id,
      updated_at = now()
  where id = reservation_row.id;

  update public.seller_promotion_slots
  set transaction_id = p_transaction_id,
      stripe_payment_intent_id = p_payment_intent_id,
      updated_at = now()
  where id = reservation_row.slot_id
    and current_reservation_id = reservation_row.id
    and status = 'reserved';

  if not found then
    raise exception 'RETAIL_SELLER_PROMOTION_SLOT_MISMATCH';
  end if;

  update public.transactions
  set seller_promotion_reservation_id = reservation_row.id,
      seller_promotion_key = reservation_row.promotion_key,
      seller_promotion_slot_ordinal = reservation_row.slot_ordinal,
      seller_promotion_normal_fee_cents = reservation_row.normal_seller_fee_cents,
      seller_promotion_applied_fee_cents = reservation_row.actual_seller_fee_cents,
      seller_promotion_waived_fee_cents = reservation_row.waived_seller_fee_cents,
      updated_at = now()
  where id = p_transaction_id;
end;
$$;

create or replace function public.release_seller_listing_promotion_reservation(
  p_reservation_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row public.seller_promotion_reservations;
begin
  if p_reservation_id is null or nullif(trim(p_reason), '') is null then
    raise exception 'RETAIL_SELLER_PROMOTION_RELEASE_INVALID_INPUT';
  end if;

  select *
  into reservation_row
  from public.seller_promotion_reservations r
  where r.id = p_reservation_id
  for update;

  if not found or reservation_row.status <> 'reserved' then
    return false;
  end if;

  update public.seller_promotion_reservations
  set status = 'released',
      released_at = now(),
      release_reason = left(trim(p_reason), 240),
      updated_at = now()
  where id = reservation_row.id
    and status = 'reserved';

  update public.seller_promotion_slots
  set status = 'available',
      current_reservation_id = null,
      transaction_id = null,
      stripe_payment_intent_id = null,
      updated_at = now()
  where id = reservation_row.slot_id
    and current_reservation_id = reservation_row.id
    and status = 'reserved';

  if not found then
    raise exception 'RETAIL_SELLER_PROMOTION_RELEASE_SLOT_MISMATCH';
  end if;

  return true;
end;
$$;

create or replace function public.release_seller_listing_promotion_token(
  p_checkout_token uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_id_value uuid;
begin
  select r.id
  into reservation_id_value
  from public.seller_promotion_reservations r
  where r.checkout_token = p_checkout_token
    and r.status = 'reserved'
  for update;

  if not found then
    return false;
  end if;

  return public.release_seller_listing_promotion_reservation(reservation_id_value, p_reason);
end;
$$;

create or replace function public.release_seller_listing_promotion_checkout(
  p_transaction_id uuid,
  p_payment_intent_id text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_id_value uuid;
begin
  select r.id
  into reservation_id_value
  from public.seller_promotion_reservations r
  where r.transaction_id = p_transaction_id
    and r.stripe_payment_intent_id = p_payment_intent_id
    and r.status = 'reserved'
  for update;

  if not found then
    return false;
  end if;

  return public.release_seller_listing_promotion_reservation(reservation_id_value, p_reason);
end;
$$;

create or replace function public.consume_seller_listing_promotion(
  p_transaction_id uuid,
  p_payment_intent_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row public.seller_promotion_reservations;
begin
  select *
  into reservation_row
  from public.seller_promotion_reservations r
  where r.transaction_id = p_transaction_id
    and r.stripe_payment_intent_id = p_payment_intent_id
    and r.status in ('reserved', 'consumed')
  order by case when r.status = 'consumed' then 0 else 1 end
  limit 1
  for update;

  if not found then
    return false;
  end if;

  if reservation_row.status = 'consumed' then
    return true;
  end if;

  update public.seller_promotion_reservations
  set status = 'consumed',
      consumed_at = now(),
      updated_at = now()
  where id = reservation_row.id
    and status = 'reserved';

  update public.seller_promotion_slots
  set status = 'consumed',
      transaction_id = p_transaction_id,
      stripe_payment_intent_id = p_payment_intent_id,
      consumed_at = now(),
      updated_at = now()
  where id = reservation_row.slot_id
    and current_reservation_id = reservation_row.id
    and status = 'reserved';

  if not found then
    raise exception 'RETAIL_SELLER_PROMOTION_CONSUME_SLOT_MISMATCH';
  end if;

  return true;
end;
$$;

create or replace function public.list_stale_seller_listing_promotion_reservations(
  p_limit integer default 10
)
returns table (
  reservation_id uuid,
  stripe_payment_intent_id text,
  reserved_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select r.id, r.stripe_payment_intent_id, r.reserved_at
  from public.seller_promotion_reservations r
  join public.seller_promotion_campaigns c
    on c.promotion_key = r.promotion_key
  where r.status = 'reserved'
    and r.reserved_at <= now() - make_interval(mins => c.stale_reservation_minutes)
  order by r.reserved_at
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

create or replace function public.release_stale_seller_listing_promotion_reservation(
  p_reservation_id uuid,
  p_expected_payment_intent_id text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row public.seller_promotion_reservations;
  stale_minutes integer;
begin
  select r.*
  into reservation_row
  from public.seller_promotion_reservations r
  where r.id = p_reservation_id
  for update;

  if not found or reservation_row.status <> 'reserved' then
    return false;
  end if;

  select c.stale_reservation_minutes
  into strict stale_minutes
  from public.seller_promotion_campaigns c
  where c.promotion_key = reservation_row.promotion_key;

  if reservation_row.reserved_at > now() - make_interval(mins => stale_minutes) then
    return false;
  end if;

  if reservation_row.stripe_payment_intent_id is distinct from p_expected_payment_intent_id then
    return false;
  end if;

  if reservation_row.stripe_payment_intent_id is null then
    if p_reason <> 'stale_without_payment_intent' then
      return false;
    end if;
  elsif p_reason <> 'stripe_payment_intent_canceled' then
    return false;
  end if;

  return public.release_seller_listing_promotion_reservation(
    reservation_row.id,
    p_reason
  );
end;
$$;

revoke all on function public.refresh_seller_listing_promotion_eligibility(text, uuid)
  from public, anon, authenticated;
revoke all on function public.capture_seller_listing_promotion_qualification()
  from public, anon, authenticated;
revoke all on function public.reserve_seller_listing_promotion(text, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.attach_seller_listing_promotion(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.release_seller_listing_promotion_reservation(uuid, text)
  from public, anon, authenticated;
revoke all on function public.release_seller_listing_promotion_token(uuid, text)
  from public, anon, authenticated;

revoke all on function public.release_seller_listing_promotion_checkout(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_seller_listing_promotion(uuid, text)
  from public, anon, authenticated;
revoke all on function public.list_stale_seller_listing_promotion_reservations(integer)
  from public, anon, authenticated;
revoke all on function public.release_stale_seller_listing_promotion_reservation(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.refresh_seller_listing_promotion_eligibility(text, uuid)
  to service_role;

grant execute on function public.reserve_seller_listing_promotion(text, uuid, uuid, integer)
  to service_role;
grant execute on function public.attach_seller_listing_promotion(uuid, uuid, text)
  to service_role;
grant execute on function public.release_seller_listing_promotion_token(uuid, text)
  to service_role;
grant execute on function public.release_seller_listing_promotion_reservation(uuid, text)
  to service_role;
grant execute on function public.release_seller_listing_promotion_checkout(uuid, text, text)
  to service_role;
grant execute on function public.consume_seller_listing_promotion(uuid, text)
  to service_role;
grant execute on function public.list_stale_seller_listing_promotion_reservations(integer)
  to service_role;
grant execute on function public.release_stale_seller_listing_promotion_reservation(uuid, text, text)
  to service_role;
;
