-- One database-owned claim must be acquired before any caller contacts a label provider.
alter table public.transactions
  add column if not exists label_purchase_claim_token uuid,
  add column if not exists label_purchase_claimed_at timestamptz,
  add column if not exists label_purchase_attempts integer not null default 0;
alter table public.transactions
  drop constraint if exists transactions_label_purchase_attempts_nonnegative;
alter table public.transactions
  add constraint transactions_label_purchase_attempts_nonnegative
  check (label_purchase_attempts >= 0);
alter table public.transactions
  drop constraint if exists transactions_label_purchase_claim_consistent;
alter table public.transactions
  add constraint transactions_label_purchase_claim_consistent
  check (
    label_status <> 'purchasing'
    or (label_purchase_claim_token is not null and label_purchase_claimed_at is not null)
  ) not valid;
create unique index if not exists transactions_label_purchase_claim_token_unique
  on public.transactions(label_purchase_claim_token)
  where label_purchase_claim_token is not null;
create or replace function public.claim_shipping_label_purchase(
  p_transaction_id uuid,
  p_claim_token uuid
)
returns table(
  claim_status text,
  id uuid,
  listing_id uuid,
  buyer_id uuid,
  seller_id uuid,
  fulfillment_method text,
  shipping_provider text,
  shipping_rate_id text,
  shipping_label_id text,
  label_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_row public.transactions;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_transaction_id is null or p_claim_token is null then
    raise exception 'RETAIL_LABEL_CLAIM_INVALID' using errcode = '22023';
  end if;

  select *
  into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found then
    return query select
      'not_found'::text,
      null::uuid, null::uuid, null::uuid, null::uuid,
      null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  if transaction_row.shipping_label_id is not null or transaction_row.label_status = 'created' then
    return query select
      'already_created'::text,
      transaction_row.id,
      transaction_row.listing_id,
      transaction_row.buyer_id,
      transaction_row.seller_id,
      transaction_row.fulfillment_method,
      transaction_row.shipping_provider,
      transaction_row.shipping_rate_id,
      transaction_row.shipping_label_id,
      transaction_row.label_status;
    return;
  end if;

  if transaction_row.label_status = 'purchasing' then
    return query select
      'in_progress'::text,
      transaction_row.id,
      transaction_row.listing_id,
      transaction_row.buyer_id,
      transaction_row.seller_id,
      transaction_row.fulfillment_method,
      transaction_row.shipping_provider,
      transaction_row.shipping_rate_id,
      transaction_row.shipping_label_id,
      transaction_row.label_status;
    return;
  end if;

  if transaction_row.fulfillment_method is distinct from 'shipping'
    or transaction_row.shipping_rate_id is null
    or transaction_row.payment_status is distinct from 'succeeded'
    or transaction_row.status is null
    or transaction_row.status not in ('pending'::public.transaction_status, 'completed'::public.transaction_status) then
    return query select
      'ineligible'::text,
      transaction_row.id,
      transaction_row.listing_id,
      transaction_row.buyer_id,
      transaction_row.seller_id,
      transaction_row.fulfillment_method,
      transaction_row.shipping_provider,
      transaction_row.shipping_rate_id,
      transaction_row.shipping_label_id,
      transaction_row.label_status;
    return;
  end if;

  update public.transactions t
  set label_status = 'purchasing',
      label_purchase_claim_token = p_claim_token,
      label_purchase_claimed_at = now(),
      label_purchase_attempts = coalesce(t.label_purchase_attempts, 0) + 1,
      shipping_exception = null,
      updated_at = now()
  where t.id = transaction_row.id
  returning t.* into transaction_row;

  return query select
    'claimed'::text,
    transaction_row.id,
    transaction_row.listing_id,
    transaction_row.buyer_id,
    transaction_row.seller_id,
    transaction_row.fulfillment_method,
    transaction_row.shipping_provider,
    transaction_row.shipping_rate_id,
    transaction_row.shipping_label_id,
    transaction_row.label_status;
end;
$$;
create or replace function public.fail_shipping_label_purchase(
  p_transaction_id uuid,
  p_claim_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  released boolean := false;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  update public.transactions t
  set label_status = 'failed',
      label_purchase_claim_token = null,
      label_purchase_claimed_at = null,
      shipping_exception = left(coalesce(nullif(trim(p_error), ''), 'Shipping label failed.'), 500),
      updated_at = now()
  where t.id = p_transaction_id
    and t.label_status = 'purchasing'
    and t.label_purchase_claim_token = p_claim_token
    and t.shipping_label_id is null;

  released := found;
  return released;
end;
$$;
revoke all on function public.claim_shipping_label_purchase(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_shipping_label_purchase(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_shipping_label_purchase(uuid, uuid) to service_role;
grant execute on function public.fail_shipping_label_purchase(uuid, uuid, text) to service_role;
comment on column public.transactions.label_purchase_claim_token is
  'Opaque token held by the single Edge Function invocation authorized to contact the label provider.';
comment on column public.transactions.label_purchase_claimed_at is
  'Timestamp of the authoritative label purchase claim; ambiguous provider outcomes remain claimed for reconciliation.';
notify pgrst, 'reload schema';
