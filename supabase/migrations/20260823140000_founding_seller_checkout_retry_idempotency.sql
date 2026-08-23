drop index if exists public.founding_seller_benefit_uses_transaction_unique;

create unique index founding_seller_benefit_uses_transaction_unique
  on public.founding_seller_benefit_uses(transaction_id)
  where transaction_id is not null
    and status in ('reserved', 'applied');

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
  existing_active_use public.founding_seller_benefit_uses;
begin
  if p_checkout_token is null
     or p_transaction_id is null
     or p_payment_intent_id is null then
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

  select *
  into existing_active_use
  from public.founding_seller_benefit_uses
  where transaction_id = p_transaction_id
    and id <> use_row.id
    and status in ('reserved', 'applied')
  order by
    case when status = 'applied' then 0 else 1 end,
    updated_at desc
  limit 1
  for update;

  if found then
    update public.founding_seller_benefit_uses
    set status = 'released',
        released_at = coalesce(released_at, now()),
        release_reason = 'existing_transaction_benefit_reused',
        updated_at = now()
    where id = use_row.id;

    if existing_active_use.status = 'reserved' then
      update public.founding_seller_benefit_uses
      set stripe_payment_intent_id = p_payment_intent_id,
          updated_at = now()
      where id = existing_active_use.id;
    end if;

    update public.transactions
    set founding_seller_benefit_use_id = existing_active_use.id,
        founding_seller_fee_waived_cents = existing_active_use.waived_platform_fee_cents,
        founding_seller_benefit_ordinal = existing_active_use.ordinal,
        updated_at = now()
    where id = p_transaction_id;

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
