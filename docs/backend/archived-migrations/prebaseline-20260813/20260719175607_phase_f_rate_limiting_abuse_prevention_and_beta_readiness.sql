-- ReTail Security Remediation Phase F
-- Rate limiting, abuse prevention, final security validation, and beta readiness.
--
-- This migration adds database-owned abuse controls without exposing new public
-- write surfaces. Rate-limit events intentionally store only coarse, non-private
-- action metadata.

create extension if not exists "pgcrypto";
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Internal-only rate limit event store
-- ---------------------------------------------------------------------------

drop index if exists public.idx_rate_limit_events_lookup;

alter table public.rate_limit_events
  drop column if exists ip_address,
  add column if not exists subject_key text not null default 'global',
  add column if not exists request_fingerprint_hash text,
  add column if not exists expires_at timestamptz;

alter table public.rate_limit_events
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.rate_limit_events
  drop constraint if exists rate_limit_events_action_length,
  add constraint rate_limit_events_action_length
    check (char_length(action) between 1 and 80),
  drop constraint if exists rate_limit_events_subject_key_length,
  add constraint rate_limit_events_subject_key_length
    check (char_length(subject_key) between 1 and 160),
  drop constraint if exists rate_limit_events_fingerprint_safe,
  add constraint rate_limit_events_fingerprint_safe
    check (
      request_fingerprint_hash is null
      or request_fingerprint_hash ~ '^[a-f0-9]{32,128}$'
    ),
  drop constraint if exists rate_limit_events_metadata_size,
  add constraint rate_limit_events_metadata_size
    check (char_length(metadata::text) <= 1200) not valid;

create index if not exists idx_rate_limit_events_user_created
  on public.rate_limit_events(user_id, created_at desc);

create index if not exists idx_rate_limit_events_action_created
  on public.rate_limit_events(action, created_at desc);

create index if not exists idx_rate_limit_events_user_action_subject_created
  on public.rate_limit_events(user_id, action, subject_key, created_at desc);

create index if not exists idx_rate_limit_events_cleanup
  on public.rate_limit_events(created_at)
  where expires_at is not null;

alter table public.rate_limit_events enable row level security;

drop policy if exists "Users insert rate limit events" on public.rate_limit_events;
drop policy if exists "Admins read rate limit events" on public.rate_limit_events;

revoke all on table public.rate_limit_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private account and rate-limit helpers
-- ---------------------------------------------------------------------------

create or replace function private.require_active_account()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_NOT_ACTIVE'
      using errcode = '42501';
  end if;

  return caller_id;
end;
$$;

revoke all on function private.require_active_account() from public, anon, authenticated;

create or replace function private.check_rate_limit(
  requested_action text,
  requested_subject_key text,
  requested_limit integer,
  requested_window interval,
  requested_fingerprint_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_action text := nullif(pg_catalog.btrim(coalesce(requested_action, '')), '');
  safe_subject text := coalesce(nullif(pg_catalog.btrim(coalesce(requested_subject_key, '')), ''), 'global');
  safe_fingerprint text := nullif(pg_catalog.btrim(coalesce(requested_fingerprint_hash, '')), '');
  recent_count integer;
begin
  if safe_action is null
    or char_length(safe_action) > 80
    or char_length(safe_subject) > 160
    or requested_limit is null
    or requested_limit < 1
    or requested_window is null
    or requested_window <= interval '0 seconds' then
    raise exception 'RETAIL_RATE_LIMIT_CONFIG_INVALID';
  end if;

  if safe_fingerprint is not null and safe_fingerprint !~ '^[a-f0-9]{32,128}$' then
    raise exception 'RETAIL_RATE_LIMIT_CONFIG_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text || ':' || safe_action || ':' || safe_subject, 0)
  );

  select count(*)
  into recent_count
  from public.rate_limit_events event
  where event.user_id = caller_id
    and event.action = safe_action
    and event.subject_key = safe_subject
    and event.created_at >= now() - requested_window;

  if recent_count >= requested_limit then
    raise exception 'RETAIL_RATE_LIMITED'
      using errcode = '42901';
  end if;

  insert into public.rate_limit_events (
    user_id,
    action,
    subject_key,
    request_fingerprint_hash,
    metadata,
    created_at,
    expires_at
  )
  values (
    caller_id,
    safe_action,
    safe_subject,
    safe_fingerprint,
    '{}'::jsonb,
    now(),
    now() + interval '60 days'
  );
end;
$$;

revoke all on function private.check_rate_limit(text, text, integer, interval, text)
  from public, anon, authenticated;

create or replace function private.normalized_message_fingerprint(message_body text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    pg_catalog.lower(
      pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(message_body, '')), '\s+', ' ', 'g')
    )
  );
$$;

revoke all on function private.normalized_message_fingerprint(text)
  from public, anon, authenticated;

create or replace function private.ensure_public_search_bounds(
  page_number integer default 1,
  page_size integer default 20,
  search_query text default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_query text := pg_catalog.btrim(coalesce(search_query, ''));
begin
  if page_number is null or page_number < 1 or page_number > 1000 then
    raise exception 'RETAIL_SEARCH_LIMIT_EXCEEDED'
      using errcode = '22023';
  end if;

  if page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'RETAIL_SEARCH_LIMIT_EXCEEDED'
      using errcode = '22023';
  end if;

  if char_length(safe_query) > 80 then
    raise exception 'RETAIL_SEARCH_LIMIT_EXCEEDED'
      using errcode = '22023';
  end if;

  if safe_query <> ''
    and pg_catalog.regexp_replace(safe_query, '[%_\s]+', '', 'g') = '' then
    raise exception 'RETAIL_SEARCH_LIMIT_EXCEEDED'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.ensure_public_search_bounds(integer, integer, text)
  from public, anon, authenticated;

create or replace function private.cleanup_rate_limit_events(
  batch_size integer default 5000,
  retention interval default interval '60 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
  safe_batch_size integer := least(greatest(coalesce(batch_size, 5000), 1), 20000);
  safe_retention interval := coalesce(retention, interval '60 days');
begin
  if safe_retention < interval '30 days' or safe_retention > interval '90 days' then
    raise exception 'RETAIL_RATE_LIMIT_RETENTION_INVALID';
  end if;

  with expired as (
    select id
    from public.rate_limit_events
    where created_at < now() - safe_retention
       or (expires_at is not null and expires_at < now())
    order by created_at asc
    limit safe_batch_size
  ),
  deleted as (
    delete from public.rate_limit_events event
    using expired
    where event.id = expired.id
    returning event.id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;

revoke all on function private.cleanup_rate_limit_events(integer, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Abuse and rate-limit triggers
-- ---------------------------------------------------------------------------

create or replace function private.enforce_phase_f_conversation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  if new.buyer_id <> caller_id then
    raise exception 'RETAIL_CONVERSATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if coalesce(current_setting('retail.phase_f_conversation_rate_checked', true), 'false') <> 'true' then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_conversation_insert()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_conversation_insert on public.conversations;
create trigger enforce_phase_f_conversation_insert
before insert on public.conversations
for each row execute function private.enforce_phase_f_conversation_insert();

create or replace function private.enforce_phase_f_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_body text := pg_catalog.btrim(coalesce(new.body, ''));
  normalized_hash text;
  link_count integer;
begin
  if new.sender_id <> caller_id then
    raise exception 'RETAIL_MESSAGE_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('message_send_minute', 'global', 60, interval '1 minute');
  perform private.check_rate_limit('message_send_hour', 'global', 300, interval '1 hour');
  perform private.check_rate_limit(
    'message_send_conversation',
    'conversation:' || new.conversation_id::text,
    30,
    interval '10 minutes'
  );

  if new.message_type = 'image'::public.message_type then
    perform private.check_rate_limit('message_image_hour', 'global', 20, interval '1 hour');
  end if;

  if new.message_type = 'text'::public.message_type then
    if safe_body = '' then
      raise exception 'RETAIL_MESSAGE_BODY_INVALID';
    end if;

    if safe_body ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' then
      raise exception 'RETAIL_MESSAGE_BODY_INVALID';
    end if;

    select count(*)
    into link_count
    from pg_catalog.regexp_matches(safe_body, '(https?://|www\.)', 'gi');

    if link_count > 5 then
      raise exception 'RETAIL_MESSAGE_LINK_LIMIT';
    end if;

    if safe_body ~* '(^|[^a-z])(javascript|data|file|vbscript):' then
      raise exception 'RETAIL_MESSAGE_LINK_LIMIT';
    end if;

    normalized_hash := private.normalized_message_fingerprint(safe_body);

    if exists (
      select 1
      from public.rate_limit_events event
      where event.user_id = caller_id
        and event.action = 'message_duplicate_guard'
        and event.subject_key = 'conversation:' || new.conversation_id::text
        and event.request_fingerprint_hash = normalized_hash
        and event.created_at >= now() - interval '2 minutes'
    ) then
      raise exception 'RETAIL_REPEATED_MESSAGE';
    end if;

    insert into public.rate_limit_events (
      user_id,
      action,
      subject_key,
      request_fingerprint_hash,
      metadata,
      created_at,
      expires_at
    )
    values (
      caller_id,
      'message_duplicate_guard',
      'conversation:' || new.conversation_id::text,
      normalized_hash,
      '{}'::jsonb,
      now(),
      now() + interval '60 days'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_message_insert()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_message_insert on public.messages;
create trigger enforce_phase_f_message_insert
before insert on public.messages
for each row execute function private.enforce_phase_f_message_insert();

create or replace function private.enforce_phase_f_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  if new.reporter_id is distinct from caller_id then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('report_create_hour', 'global', 10, interval '1 hour');
  perform private.check_rate_limit('report_create_day', 'global', 30, interval '1 day');
  return new;
end;
$$;

revoke all on function private.enforce_phase_f_report_insert()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_report_insert on public.reports;
create trigger enforce_phase_f_report_insert
before insert on public.reports
for each row execute function private.enforce_phase_f_report_insert();

create or replace function private.enforce_phase_f_review_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  if new.reviewer_id is distinct from caller_id then
    raise exception 'RETAIL_REVIEW_NOT_ALLOWED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('review_create_hour', 'global', 10, interval '1 hour');
  return new;
end;
$$;

revoke all on function private.enforce_phase_f_review_insert()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_review_insert on public.reviews;
create trigger enforce_phase_f_review_insert
before insert on public.reviews
for each row execute function private.enforce_phase_f_review_insert();

create or replace function private.enforce_phase_f_listing_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  if tg_op = 'INSERT' then
    if new.seller_id is distinct from caller_id then
      raise exception 'RETAIL_LISTING_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    perform private.check_rate_limit('listing_create_hour', 'global', 10, interval '1 hour');
    perform private.check_rate_limit('listing_create_day', 'global', 30, interval '1 day');
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.seller_id is distinct from old.seller_id then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      perform private.check_rate_limit('listing_status_change_hour', 'global', 60, interval '1 hour');
    else
      perform private.check_rate_limit('listing_edit_hour', 'global', 60, interval '1 hour');
    end if;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_listing_write()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_listing_write on public.listings;
create trigger enforce_phase_f_listing_write
before insert or update on public.listings
for each row execute function private.enforce_phase_f_listing_write();

create or replace function private.enforce_phase_f_favorite_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  listing_row public.listings%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from caller_id then
      raise exception 'RETAIL_FAVORITE_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    select *
    into listing_row
    from public.listings l
    where l.id = new.listing_id
      and l.status = 'active'::public.listing_status
      and l.deleted_at is null;

    if not found then
      raise exception 'RETAIL_FAVORITE_LISTING_UNAVAILABLE'
        using errcode = 'P0002';
    end if;

    if listing_row.seller_id = caller_id then
      raise exception 'RETAIL_FAVORITE_SELF_DENIED'
        using errcode = '42501';
    end if;

    perform private.check_rate_limit('favorite_state_change_hour', 'global', 100, interval '1 hour');
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id is distinct from caller_id then
      raise exception 'RETAIL_FAVORITE_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    perform private.check_rate_limit('favorite_state_change_hour', 'global', 100, interval '1 hour');
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_favorite_write()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_favorite_insert on public.favorites;
create trigger enforce_phase_f_favorite_insert
before insert on public.favorites
for each row execute function private.enforce_phase_f_favorite_write();

drop trigger if exists enforce_phase_f_favorite_delete on public.favorites;
create trigger enforce_phase_f_favorite_delete
before delete on public.favorites
for each row execute function private.enforce_phase_f_favorite_write();

create or replace function private.enforce_phase_f_saved_search_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  active_count integer;
  target_user_id uuid;
  excluded_saved_search_id uuid;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
    excluded_saved_search_id := old.id;
  else
    target_user_id := new.user_id;
    excluded_saved_search_id := case when tg_op = 'UPDATE' then old.id else null end;
  end if;

  if target_user_id is distinct from caller_id then
    raise exception 'RETAIL_SAVED_SEARCH_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('saved_search_change_hour', 'global', 30, interval '1 hour');

  if tg_op in ('INSERT', 'UPDATE') then
    perform private.ensure_public_search_bounds(1, 20, new.search_query);

    if new.radius_miles is null or new.radius_miles <= 0 or new.radius_miles > 100 then
      raise exception 'RETAIL_SEARCH_LIMIT_EXCEEDED'
        using errcode = '22023';
    end if;

    if new.deleted_at is null then
      select count(*)
      into active_count
      from public.saved_searches ss
      where ss.user_id = caller_id
        and ss.deleted_at is null
        and (excluded_saved_search_id is null or ss.id <> excluded_saved_search_id);

      if active_count >= 50 then
        raise exception 'RETAIL_SAVED_SEARCH_LIMIT_EXCEEDED'
          using errcode = '42901';
      end if;
    end if;

    return new;
  end if;

  return old;
end;
$$;

revoke all on function private.enforce_phase_f_saved_search_write()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_saved_search_write on public.saved_searches;
create trigger enforce_phase_f_saved_search_write
before insert or update or delete on public.saved_searches
for each row execute function private.enforce_phase_f_saved_search_write();

create or replace function private.enforce_phase_f_block_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  target_blocker_id uuid;
begin
  target_blocker_id := case when tg_op = 'DELETE' then old.blocker_id else new.blocker_id end;

  if target_blocker_id is distinct from caller_id then
    raise exception 'RETAIL_BLOCK_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('block_state_change_hour', 'global', 30, interval '1 hour');

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_block_write()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_block_insert on public.blocks;
create trigger enforce_phase_f_block_insert
before insert on public.blocks
for each row execute function private.enforce_phase_f_block_write();

drop trigger if exists enforce_phase_f_block_delete on public.blocks;
create trigger enforce_phase_f_block_delete
before delete on public.blocks
for each row execute function private.enforce_phase_f_block_write();

create or replace function private.enforce_phase_f_device_token_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  target_user_id uuid;
begin
  target_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  if target_user_id is distinct from caller_id then
    raise exception 'RETAIL_DEVICE_TOKEN_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('device_token_change_hour', 'global', 20, interval '1 hour');

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_device_token_write()
  from public, anon, authenticated;

drop trigger if exists enforce_phase_f_device_token_write on public.device_tokens;
create trigger enforce_phase_f_device_token_write
before insert or update or delete on public.device_tokens
for each row execute function private.enforce_phase_f_device_token_write();

-- ---------------------------------------------------------------------------
-- Wrappers for attempt-aware limits and bounded public discovery
-- ---------------------------------------------------------------------------

alter function public.create_or_get_conversation(uuid)
  rename to create_or_get_conversation_phase_f_base;

create or replace function public.create_or_get_conversation(target_listing_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  listing_row public.listings%rowtype;
begin
  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.status = 'active'::public.listing_status
    and l.deleted_at is null;

  if not found then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
    raise exception 'Listing is not available';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.listing_id = target_listing_id
      and c.buyer_id = caller_id
      and c.seller_id = listing_row.seller_id
      and c.deleted_at is null
  ) then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
  end if;

  perform set_config('retail.phase_f_conversation_rate_checked', 'true', true);
  return public.create_or_get_conversation_phase_f_base(target_listing_id);
exception
  when others then
    perform set_config('retail.phase_f_conversation_rate_checked', 'false', true);
    raise;
end;
$$;

revoke all on function public.create_or_get_conversation_phase_f_base(uuid)
  from public, anon, authenticated;
revoke all on function public.create_or_get_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.create_or_get_conversation(uuid)
  to authenticated;

alter function public.complete_listing_transaction(
  uuid,
  public.transaction_outcome,
  uuid
) rename to complete_listing_transaction_phase_f_base;

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
  caller_id uuid := private.require_active_account();
begin
  perform private.check_rate_limit('transaction_complete_attempt', 'seller:' || caller_id::text, 20, interval '1 hour');

  return query
  select *
  from public.complete_listing_transaction_phase_f_base(
    target_listing_id,
    target_outcome,
    target_buyer_id
  );
end;
$$;

revoke all on function public.complete_listing_transaction_phase_f_base(
  uuid,
  public.transaction_outcome,
  uuid
) from public, anon, authenticated;
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

alter function public.admin_update_report(uuid, public.report_status, text)
  rename to admin_update_report_phase_f_base;

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
  caller_id uuid := private.require_active_account();
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('admin_report_update_hour', 'global', 300, interval '1 hour');
  return public.admin_update_report_phase_f_base(target_report_id, requested_status, requested_admin_notes);
end;
$$;

revoke all on function public.admin_update_report_phase_f_base(uuid, public.report_status, text)
  from public, anon, authenticated;
revoke all on function public.admin_update_report(uuid, public.report_status, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_report(uuid, public.report_status, text)
  to authenticated;

alter function public.get_public_listing_feed(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text
) rename to get_public_listing_feed_phase_f_base;

create or replace function public.get_public_listing_feed(
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null,
  city_filter text default null,
  state_filter text default null
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  return query
  select *
  from public.get_public_listing_feed_phase_f_base(
    page_number,
    page_size,
    category_filter,
    search_query,
    min_price_filter,
    max_price_filter,
    condition_filter,
    listing_type_filter,
    city_filter,
    state_filter
  );
end;
$$;

revoke all on function public.get_public_listing_feed_phase_f_base(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.get_public_listing_feed(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.get_public_listing_feed(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text
) to anon, authenticated;

alter function public.get_public_user_listings(uuid, integer, integer)
  rename to get_public_user_listings_phase_f_base;

create or replace function public.get_public_user_listings(
  target_user_id uuid,
  page_number integer default 1,
  page_size integer default 20
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ensure_public_search_bounds(page_number, page_size, null);

  return query
  select *
  from public.get_public_user_listings_phase_f_base(target_user_id, page_number, page_size);
end;
$$;

revoke all on function public.get_public_user_listings_phase_f_base(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_public_user_listings(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_user_listings(uuid, integer, integer)
  to anon, authenticated;

alter function public.get_public_rescue_feed(integer, integer, text)
  rename to get_public_rescue_feed_phase_f_base;

create or replace function public.get_public_rescue_feed(
  page_number integer default 1,
  page_size integer default 20,
  search_query text default null
)
returns table (
  id uuid,
  name text,
  slug text,
  summary text,
  animals_rescued text[],
  city text,
  state text,
  website_url text,
  contact_hint text,
  is_verified boolean,
  needs jsonb,
  wishlist_items jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  return query
  select *
  from public.get_public_rescue_feed_phase_f_base(page_number, page_size, search_query);
end;
$$;

revoke all on function public.get_public_rescue_feed_phase_f_base(integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.get_public_rescue_feed(integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_public_rescue_feed(integer, integer, text)
  to anon, authenticated;

alter function public.get_nearby_listings(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) rename to get_nearby_listings_phase_f_base;

create or replace function public.get_nearby_listings(
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  return query
  select *
  from public.get_nearby_listings_phase_f_base(
    page_number,
    page_size,
    category_filter,
    search_query,
    min_price_filter,
    max_price_filter,
    condition_filter,
    listing_type_filter
  );
end;
$$;

revoke all on function public.get_nearby_listings_phase_f_base(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) from public, anon, authenticated;
revoke all on function public.get_nearby_listings(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) from public, anon, authenticated;
grant execute on function public.get_nearby_listings(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) to authenticated;

alter function public.get_nearby_rescues(text)
  rename to get_nearby_rescues_phase_f_base;

create or replace function public.get_nearby_rescues(
  search_query text default null
)
returns table (
  id uuid,
  name text,
  slug text,
  summary text,
  animals_rescued text[],
  city text,
  state text,
  website_url text,
  contact_hint text,
  is_verified boolean,
  needs jsonb,
  wishlist_items jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  perform private.ensure_public_search_bounds(1, 20, search_query);

  return query
  select *
  from public.get_nearby_rescues_phase_f_base(search_query);
end;
$$;

revoke all on function public.get_nearby_rescues_phase_f_base(text)
  from public, anon, authenticated;
revoke all on function public.get_nearby_rescues(text)
  from public, anon, authenticated;
grant execute on function public.get_nearby_rescues(text)
  to authenticated;

-- Favorite notifications now dedupe by listing/user, not by favorite row id.
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

  if not found or listing_row.seller_id = new.user_id then
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
    jsonb_build_object('listingId', listing_row.id),
    'favorite:' || listing_row.id::text || ':' || new.user_id::text
  );

  return new;
end;
$$;

revoke all on function public.create_favorite_notification_after_insert()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
