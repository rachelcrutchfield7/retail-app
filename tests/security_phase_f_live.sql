begin;

create or replace function pg_temp.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'Phase F live assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(statement text, expected_message text, label text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'Expected Phase F live error did not occur: %', label;
exception
  when others then
    if sqlerrm like 'Expected Phase F live error did not occur:%' then
      raise;
    end if;

    if expected_message is not null and sqlerrm !~* expected_message then
      raise exception 'Wrong Phase F live error for %. Got: %', label, sqlerrm;
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
    '00000000-0000-4000-8000-00000000f101',
    'authenticated',
    'authenticated',
    'phase-f-live-seller@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000f102',
    'authenticated',
    'authenticated',
    'phase-f-live-buyer@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000f103',
    'authenticated',
    'authenticated',
    'phase-f-live-admin@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000f104',
    'authenticated',
    'authenticated',
    'phase-f-live-stranger@retail.local',
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
  zip_code,
  is_admin
)
values
  ('00000000-0000-4000-8000-00000000f101', 'Phase F Seller', 'phasefliveseller', 'Springfield', 'IL', '62701', false),
  ('00000000-0000-4000-8000-00000000f102', 'Phase F Buyer', 'phaseflivebuyer', 'Springfield', 'IL', '62701', false),
  ('00000000-0000-4000-8000-00000000f103', 'Phase F Admin', 'phasefliveadmin', 'Springfield', 'IL', '62701', true),
  ('00000000-0000-4000-8000-00000000f104', 'Phase F Stranger', 'phaseflivestranger', 'Springfield', 'IL', '62701', false);

insert into public.categories (id, name, slug, icon, sort_order, is_active)
values (
  '00000000-0000-4000-8000-00000000f501',
  'Phase F Live Supplies',
  'phase-f-live-supplies',
  'paw',
  999,
  true
);

create temporary table phase_f_listing_one (id uuid not null) on commit drop;
create temporary table phase_f_listing_two (id uuid not null) on commit drop;
create temporary table phase_f_conversation_one (id uuid not null) on commit drop;
create temporary table phase_f_conversation_two (id uuid not null) on commit drop;
create temporary table phase_f_transaction (id uuid not null) on commit drop;
create temporary table phase_f_report (id uuid not null) on commit drop;

grant all on table
  phase_f_listing_one,
  phase_f_listing_two,
  phase_f_conversation_one,
  phase_f_conversation_two,
  phase_f_transaction,
  phase_f_report
to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f101', true);
insert into phase_f_listing_one
select id from public.create_listing(
  '00000000-0000-4000-8000-00000000f501',
  'Phase F Live Crate',
  'A safe test listing for Phase F.',
  'good',
  'sale',
  25,
  null,
  'Springfield',
  'IL',
  '62701',
  true,
  false,
  true,
  false,
  'buyer',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  true
);
insert into phase_f_listing_two
select id from public.create_listing(
  '00000000-0000-4000-8000-00000000f501',
  'Phase F Live Carrier',
  'A second safe test listing for Phase F.',
  'like_new',
  'sale',
  35,
  null,
  'Springfield',
  'IL',
  '62701',
  true,
  false,
  true,
  false,
  'buyer',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  true
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
insert into phase_f_conversation_one
select id from public.create_or_get_conversation((select id from phase_f_listing_one));
insert into phase_f_conversation_two
select id from public.create_or_get_conversation((select id from phase_f_listing_two));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f101', true);
insert into phase_f_transaction
select transaction_id
from public.complete_listing_transaction(
  (select id from phase_f_listing_two),
  'sold',
  '00000000-0000-4000-8000-00000000f102'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select public.send_message((select id from phase_f_conversation_one), 'text', 'Can I pick this up today?');
select pg_temp.expect_error(
  format(
    $$select public.send_message(%L, 'text', 'Can I pick this up today?')$$,
    (select id::text from phase_f_conversation_one)
  ),
  'RETAIL_REPEATED_MESSAGE',
  'duplicate messages are rejected'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f102',
  'message_send_minute',
  'global',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 60);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select pg_temp.expect_error(
  format(
    $$select public.send_message(%L, 'text', 'Fresh body that should hit the minute limit')$$,
    (select id::text from phase_f_conversation_one)
  ),
  'RETAIL_RATE_LIMITED',
  'message minute limit is enforced by the database'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f101', true);
select pg_temp.expect_error(
  format(
    $$insert into public.favorites (user_id, listing_id) values ('00000000-0000-4000-8000-00000000f101', %L)$$,
    (select id::text from phase_f_listing_one)
  ),
  'RETAIL_FAVORITE_SELF_DENIED',
  'users cannot favorite their own listings'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f102',
  'conversation_create_attempt',
  'global',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select pg_temp.expect_error(
  $$select public.create_or_get_conversation('00000000-0000-4000-8000-00000000ffff')$$,
  'RETAIL_RATE_LIMITED',
  'invalid conversation attempts are rate limited'
);
reset role;

alter table public.saved_searches disable trigger enforce_phase_f_saved_search_write;
insert into public.saved_searches (user_id, name, radius_miles)
select
  '00000000-0000-4000-8000-00000000f102',
  'Phase F saved search ' || series_index,
  25
from generate_series(1, 50) as series_index;
alter table public.saved_searches enable trigger enforce_phase_f_saved_search_write;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select pg_temp.expect_error(
  $$insert into public.saved_searches (user_id, name, radius_miles) values ('00000000-0000-4000-8000-00000000f102', 'Phase F overflow search', 25)$$,
  'RETAIL_SAVED_SEARCH_LIMIT_EXCEEDED',
  'saved searches are capped per user'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f102',
  'report_create_hour',
  'global',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 10);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select pg_temp.expect_error(
  format(
    $$select public.submit_report('listing', %L, 'spam', 'Phase F rate-limit report')$$,
    (select id::text from phase_f_listing_one)
  ),
  'RETAIL_RATE_LIMITED',
  'report submission is rate limited'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f104', true);
insert into phase_f_report
select public.submit_report(
  'listing',
  (select id from phase_f_listing_one),
  'spam',
  'Phase F admin report fixture'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f103',
  'admin_report_update_hour',
  'global',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 300);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f103', true);
select pg_temp.expect_error(
  format(
    $$select public.admin_update_report(%L, 'reviewing', 'Phase F admin limit check')$$,
    (select id::text from phase_f_report)
  ),
  'RETAIL_RATE_LIMITED',
  'admin moderation updates are rate limited'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f102',
  'review_create_hour',
  'global',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 10);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select pg_temp.expect_error(
  format(
    $$select public.create_transaction_review(%L, 5, 'Phase F rate-limit review')$$,
    (select id::text from phase_f_transaction)
  ),
  'RETAIL_RATE_LIMITED',
  'review creation is rate limited'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f101',
  'transaction_complete_attempt',
  'seller:00000000-0000-4000-8000-00000000f101',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f101', true);
select pg_temp.expect_error(
  format(
    $$select * from public.complete_listing_transaction(%L, 'sold', '00000000-0000-4000-8000-00000000f104')$$,
    (select id::text from phase_f_listing_one)
  ),
  'RETAIL_RATE_LIMITED',
  'transaction completion attempts are rate limited before buyer guessing'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f102',
  'device_token_change_hour',
  'global',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select pg_temp.expect_error(
  $$select public.register_my_device_token('phase-f-token', 'ios')$$,
  'RETAIL_RATE_LIMITED',
  'device token changes are rate limited'
);
reset role;

insert into public.rate_limit_events (user_id, action, subject_key, metadata, created_at, expires_at)
select
  '00000000-0000-4000-8000-00000000f102',
  'block_state_change_hour',
  'global',
  '{}'::jsonb,
  now(),
  now() + interval '60 days'
from generate_series(1, 30);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f102', true);
select pg_temp.expect_error(
  $$select public.block_user('00000000-0000-4000-8000-00000000f104')$$,
  'RETAIL_RATE_LIMITED',
  'block changes are rate limited'
);
select pg_temp.expect_error(
  $$insert into public.rate_limit_events (user_id, action, subject_key) values ('00000000-0000-4000-8000-00000000f102', 'client_fake', 'global')$$,
  'permission denied',
  'authenticated users cannot write rate limit events directly'
);
reset role;

select 'phase_f_live_tests_passed' as result;

rollback;

do $$
declare
  remaining_rows integer;
begin
  select
    (
      select count(*)
      from auth.users
      where id in (
        '00000000-0000-4000-8000-00000000f101',
        '00000000-0000-4000-8000-00000000f102',
        '00000000-0000-4000-8000-00000000f103',
        '00000000-0000-4000-8000-00000000f104'
      )
    )
    + (
      select count(*)
      from public.profiles
      where id in (
        '00000000-0000-4000-8000-00000000f101',
        '00000000-0000-4000-8000-00000000f102',
        '00000000-0000-4000-8000-00000000f103',
        '00000000-0000-4000-8000-00000000f104'
      )
    )
    + (
      select count(*)
      from public.categories
      where id = '00000000-0000-4000-8000-00000000f501'
    )
    + (
      select count(*)
      from public.rate_limit_events
      where user_id in (
        '00000000-0000-4000-8000-00000000f101',
        '00000000-0000-4000-8000-00000000f102',
        '00000000-0000-4000-8000-00000000f103',
        '00000000-0000-4000-8000-00000000f104'
      )
    )
  into remaining_rows;

  if remaining_rows <> 0 then
    raise exception 'Phase F live cleanup failed. Remaining rows: %', remaining_rows;
  end if;
end $$;
