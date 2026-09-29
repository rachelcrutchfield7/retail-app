-- Split ReTail marketplace fees into an applied seller fee and a buyer-facing
-- service fee while keeping historical transactions readable as-is.

alter table public.transactions
  add column if not exists seller_fee_cents integer,
  add column if not exists buyer_service_fee_cents integer,
  add column if not exists retail_fee_total_cents integer,
  add column if not exists stripe_application_fee_cents integer,
  add column if not exists fee_model_version text;

alter table public.transactions
  drop constraint if exists transactions_authoritative_checkout_amounts_balance;

alter table public.transactions
  add constraint transactions_legacy_checkout_amounts_balance
  check (
    fee_model_version is not null
    or amount_cents is null
    or item_amount_cents is null
    or platform_fee_cents is null
    or seller_amount_cents is null
    or shipping_collected_cents is null
    or tax_amount_cents is null
    or seller_amount_cents + platform_fee_cents + shipping_collected_cents + tax_amount_cents = amount_cents
  ),
  add constraint transactions_fee_model_fields_complete
  check (
    (
      fee_model_version is null
      and seller_fee_cents is null
      and buyer_service_fee_cents is null
      and retail_fee_total_cents is null
      and stripe_application_fee_cents is null
    )
    or
    (
      fee_model_version = 'seller10_buyer5_min50_max1000_v1'
      and seller_fee_cents is not null
      and buyer_service_fee_cents is not null
      and retail_fee_total_cents is not null
      and stripe_application_fee_cents is not null
      and amount_cents is not null
      and item_amount_cents is not null
      and platform_fee_cents is not null
      and seller_amount_cents is not null
      and shipping_collected_cents is not null
      and tax_amount_cents is not null
    )
  ),
  add constraint transactions_fee_model_amounts_nonnegative
  check (
    (seller_fee_cents is null or seller_fee_cents >= 0)
    and (buyer_service_fee_cents is null or buyer_service_fee_cents >= 0)
    and (retail_fee_total_cents is null or retail_fee_total_cents >= 0)
    and (stripe_application_fee_cents is null or stripe_application_fee_cents >= 0)
  ),
  add constraint transactions_fee_model_v1_accounting
  check (
    fee_model_version is distinct from 'seller10_buyer5_min50_max1000_v1'
    or (
      platform_fee_cents = seller_fee_cents
      and seller_fee_cents <= item_amount_cents
      and seller_fee_cents in (
        0,
        floor(((item_amount_cents::numeric * 1000) + 5000) / 10000)::integer
      )
      and buyer_service_fee_cents = least(
        greatest(
          floor(((item_amount_cents::numeric * 500) + 5000) / 10000)::integer,
          50
        ),
        1000
      )
      and retail_fee_total_cents = seller_fee_cents + buyer_service_fee_cents
      and seller_amount_cents = item_amount_cents - seller_fee_cents
      and amount_cents = item_amount_cents + buyer_service_fee_cents + shipping_collected_cents + tax_amount_cents
      and stripe_application_fee_cents = retail_fee_total_cents + shipping_collected_cents + tax_amount_cents
      and amount_cents - stripe_application_fee_cents = seller_amount_cents
    )
  );

create or replace function public.protect_transaction_phase_e_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
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
      or new.item_amount_cents is distinct from old.item_amount_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.seller_fee_cents is distinct from old.seller_fee_cents
      or new.buyer_service_fee_cents is distinct from old.buyer_service_fee_cents
      or new.retail_fee_total_cents is distinct from old.retail_fee_total_cents
      or new.stripe_application_fee_cents is distinct from old.stripe_application_fee_cents
      or new.fee_model_version is distinct from old.fee_model_version
      or new.seller_amount_cents is distinct from old.seller_amount_cents
      or new.fulfillment_method is distinct from old.fulfillment_method
      or new.shipping_payer is distinct from old.shipping_payer
      or new.shipping_amount_cents is distinct from old.shipping_amount_cents
      or new.shipping_collected_cents is distinct from old.shipping_collected_cents
      or new.shipping_carrier is distinct from old.shipping_carrier
      or new.shipping_service is distinct from old.shipping_service
      or new.tax_amount_cents is distinct from old.tax_amount_cents
      or new.currency is distinct from old.currency
      or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
      or new.stripe_transfer_destination is distinct from old.stripe_transfer_destination
      or new.stripe_tax_calculation_id is distinct from old.stripe_tax_calculation_id
      or new.stripe_tax_transaction_id is distinct from old.stripe_tax_transaction_id
      or new.tax_behavior is distinct from old.tax_behavior
      or new.tax_liability is distinct from old.tax_liability
      or new.product_tax_code is distinct from old.product_tax_code
      or new.shipping_tax_code is distinct from old.shipping_tax_code
      or new.retail_fee_tax_code is distinct from old.retail_fee_tax_code
      or new.buyer_tax_address_source is distinct from old.buyer_tax_address_source
      or new.buyer_tax_country is distinct from old.buyer_tax_country
      or new.buyer_tax_state is distinct from old.buyer_tax_state
      or new.buyer_tax_postal_code is distinct from old.buyer_tax_postal_code
      or new.payment_error is distinct from old.payment_error
      or new.paid_at is distinct from old.paid_at
      or new.refunded_amount_cents is distinct from old.refunded_amount_cents
      or new.refunded_at is distinct from old.refunded_at
      or new.last_stripe_charge_id is distinct from old.last_stripe_charge_id
      or new.stripe_dispute_id is distinct from old.stripe_dispute_id
      or new.dispute_status is distinct from old.dispute_status
      or new.dispute_amount_cents is distinct from old.dispute_amount_cents
      or new.dispute_reason is distinct from old.dispute_reason
      or new.dispute_created_at is distinct from old.dispute_created_at
      or new.dispute_resolved_at is distinct from old.dispute_resolved_at
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
$function$;

revoke all on function public.protect_transaction_phase_e_fields() from public;
grant all on function public.protect_transaction_phase_e_fields() to service_role;
;
