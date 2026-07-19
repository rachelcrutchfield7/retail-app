begin;

create or replace function pg_temp.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'Phase E live assertion failed: %', label;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(statement text, expected_message text, label text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'Expected Phase E live error did not occur: %', label;
exception
  when others then
    if sqlerrm like 'Expected Phase E live error did not occur:%' then
      raise;
    end if;

    if expected_message is not null and sqlerrm !~* expected_message then
      raise exception 'Wrong Phase E live error for %. Got: %', label, sqlerrm;
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
    '00000000-0000-4000-8000-00000000e101',
    'authenticated',
    'authenticated',
    'phase-e-live-seller@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000e102',
    'authenticated',
    'authenticated',
    'phase-e-live-buyer@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000e103',
    'authenticated',
    'authenticated',
    'phase-e-live-admin@retail.local',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000e104',
    'authenticated',
    'authenticated',
    'phase-e-live-stranger@retail.local',
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
  ('00000000-0000-4000-8000-00000000e101', 'Phase E Seller', 'phaseeliveseller', 'Springfield', 'IL', '62701', false),
  ('00000000-0000-4000-8000-00000000e102', 'Phase E Buyer', 'phaseelivebuyer', 'Springfield', 'IL', '62701', false),
  ('00000000-0000-4000-8000-00000000e103', 'Phase E Admin', 'phaseeliveadmin', 'Springfield', 'IL', '62701', true),
  ('00000000-0000-4000-8000-00000000e104', 'Phase E Stranger', 'phaseelivestranger', 'Springfield', 'IL', '62701', false);

insert into public.categories (id, name, slug, icon, sort_order, is_active)
values (
  '00000000-0000-4000-8000-00000000e501',
  'Phase E Live Supplies',
  'phase-e-live-supplies',
  'paw',
  999,
  true
);

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
  safety_confirmed,
  city,
  state,
  zip_code,
  porch_pickup_available,
  meetup_available,
  shipping_available
)
values
  (
    '00000000-0000-4000-8000-00000000e201',
    '00000000-0000-4000-8000-00000000e101',
    '00000000-0000-4000-8000-00000000e501',
    'Phase E Linked Crate',
    'Disposable linked transaction listing for Phase E live testing.',
    35,
    'sale',
    'good',
    'active',
    true,
    'Springfield',
    'IL',
    '62701',
    true,
    true,
    false
  ),
  (
    '00000000-0000-4000-8000-00000000e202',
    '00000000-0000-4000-8000-00000000e101',
    '00000000-0000-4000-8000-00000000e501',
    'Phase E Unlinked Bowl',
    'Disposable unlinked completion listing for Phase E live testing.',
    12,
    'sale',
    'like_new',
    'active',
    true,
    'Springfield',
    'IL',
    '62701',
    true,
    true,
    false
  ),
  (
    '00000000-0000-4000-8000-00000000e203',
    '00000000-0000-4000-8000-00000000e101',
    '00000000-0000-4000-8000-00000000e501',
    'Phase E Report Harness',
    'Disposable active listing for Phase E report and favorite notification testing.',
    18,
    'sale',
    'fair',
    'active',
    true,
    'Springfield',
    'IL',
    '62701',
    true,
    true,
    false
  ),
  (
    '00000000-0000-4000-8000-00000000e204',
    '00000000-0000-4000-8000-00000000e104',
    '00000000-0000-4000-8000-00000000e501',
    'Phase E Stranger Listing',
    'Disposable unrelated listing for negative authorization checks.',
    20,
    'sale',
    'good',
    'active',
    true,
    'Springfield',
    'IL',
    '62701',
    true,
    true,
    false
  );

insert into public.conversations (
  id,
  listing_id,
  buyer_id,
  seller_id,
  last_message_at
)
values
  (
    '00000000-0000-4000-8000-00000000e301',
    '00000000-0000-4000-8000-00000000e201',
    '00000000-0000-4000-8000-00000000e102',
    '00000000-0000-4000-8000-00000000e101',
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000e302',
    '00000000-0000-4000-8000-00000000e204',
    '00000000-0000-4000-8000-00000000e102',
    '00000000-0000-4000-8000-00000000e104',
    now()
  );

insert into public.messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  body
)
values
  (
    '00000000-0000-4000-8000-00000000e401',
    '00000000-0000-4000-8000-00000000e301',
    '00000000-0000-4000-8000-00000000e101',
    'text',
    'Phase E reportable message.'
  ),
  (
    '00000000-0000-4000-8000-00000000e402',
    '00000000-0000-4000-8000-00000000e302',
    '00000000-0000-4000-8000-00000000e104',
    'text',
    'Phase E unrelated message.'
  );

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error(
  $$select * from public.complete_listing_transaction(
    '00000000-0000-4000-8000-00000000e201',
    'sold',
    '00000000-0000-4000-8000-00000000e102'
  )$$,
  'RETAIL_TRANSACTION_PERMISSION_DENIED|permission denied',
  'anonymous transaction completion is denied'
);
select pg_temp.expect_error(
  $$select public.submit_report(
    'listing',
    '00000000-0000-4000-8000-00000000e203',
    'spam',
    'anonymous report'
  )$$,
  'RETAIL_REPORT_PERMISSION_DENIED|permission denied',
  'anonymous report submission is denied'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select pg_temp.expect_error(
  $$select * from public.complete_listing_transaction(
    '00000000-0000-4000-8000-00000000e201',
    'sold',
    '00000000-0000-4000-8000-00000000e102'
  )$$,
  'RETAIL_TRANSACTION_PERMISSION_DENIED',
  'buyer cannot complete a seller transaction'
);
select pg_temp.expect_error(
  $$insert into public.transactions (
    listing_id,
    buyer_id,
    seller_id,
    status,
    outcome,
    completed_at
  ) values (
    '00000000-0000-4000-8000-00000000e201',
    '00000000-0000-4000-8000-00000000e102',
    '00000000-0000-4000-8000-00000000e101',
    'completed',
    'sold',
    now()
  )$$,
  'permission denied',
  'direct transaction insert is denied'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e101', true);
select pg_temp.expect_error(
  $$select * from public.complete_listing_transaction(
    '00000000-0000-4000-8000-00000000e201',
    'sold',
    '00000000-0000-4000-8000-00000000e104'
  )$$,
  'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE',
  'seller cannot choose an unlinked buyer'
);
select pg_temp.expect_error(
  $$select * from public.complete_listing_transaction(
    '00000000-0000-4000-8000-00000000e201',
    'sold',
    '00000000-0000-4000-8000-00000000e101'
  )$$,
  'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE',
  'seller cannot complete with self as buyer'
);
select * from public.complete_listing_transaction(
  '00000000-0000-4000-8000-00000000e201',
  'sold',
  '00000000-0000-4000-8000-00000000e102'
);
select pg_temp.expect_error(
  $$select * from public.complete_listing_transaction(
    '00000000-0000-4000-8000-00000000e201',
    'sold',
    '00000000-0000-4000-8000-00000000e102'
  )$$,
  'RETAIL_TRANSACTION_ALREADY_COMPLETED',
  'duplicate linked transaction completion is denied'
);
select * from public.complete_listing_transaction(
  '00000000-0000-4000-8000-00000000e202',
  'sold',
  null
);
reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.transactions
    where listing_id = '00000000-0000-4000-8000-00000000e201'
      and seller_id = '00000000-0000-4000-8000-00000000e101'
      and buyer_id = '00000000-0000-4000-8000-00000000e102'
      and status = 'completed'
      and outcome = 'sold'
      and deleted_at is null
  ),
  'seller-only linked transaction completion persists trusted transaction'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.listings
    where id = '00000000-0000-4000-8000-00000000e201'
      and status = 'sold'
  ),
  'linked completion updates listing status'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from public.transactions
    where listing_id = '00000000-0000-4000-8000-00000000e202'
  )
  and exists (
    select 1
    from public.listings
    where id = '00000000-0000-4000-8000-00000000e202'
      and status = 'sold'
  ),
  'unlinked completion marks listing without creating transaction'
);
select pg_temp.assert_true(
  (
    select count(*)
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e102'
      and type = 'transaction_completed'
      and data ->> 'listingId' = '00000000-0000-4000-8000-00000000e201'
      and deleted_at is null
  ) = 1,
  'transaction completion creates one deduped buyer notification'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e104', true);
select pg_temp.expect_error(
  $$select public.create_transaction_review(
    (
      select id
      from public.transactions
      where listing_id = '00000000-0000-4000-8000-00000000e201'
      limit 1
    ),
    5,
    'unrelated review'
  )$$,
  'RETAIL_REVIEW_NOT_ALLOWED',
  'unrelated user cannot review transaction'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select public.create_transaction_review(
  (
    select id
    from public.transactions
    where listing_id = '00000000-0000-4000-8000-00000000e201'
    limit 1
  ),
  5,
  'Clean transaction.'
);
select pg_temp.expect_error(
  $$select public.create_transaction_review(
    (
      select id
      from public.transactions
      where listing_id = '00000000-0000-4000-8000-00000000e201'
      limit 1
    ),
    4,
    'duplicate review'
  )$$,
  'RETAIL_REVIEW_ALREADY_SUBMITTED',
  'duplicate buyer review is denied'
);
select pg_temp.expect_error(
  $$insert into public.reviews (
    transaction_id,
    reviewer_id,
    reviewee_id,
    listing_id,
    rating
  ) values (
    (
      select id
      from public.transactions
      where listing_id = '00000000-0000-4000-8000-00000000e201'
      limit 1
    ),
    '00000000-0000-4000-8000-00000000e102',
    '00000000-0000-4000-8000-00000000e101',
    '00000000-0000-4000-8000-00000000e201',
    5
  )$$,
  'permission denied',
  'direct review insert is denied'
);
select * from public.update_my_notification_preferences(
  true,
  true,
  false,
  true,
  true,
  false,
  false,
  false,
  false
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e101', true);
select pg_temp.expect_error(
  $$select public.create_transaction_review(
    (
      select id
      from public.transactions
      where listing_id = '00000000-0000-4000-8000-00000000e201'
      limit 1
    ),
    6,
    'invalid seller review'
  )$$,
  'RETAIL_REVIEW_RATING_INVALID',
  'invalid review rating is denied'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e101', true);
select public.create_transaction_review(
  (
    select id
    from public.transactions
    where listing_id = '00000000-0000-4000-8000-00000000e201'
    limit 1
  ),
  4,
  'Good buyer.'
);
reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.reviews
    where listing_id = '00000000-0000-4000-8000-00000000e201'
      and reviewer_id = '00000000-0000-4000-8000-00000000e102'
      and reviewee_id = '00000000-0000-4000-8000-00000000e101'
      and rating = 5
      and deleted_at is null
  )
  and exists (
    select 1
    from public.reviews
    where listing_id = '00000000-0000-4000-8000-00000000e201'
      and reviewer_id = '00000000-0000-4000-8000-00000000e101'
      and reviewee_id = '00000000-0000-4000-8000-00000000e102'
      and rating = 4
      and deleted_at is null
  ),
  'buyer and seller reviews derive participants from the transaction'
);
select pg_temp.assert_true(
  (
    select count(*)
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e101'
      and type = 'review'
      and deleted_at is null
  ) = 1
  and (
    select count(*)
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e102'
      and type = 'review'
      and deleted_at is null
  ) = 0,
  'review notification preferences are stored and enforced'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e101', true);
select pg_temp.expect_error(
  $$select public.submit_report(
    'listing',
    '00000000-0000-4000-8000-00000000e203',
    'spam',
    'self listing report'
  )$$,
  'RETAIL_REPORT_PERMISSION_DENIED',
  'seller cannot report own listing'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select public.submit_report(
  'listing',
  '00000000-0000-4000-8000-00000000e203',
  'spam',
  'Possible spam listing.'
);
select pg_temp.expect_error(
  $$select public.submit_report(
    'listing',
    '00000000-0000-4000-8000-00000000e203',
    'spam',
    'duplicate listing report'
  )$$,
  'RETAIL_REPORT_ALREADY_SUBMITTED',
  'duplicate active listing report is denied'
);
select pg_temp.assert_true(
  public.has_existing_report(
    'listing',
    '00000000-0000-4000-8000-00000000e203'
  ),
  'has_existing_report sees the caller report'
);
select * from public.get_my_reports();
select pg_temp.expect_error(
  $$select evidence from public.get_my_reports()$$,
  'column "evidence" does not exist',
  'reporter-safe report view excludes evidence'
);
select pg_temp.assert_true(
  (
    select count(*)
    from public.reports
    where reporter_id = '00000000-0000-4000-8000-00000000e102'
  ) = 0,
  'reporter cannot read raw reports table'
);
select pg_temp.expect_error(
  $$insert into public.reports (
    reporter_id,
    report_type,
    reason,
    listing_id
  ) values (
    '00000000-0000-4000-8000-00000000e102',
    'listing',
    'spam',
    '00000000-0000-4000-8000-00000000e203'
  )$$,
  'permission denied',
  'direct report insert is denied'
);
select public.submit_report(
  'message',
  '00000000-0000-4000-8000-00000000e401',
  'harassment',
  'Message was inappropriate.'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e101', true);
select pg_temp.expect_error(
  $$select public.submit_report(
    'message',
    '00000000-0000-4000-8000-00000000e402',
    'harassment',
    'not my conversation'
  )$$,
  'RETAIL_REPORT_TARGET_INVALID',
  'private message report requires conversation participation'
);
select public.submit_report(
  'user',
  '00000000-0000-4000-8000-00000000e104',
  'fraud',
  'Suspicious account.'
);
reset role;

select pg_temp.assert_true(
  (
    select count(*)
    from public.reports
    where report_type = 'listing'
      and listing_id = '00000000-0000-4000-8000-00000000e203'
      and status = 'open'
  ) = 1
  and (
    select count(*)
    from public.reports
    where report_type = 'message'
      and message_id = '00000000-0000-4000-8000-00000000e401'
      and status = 'open'
  ) = 1
  and (
    select count(*)
    from public.reports
    where report_type = 'user'
      and reported_user_id = '00000000-0000-4000-8000-00000000e104'
      and status = 'open'
  ) = 1,
  'listing, message, and user reports are submitted with trusted targets'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select pg_temp.expect_error(
  $$select public.admin_update_report(
    (
      select id
      from public.reports
      where report_type = 'listing'
        and listing_id = '00000000-0000-4000-8000-00000000e203'
      limit 1
    ),
    'reviewing',
    'not admin'
  )$$,
  'RETAIL_REPORT_PERMISSION_DENIED',
  'non-admin report moderation is denied'
);
select pg_temp.assert_true(
  (
    select count(*)
    from public.report_moderation_events
  ) = 0,
  'non-admin cannot read moderation event rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e103', true);
select public.admin_update_report(
  (
    select id
    from public.reports
    where report_type = 'listing'
      and listing_id = '00000000-0000-4000-8000-00000000e203'
    limit 1
  ),
  'reviewing',
  'Admin reviewed in Phase E live test.'
);
reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.reports
    where report_type = 'listing'
      and listing_id = '00000000-0000-4000-8000-00000000e203'
      and status = 'reviewing'
      and assigned_admin_id = '00000000-0000-4000-8000-00000000e103'
      and admin_notes is not null
  )
  and exists (
    select 1
    from public.report_moderation_events
    where previous_status = 'open'
      and new_status = 'reviewing'
      and admin_id = '00000000-0000-4000-8000-00000000e103'
      and note_present is true
  )
  and exists (
    select 1
    from public.audit_logs
    where event_type in ('listing_reported', 'user_reported', 'message_reported')
      and target_table = 'reports'
  ),
  'admin moderation creates report status, moderation event, and audit evidence'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select pg_temp.expect_error(
  $$insert into public.notifications (
    user_id,
    type,
    title,
    body
  ) values (
    '00000000-0000-4000-8000-00000000e101',
    'system',
    'Forged notification',
    'This should be denied.'
  )$$,
  'permission denied',
  'direct notification insert is denied'
);
select pg_temp.expect_error(
  $$insert into public.notification_preferences (
    user_id,
    in_app_messages
  ) values (
    '00000000-0000-4000-8000-00000000e101',
    false
  )$$,
  'permission denied',
  'direct notification preference write is denied'
);
select pg_temp.expect_error(
  $$insert into public.device_tokens (
    user_id,
    token,
    platform
  ) values (
    '00000000-0000-4000-8000-00000000e102',
    'phase-e-live-direct-token',
    'ios'
  )$$,
  'permission denied',
  'direct device token insert is denied'
);
reset role;

select set_config(
  'retail.phase_e_seller_notification_id',
  (
    select id::text
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e101'
      and type = 'review'
      and deleted_at is null
    limit 1
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select public.mark_notification_read(
  current_setting('retail.phase_e_seller_notification_id')::uuid
);
reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.notifications
    where id = current_setting('retail.phase_e_seller_notification_id')::uuid
      and user_id = '00000000-0000-4000-8000-00000000e101'
      and is_read is false
      and deleted_at is null
  ),
  'cross-user notification mark read is non-mutating'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select public.mark_notification_read(
  (
    select id
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e102'
      and type = 'transaction_completed'
    limit 1
  )
);
select public.delete_my_notification(
  (
    select id
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e102'
      and type = 'transaction_completed'
    limit 1
  )
);
select public.register_my_device_token('phase-e-live-token-transfer', 'ios');
select public.remove_my_device_token('phase-e-live-token-transfer') = true as buyer_removed_own_token;
select public.register_my_device_token('phase-e-live-token-transfer', 'ios');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e101', true);
select public.update_my_notification_preferences(
  false,
  true,
  false,
  true,
  true,
  false,
  false,
  false,
  false
);
select public.register_my_device_token('phase-e-live-token-transfer', 'android');
reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.device_tokens
    where token = 'phase-e-live-token-transfer'
      and user_id = '00000000-0000-4000-8000-00000000e101'
      and platform = 'android'
  )
  and not exists (
    select 1
    from public.device_tokens
    where token = 'phase-e-live-token-transfer'
      and user_id = '00000000-0000-4000-8000-00000000e102'
  ),
  'device token registration transfers ownership and removes prior owner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e101', true);
select pg_temp.assert_true(
  public.remove_my_device_token('phase-e-live-token-transfer'),
  'device token removal succeeds for current owner'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
select public.send_message(
  '00000000-0000-4000-8000-00000000e301',
  'text',
  'RETAIL_OFFER::{"amount":12,"note":"Do not leak raw offer JSON"}',
  null,
  null,
  null,
  null,
  null,
  null
);
reset role;

select pg_temp.assert_true(
  (
    select count(*)
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e101'
      and type = 'message'
      and body like '%RETAIL_OFFER::%'
      and deleted_at is null
  ) = 0,
  'offer notifications use safe preview text'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e102', true);
insert into public.favorites (user_id, listing_id)
values (
  '00000000-0000-4000-8000-00000000e102',
  '00000000-0000-4000-8000-00000000e203'
);
reset role;

select pg_temp.assert_true(
  (
    select count(*)
    from public.notifications
    where user_id = '00000000-0000-4000-8000-00000000e101'
      and type = 'favorite'
      and data ->> 'listingId' = '00000000-0000-4000-8000-00000000e203'
      and deleted_at is null
  ) = 1,
  'favorite notification ownership and deduplication are enforced by the trigger'
);

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
        '00000000-0000-4000-8000-00000000e101',
        '00000000-0000-4000-8000-00000000e102',
        '00000000-0000-4000-8000-00000000e103',
        '00000000-0000-4000-8000-00000000e104'
      )
    )
    + (
      select count(*)
      from public.profiles
      where id in (
        '00000000-0000-4000-8000-00000000e101',
        '00000000-0000-4000-8000-00000000e102',
        '00000000-0000-4000-8000-00000000e103',
        '00000000-0000-4000-8000-00000000e104'
      )
    )
    + (
      select count(*)
      from public.categories
      where id = '00000000-0000-4000-8000-00000000e501'
    )
    + (
      select count(*)
      from public.listings
      where id in (
        '00000000-0000-4000-8000-00000000e201',
        '00000000-0000-4000-8000-00000000e202',
        '00000000-0000-4000-8000-00000000e203',
        '00000000-0000-4000-8000-00000000e204'
      )
    )
    + (
      select count(*)
      from public.conversations
      where id in (
        '00000000-0000-4000-8000-00000000e301',
        '00000000-0000-4000-8000-00000000e302'
      )
    )
    + (
      select count(*)
      from public.messages
      where id in (
        '00000000-0000-4000-8000-00000000e401',
        '00000000-0000-4000-8000-00000000e402'
      )
    )
    + (
      select count(*)
      from public.notifications
      where user_id in (
        '00000000-0000-4000-8000-00000000e101',
        '00000000-0000-4000-8000-00000000e102',
        '00000000-0000-4000-8000-00000000e103',
        '00000000-0000-4000-8000-00000000e104'
      )
    )
    + (
      select count(*)
      from public.notification_preferences
      where user_id in (
        '00000000-0000-4000-8000-00000000e101',
        '00000000-0000-4000-8000-00000000e102',
        '00000000-0000-4000-8000-00000000e103',
        '00000000-0000-4000-8000-00000000e104'
      )
    )
    + (
      select count(*)
      from public.device_tokens
      where token like 'phase-e-live-%'
    )
    + (
      select count(*)
      from public.reports
      where reporter_id in (
        '00000000-0000-4000-8000-00000000e101',
        '00000000-0000-4000-8000-00000000e102',
        '00000000-0000-4000-8000-00000000e103',
        '00000000-0000-4000-8000-00000000e104'
      )
    )
  into remaining_rows;

  if remaining_rows <> 0 then
    raise exception 'Phase E live cleanup failed. Remaining rows: %', remaining_rows;
  end if;
end;
$$;

select 'phase_e_live_tests_passed' as result;
