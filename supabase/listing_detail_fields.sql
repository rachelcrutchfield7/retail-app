-- ReTail Listing Detail Fields
-- Adds optional buyer-facing listing details and lightweight shipping metadata.

alter table public.listings
  add column if not exists item_dimensions text,
  add column if not exists pet_size text,
  add column if not exists condition_notes text,
  add column if not exists availability_notes text,
  add column if not exists reason_for_listing text,
  add column if not exists safety_confirmed boolean default false,
  add column if not exists shipping_payer text default 'buyer',
  add column if not exists shipping_cost_estimate numeric(10,2),
  add column if not exists handling_time text,
  add column if not exists ship_from_zip_code text;

update public.listings
set safety_confirmed = true
where safety_confirmed is distinct from true;

update public.listings
set shipping_payer = 'buyer'
where shipping_payer is null;

alter table public.listings
  alter column safety_confirmed set not null,
  alter column shipping_payer set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_item_dimensions_length'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_item_dimensions_length
      check (item_dimensions is null or char_length(item_dimensions) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_pet_size_length'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_pet_size_length
      check (pet_size is null or char_length(pet_size) <= 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_condition_notes_length'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_condition_notes_length
      check (condition_notes is null or char_length(condition_notes) <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_availability_notes_length'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_availability_notes_length
      check (availability_notes is null or char_length(availability_notes) <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_reason_for_listing_length'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_reason_for_listing_length
      check (reason_for_listing is null or char_length(reason_for_listing) <= 300);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_shipping_payer_valid'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_shipping_payer_valid
      check (shipping_payer in ('buyer', 'seller', 'discuss'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_shipping_cost_estimate_nonnegative'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_shipping_cost_estimate_nonnegative
      check (shipping_cost_estimate is null or shipping_cost_estimate >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_handling_time_length'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_handling_time_length
      check (handling_time is null or char_length(handling_time) <= 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_ship_from_zip_code_valid'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_ship_from_zip_code_valid
      check (ship_from_zip_code is null or ship_from_zip_code ~ '^[0-9]{5}$');
  end if;
end $$;
