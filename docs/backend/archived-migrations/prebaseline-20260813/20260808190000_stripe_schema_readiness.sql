-- ReTail Stripe schema readiness
-- Add only the schema required by the deployed Stripe Edge Functions.

-- ---------------------------------------------------------------------------
-- Stripe Connect profile state
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_onboarding_complete_at timestamptz,
  add column if not exists stripe_connect_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_stripe_connect_account_id_format,
  add constraint profiles_stripe_connect_account_id_format
    check (
      stripe_connect_account_id is null
      or stripe_connect_account_id ~ '^acct_[A-Za-z0-9]+$'
    );

create unique index if not exists profiles_stripe_connect_account_id_unique
  on public.profiles(stripe_connect_account_id)
  where stripe_connect_account_id is not null;

-- ---------------------------------------------------------------------------
-- Stripe payment transaction state
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column if not exists payment_method text,
  add column if not exists payment_status text,
  add column if not exists amount_cents integer,
  add column if not exists platform_fee_cents integer,
  add column if not exists seller_amount_cents integer,
  add column if not exists currency text default 'usd',
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_transfer_destination text,
  add column if not exists payment_error text,
  add column if not exists paid_at timestamptz;

alter table public.transactions
  drop constraint if exists transactions_payment_method_known,
  add constraint transactions_payment_method_known
    check (payment_method is null or payment_method in ('stripe', 'outside_app')),
  drop constraint if exists transactions_payment_status_known,
  add constraint transactions_payment_status_known
    check (
      payment_status is null
      or payment_status in (
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing',
        'requires_capture',
        'canceled',
        'succeeded',
        'failed'
      )
    ),
  drop constraint if exists transactions_payment_amounts_nonnegative,
  add constraint transactions_payment_amounts_nonnegative
    check (
      (amount_cents is null or amount_cents >= 0)
      and (platform_fee_cents is null or platform_fee_cents >= 0)
      and (seller_amount_cents is null or seller_amount_cents >= 0)
    ),
  drop constraint if exists transactions_payment_amounts_balance,
  add constraint transactions_payment_amounts_balance
    check (
      amount_cents is null
      or platform_fee_cents is null
      or seller_amount_cents is null
      or platform_fee_cents + seller_amount_cents = amount_cents
    ),
  drop constraint if exists transactions_currency_format,
  add constraint transactions_currency_format
    check (currency is null or currency ~ '^[a-z]{3}$'),
  drop constraint if exists transactions_stripe_payment_intent_id_format,
  add constraint transactions_stripe_payment_intent_id_format
    check (
      stripe_payment_intent_id is null
      or stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
    ),
  drop constraint if exists transactions_stripe_transfer_destination_format,
  add constraint transactions_stripe_transfer_destination_format
    check (
      stripe_transfer_destination is null
      or stripe_transfer_destination ~ '^acct_[A-Za-z0-9]+$'
    );

create unique index if not exists transactions_stripe_payment_intent_id_unique
  on public.transactions(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- ---------------------------------------------------------------------------
-- Server-controlled profile field protection
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_phase_c_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account_deletion_context boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.account_deletion_context', true), ''),
    'off'
  ) = 'on';
  deletion_anonymization boolean;
  counter_refresh boolean;
begin
  if tg_op = 'UPDATE' and account_deletion_context then
    counter_refresh :=
      new.id is not distinct from old.id
      and new.account_type is not distinct from old.account_type
      and new.display_name is not distinct from old.display_name
      and new.username is not distinct from old.username
      and new.bio is not distinct from old.bio
      and new.avatar_url is not distinct from old.avatar_url
      and new.city is not distinct from old.city
      and new.state is not distinct from old.state
      and new.zip_code is not distinct from old.zip_code
      and new.latitude is not distinct from old.latitude
      and new.longitude is not distinct from old.longitude
      and new.is_verified is not distinct from old.is_verified
      and new.is_admin is not distinct from old.is_admin
      and new.is_banned is not distinct from old.is_banned
      and new.stripe_connect_account_id is not distinct from old.stripe_connect_account_id
      and new.stripe_connect_charges_enabled is not distinct from old.stripe_connect_charges_enabled
      and new.stripe_connect_payouts_enabled is not distinct from old.stripe_connect_payouts_enabled
      and new.stripe_connect_details_submitted is not distinct from old.stripe_connect_details_submitted
      and new.stripe_connect_onboarding_complete_at is not distinct from old.stripe_connect_onboarding_complete_at
      and new.stripe_connect_updated_at is not distinct from old.stripe_connect_updated_at
      and new.created_at is not distinct from old.created_at
      and new.deleted_at is not distinct from old.deleted_at;

    if counter_refresh then
      return new;
    end if;

    deletion_anonymization :=
      new.id is not distinct from old.id
      and new.account_type is not distinct from old.account_type
      and new.buyer_rating is not distinct from old.buyer_rating
      and new.seller_rating is not distinct from old.seller_rating
      and new.review_count is not distinct from old.review_count
      and new.listings_count is not distinct from old.listings_count
      and new.completed_sales_count is not distinct from old.completed_sales_count
      and new.is_verified is not distinct from old.is_verified
      and new.is_admin is not distinct from old.is_admin
      and new.stripe_connect_account_id is not distinct from old.stripe_connect_account_id
      and new.stripe_connect_charges_enabled is not distinct from old.stripe_connect_charges_enabled
      and new.stripe_connect_payouts_enabled is not distinct from old.stripe_connect_payouts_enabled
      and new.stripe_connect_details_submitted is not distinct from old.stripe_connect_details_submitted
      and new.stripe_connect_onboarding_complete_at is not distinct from old.stripe_connect_onboarding_complete_at
      and new.stripe_connect_updated_at is not distinct from old.stripe_connect_updated_at
      and new.created_at is not distinct from old.created_at
      and new.display_name = 'Deleted User'
      and new.bio is null
      and new.avatar_url is null
      and new.city is null
      and new.state is null
      and new.zip_code is null
      and new.latitude is null
      and new.longitude is null
      and new.is_banned is true
      and new.deleted_at is not null;

    if deletion_anonymization then
      return new;
    end if;

    raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
      using errcode = '42501';
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is distinct from auth.uid()
      or coalesce(new.buyer_rating, 0) <> 0
      or coalesce(new.seller_rating, 0) <> 0
      or coalesce(new.review_count, 0) <> 0
      or coalesce(new.listings_count, 0) <> 0
      or coalesce(new.completed_sales_count, 0) <> 0
      or coalesce(new.is_verified, false) <> false
      or coalesce(new.is_admin, false) <> false
      or coalesce(new.is_banned, false) <> false
      or new.deleted_at is not null
      or new.latitude is not null
      or new.longitude is not null
      or new.stripe_connect_account_id is not null
      or coalesce(new.stripe_connect_charges_enabled, false) <> false
      or coalesce(new.stripe_connect_payouts_enabled, false) <> false
      or coalesce(new.stripe_connect_details_submitted, false) <> false
      or new.stripe_connect_onboarding_complete_at is not null
      or new.stripe_connect_updated_at is not null then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.account_type is distinct from old.account_type
      or new.buyer_rating is distinct from old.buyer_rating
      or new.seller_rating is distinct from old.seller_rating
      or new.review_count is distinct from old.review_count
      or new.listings_count is distinct from old.listings_count
      or new.completed_sales_count is distinct from old.completed_sales_count
      or new.is_verified is distinct from old.is_verified
      or new.is_admin is distinct from old.is_admin
      or new.is_banned is distinct from old.is_banned
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.deleted_at is distinct from old.deleted_at
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.stripe_connect_account_id is distinct from old.stripe_connect_account_id
      or new.stripe_connect_charges_enabled is distinct from old.stripe_connect_charges_enabled
      or new.stripe_connect_payouts_enabled is distinct from old.stripe_connect_payouts_enabled
      or new.stripe_connect_details_submitted is distinct from old.stripe_connect_details_submitted
      or new.stripe_connect_onboarding_complete_at is distinct from old.stripe_connect_onboarding_complete_at
      or new.stripe_connect_updated_at is distinct from old.stripe_connect_updated_at then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_phase_c_fields()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Server-controlled transaction/payment field protection
-- ---------------------------------------------------------------------------

create or replace function public.protect_transaction_phase_e_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_transaction_write', true), ''),
    'false'
  )::boolean or jwt_role = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not trusted_write then
      raise exception 'RETAIL_TRANSACTION_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    if new.buyer_id = new.seller_id then
      raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not trusted_write and (
      new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.status is distinct from old.status
      or new.outcome is distinct from old.outcome
      or new.completed_at is distinct from old.completed_at
      or new.cancelled_at is distinct from old.cancelled_at
      or new.created_at is distinct from old.created_at
      or new.deleted_at is distinct from old.deleted_at
      or new.payment_method is distinct from old.payment_method
      or new.payment_status is distinct from old.payment_status
      or new.amount_cents is distinct from old.amount_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.seller_amount_cents is distinct from old.seller_amount_cents
      or new.currency is distinct from old.currency
      or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
      or new.stripe_transfer_destination is distinct from old.stripe_transfer_destination
      or new.payment_error is distinct from old.payment_error
      or new.paid_at is distinct from old.paid_at
    ) then
      raise exception 'RETAIL_TRANSACTION_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.status = 'completed'::public.transaction_status and (
      new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.status is distinct from old.status
      or new.outcome is distinct from old.outcome
      or new.completed_at is distinct from old.completed_at
      or new.created_at is distinct from old.created_at
      or new.deleted_at is distinct from old.deleted_at
      or new.cancelled_at is distinct from old.cancelled_at
    ) then
      raise exception 'RETAIL_TRANSACTION_IMMUTABLE'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_transaction_phase_e_fields()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
