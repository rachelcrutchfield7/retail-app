alter table public.profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_onboarding_complete_at timestamptz,
  add column if not exists stripe_connect_updated_at timestamptz;

alter table public.transactions
  add column if not exists payment_method text not null default 'outside_app',
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists amount_cents integer,
  add column if not exists platform_fee_cents integer,
  add column if not exists seller_amount_cents integer,
  add column if not exists currency text not null default 'usd',
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_transfer_destination text,
  add column if not exists stripe_latest_charge_id text,
  add column if not exists stripe_receipt_url text,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists payment_error text;

alter table public.transactions
  add constraint transactions_payment_method_check
  check (payment_method in ('outside_app', 'stripe'))
  not valid;

alter table public.transactions
  add constraint transactions_payment_status_check
  check (payment_status in (
    'not_required',
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'succeeded',
    'failed',
    'canceled',
    'refunded'
  ))
  not valid;

create unique index if not exists idx_transactions_stripe_payment_intent
  on public.transactions(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_profiles_stripe_connect_account
  on public.profiles(stripe_connect_account_id)
  where stripe_connect_account_id is not null;

create index if not exists idx_transactions_payment_status
  on public.transactions(payment_status, updated_at desc);

notify pgrst, 'reload schema';
