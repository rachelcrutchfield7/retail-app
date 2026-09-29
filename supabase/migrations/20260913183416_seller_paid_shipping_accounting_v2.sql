-- Versioned checkout accounting: seller-paid labels reduce seller proceeds without
-- being classified as ReTail marketplace fee revenue. Existing v1 rows are unchanged.
alter table public.transactions
  add column if not exists seller_fee_cents integer,
  add column if not exists buyer_service_fee_cents integer,
  add column if not exists retail_fee_total_cents integer,
  add column if not exists stripe_application_fee_cents integer,
  add column if not exists fee_model_version text,
  add column if not exists seller_shipping_deduction_cents integer;
alter table public.transactions
  drop constraint if exists transactions_authoritative_checkout_amounts_balance,
  drop constraint if exists transactions_legacy_checkout_amounts_balance;
alter table public.transactions
  add constraint transactions_legacy_checkout_amounts_balance check (
    fee_model_version is not null
    or amount_cents is null
    or item_amount_cents is null
    or platform_fee_cents is null
    or seller_amount_cents is null
    or shipping_collected_cents is null
    or tax_amount_cents is null
    or seller_amount_cents + platform_fee_cents + shipping_collected_cents + tax_amount_cents = amount_cents
  );
alter table public.transactions
  drop constraint if exists transactions_fee_model_amounts_nonnegative;
alter table public.transactions
  add constraint transactions_fee_model_amounts_nonnegative check (
    (seller_fee_cents is null or seller_fee_cents >= 0)
    and (buyer_service_fee_cents is null or buyer_service_fee_cents >= 0)
    and (retail_fee_total_cents is null or retail_fee_total_cents >= 0)
    and (stripe_application_fee_cents is null or stripe_application_fee_cents >= 0)
    and (seller_shipping_deduction_cents is null or seller_shipping_deduction_cents >= 0)
  );
alter table public.transactions
  drop constraint if exists transactions_fee_model_fields_complete;
alter table public.transactions
  add constraint transactions_fee_model_fields_complete check (
    (
      fee_model_version is null
      and seller_fee_cents is null
      and buyer_service_fee_cents is null
      and retail_fee_total_cents is null
      and stripe_application_fee_cents is null
      and seller_shipping_deduction_cents is null
    )
    or (
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
      and seller_shipping_deduction_cents is null
    )
    or (
      fee_model_version = 'seller10_buyer5_min50_max1000_seller_shipping_v2'
      and seller_fee_cents is not null
      and buyer_service_fee_cents is not null
      and retail_fee_total_cents is not null
      and stripe_application_fee_cents is not null
      and amount_cents is not null
      and item_amount_cents is not null
      and platform_fee_cents is not null
      and seller_amount_cents is not null
      and shipping_amount_cents is not null
      and shipping_collected_cents is not null
      and seller_shipping_deduction_cents is not null
      and tax_amount_cents is not null
    )
  );
alter table public.transactions
  drop constraint if exists transactions_fee_model_v1_accounting;
alter table public.transactions
  add constraint transactions_fee_model_v1_accounting check (
    fee_model_version is distinct from 'seller10_buyer5_min50_max1000_v1'
    or (
      platform_fee_cents = seller_fee_cents
      and seller_fee_cents <= item_amount_cents
      and (
        seller_fee_cents = 0
        or seller_fee_cents = floor((item_amount_cents * 1000 + 5000)::numeric / 10000)::integer
      )
      and buyer_service_fee_cents = least(
        greatest(floor((item_amount_cents * 500 + 5000)::numeric / 10000)::integer, 50),
        1000
      )
      and retail_fee_total_cents = seller_fee_cents + buyer_service_fee_cents
      and seller_amount_cents = item_amount_cents - seller_fee_cents
      and amount_cents = item_amount_cents + buyer_service_fee_cents + shipping_collected_cents + tax_amount_cents
      and stripe_application_fee_cents = retail_fee_total_cents + shipping_collected_cents + tax_amount_cents
      and amount_cents - stripe_application_fee_cents = seller_amount_cents
    )
  );
alter table public.transactions
  drop constraint if exists transactions_fee_model_v2_accounting;
alter table public.transactions
  add constraint transactions_fee_model_v2_accounting check (
    fee_model_version is distinct from 'seller10_buyer5_min50_max1000_seller_shipping_v2'
    or (
      platform_fee_cents = seller_fee_cents
      and seller_fee_cents <= item_amount_cents
      and (
        seller_fee_cents = 0
        or seller_fee_cents = floor((item_amount_cents * 1000 + 5000)::numeric / 10000)::integer
      )
      and buyer_service_fee_cents = least(
        greatest(floor((item_amount_cents * 500 + 5000)::numeric / 10000)::integer, 50),
        1000
      )
      and retail_fee_total_cents = seller_fee_cents + buyer_service_fee_cents
      and shipping_collected_cents = case
        when fulfillment_method = 'shipping' and shipping_payer = 'buyer' then shipping_amount_cents
        else 0
      end
      and seller_shipping_deduction_cents = case
        when fulfillment_method = 'shipping' and shipping_payer = 'seller' then shipping_amount_cents
        else 0
      end
      and seller_amount_cents = item_amount_cents - seller_fee_cents - seller_shipping_deduction_cents
      and seller_amount_cents >= 0
      and amount_cents = item_amount_cents + buyer_service_fee_cents + shipping_collected_cents + tax_amount_cents
      and stripe_application_fee_cents = retail_fee_total_cents
        + shipping_collected_cents
        + seller_shipping_deduction_cents
        + tax_amount_cents
      and amount_cents - stripe_application_fee_cents = seller_amount_cents
    )
  );
comment on column public.transactions.seller_shipping_deduction_cents is
  'Shipping-label amount withheld from seller proceeds; not ReTail marketplace fee revenue.';
