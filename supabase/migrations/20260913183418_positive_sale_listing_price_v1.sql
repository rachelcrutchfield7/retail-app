-- Sale listings must have a purchasable positive price. Free and donation listings
-- retain their existing zero/null behavior. NOT VALID preserves any historical rows.
create or replace function private.enforce_positive_sale_listing_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.listing_type = 'sale'::public.listing_type
    and (new.price is null or new.price <= 0) then
    raise exception 'RETAIL_PRICE_REQUIRED' using errcode = '22023';
  end if;

  return new;
end;
$$;
drop trigger if exists listings_positive_sale_price_guard on public.listings;
create trigger listings_positive_sale_price_guard
before insert or update of listing_type, price on public.listings
for each row execute function private.enforce_positive_sale_listing_price();
revoke all on function private.enforce_positive_sale_listing_price() from public, anon, authenticated;
alter table public.listings
  drop constraint if exists listing_price_matches_type;
alter table public.listings
  add constraint listing_price_matches_type check (
    (
      listing_type = 'sale'::public.listing_type
      and price is not null
      and price > 0
    )
    or (
      listing_type in ('free'::public.listing_type, 'donation'::public.listing_type)
      and (price is null or price = 0)
    )
  ) not valid;
comment on function private.enforce_positive_sale_listing_price() is
  'Central create_listing/update_my_listing/direct-write guard: sale listings require price > 0.';
