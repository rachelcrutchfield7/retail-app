-- ReTail Listing Getting Options
-- Adds explicit seller choices for how buyers can receive an item.

alter table public.listings
  add column if not exists porch_pickup_available boolean not null default false,
  add column if not exists meetup_available boolean not null default true;

update public.listings
set meetup_available = true
where pickup_available = true
  and meetup_available is distinct from true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listing_has_getting_option'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listing_has_getting_option
      check (porch_pickup_available or meetup_available or shipping_available);
  end if;
end $$;
