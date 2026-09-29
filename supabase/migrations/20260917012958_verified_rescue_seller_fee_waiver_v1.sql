-- Reuse the donation boundary's verified-rescue definition for checkout.
create or replace function public.is_verified_rescue_seller(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_verified_rescue_recipient(target_user_id);
$function$;

revoke all on function public.is_verified_rescue_seller(uuid)
from public, anon, authenticated;
grant execute on function public.is_verified_rescue_seller(uuid) to service_role;

alter table public.transactions
  add column if not exists seller_fee_waiver_reason text;

alter table public.transactions
  add constraint transactions_verified_rescue_seller_fee_waiver check (
    seller_fee_waiver_reason is null
    or (
      seller_fee_waiver_reason = 'verified_rescue'
      and fee_model_version = 'seller10_buyer5_min50_max1000_seller_shipping_v2'
      and seller_fee_cents = 0
    )
  );

comment on column public.transactions.seller_fee_waiver_reason is
  'Authoritative checkout-time reason for a permanent seller-fee waiver; historical rows remain null.';
;
