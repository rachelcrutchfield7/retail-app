create table if not exists public.founding_seller_benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  free_sales_limit integer not null default 3,
  status text not null default 'active',
  source text not null default 'manual',
  notes text,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founding_seller_benefits_free_sales_limit_valid check (free_sales_limit between 1 and 25),
  constraint founding_seller_benefits_status_valid check (status in ('active', 'paused', 'revoked'))
);

create table if not exists public.founding_seller_benefit_uses (
  id uuid primary key default gen_random_uuid(),
  benefit_id uuid not null references public.founding_seller_benefits(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  checkout_token uuid not null unique,
  transaction_id uuid references public.transactions(id) on delete set null,
  stripe_payment_intent_id text,
  ordinal integer not null,
  normal_platform_fee_cents integer not null,
  applied_platform_fee_cents integer not null default 0,
  waived_platform_fee_cents integer not null,
  status text not null default 'reserved',
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  applied_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founding_seller_benefit_uses_amounts_nonnegative check (
    normal_platform_fee_cents >= 0
    and applied_platform_fee_cents >= 0
    and waived_platform_fee_cents >= 0
  ),
  constraint founding_seller_benefit_uses_status_valid check (status in ('reserved', 'applied', 'released', 'expired')),
  constraint founding_seller_benefit_uses_payment_intent_format check (
    stripe_payment_intent_id is null
    or stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
  )
);

alter table public.transactions
  add column if not exists founding_seller_benefit_use_id uuid references public.founding_seller_benefit_uses(id) on delete set null,
  add column if not exists founding_seller_fee_waived_cents integer not null default 0,
  add column if not exists founding_seller_benefit_ordinal integer,
  add constraint transactions_founding_seller_fee_waived_nonnegative check (founding_seller_fee_waived_cents >= 0);

create unique index if not exists founding_seller_benefit_uses_transaction_unique
  on public.founding_seller_benefit_uses(transaction_id)
  where transaction_id is not null;

create unique index if not exists founding_seller_benefit_uses_active_slot_unique
  on public.founding_seller_benefit_uses(benefit_id, ordinal)
  where status in ('reserved', 'applied');

create index if not exists idx_founding_seller_benefits_user_status
  on public.founding_seller_benefits(user_id, status);

create index if not exists idx_founding_seller_benefit_uses_seller_status
  on public.founding_seller_benefit_uses(seller_id, status, reserved_at desc);

alter table public.founding_seller_benefits enable row level security;
alter table public.founding_seller_benefit_uses enable row level security;

drop policy if exists "Founding sellers read own benefit" on public.founding_seller_benefits;
create policy "Founding sellers read own benefit"
  on public.founding_seller_benefits
  for select
  to authenticated
  using (private.is_account_active(auth.uid()) and (user_id = auth.uid() or private.is_admin(auth.uid())));

drop policy if exists "Admins manage founding seller benefits" on public.founding_seller_benefits;
create policy "Admins manage founding seller benefits"
  on public.founding_seller_benefits
  to authenticated
  using (private.is_account_active(auth.uid()) and private.is_admin(auth.uid()))
  with check (private.is_account_active(auth.uid()) and private.is_admin(auth.uid()));

drop policy if exists "Founding sellers read own benefit uses" on public.founding_seller_benefit_uses;
create policy "Founding sellers read own benefit uses"
  on public.founding_seller_benefit_uses
  for select
  to authenticated
  using (private.is_account_active(auth.uid()) and (seller_id = auth.uid() or private.is_admin(auth.uid())));

create or replace function public.reserve_founding_seller_checkout_benefit(
  p_checkout_token uuid,
  p_seller_id uuid,
  p_normal_platform_fee_cents integer
)
returns table (
  benefit_use_id uuid,
  benefit_applied boolean,
  platform_fee_cents integer,
  waived_platform_fee_cents integer,
  benefit_ordinal integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  benefit_row public.founding_seller_benefits;
  existing_use public.founding_seller_benefit_uses;
  next_ordinal integer;
begin
  if p_checkout_token is null or p_seller_id is null or p_normal_platform_fee_cents is null or p_normal_platform_fee_cents < 0 then
    raise exception 'RETAIL_FOUNDING_SELLER_INVALID_INPUT';
  end if;

  if p_normal_platform_fee_cents = 0 then
    return query select null::uuid, false, 0, 0, null::integer;
    return;
  end if;

  select *
  into existing_use
  from public.founding_seller_benefit_uses
  where checkout_token = p_checkout_token
  for update;

  if found and existing_use.status in ('reserved', 'applied') then
    return query
      select
        existing_use.id,
        true,
        existing_use.applied_platform_fee_cents,
        existing_use.waived_platform_fee_cents,
        existing_use.ordinal;
    return;
  end if;

  select *
  into benefit_row
  from public.founding_seller_benefits
  where user_id = p_seller_id
    and status = 'active'
  for update;

  if not found then
    return query select null::uuid, false, p_normal_platform_fee_cents, 0, null::integer;
    return;
  end if;

  update public.founding_seller_benefit_uses
  set status = 'expired',
      released_at = now(),
      release_reason = 'checkout_expired',
      updated_at = now()
  where benefit_id = benefit_row.id
    and status = 'reserved'
    and expires_at < now();

  select slot
  into next_ordinal
  from generate_series(1, benefit_row.free_sales_limit) as slot
  where not exists (
    select 1
    from public.founding_seller_benefit_uses use_row
    where use_row.benefit_id = benefit_row.id
      and use_row.ordinal = slot
      and use_row.status in ('reserved', 'applied')
  )
  order by slot
  limit 1;

  if next_ordinal is null then
    return query select null::uuid, false, p_normal_platform_fee_cents, 0, null::integer;
    return;
  end if;

  insert into public.founding_seller_benefit_uses (
    benefit_id,
    seller_id,
    checkout_token,
    ordinal,
    normal_platform_fee_cents,
    applied_platform_fee_cents,
    waived_platform_fee_cents
  )
  values (
    benefit_row.id,
    p_seller_id,
    p_checkout_token,
    next_ordinal,
    p_normal_platform_fee_cents,
    0,
    p_normal_platform_fee_cents
  )
  returning * into existing_use;

  return query
    select
      existing_use.id,
      true,
      existing_use.applied_platform_fee_cents,
      existing_use.waived_platform_fee_cents,
      existing_use.ordinal;
end;
$$;

create or replace function public.attach_founding_seller_checkout_benefit(
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
  use_row public.founding_seller_benefit_uses;
begin
  if p_checkout_token is null or p_transaction_id is null or p_payment_intent_id is null then
    raise exception 'RETAIL_FOUNDING_SELLER_ATTACH_INVALID_INPUT';
  end if;

  select *
  into use_row
  from public.founding_seller_benefit_uses
  where checkout_token = p_checkout_token
    and status = 'reserved'
  for update;

  if not found then
    return;
  end if;

  update public.founding_seller_benefit_uses
  set transaction_id = p_transaction_id,
      stripe_payment_intent_id = p_payment_intent_id,
      updated_at = now()
  where id = use_row.id;

  update public.transactions
  set founding_seller_benefit_use_id = use_row.id,
      founding_seller_fee_waived_cents = use_row.waived_platform_fee_cents,
      founding_seller_benefit_ordinal = use_row.ordinal,
      updated_at = now()
  where id = p_transaction_id;
end;
$$;

create or replace function public.apply_founding_seller_checkout_benefit(
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.founding_seller_benefit_uses
  set status = 'applied',
      applied_at = coalesce(applied_at, now()),
      updated_at = now()
  where transaction_id = p_transaction_id
    and status = 'reserved';
end;
$$;

create or replace function public.release_founding_seller_checkout_benefit(
  p_transaction_id uuid,
  p_payment_intent_id text default null,
  p_reason text default 'payment_not_completed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.founding_seller_benefit_uses
  set status = 'released',
      released_at = coalesce(released_at, now()),
      release_reason = nullif(btrim(coalesce(p_reason, 'payment_not_completed')), ''),
      updated_at = now()
  where transaction_id = p_transaction_id
    and status = 'reserved'
    and (
      p_payment_intent_id is null
      or stripe_payment_intent_id = p_payment_intent_id
    );
end;
$$;

create or replace function public.release_founding_seller_checkout_token(
  p_checkout_token uuid,
  p_reason text default 'checkout_not_completed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.founding_seller_benefit_uses
  set status = 'released',
      released_at = coalesce(released_at, now()),
      release_reason = nullif(btrim(coalesce(p_reason, 'checkout_not_completed')), ''),
      updated_at = now()
  where checkout_token = p_checkout_token
    and status = 'reserved';
end;
$$;

revoke all on function public.reserve_founding_seller_checkout_benefit(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_founding_seller_checkout_benefit(uuid, uuid, integer) to service_role;

revoke all on function public.attach_founding_seller_checkout_benefit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.attach_founding_seller_checkout_benefit(uuid, uuid, text) to service_role;

revoke all on function public.apply_founding_seller_checkout_benefit(uuid) from public, anon, authenticated;
grant execute on function public.apply_founding_seller_checkout_benefit(uuid) to service_role;

revoke all on function public.release_founding_seller_checkout_benefit(uuid, text, text) from public, anon, authenticated;
grant execute on function public.release_founding_seller_checkout_benefit(uuid, text, text) to service_role;

revoke all on function public.release_founding_seller_checkout_token(uuid, text) from public, anon, authenticated;
grant execute on function public.release_founding_seller_checkout_token(uuid, text) to service_role;
