-- ReTail Security Remediation Phase E
-- Transactions, reviews, reports, notifications, preferences, and device tokens.
--
-- This migration intentionally does not redesign marketplace, messaging,
-- rescue, profile, payment, shipping, or storage behavior outside this trust
-- boundary.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Data shape, dedupe, and immutable audit foundations
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists dedupe_key text,
  add column if not exists deleted_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_dedupe_key_length,
  add constraint notifications_dedupe_key_length
    check (dedupe_key is null or char_length(dedupe_key) between 1 and 240);

alter table public.device_tokens
  drop constraint if exists device_tokens_token_length,
  add constraint device_tokens_token_length
    check (char_length(btrim(token)) between 1 and 4096);

create unique index if not exists notifications_unique_user_dedupe_key
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_notifications_user_live
  on public.notifications(user_id, is_read, created_at desc)
  where deleted_at is null;

create unique index if not exists transactions_one_completed_per_listing
  on public.transactions(listing_id)
  where status = 'completed'::public.transaction_status
    and deleted_at is null;

create unique index if not exists reviews_one_per_reviewer_transaction
  on public.reviews(reviewer_id, transaction_id)
  where deleted_at is null;

alter table public.reviews
  drop constraint if exists reviews_reviewer_id_reviewee_id_transaction_id_key;

drop index if exists public.reports_unique_listing_report;
drop index if exists public.reports_unique_user_report;
drop index if exists public.reports_unique_message_report;

create unique index if not exists reports_one_active_listing_report
  on public.reports(reporter_id, listing_id)
  where report_type = 'listing'::public.report_type
    and status in ('open'::public.report_status, 'reviewing'::public.report_status)
    and reporter_id is not null
    and listing_id is not null;

create unique index if not exists reports_one_active_user_report
  on public.reports(reporter_id, reported_user_id)
  where report_type = 'user'::public.report_type
    and status in ('open'::public.report_status, 'reviewing'::public.report_status)
    and reporter_id is not null
    and reported_user_id is not null
    and message_id is null;

create unique index if not exists reports_one_active_message_report
  on public.reports(reporter_id, message_id)
  where report_type = 'message'::public.report_type
    and status in ('open'::public.report_status, 'reviewing'::public.report_status)
    and reporter_id is not null
    and message_id is not null;

create unique index if not exists device_tokens_unique_token
  on public.device_tokens(token);

create table if not exists public.report_moderation_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  admin_id uuid references public.profiles(id) on delete set null,
  previous_status public.report_status not null,
  new_status public.report_status not null,
  note_present boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_moderation_events_report
  on public.report_moderation_events(report_id, created_at desc);

create index if not exists idx_report_moderation_events_admin
  on public.report_moderation_events(admin_id, created_at desc);

alter table public.report_moderation_events enable row level security;

-- ---------------------------------------------------------------------------
-- Private notification helpers
-- ---------------------------------------------------------------------------

create or replace function private.notification_preference_allows(
  target_user_id uuid,
  requested_type public.notification_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when requested_type = 'message'::public.notification_type
      then coalesce(np.in_app_messages, true)
    when requested_type = 'favorite'::public.notification_type
      then coalesce(np.in_app_favorites, true)
    when requested_type = 'review'::public.notification_type
      then coalesce(np.in_app_reviews, true)
    when requested_type in (
      'transaction_completed'::public.notification_type,
      'listing_sold'::public.notification_type,
      'listing_donated'::public.notification_type,
      'saved_search'::public.notification_type
    )
      then coalesce(np.in_app_marketplace_updates, true)
    else coalesce(np.in_app_system, true)
  end
  from (select 1) seed
  left join public.notification_preferences np
    on np.user_id = target_user_id;
$$;

revoke all on function private.notification_preference_allows(uuid, public.notification_type)
  from public, anon, authenticated;

create or replace function private.create_notification_for_event(
  target_user_id uuid,
  requested_type public.notification_type,
  requested_title text,
  requested_body text,
  requested_route text,
  requested_data jsonb default '{}'::jsonb,
  requested_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_title text := nullif(btrim(coalesce(requested_title, '')), '');
  safe_body text := nullif(btrim(coalesce(requested_body, '')), '');
  safe_route text := nullif(btrim(coalesce(requested_route, '')), '');
  safe_dedupe_key text := nullif(btrim(coalesce(requested_dedupe_key, '')), '');
  safe_data jsonb := coalesce(requested_data, '{}'::jsonb);
  inserted_id uuid;
begin
  if target_user_id is null or not private.is_account_active(target_user_id) then
    return null;
  end if;

  if safe_title is null or char_length(safe_title) > 120 then
    raise exception 'RETAIL_NOTIFICATION_INVALID';
  end if;

  if safe_body is null or char_length(safe_body) > 500 then
    raise exception 'RETAIL_NOTIFICATION_INVALID';
  end if;

  if safe_route is not null and char_length(safe_route) > 240 then
    raise exception 'RETAIL_NOTIFICATION_INVALID';
  end if;

  if safe_dedupe_key is not null and char_length(safe_dedupe_key) > 240 then
    raise exception 'RETAIL_NOTIFICATION_INVALID';
  end if;

  if not private.notification_preference_allows(target_user_id, requested_type) then
    return null;
  end if;

  if safe_dedupe_key is not null then
    select n.id
    into inserted_id
    from public.notifications n
    where n.user_id = target_user_id
      and n.dedupe_key = safe_dedupe_key
    limit 1;

    if inserted_id is not null then
      return inserted_id;
    end if;
  end if;

  perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    dedupe_key,
    is_read,
    created_at
  )
  values (
    target_user_id,
    requested_type,
    safe_title,
    safe_body,
    jsonb_strip_nulls(safe_data || jsonb_build_object('route', safe_route)),
    safe_dedupe_key,
    false,
    now()
  )
  returning id into inserted_id;

  perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
  return inserted_id;
exception
  when unique_violation then
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);

    select n.id
    into inserted_id
    from public.notifications n
    where n.user_id = target_user_id
      and n.dedupe_key = safe_dedupe_key
    limit 1;

    return inserted_id;
end;
$$;

revoke all on function private.create_notification_for_event(
  uuid,
  public.notification_type,
  text,
  text,
  text,
  jsonb,
  text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Protective triggers
-- ---------------------------------------------------------------------------

create or replace function public.protect_transaction_phase_e_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_transaction_write', true), ''),
    'false'
  )::boolean;
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
$$;

drop trigger if exists protect_transaction_state on public.transactions;
drop trigger if exists protect_transaction_phase_e_fields on public.transactions;
create trigger protect_transaction_phase_e_fields
before insert or update on public.transactions
for each row execute function public.protect_transaction_phase_e_fields();

revoke all on function public.protect_transaction_phase_e_fields()
  from public, anon, authenticated;

create or replace function public.protect_review_phase_e_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_review_write', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'INSERT' then
    if not trusted_write then
      raise exception 'RETAIL_REVIEW_NOT_ALLOWED'
        using errcode = '42501';
    end if;

    if new.reviewer_id = new.reviewee_id then
      raise exception 'RETAIL_REVIEW_NOT_ALLOWED';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.transaction_id is distinct from old.transaction_id
      or new.reviewer_id is distinct from old.reviewer_id
      or new.reviewee_id is distinct from old.reviewee_id
      or new.listing_id is distinct from old.listing_id
      or new.created_at is distinct from old.created_at
      or new.deleted_at is distinct from old.deleted_at
    then
      raise exception 'RETAIL_REVIEW_IMMUTABLE'
        using errcode = '42501';
    end if;

    if not trusted_write and (
      new.rating is distinct from old.rating
      or new.comment is distinct from old.comment
      or new.updated_at is distinct from old.updated_at
    ) then
      raise exception 'RETAIL_REVIEW_IMMUTABLE'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_review_rating_update on public.reviews;
drop trigger if exists prevent_review_identity_update on public.reviews;
drop trigger if exists protect_review_phase_e_fields on public.reviews;
create trigger protect_review_phase_e_fields
before insert or update on public.reviews
for each row execute function public.protect_review_phase_e_fields();

revoke all on function public.protect_review_phase_e_fields()
  from public, anon, authenticated;

create or replace function public.protect_report_phase_e_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_report_write', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'INSERT' and not trusted_write then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if not trusted_write then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    if new.reporter_id is distinct from old.reporter_id
      or new.reported_user_id is distinct from old.reported_user_id
      or new.listing_id is distinct from old.listing_id
      or new.message_id is distinct from old.message_id
      or new.report_type is distinct from old.report_type
      or new.reason is distinct from old.reason
      or new.evidence is distinct from old.evidence
      or new.created_at is distinct from old.created_at
    then
      raise exception 'RETAIL_REPORT_IMMUTABLE'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_report_phase_e_fields on public.reports;
create trigger protect_report_phase_e_fields
before insert or update on public.reports
for each row execute function public.protect_report_phase_e_fields();

revoke all on function public.protect_report_phase_e_fields()
  from public, anon, authenticated;

create or replace function public.protect_notification_phase_e_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_notification_write', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'INSERT' and not trusted_write then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if not trusted_write then
      raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    if new.user_id is distinct from old.user_id
      or new.type is distinct from old.type
      or new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.data is distinct from old.data
      or new.created_at is distinct from old.created_at
      or new.dedupe_key is distinct from old.dedupe_key
    then
      raise exception 'RETAIL_NOTIFICATION_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
      raise exception 'RETAIL_NOTIFICATION_IMMUTABLE'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_notification_phase_e_fields on public.notifications;
create trigger protect_notification_phase_e_fields
before insert or update on public.notifications
for each row execute function public.protect_notification_phase_e_fields();

revoke all on function public.protect_notification_phase_e_fields()
  from public, anon, authenticated;

create or replace function public.protect_report_moderation_event_phase_e()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'RETAIL_REPORT_AUDIT_IMMUTABLE'
      using errcode = '42501';
  end if;

  if coalesce(nullif(current_setting('retail.phase_e_trusted_report_write', true), ''), 'false')::boolean = false then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_report_moderation_event_phase_e on public.report_moderation_events;
create trigger protect_report_moderation_event_phase_e
before insert or update or delete on public.report_moderation_events
for each row execute function public.protect_report_moderation_event_phase_e();

revoke all on function public.protect_report_moderation_event_phase_e()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Transaction completion RPC
-- ---------------------------------------------------------------------------

drop function if exists public.complete_listing_transaction(
  uuid,
  uuid,
  public.transaction_outcome
);

create or replace function public.complete_listing_transaction(
  target_listing_id uuid,
  target_outcome public.transaction_outcome,
  target_buyer_id uuid default null
)
returns table (
  transaction_id uuid,
  listing_id uuid,
  buyer_id uuid,
  seller_id uuid,
  outcome public.transaction_outcome,
  listing_status public.listing_status,
  completed_at timestamptz,
  linked_transaction boolean,
  notification_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  listing_row public.listings%rowtype;
  inserted_transaction public.transactions%rowtype;
  inserted_notification_id uuid;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_TRANSACTION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_TRANSACTION_LISTING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if listing_row.seller_id <> caller_id then
    raise exception 'RETAIL_TRANSACTION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if listing_row.status <> 'active'::public.listing_status then
    raise exception 'RETAIL_TRANSACTION_ALREADY_COMPLETED';
  end if;

  if target_outcome not in ('sold'::public.transaction_outcome, 'donated'::public.transaction_outcome) then
    raise exception 'RETAIL_TRANSACTION_OUTCOME_INVALID';
  end if;

  if listing_row.listing_type in ('free'::public.listing_type, 'donation'::public.listing_type)
    and target_outcome <> 'donated'::public.transaction_outcome then
    raise exception 'RETAIL_TRANSACTION_OUTCOME_INVALID';
  end if;

  if exists (
    select 1
    from public.transactions t
    where t.listing_id = listing_row.id
      and t.status = 'completed'::public.transaction_status
      and t.deleted_at is null
  ) then
    raise exception 'RETAIL_TRANSACTION_ALREADY_COMPLETED';
  end if;

  if target_buyer_id is null then
    perform set_config('retail.phase_e_trusted_transaction_write', 'true', true);

    update public.listings l
    set status = case
          when target_outcome = 'donated'::public.transaction_outcome then 'donated'::public.listing_status
          else 'sold'::public.listing_status
        end,
        updated_at = now()
    where l.id = listing_row.id;

    update public.profiles p
    set completed_sales_count = completed_sales_count + 1
    where p.id = caller_id;

    insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
    values (
      caller_id,
      'listing_updated'::public.audit_event_type,
      'listings',
      listing_row.id,
      jsonb_build_object(
        'source', 'complete_listing_transaction',
        'linked_transaction', false,
        'outcome', target_outcome
      )
    );

    perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);

    transaction_id := null;
    listing_id := listing_row.id;
    buyer_id := null;
    seller_id := caller_id;
    outcome := target_outcome;
    listing_status := case
      when target_outcome = 'donated'::public.transaction_outcome then 'donated'::public.listing_status
      else 'sold'::public.listing_status
    end;
    completed_at := now();
    linked_transaction := false;
    notification_id := null;
    return next;
    return;
  end if;

  if target_buyer_id = caller_id then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE';
  end if;

  if not private.is_account_active(target_buyer_id) then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE';
  end if;

  if private.is_blocked_between(caller_id, target_buyer_id) then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.listing_id = listing_row.id
      and c.buyer_id = target_buyer_id
      and c.seller_id = listing_row.seller_id
      and c.deleted_at is null
  ) then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE';
  end if;

  perform set_config('retail.phase_e_trusted_transaction_write', 'true', true);

  insert into public.transactions (
    listing_id,
    buyer_id,
    seller_id,
    status,
    outcome,
    completed_at,
    created_at,
    updated_at
  )
  values (
    listing_row.id,
    target_buyer_id,
    listing_row.seller_id,
    'completed'::public.transaction_status,
    target_outcome,
    now(),
    now(),
    now()
  )
  returning * into inserted_transaction;

  update public.listings l
  set status = case
        when target_outcome = 'donated'::public.transaction_outcome then 'donated'::public.listing_status
        else 'sold'::public.listing_status
      end,
      updated_at = now()
  where l.id = listing_row.id;

  update public.profiles p
  set completed_sales_count = completed_sales_count + 1
  where p.id = caller_id;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action'::public.audit_event_type,
    'transactions',
    inserted_transaction.id,
    jsonb_build_object(
      'source', 'complete_listing_transaction',
      'listing_id', listing_row.id,
      'buyer_id', target_buyer_id,
      'outcome', target_outcome
    )
  );

  inserted_notification_id := private.create_notification_for_event(
    target_buyer_id,
    'transaction_completed'::public.notification_type,
    case when target_outcome = 'donated'::public.transaction_outcome then 'Donation completed' else 'Purchase completed' end,
    '"' || listing_row.title || '" was marked ' || target_outcome::text || '. You can now leave a review.',
    '/listing/' || listing_row.id::text,
    jsonb_build_object(
      'listingId', listing_row.id,
      'transactionId', inserted_transaction.id
    ),
    'transaction:' || inserted_transaction.id::text || ':completed:' || target_buyer_id::text
  );

  perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);

  transaction_id := inserted_transaction.id;
  listing_id := inserted_transaction.listing_id;
  buyer_id := inserted_transaction.buyer_id;
  seller_id := inserted_transaction.seller_id;
  outcome := inserted_transaction.outcome;
  listing_status := case
    when inserted_transaction.outcome = 'donated'::public.transaction_outcome then 'donated'::public.listing_status
    else 'sold'::public.listing_status
  end;
  completed_at := inserted_transaction.completed_at;
  linked_transaction := true;
  notification_id := inserted_notification_id;
  return next;
exception
  when unique_violation then
    perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);
    raise exception 'RETAIL_TRANSACTION_ALREADY_COMPLETED';
  when others then
    perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.complete_listing_transaction(
  uuid,
  public.transaction_outcome,
  uuid
) from public, anon, authenticated;
grant execute on function public.complete_listing_transaction(
  uuid,
  public.transaction_outcome,
  uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------

create or replace function public.create_transaction_review(
  target_transaction_id uuid,
  requested_rating integer,
  requested_comment text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  transaction_row public.transactions%rowtype;
  reviewee_uuid uuid;
  safe_comment text := nullif(btrim(coalesce(requested_comment, '')), '');
  inserted_review public.reviews%rowtype;
  inserted_notification_id uuid;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_REVIEW_NOT_ALLOWED'
      using errcode = '42501';
  end if;

  if requested_rating < 1 or requested_rating > 5 then
    raise exception 'RETAIL_REVIEW_RATING_INVALID';
  end if;

  if safe_comment is not null and char_length(safe_comment) > 1000 then
    raise exception 'RETAIL_REVIEW_COMMENT_TOO_LONG';
  end if;

  select *
  into transaction_row
  from public.transactions t
  where t.id = target_transaction_id
    and t.status = 'completed'::public.transaction_status
    and t.deleted_at is null;

  if not found then
    raise exception 'RETAIL_REVIEW_NOT_ALLOWED';
  end if;

  if caller_id = transaction_row.buyer_id then
    reviewee_uuid := transaction_row.seller_id;
  elsif caller_id = transaction_row.seller_id then
    reviewee_uuid := transaction_row.buyer_id;
  else
    raise exception 'RETAIL_REVIEW_NOT_ALLOWED'
      using errcode = '42501';
  end if;

  if reviewee_uuid = caller_id then
    raise exception 'RETAIL_REVIEW_NOT_ALLOWED';
  end if;

  if exists (
    select 1
    from public.reviews r
    where r.transaction_id = transaction_row.id
      and r.reviewer_id = caller_id
      and r.deleted_at is null
  ) then
    raise exception 'RETAIL_REVIEW_ALREADY_SUBMITTED';
  end if;

  perform set_config('retail.phase_e_trusted_review_write', 'true', true);

  insert into public.reviews (
    transaction_id,
    reviewer_id,
    reviewee_id,
    listing_id,
    rating,
    comment,
    created_at,
    updated_at
  )
  values (
    transaction_row.id,
    caller_id,
    reviewee_uuid,
    transaction_row.listing_id,
    requested_rating,
    safe_comment,
    now(),
    now()
  )
  returning * into inserted_review;

  inserted_notification_id := private.create_notification_for_event(
    reviewee_uuid,
    'review'::public.notification_type,
    'New review',
    'You received a review on ReTail.',
    '/profile/' || reviewee_uuid::text,
    jsonb_build_object(
      'reviewId', inserted_review.id,
      'transactionId', transaction_row.id,
      'listingId', transaction_row.listing_id
    ),
    'review:' || inserted_review.id::text || ':' || reviewee_uuid::text
  );

  perform set_config('retail.phase_e_trusted_review_write', 'false', true);

  return inserted_review;
exception
  when unique_violation then
    perform set_config('retail.phase_e_trusted_review_write', 'false', true);
    raise exception 'RETAIL_REVIEW_ALREADY_SUBMITTED';
  when others then
    perform set_config('retail.phase_e_trusted_review_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.create_transaction_review(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_transaction_review(uuid, integer, text)
  to authenticated;

create or replace function public.get_user_review_summary(target_user_id uuid)
returns table (
  average_rating numeric,
  review_count integer,
  rating_1_count integer,
  rating_2_count integer,
  rating_3_count integer,
  rating_4_count integer,
  rating_5_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(round(avg(r.rating)::numeric, 2), 0)::numeric as average_rating,
    count(r.id)::integer as review_count,
    count(*) filter (where r.rating = 1)::integer as rating_1_count,
    count(*) filter (where r.rating = 2)::integer as rating_2_count,
    count(*) filter (where r.rating = 3)::integer as rating_3_count,
    count(*) filter (where r.rating = 4)::integer as rating_4_count,
    count(*) filter (where r.rating = 5)::integer as rating_5_count
  from public.reviews r
  join public.profiles p on p.id = r.reviewee_id
  where r.reviewee_id = target_user_id
    and r.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false;
$$;

revoke all on function public.get_user_review_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.get_user_review_summary(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports and moderation
-- ---------------------------------------------------------------------------

create or replace function public.has_existing_report(
  report_target_type public.report_type,
  report_target_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.reports r
    where r.reporter_id = caller_id
      and r.status in ('open'::public.report_status, 'reviewing'::public.report_status)
      and (
        (report_target_type = 'listing'::public.report_type and r.report_type = 'listing'::public.report_type and r.listing_id = report_target_id)
        or (report_target_type = 'user'::public.report_type and r.report_type = 'user'::public.report_type and r.reported_user_id = report_target_id and r.message_id is null)
        or (report_target_type = 'message'::public.report_type and r.report_type = 'message'::public.report_type and r.message_id = report_target_id)
      )
  );
end;
$$;

revoke all on function public.has_existing_report(public.report_type, uuid)
  from public, anon, authenticated;
grant execute on function public.has_existing_report(public.report_type, uuid)
  to authenticated;

create or replace function public.submit_report(
  report_target_type public.report_type,
  report_target_id uuid,
  report_reason_value public.report_reason,
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  safe_details text := nullif(btrim(coalesce(report_details, '')), '');
  target_user_id uuid;
  inserted_report_id uuid;
  evidence_payload jsonb := '{}'::jsonb;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if report_target_id is null then
    raise exception 'RETAIL_REPORT_TARGET_INVALID';
  end if;

  if safe_details is not null and char_length(safe_details) > 2000 then
    raise exception 'RETAIL_REPORT_DETAILS_TOO_LONG';
  end if;

  if public.has_existing_report(report_target_type, report_target_id) then
    raise exception 'RETAIL_REPORT_ALREADY_SUBMITTED';
  end if;

  if report_target_type = 'listing'::public.report_type then
    select l.seller_id
    into target_user_id
    from public.listings l
    where l.id = report_target_id
      and l.deleted_at is null
      and l.status in ('active'::public.listing_status, 'pending'::public.listing_status);

    if target_user_id is null then
      raise exception 'RETAIL_REPORT_TARGET_INVALID';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    evidence_payload := jsonb_build_object(
      'targetType', 'listing',
      'listingId', report_target_id,
      'reportedUserId', target_user_id
    );

    perform set_config('retail.phase_e_trusted_report_write', 'true', true);

    insert into public.reports (
      reporter_id,
      report_type,
      reason,
      details,
      listing_id,
      evidence,
      status,
      created_at,
      updated_at
    )
    values (
      caller_id,
      report_target_type,
      report_reason_value,
      safe_details,
      report_target_id,
      evidence_payload,
      'open'::public.report_status,
      now(),
      now()
    )
    returning id into inserted_report_id;
  elsif report_target_type = 'user'::public.report_type then
    if report_target_id = caller_id then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.id = report_target_id
        and p.deleted_at is null
    ) then
      raise exception 'RETAIL_REPORT_TARGET_INVALID';
    end if;

    evidence_payload := jsonb_build_object(
      'targetType', 'user',
      'reportedUserId', report_target_id
    );

    perform set_config('retail.phase_e_trusted_report_write', 'true', true);

    insert into public.reports (
      reporter_id,
      report_type,
      reason,
      details,
      reported_user_id,
      evidence,
      status,
      created_at,
      updated_at
    )
    values (
      caller_id,
      report_target_type,
      report_reason_value,
      safe_details,
      report_target_id,
      evidence_payload,
      'open'::public.report_status,
      now(),
      now()
    )
    returning id into inserted_report_id;
  elsif report_target_type = 'message'::public.report_type then
    select m.sender_id
    into target_user_id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = report_target_id
      and m.deleted_at is null
      and c.deleted_at is null
      and caller_id in (c.buyer_id, c.seller_id);

    if target_user_id is null then
      raise exception 'RETAIL_REPORT_TARGET_INVALID';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    select jsonb_build_object(
      'targetType', 'message',
      'messageId', m.id,
      'conversationId', m.conversation_id,
      'reportedUserId', m.sender_id,
      'messageType', m.message_type,
      'body', case when m.message_type = 'text'::public.message_type then m.body else null end,
      'hasAttachment', m.attachment_path is not null
    )
    into evidence_payload
    from public.messages m
    where m.id = report_target_id;

    perform set_config('retail.phase_e_trusted_report_write', 'true', true);

    insert into public.reports (
      reporter_id,
      report_type,
      reason,
      details,
      reported_user_id,
      message_id,
      evidence,
      status,
      created_at,
      updated_at
    )
    values (
      caller_id,
      report_target_type,
      report_reason_value,
      safe_details,
      target_user_id,
      report_target_id,
      coalesce(evidence_payload, '{}'::jsonb),
      'open'::public.report_status,
      now(),
      now()
    )
    returning id into inserted_report_id;
  else
    raise exception 'RETAIL_REPORT_TARGET_INVALID';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    case
      when report_target_type = 'listing'::public.report_type then 'listing_reported'::public.audit_event_type
      when report_target_type = 'user'::public.report_type then 'user_reported'::public.audit_event_type
      else 'message_reported'::public.audit_event_type
    end,
    'reports',
    inserted_report_id,
    jsonb_build_object('report_type', report_target_type)
  );

  perform set_config('retail.phase_e_trusted_report_write', 'false', true);
  return inserted_report_id;
exception
  when unique_violation then
    perform set_config('retail.phase_e_trusted_report_write', 'false', true);
    raise exception 'RETAIL_REPORT_ALREADY_SUBMITTED';
  when others then
    perform set_config('retail.phase_e_trusted_report_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.submit_report(
  public.report_type,
  uuid,
  public.report_reason,
  text
) from public, anon, authenticated;
grant execute on function public.submit_report(
  public.report_type,
  uuid,
  public.report_reason,
  text
) to authenticated;

create or replace function public.get_my_reports()
returns table (
  id uuid,
  report_type public.report_type,
  reported_user_id uuid,
  listing_id uuid,
  message_id uuid,
  reason public.report_reason,
  details text,
  status public.report_status,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.report_type,
    r.reported_user_id,
    r.listing_id,
    r.message_id,
    r.reason,
    r.details,
    r.status,
    r.created_at,
    r.updated_at,
    r.resolved_at
  from public.reports r
  where r.reporter_id = auth.uid()
    and private.is_account_active(auth.uid())
  order by r.created_at desc;
$$;

revoke all on function public.get_my_reports()
  from public, anon, authenticated;
grant execute on function public.get_my_reports()
  to authenticated;

create or replace function public.admin_update_report(
  target_report_id uuid,
  requested_status public.report_status,
  requested_admin_notes text default null
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  report_row public.reports%rowtype;
  updated_report public.reports%rowtype;
  safe_notes text := nullif(btrim(coalesce(requested_admin_notes, '')), '');
begin
  if caller_id is null or not private.is_account_active(caller_id) or not private.is_admin(caller_id) then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if requested_status not in (
    'reviewing'::public.report_status,
    'resolved'::public.report_status,
    'dismissed'::public.report_status
  ) then
    raise exception 'RETAIL_REPORT_STATUS_INVALID';
  end if;

  if safe_notes is not null and char_length(safe_notes) > 2000 then
    raise exception 'RETAIL_REPORT_ADMIN_NOTES_TOO_LONG';
  end if;

  select *
  into report_row
  from public.reports r
  where r.id = target_report_id
  for update;

  if not found then
    raise exception 'RETAIL_REPORT_TARGET_INVALID'
      using errcode = 'P0002';
  end if;

  if report_row.status in ('resolved'::public.report_status, 'dismissed'::public.report_status) then
    raise exception 'RETAIL_REPORT_STATUS_INVALID';
  end if;

  if report_row.status = 'reviewing'::public.report_status
    and requested_status = 'reviewing'::public.report_status then
    raise exception 'RETAIL_REPORT_STATUS_INVALID';
  end if;

  perform set_config('retail.phase_e_trusted_report_write', 'true', true);

  update public.reports r
  set status = requested_status,
      assigned_admin_id = caller_id,
      admin_notes = safe_notes,
      resolved_at = case
        when requested_status in ('resolved'::public.report_status, 'dismissed'::public.report_status) then now()
        else null
      end,
      updated_at = now()
  where r.id = target_report_id
  returning * into updated_report;

  insert into public.report_moderation_events (
    report_id,
    admin_id,
    previous_status,
    new_status,
    note_present,
    created_at
  )
  values (
    target_report_id,
    caller_id,
    report_row.status,
    requested_status,
    safe_notes is not null,
    now()
  );

  perform set_config('retail.phase_e_trusted_report_write', 'false', true);
  return updated_report;
exception
  when others then
    perform set_config('retail.phase_e_trusted_report_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.admin_update_report(uuid, public.report_status, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_report(uuid, public.report_status, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Notification read, deletion, preference, and device-token RPCs
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification_read(target_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_notification public.notifications%rowtype;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

  update public.notifications n
  set is_read = true,
      read_at = coalesce(read_at, now())
  where n.id = target_notification_id
    and n.user_id = caller_id
    and n.deleted_at is null
  returning * into updated_notification;

  perform set_config('retail.phase_e_trusted_notification_write', 'false', true);

  if not found then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  return updated_notification;
exception
  when others then
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.mark_notification_read(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid)
  to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_count integer := 0;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

  update public.notifications n
  set is_read = true,
      read_at = coalesce(read_at, now())
  where n.user_id = caller_id
    and n.is_read = false
    and n.deleted_at is null;

  get diagnostics updated_count = row_count;
  perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
  return updated_count;
exception
  when others then
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.mark_all_notifications_read()
  from public, anon, authenticated;
grant execute on function public.mark_all_notifications_read()
  to authenticated;

create or replace function public.delete_my_notification(target_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_notification public.notifications%rowtype;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

  update public.notifications n
  set is_read = true,
      read_at = coalesce(read_at, now()),
      deleted_at = coalesce(deleted_at, now())
  where n.id = target_notification_id
    and n.user_id = caller_id
    and n.deleted_at is null
  returning * into updated_notification;

  perform set_config('retail.phase_e_trusted_notification_write', 'false', true);

  if not found then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  return updated_notification;
exception
  when others then
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.delete_my_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_my_notification(uuid)
  to authenticated;

create or replace function public.get_my_notification_preferences()
returns table (
  in_app_messages boolean,
  in_app_favorites boolean,
  in_app_reviews boolean,
  in_app_marketplace_updates boolean,
  in_app_system boolean,
  push_messages boolean,
  push_favorites boolean,
  push_reviews boolean,
  push_marketplace_updates boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  return query
  select
    coalesce(np.in_app_messages, true),
    coalesce(np.in_app_favorites, true),
    coalesce(np.in_app_reviews, true),
    coalesce(np.in_app_marketplace_updates, true),
    coalesce(np.in_app_system, true),
    coalesce(np.push_messages, false),
    coalesce(np.push_favorites, false),
    coalesce(np.push_reviews, false),
    coalesce(np.push_marketplace_updates, false)
  from (select caller_id as user_id) current_user_row
  left join public.notification_preferences np
    on np.user_id = current_user_row.user_id;
end;
$$;

revoke all on function public.get_my_notification_preferences()
  from public, anon, authenticated;
grant execute on function public.get_my_notification_preferences()
  to authenticated;

create or replace function public.update_my_notification_preferences(
  requested_in_app_messages boolean,
  requested_in_app_favorites boolean,
  requested_in_app_reviews boolean,
  requested_in_app_marketplace_updates boolean,
  requested_in_app_system boolean,
  requested_push_messages boolean,
  requested_push_favorites boolean,
  requested_push_reviews boolean,
  requested_push_marketplace_updates boolean
)
returns table (
  in_app_messages boolean,
  in_app_favorites boolean,
  in_app_reviews boolean,
  in_app_marketplace_updates boolean,
  in_app_system boolean,
  push_messages boolean,
  push_favorites boolean,
  push_reviews boolean,
  push_marketplace_updates boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  insert into public.notification_preferences (
    user_id,
    in_app_messages,
    in_app_favorites,
    in_app_reviews,
    in_app_marketplace_updates,
    in_app_system,
    push_messages,
    push_favorites,
    push_reviews,
    push_marketplace_updates,
    created_at,
    updated_at
  )
  values (
    caller_id,
    coalesce(requested_in_app_messages, true),
    coalesce(requested_in_app_favorites, true),
    coalesce(requested_in_app_reviews, true),
    coalesce(requested_in_app_marketplace_updates, true),
    coalesce(requested_in_app_system, true),
    coalesce(requested_push_messages, false),
    coalesce(requested_push_favorites, false),
    coalesce(requested_push_reviews, false),
    coalesce(requested_push_marketplace_updates, false),
    now(),
    now()
  )
  on conflict (user_id)
  do update set
    in_app_messages = excluded.in_app_messages,
    in_app_favorites = excluded.in_app_favorites,
    in_app_reviews = excluded.in_app_reviews,
    in_app_marketplace_updates = excluded.in_app_marketplace_updates,
    in_app_system = excluded.in_app_system,
    push_messages = excluded.push_messages,
    push_favorites = excluded.push_favorites,
    push_reviews = excluded.push_reviews,
    push_marketplace_updates = excluded.push_marketplace_updates,
    updated_at = now();

  return query
  select *
  from public.get_my_notification_preferences();
end;
$$;

revoke all on function public.update_my_notification_preferences(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from public, anon, authenticated;
grant execute on function public.update_my_notification_preferences(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

create or replace function public.register_my_device_token(
  requested_token text,
  requested_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  safe_token text := btrim(coalesce(requested_token, ''));
  safe_platform text := lower(btrim(coalesce(requested_platform, '')));
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_DEVICE_TOKEN_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if safe_platform not in ('ios', 'android') then
    raise exception 'RETAIL_DEVICE_TOKEN_INVALID';
  end if;

  if safe_token = '' or char_length(safe_token) > 4096 then
    raise exception 'RETAIL_DEVICE_TOKEN_INVALID';
  end if;

  delete from public.device_tokens dt
  where dt.token = safe_token
    and dt.user_id <> caller_id;

  insert into public.device_tokens (user_id, token, platform, created_at, updated_at)
  values (caller_id, safe_token, safe_platform, now(), now())
  on conflict (token)
  do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    updated_at = now();
end;
$$;

revoke all on function public.register_my_device_token(text, text)
  from public, anon, authenticated;
grant execute on function public.register_my_device_token(text, text)
  to authenticated;

create or replace function public.remove_my_device_token(requested_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  safe_token text := btrim(coalesce(requested_token, ''));
  deleted_count integer := 0;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_DEVICE_TOKEN_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if safe_token = '' or char_length(safe_token) > 4096 then
    raise exception 'RETAIL_DEVICE_TOKEN_INVALID';
  end if;

  delete from public.device_tokens dt
  where dt.user_id = caller_id
    and dt.token = safe_token;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.remove_my_device_token(text)
  from public, anon, authenticated;
grant execute on function public.remove_my_device_token(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Server-owned notifications from messages, favorites, and saved searches
-- ---------------------------------------------------------------------------

create or replace function public.send_message(
  target_conversation_id uuid,
  requested_message_type public.message_type,
  requested_body text default null,
  requested_attachment_bucket text default null,
  requested_attachment_path text default null,
  requested_attachment_mime_type text default null,
  requested_attachment_size_bytes integer default null,
  requested_attachment_width integer default null,
  requested_attachment_height integer default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  conversation_row public.conversations%rowtype;
  recipient_id uuid;
  sent_count integer;
  inserted_row public.messages%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if requested_message_type = 'system'::public.message_type then
    raise exception 'RETAIL_SYSTEM_MESSAGE_FORBIDDEN';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  select *
  into conversation_row
  from public.conversations c
  where c.id = target_conversation_id
    and c.deleted_at is null
    and caller_id in (c.buyer_id, c.seller_id);

  if not found then
    raise exception 'Conversation is not available';
  end if;

  recipient_id := case
    when conversation_row.buyer_id = caller_id then conversation_row.seller_id
    else conversation_row.buyer_id
  end;

  if not private.is_account_active(recipient_id) then
    raise exception 'Recipient account is not active';
  end if;

  if private.is_blocked_between(caller_id, recipient_id) then
    raise exception 'RETAIL_MESSAGE_BLOCKED';
  end if;

  select count(*)
  into sent_count
  from public.messages m
  where m.sender_id = caller_id
    and m.created_at >= now() - interval '1 hour';

  if sent_count >= 100 then
    raise exception 'Message rate limit exceeded';
  end if;

  if requested_message_type = 'text'::public.message_type then
    requested_body := nullif(trim(coalesce(requested_body, '')), '');

    if requested_body is null or length(requested_body) > 2000 then
      raise exception 'Message body is invalid';
    end if;

    requested_attachment_bucket := null;
    requested_attachment_path := null;
    requested_attachment_mime_type := null;
    requested_attachment_size_bytes := null;
    requested_attachment_width := null;
    requested_attachment_height := null;
  elsif requested_message_type = 'image'::public.message_type then
    if requested_body is not null and length(requested_body) > 2000 then
      raise exception 'Image caption is too long';
    end if;

    if not private.message_attachment_path_is_valid(
      target_conversation_id,
      caller_id,
      requested_attachment_bucket,
      requested_attachment_path,
      requested_attachment_mime_type,
      requested_attachment_size_bytes
    ) then
      raise exception 'RETAIL_INVALID_MESSAGE_ATTACHMENT';
    end if;
  else
    raise exception 'Unsupported message type';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    attachment_bucket,
    attachment_path,
    attachment_mime_type,
    attachment_size_bytes,
    attachment_width,
    attachment_height,
    is_read
  )
  values (
    target_conversation_id,
    caller_id,
    requested_message_type,
    requested_body,
    requested_attachment_bucket,
    requested_attachment_path,
    requested_attachment_mime_type,
    requested_attachment_size_bytes,
    requested_attachment_width,
    requested_attachment_height,
    false
  )
  returning * into inserted_row;

  perform private.create_notification_for_event(
    recipient_id,
    'message'::public.notification_type,
    'New message',
    case
      when requested_message_type = 'image'::public.message_type then 'You received a photo.'
      when requested_body like 'RETAIL_OFFER::%' then 'You received a ReTail offer update.'
      else 'You have a new ReTail message.'
    end,
    '/messages/' || target_conversation_id::text,
    jsonb_build_object(
      'conversationId', target_conversation_id,
      'listingId', conversation_row.listing_id,
      'messageId', inserted_row.id
    ),
    'message:' || inserted_row.id::text
  );

  return inserted_row;
end;
$$;

revoke all on function public.send_message(
  uuid,
  public.message_type,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.send_message(
  uuid,
  public.message_type,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) to authenticated;

create or replace function public.create_favorite_notification_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_row public.listings%rowtype;
begin
  select *
  into listing_row
  from public.listings l
  where l.id = new.listing_id
    and l.deleted_at is null
    and l.status = 'active'::public.listing_status;

  if not found then
    return new;
  end if;

  if listing_row.seller_id = new.user_id then
    return new;
  end if;

  if private.is_blocked_between(listing_row.seller_id, new.user_id) then
    return new;
  end if;

  perform private.create_notification_for_event(
    listing_row.seller_id,
    'favorite'::public.notification_type,
    'Listing favorited',
    'Someone saved "' || listing_row.title || '".',
    '/listing/' || listing_row.id::text,
    jsonb_build_object(
      'listingId', listing_row.id,
      'favoriteId', new.id
    ),
    'favorite:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists favorite_insert_notification on public.favorites;
create trigger favorite_insert_notification
after insert on public.favorites
for each row execute function public.create_favorite_notification_after_insert();

revoke all on function public.create_favorite_notification_after_insert()
  from public, anon, authenticated;

create or replace function public.create_saved_search_notifications_for_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_search_row record;
begin
  if new.status <> 'active'::public.listing_status or new.deleted_at is not null then
    return new;
  end if;

  for saved_search_row in
    select ss.*
    from public.saved_searches ss
    where ss.deleted_at is null
      and ss.notifications_enabled = true
      and ss.user_id <> new.seller_id
      and (
        ss.search_query is null
        or btrim(ss.search_query) = ''
        or new.title ilike '%' || ss.search_query || '%'
        or new.description ilike '%' || ss.search_query || '%'
        or coalesce(new.brand, '') ilike '%' || ss.search_query || '%'
      )
      and (ss.category_id is null or ss.category_id = new.category_id)
      and (ss.min_price is null or coalesce(new.price, 0) >= ss.min_price)
      and (ss.max_price is null or coalesce(new.price, 0) <= ss.max_price)
      and (ss.condition is null or ss.condition = new.condition)
      and (ss.listing_type is null or ss.listing_type = new.listing_type)
      and (
        ss.latitude is null
        or ss.longitude is null
        or new.latitude is null
        or new.longitude is null
        or public.approximate_distance_miles(ss.latitude, ss.longitude, new.latitude, new.longitude) <= ss.radius_miles
      )
      and (
        (ss.latitude is not null and ss.longitude is not null and new.latitude is not null and new.longitude is not null)
        or ss.city is null
        or ss.state is null
        or (lower(ss.city) = lower(new.city) and lower(ss.state) = lower(new.state))
      )
  loop
    perform private.create_notification_for_event(
      saved_search_row.user_id,
      'saved_search'::public.notification_type,
      'New saved search match',
      '"' || new.title || '" matches "' || saved_search_row.name || '".',
      '/listing/' || new.id::text,
      jsonb_build_object(
        'savedSearchId', saved_search_row.id,
        'listingId', new.id
      ),
      'saved-search:' || saved_search_row.id::text || ':' || new.id::text
    );
  end loop;

  update public.saved_searches ss
  set last_notified_at = now()
  where ss.deleted_at is null
    and ss.notifications_enabled = true
    and ss.user_id <> new.seller_id
    and (
      ss.search_query is null
      or btrim(ss.search_query) = ''
      or new.title ilike '%' || ss.search_query || '%'
      or new.description ilike '%' || ss.search_query || '%'
      or coalesce(new.brand, '') ilike '%' || ss.search_query || '%'
    )
    and (ss.category_id is null or ss.category_id = new.category_id)
    and (ss.min_price is null or coalesce(new.price, 0) >= ss.min_price)
    and (ss.max_price is null or coalesce(new.price, 0) <= ss.max_price)
    and (ss.condition is null or ss.condition = new.condition)
    and (ss.listing_type is null or ss.listing_type = new.listing_type);

  return new;
end;
$$;

revoke all on function public.create_saved_search_notifications_for_listing()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants and RLS policies
-- ---------------------------------------------------------------------------

alter table public.transactions enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.device_tokens enable row level security;
alter table public.report_moderation_events enable row level security;

revoke all on table public.transactions from public, anon, authenticated;
revoke all on table public.reviews from public, anon, authenticated;
revoke all on table public.reports from public, anon, authenticated;
revoke all on table public.notifications from public, anon, authenticated;
revoke all on table public.notification_preferences from public, anon, authenticated;
revoke all on table public.device_tokens from public, anon, authenticated;
revoke all on table public.report_moderation_events from public, anon, authenticated;

grant select on table public.transactions to authenticated;
grant select on table public.reviews to anon, authenticated;
grant select on table public.reports to authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.report_moderation_events to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'transactions',
        'reviews',
        'reports',
        'notifications',
        'notification_preferences',
        'device_tokens',
        'report_moderation_events'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

create policy "Phase E transaction participants can read"
on public.transactions
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and (
    auth.uid() in (buyer_id, seller_id)
    or private.is_admin(auth.uid())
  )
);

create policy "Phase E public can read reviews"
on public.reviews
for select
to anon, authenticated
using (
  deleted_at is null
);

create policy "Phase E admins can read reports"
on public.reports
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and private.is_admin(auth.uid())
);

create policy "Phase E users can read own notifications"
on public.notifications
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and auth.uid() = user_id
  and deleted_at is null
);

create policy "Phase E admins can read report moderation events"
on public.report_moderation_events
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and private.is_admin(auth.uid())
);

-- Legacy client-callable generic notification creator is intentionally removed.
drop function if exists public.create_user_notification(
  uuid,
  public.notification_type,
  text,
  text,
  jsonb
);

notify pgrst, 'reload schema';
