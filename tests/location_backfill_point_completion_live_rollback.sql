begin;

create or replace function pg_temp.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'Location v2 point-completion assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(statement text, expected_message text, label text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'Expected Location v2 point-completion error did not occur: %', label;
exception
  when others then
    if sqlerrm like 'Expected Location v2 point-completion error did not occur:%' then
      raise;
    end if;

    if sqlerrm !~ expected_message then
      raise exception 'Wrong Location v2 point-completion error for %. Got: %', label, sqlerrm;
    end if;
end;
$$;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000005c01',
    'authenticated',
    'authenticated',
    'location-point-seller@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000005c02',
    'authenticated',
    'authenticated',
    'location-point-buyer@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (
  id,
  display_name,
  username,
  city,
  state,
  zip_code
)
values
  (
    '00000000-0000-4000-8000-000000005c01',
    'Location Point Seller',
    'locationpointseller',
    'Cottage Hills',
    'IL',
    '62018'
  ),
  (
    '00000000-0000-4000-8000-000000005c02',
    'Location Point Buyer',
    'locationpointbuyer',
    'Cottage Hills',
    'IL',
    '62018'
  );

insert into public.categories (id, name, slug, icon, sort_order, is_active)
values (
  '00000000-0000-4000-8000-000000005c03',
  'Location Point Fixtures',
  'location-point-fixtures',
  'map-pin',
  999,
  true
);

insert into private.marketplace_locations (
  id,
  location_key,
  country_code,
  state_code,
  city,
  postal_code,
  latitude,
  longitude,
  location_point,
  resolution_level,
  provider,
  is_active
)
values
  (
    '00000000-0000-4000-8000-000000005c10',
    'US|POSTAL|62018',
    'US',
    'IL',
    'Bethalto',
    '62018',
    38.900000,
    -90.070000,
    public.st_setsrid(public.st_makepoint(-90.070000, 38.900000), 4326)::public.geography,
    'postal_code',
    'rollback-fixture',
    true
  ),
  (
    '00000000-0000-4000-8000-000000005c11',
    'US|POSTAL|62096',
    'US',
    'IL',
    'Wood River',
    '62096',
    38.861200,
    -90.097600,
    public.st_setsrid(public.st_makepoint(-90.097600, 38.861200), 4326)::public.geography,
    'postal_code',
    'rollback-fixture',
    true
  );

create or replace function pg_temp.make_listing(
  fixture_id uuid,
  fixture_status public.listing_status default 'active'::public.listing_status,
  fixture_state text default 'IL',
  fixture_zip text default '62018',
  fixture_location_id uuid default null
)
returns void
language plpgsql
as $$
begin
  perform set_config('retail.location_backfill_context', 'true', true);

  insert into public.listings (
    id,
    seller_id,
    category_id,
    title,
    description,
    price,
    listing_type,
    condition,
    status,
    city,
    state,
    zip_code,
    marketplace_location_id,
    pickup_available,
    porch_pickup_available,
    meetup_available,
    shipping_available,
    safety_confirmed
  )
  values (
    fixture_id,
    '00000000-0000-4000-8000-000000005c01',
    '00000000-0000-4000-8000-000000005c03',
    'Location point fixture',
    'Rollback-only Location v2 point completion fixture.',
    0,
    'free'::public.listing_type,
    'good'::public.listing_condition,
    fixture_status,
    'Cottage Hills',
    fixture_state,
    fixture_zip,
    fixture_location_id,
    true,
    false,
    true,
    false,
    true
  );

  perform set_config('retail.location_backfill_context', 'false', true);
exception
  when others then
    perform set_config('retail.location_backfill_context', 'false', true);
    raise;
end;
$$;

select pg_temp.make_listing('00000000-0000-4000-8000-000000005a01');
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a02',
  fixture_location_id => '00000000-0000-4000-8000-000000005c10'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a03',
  fixture_location_id => '00000000-0000-4000-8000-000000005c11'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a04',
  fixture_zip => '62017'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a05',
  fixture_state => 'MO'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a06',
  fixture_status => 'sold'::public.listing_status
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a07',
  fixture_status => 'pending'::public.listing_status
);
select pg_temp.make_listing('00000000-0000-4000-8000-000000005a08');
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a09',
  fixture_location_id => '00000000-0000-4000-8000-000000005c10'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a0a',
  fixture_location_id => '00000000-0000-4000-8000-000000005c10'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a0b',
  fixture_location_id => '00000000-0000-4000-8000-000000005c10'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a0c',
  fixture_location_id => '00000000-0000-4000-8000-000000005c10'
);
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a0d',
  fixture_location_id => '00000000-0000-4000-8000-000000005c10'
);

select set_config('retail.location_backfill_context', 'true', true);
update public.listings set latitude = 38.900000
where id = '00000000-0000-4000-8000-000000005a09';
update public.listings set longitude = -90.070000
where id = '00000000-0000-4000-8000-000000005a0a';
update public.listings
set location_point = public.st_setsrid(public.st_makepoint(-90.070000, 38.900000), 4326)::public.geography
where id = '00000000-0000-4000-8000-000000005a0b';
update public.listings
set latitude = 39.000000,
    longitude = -90.000000
where id = '00000000-0000-4000-8000-000000005a0c';
update public.listings
set latitude = 38.900000,
    longitude = -90.070000
where id = '00000000-0000-4000-8000-000000005a0d';
update public.listings set location_point = null
where id = '00000000-0000-4000-8000-000000005a0d';
select set_config('retail.location_backfill_context', 'false', true);

-- A service-role UPDATE without the RPC context must hit the normal Phase F
-- guard. The corrected RPC performs the same protected mutation successfully.
set local role service_role;
select pg_temp.expect_error(
  $statement$
    update public.listings
    set marketplace_location_id = '00000000-0000-4000-8000-000000005c10',
        latitude = 38.900000,
        longitude = -90.070000
    where id = '00000000-0000-4000-8000-000000005a01'
  $statement$,
  'RETAIL_AUTH_REQUIRED|RETAIL_ACCOUNT_NOT_ACTIVE',
  'direct write without location_backfill_context'
);

select pg_temp.assert_true(
  (
    select result = 'backfilled'
    from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a01',
      '00000000-0000-4000-8000-000000005c10'
    )
  ),
  'fresh listing result'
);
reset role;

select pg_temp.assert_true(
  (
    select marketplace_location_id = '00000000-0000-4000-8000-000000005c10'
      and latitude = 38.900000
      and longitude = -90.070000
      and location_point is not null
      and public.st_equals(
        location_point::public.geometry,
        public.st_setsrid(public.st_makepoint(-90.070000, 38.900000), 4326)
      )
    from public.listings
    where id = '00000000-0000-4000-8000-000000005a01'
  ),
  'fresh listing trusted coordinates and trigger-generated point'
);

create temporary table fresh_listing_before_reapply
on commit drop
as
select updated_at
from public.listings
where id = '00000000-0000-4000-8000-000000005a01';

set local role service_role;
select pg_temp.assert_true(
  (
    select result = 'already_complete'
    from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a01',
      '00000000-0000-4000-8000-000000005c10'
    )
  ),
  'complete listing idempotent result'
);
reset role;

select pg_temp.assert_true(
  (
    select l.updated_at = snapshot.updated_at
    from public.listings as l
    cross join fresh_listing_before_reapply as snapshot
    where l.id = '00000000-0000-4000-8000-000000005a01'
  ),
  'complete listing is not mutated on reapply'
);

set local role service_role;
select pg_temp.assert_true(
  (
    select result = 'repaired'
    from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a02',
      '00000000-0000-4000-8000-000000005c10'
    )
  ),
  'exact Phase 5 partial state repaired'
);
reset role;

select pg_temp.assert_true(
  (
    select latitude = 38.900000
      and longitude = -90.070000
      and location_point is not null
    from public.listings
    where id = '00000000-0000-4000-8000-000000005a02'
  ),
  'repair populated coordinates and point'
);

set local role service_role;
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a03',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_ALREADY_TRUSTED',
  'different trusted location'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a04',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_ZIP_MISMATCH',
  'ZIP mismatch'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a05',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_STATE_MISMATCH',
  'state mismatch'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a06',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE',
  'sold listing'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a07',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE',
  'pending listing'
);
reset role;

-- Simulate candidate scan, then a lifecycle transition before attachment.
set local role service_role;
select pg_temp.assert_true(
  exists (
    select 1
    from public.get_marketplace_location_backfill_candidates(50)
    where listing_id = '00000000-0000-4000-8000-000000005a08'
  ),
  'race fixture appeared in candidate scan'
);
reset role;

select set_config('retail.location_backfill_context', 'true', true);
update public.listings
set status = 'sold'::public.listing_status
where id = '00000000-0000-4000-8000-000000005a08';
select set_config('retail.location_backfill_context', 'false', true);

set local role service_role;
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a08',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE',
  'active-to-sold scan/attach race'
);

select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a09',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE',
  'latitude-only state'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a0a',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE',
  'longitude-only state'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a0b',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE',
  'point-without-coordinates state'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a0c',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE',
  'coordinates disagree with trusted location'
);
select pg_temp.expect_error(
  $statement$
    select * from public.backfill_listing_marketplace_location(
      '00000000-0000-4000-8000-000000005a0d',
      '00000000-0000-4000-8000-000000005c10'
    )
  $statement$,
  'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE',
  'coordinates-without-point state'
);
reset role;

-- Preserve business, reservation, transaction, and payment state.
select pg_temp.make_listing('00000000-0000-4000-8000-000000005a10');
select set_config('retail.phase_e_trusted_transaction_write', 'true', true);
insert into public.transactions (
  id,
  listing_id,
  buyer_id,
  seller_id,
  status,
  payment_method,
  payment_status,
  amount_cents,
  item_amount_cents,
  platform_fee_cents,
  seller_amount_cents,
  shipping_collected_cents,
  tax_amount_cents
)
values (
  '00000000-0000-4000-8000-000000005c20',
  '00000000-0000-4000-8000-000000005a10',
  '00000000-0000-4000-8000-000000005c02',
  '00000000-0000-4000-8000-000000005c01',
  'pending'::public.transaction_status,
  'outside_app',
  'processing',
  0,
  0,
  0,
  0,
  0,
  0
);
select set_config('retail.phase_e_trusted_transaction_write', 'false', true);

select set_config('retail.location_backfill_context', 'true', true);
select set_config('retail.checkout_reservation_context', 'true', true);
update public.listings
set reserved_by = '00000000-0000-4000-8000-000000005c02',
    reserved_until = now() + interval '30 minutes',
    reservation_payment_intent_id = 'pi_locationpointfixture',
    reservation_transaction_id = '00000000-0000-4000-8000-000000005c20'
where id = '00000000-0000-4000-8000-000000005a10';
select set_config('retail.checkout_reservation_context', 'false', true);
select set_config('retail.location_backfill_context', 'false', true);

create temporary table protected_listing_snapshot
on commit drop
as
select to_jsonb(l) - array[
  'marketplace_location_id',
  'latitude',
  'longitude',
  'location_point',
  'updated_at'
] as state
from public.listings as l
where l.id = '00000000-0000-4000-8000-000000005a10';

create temporary table protected_transaction_snapshot
on commit drop
as
select to_jsonb(t) as state
from public.transactions as t
where t.id = '00000000-0000-4000-8000-000000005c20';

set local role service_role;
select result
from public.backfill_listing_marketplace_location(
  '00000000-0000-4000-8000-000000005a10',
  '00000000-0000-4000-8000-000000005c10'
);
reset role;

select pg_temp.assert_true(
  (
    select (to_jsonb(l) - array[
      'marketplace_location_id',
      'latitude',
      'longitude',
      'location_point',
      'updated_at'
    ]) = snapshot.state
    from public.listings as l
    cross join protected_listing_snapshot as snapshot
    where l.id = '00000000-0000-4000-8000-000000005a10'
  ),
  'business and reservation fields unchanged'
);

select pg_temp.assert_true(
  (
    select to_jsonb(t) = snapshot.state
    from public.transactions as t
    cross join protected_transaction_snapshot as snapshot
    where t.id = '00000000-0000-4000-8000-000000005c20'
  ),
  'transaction and payment state unchanged'
);

select pg_temp.assert_true(
  pg_get_function_result(
    'public.backfill_listing_marketplace_location(uuid,uuid)'::regprocedure
  ) !~* 'latitude|longitude|location_point',
  'backfill RPC return signature exposes no coordinates'
);

-- Reapply the corrective migration inside this rollback-only transaction to
-- prove the generic migration repair finds an ID-agnostic exact partial row.
select pg_temp.make_listing(
  '00000000-0000-4000-8000-000000005a11',
  fixture_location_id => '00000000-0000-4000-8000-000000005c10'
);
\ir ../supabase/migrations/20260925010007_location_architecture_v2_backfill_point_completion.sql

select pg_temp.assert_true(
  (
    select latitude = 38.900000
      and longitude = -90.070000
      and location_point is not null
    from public.listings
    where id = '00000000-0000-4000-8000-000000005a11'
  ),
  'generic migration repair completed exact partial row'
);

rollback;
