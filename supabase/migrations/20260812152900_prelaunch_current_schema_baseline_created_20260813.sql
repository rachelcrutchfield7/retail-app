-- ReTail prelaunch current-schema baseline.
-- Created on 2026-08-13 from verified remote schema backup:
-- /private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_schema_20260813_081656.sql
-- Timestamp intentionally sorts before 20260812153000_push_notification_delivery_tracking.sql.
-- Excludes pending push-delivery schema; that remains a separate migration.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";
























CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";












CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."account_type" AS ENUM (
    'regular',
    'rescue'
);


ALTER TYPE "public"."account_type" OWNER TO "postgres";


CREATE TYPE "public"."audit_event_type" AS ENUM (
    'account_created',
    'account_deleted',
    'listing_created',
    'listing_updated',
    'listing_deleted',
    'listing_reported',
    'user_reported',
    'message_reported',
    'user_banned',
    'moderator_action'
);


ALTER TYPE "public"."audit_event_type" OWNER TO "postgres";


CREATE TYPE "public"."listing_condition" AS ENUM (
    'new',
    'like_new',
    'good',
    'fair',
    'poor'
);


ALTER TYPE "public"."listing_condition" OWNER TO "postgres";


CREATE TYPE "public"."listing_status" AS ENUM (
    'draft',
    'active',
    'pending',
    'sold',
    'donated',
    'archived',
    'removed'
);


ALTER TYPE "public"."listing_status" OWNER TO "postgres";


CREATE TYPE "public"."listing_type" AS ENUM (
    'sale',
    'free',
    'donation'
);


ALTER TYPE "public"."listing_type" OWNER TO "postgres";


CREATE TYPE "public"."message_type" AS ENUM (
    'text',
    'image',
    'system'
);


ALTER TYPE "public"."message_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'message',
    'favorite',
    'review',
    'listing_sold',
    'saved_search',
    'system',
    'transaction_completed',
    'listing_donated'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."report_reason" AS ENUM (
    'spam',
    'fraud',
    'prohibited_item',
    'harassment',
    'inappropriate_content',
    'duplicate_listing',
    'other',
    'hate_speech',
    'stolen_goods'
);


ALTER TYPE "public"."report_reason" OWNER TO "postgres";


CREATE TYPE "public"."report_status" AS ENUM (
    'open',
    'reviewing',
    'resolved',
    'dismissed'
);


ALTER TYPE "public"."report_status" OWNER TO "postgres";


CREATE TYPE "public"."report_type" AS ENUM (
    'listing',
    'user',
    'message'
);


ALTER TYPE "public"."report_type" OWNER TO "postgres";


CREATE TYPE "public"."support_case_issue_category" AS ENUM (
    'cancel_order',
    'seller_not_shipped',
    'package_not_arrived',
    'item_arrived_damaged',
    'item_not_as_described',
    'wrong_item_received',
    'return_refund_request',
    'payment_problem',
    'payout_problem',
    'shipping_problem',
    'buyer_transaction_issue',
    'other_order_issue',
    'other_sale_issue'
);


ALTER TYPE "public"."support_case_issue_category" OWNER TO "postgres";


CREATE TYPE "public"."support_case_requester_role" AS ENUM (
    'buyer',
    'seller'
);


ALTER TYPE "public"."support_case_requester_role" OWNER TO "postgres";


CREATE TYPE "public"."support_case_status" AS ENUM (
    'open',
    'reviewing',
    'waiting_on_buyer',
    'waiting_on_seller',
    'resolved',
    'closed'
);


ALTER TYPE "public"."support_case_status" OWNER TO "postgres";


CREATE TYPE "public"."transaction_outcome" AS ENUM (
    'sold',
    'donated'
);


ALTER TYPE "public"."transaction_outcome" OWNER TO "postgres";


CREATE TYPE "public"."transaction_status" AS ENUM (
    'pending',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."transaction_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_message_attachment"("target_bucket" "text", "target_path" "text", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  path_parts text[];
  conversation_uuid uuid;
  uploader_uuid uuid;
begin
  if target_bucket <> 'message-images' or target_path is null or target_user_id is null then
    return false;
  end if;

  path_parts := storage.foldername(target_path);

  if array_length(path_parts, 1) <> 2 then
    return false;
  end if;

  begin
    conversation_uuid := path_parts[1]::uuid;
    uploader_uuid := path_parts[2]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if not private.is_valid_message_attachment_path(target_path, conversation_uuid, uploader_uuid) then
    return false;
  end if;

  if not private.is_account_active(target_user_id) then
    return false;
  end if;

  if not private.is_conversation_participant(conversation_uuid, target_user_id) then
    return false;
  end if;

  if not private.is_conversation_participant(conversation_uuid, uploader_uuid) then
    return false;
  end if;

  return exists (
    select 1
    from public.messages m
    where m.conversation_id = conversation_uuid
      and m.attachment_bucket = target_bucket
      and m.attachment_path = target_path
      and m.deleted_at is null
  );
end;
$$;


ALTER FUNCTION "private"."can_access_message_attachment"("target_bucket" "text", "target_path" "text", "target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."check_rate_limit"("requested_action" "text", "requested_subject_key" "text", "requested_limit" integer, "requested_window" interval, "requested_fingerprint_hash" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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

  if private.is_account_deletion_context() then
    return;
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
$_$;


ALTER FUNCTION "private"."check_rate_limit"("requested_action" "text", "requested_subject_key" "text", "requested_limit" integer, "requested_window" interval, "requested_fingerprint_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."cleanup_rate_limit_events"("batch_size" integer DEFAULT 5000, "retention" interval DEFAULT '60 days'::interval) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."cleanup_rate_limit_events"("batch_size" integer, "retention" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_admin_report_message"("target_report_id" "uuid", "admin_user_id" "uuid", "recipient_user_id" "uuid", "message_body" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  safe_body text := left(nullif(btrim(coalesce(message_body, '')), ''), 2000);
  conversation_id uuid;
  message_id uuid;
begin
  if target_report_id is null or admin_user_id is null or recipient_user_id is null or safe_body is null then
    return null;
  end if;

  if admin_user_id = recipient_user_id then
    return null;
  end if;

  select id
  into conversation_id
  from public.conversations
  where report_id = target_report_id
    and buyer_id = recipient_user_id
    and seller_id = admin_user_id
    and deleted_at is null
  limit 1;

  if conversation_id is null then
    perform set_config('retail.trusted_admin_report_message', 'true', true);

    insert into public.conversations (
      listing_id,
      rescue_id,
      report_id,
      buyer_id,
      seller_id,
      last_message_at
    )
    values (
      null,
      null,
      target_report_id,
      recipient_user_id,
      admin_user_id,
      now()
    )
    on conflict do nothing
    returning id into conversation_id;

    perform set_config('retail.trusted_admin_report_message', 'false', true);
  end if;

  if conversation_id is null then
    select id
    into conversation_id
    from public.conversations
    where report_id = target_report_id
      and buyer_id = recipient_user_id
      and seller_id = admin_user_id
      and deleted_at is null
    limit 1;
  end if;

  if conversation_id is null then
    return null;
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    is_read
  )
  values (
    conversation_id,
    admin_user_id,
    'text'::public.message_type,
    safe_body,
    false
  )
  returning id into message_id;

  return message_id;
end;
$$;


ALTER FUNCTION "private"."create_admin_report_message"("target_report_id" "uuid", "admin_user_id" "uuid", "recipient_user_id" "uuid", "message_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_notification_for_event"("target_user_id" "uuid", "requested_type" "public"."notification_type", "requested_title" "text", "requested_body" "text", "requested_route" "text", "requested_data" "jsonb" DEFAULT '{}'::"jsonb", "requested_dedupe_key" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."create_notification_for_event"("target_user_id" "uuid", "requested_type" "public"."notification_type", "requested_title" "text", "requested_body" "text", "requested_route" "text", "requested_data" "jsonb", "requested_dedupe_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_block_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_phase_f_block_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_conversation_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
  admin_report_message_context boolean :=
    coalesce(current_setting('retail.trusted_admin_report_message', true), 'false') = 'true';
begin
  if not admin_report_message_context and new.buyer_id <> caller_id then
    raise exception 'RETAIL_CONVERSATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if not admin_report_message_context
    and coalesce(current_setting('retail.phase_f_conversation_rate_checked', true), 'false') <> 'true' then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_phase_f_conversation_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_device_token_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_phase_f_device_token_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_favorite_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_phase_f_favorite_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_listing_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_phase_f_listing_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_message_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_phase_f_message_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_report_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_phase_f_report_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_review_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."enforce_phase_f_review_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_phase_f_saved_search_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid;
  active_count integer;
  target_user_id uuid;
  excluded_saved_search_id uuid;
  trusted_notification_write boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.trusted_saved_search_notification_write', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'UPDATE' and trusted_notification_write then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.name is distinct from old.name
      or new.search_query is distinct from old.search_query
      or new.category_id is distinct from old.category_id
      or new.category_slug is distinct from old.category_slug
      or new.category_name is distinct from old.category_name
      or new.min_price is distinct from old.min_price
      or new.max_price is distinct from old.max_price
      or new.condition is distinct from old.condition
      or new.listing_type is distinct from old.listing_type
      or new.radius_miles is distinct from old.radius_miles
      or new.city is distinct from old.city
      or new.state is distinct from old.state
      or new.zip_code is distinct from old.zip_code
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.notifications_enabled is distinct from old.notifications_enabled
      or new.created_at is distinct from old.created_at
      or new.deleted_at is distinct from old.deleted_at then
      raise exception 'RETAIL_SAVED_SEARCH_IMMUTABLE'
        using errcode = '42501';
    end if;

    return new;
  end if;

  caller_id := private.require_active_account();

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


ALTER FUNCTION "private"."enforce_phase_f_saved_search_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."ensure_public_search_bounds"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "search_query" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."ensure_public_search_bounds"("page_number" integer, "page_size" integer, "search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_current_policy_acceptance"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'terms_of_service'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    )
    and exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'community_guidelines'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    )
    and exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'privacy_acknowledgment'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    );
$$;


ALTER FUNCTION "private"."has_current_policy_acceptance"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_account_active"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and is_banned = false
      and deleted_at is null
  );
$$;


ALTER FUNCTION "private"."is_account_active"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_account_deletion_context"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(pg_catalog.current_setting('retail.account_deletion_context', true), '') = 'on';
$$;


ALTER FUNCTION "private"."is_account_deletion_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and is_admin = true
      and is_banned = false
      and deleted_at is null
  );
$$;


ALTER FUNCTION "private"."is_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_blocked_between"("first_user_id" "uuid", "second_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = first_user_id and b.blocked_id = second_user_id)
       or (b.blocker_id = second_user_id and b.blocked_id = first_user_id)
  );
$$;


ALTER FUNCTION "private"."is_blocked_between"("first_user_id" "uuid", "second_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id and c.deleted_at is null and target_user_id in (c.buyer_id, c.seller_id)
  );
$$;


ALTER FUNCTION "private"."is_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_valid_message_attachment_path"("target_path" "text", "expected_conversation_id" "uuid", "expected_uploader_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  path_parts text[];
  file_name text;
begin
  if target_path is null
    or expected_conversation_id is null
    or expected_uploader_id is null
  then
    return false;
  end if;

  path_parts := storage.foldername(target_path);
  file_name := storage.filename(target_path);

  if array_length(path_parts, 1) <> 2 then
    return false;
  end if;

  if path_parts[1] <> expected_conversation_id::text
    or path_parts[2] <> expected_uploader_id::text
  then
    return false;
  end if;

  return target_path ~ (
    '^' || expected_conversation_id::text || '/' ||
    expected_uploader_id::text || '/' ||
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|jpeg|png|webp)$'
  )
    and file_name !~ '[.](jpg|jpeg|png|webp)[.]';
exception
  when others then
    return false;
end;
$_$;


ALTER FUNCTION "private"."is_valid_message_attachment_path"("target_path" "text", "expected_conversation_id" "uuid", "expected_uploader_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."latest_marketing_email_preference"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((
    select consent.granted
    from public.user_consents consent
    where consent.user_id = target_user_id
      and consent.consent_type = 'marketing_email'
    order by consent.recorded_at desc, consent.id desc
    limit 1
  ), false);
$$;


ALTER FUNCTION "private"."latest_marketing_email_preference"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."message_attachment_path_is_valid"("target_conversation_id" "uuid", "target_sender_id" "uuid", "target_bucket" "text", "target_path" "text", "target_mime_type" "text", "target_size_bytes" integer) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  object_mime_type text;
  object_size_bytes bigint;
  bucket_limit_bytes bigint;
begin
  if target_bucket <> 'message-images'
    or target_conversation_id is null
    or target_sender_id is null
    or target_path is null
    or target_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or target_size_bytes is null
    or target_size_bytes <= 0
  then
    return false;
  end if;

  if not private.is_valid_message_attachment_path(target_path, target_conversation_id, target_sender_id) then
    return false;
  end if;

  select
    coalesce(
      nullif(o.metadata ->> 'mimetype', ''),
      nullif(o.metadata ->> 'mimeType', ''),
      nullif(o.metadata ->> 'contentType', '')
    ),
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      else null
    end,
    coalesce(b.file_size_limit, 10485760)
  into object_mime_type, object_size_bytes, bucket_limit_bytes
  from storage.objects o
  join storage.buckets b on b.id = o.bucket_id
  where o.bucket_id = target_bucket
    and o.name = target_path
    and o.owner_id = target_sender_id::text;

  if not found then
    return false;
  end if;

  return object_mime_type = target_mime_type
    and object_size_bytes = target_size_bytes::bigint
    and object_size_bytes > 0
    and object_size_bytes <= bucket_limit_bytes
    and target_size_bytes::bigint <= bucket_limit_bytes
    and private.is_conversation_participant(target_conversation_id, target_sender_id);
exception
  when others then
    return false;
end;
$_$;


ALTER FUNCTION "private"."message_attachment_path_is_valid"("target_conversation_id" "uuid", "target_sender_id" "uuid", "target_bucket" "text", "target_path" "text", "target_mime_type" "text", "target_size_bytes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalized_message_fingerprint"("message_body" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select pg_catalog.md5(
    pg_catalog.lower(
      pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(message_body, '')), '\s+', ' ', 'g')
    )
  );
$$;


ALTER FUNCTION "private"."normalized_message_fingerprint"("message_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notification_preference_allows"("target_user_id" "uuid", "requested_type" "public"."notification_type") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."notification_preference_allows"("target_user_id" "uuid", "requested_type" "public"."notification_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."other_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case when c.buyer_id = target_user_id then c.seller_id when c.seller_id = target_user_id then c.buyer_id else null end
  from public.conversations c
  where c.id = target_conversation_id and c.deleted_at is null;
$$;


ALTER FUNCTION "private"."other_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."public_storage_path_from_url"("target_bucket" "text", "target_url" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  marker text := '/storage/v1/object/public/' || target_bucket || '/';
  marker_position integer;
begin
  if target_bucket is null or target_url is null then return null; end if;
  marker_position := position(marker in target_url);
  if marker_position <= 0 then return null; end if;
  return split_part(substring(target_url from marker_position + length(marker)), '?', 1);
end;
$$;


ALTER FUNCTION "private"."public_storage_path_from_url"("target_bucket" "text", "target_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_account_deletion_marketing_opt_out"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (new.id, 'marketing_email', null, false, 'account_deletion');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."record_account_deletion_marketing_opt_out"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_auth_user_deletion_marketing_opt_out"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
  values (old.id, 'marketing_email', null, false, 'account_deletion');
  return old;
end;
$$;


ALTER FUNCTION "private"."record_auth_user_deletion_marketing_opt_out"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_email_signup_consents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce((metadata ->> 'retail_policy_consent_pending')::boolean, false) = true
    and coalesce((metadata ->> 'retail_terms_accepted')::boolean, false) = true
    and metadata ->> 'retail_terms_version' = '2026-08-10'
    and coalesce((metadata ->> 'retail_community_guidelines_accepted')::boolean, false) = true
    and metadata ->> 'retail_community_guidelines_version' = '2026-08-10'
    and coalesce((metadata ->> 'retail_privacy_acknowledged')::boolean, false) = true
    and metadata ->> 'retail_privacy_version' = '2026-08-10'
    and metadata ->> 'retail_consent_source' = 'email_signup' then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values
      (new.id, 'terms_of_service', '2026-08-10', true, 'email_signup'),
      (new.id, 'community_guidelines', '2026-08-10', true, 'email_signup'),
      (new.id, 'privacy_acknowledgment', '2026-08-10', true, 'email_signup'),
      (
        new.id,
        'marketing_email',
        null,
        coalesce((metadata ->> 'retail_marketing_email_opt_in')::boolean, false),
        'email_signup'
      );
  end if;

  return new;
exception
  when invalid_text_representation then
    raise exception 'RETAIL_SIGNUP_CONSENT_METADATA_INVALID'
      using errcode = '22023';
end;
$$;


ALTER FUNCTION "private"."record_email_signup_consents"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reject_user_consent_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  raise exception 'RETAIL_CONSENT_HISTORY_IS_APPEND_ONLY'
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "private"."reject_user_consent_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."require_active_account"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'RETAIL_ACCOUNT_NOT_ACTIVE'
      using errcode = '42501';
  end if;

  if private.is_account_deletion_context() then
    return caller_id;
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_NOT_ACTIVE'
      using errcode = '42501';
  end if;

  return caller_id;
end;
$$;


ALTER FUNCTION "private"."require_active_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."seller_payout_ready"("p_seller_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_seller_id
      and p.stripe_connect_account_id is not null
      and coalesce(p.stripe_connect_details_submitted, false)
      and coalesce(p.stripe_connect_charges_enabled, false)
      and coalesce(p.stripe_connect_payouts_enabled, false)
      and p.deleted_at is null
      and not coalesce(p.is_banned, false)
  );
$$;


ALTER FUNCTION "private"."seller_payout_ready"("p_seller_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."uuid_from_text"("target_text" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if target_text is null then return null; end if;
  return target_text::uuid;
exception when invalid_text_representation then return null;
end;
$$;


ALTER FUNCTION "private"."uuid_from_text"("target_text" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid",
    "reported_user_id" "uuid",
    "listing_id" "uuid",
    "message_id" "uuid",
    "report_type" "public"."report_type" NOT NULL,
    "reason" "public"."report_reason" NOT NULL,
    "details" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "public"."report_status" DEFAULT 'open'::"public"."report_status" NOT NULL,
    "assigned_admin_id" "uuid",
    "admin_notes" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_target_matches_type" CHECK (((("report_type" = 'listing'::"public"."report_type") AND ("listing_id" IS NOT NULL) AND ("reported_user_id" IS NULL) AND ("message_id" IS NULL)) OR (("report_type" = 'user'::"public"."report_type") AND ("reported_user_id" IS NOT NULL) AND ("listing_id" IS NULL) AND ("message_id" IS NULL)) OR (("report_type" = 'message'::"public"."report_type") AND ("message_id" IS NOT NULL) AND ("listing_id" IS NULL)))),
    CONSTRAINT "reports_details_check" CHECK ((("details" IS NULL) OR ("char_length"("details") <= 2000)))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_moderate_report"("target_report_id" "uuid", "requested_status" "text", "requested_action" "text" DEFAULT 'none'::"text", "requested_admin_note" "text" DEFAULT NULL::"text", "requested_admin_message" "text" DEFAULT NULL::"text") RETURNS "public"."reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  report_row public.reports;
  updated_report public.reports;
  target_listing_id uuid;
  target_listing_title text;
  target_user_id uuid;
  target_user_is_admin boolean := false;
  target_message_id uuid;
  reporter_title text;
  reporter_body text;
  reported_title text;
  reported_body text;
  admin_message text := nullif(btrim(coalesce(requested_admin_message, '')), '');
  reporter_message_body text;
  reported_message_body text;
  safe_status public.report_status;
  safe_action text := coalesce(nullif(btrim(requested_action), ''), 'none');
begin
  if caller_id is null or not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if requested_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'RETAIL_REPORT_STATUS_INVALID' using errcode = '22023';
  end if;

  if safe_action not in ('none', 'remove_listing', 'delete_user', 'remove_message') then
    raise exception 'RETAIL_REPORT_ACTION_INVALID' using errcode = '22023';
  end if;

  select * into report_row from public.reports where id = target_report_id for update;

  if not found then
    raise exception 'RETAIL_REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  target_listing_id := report_row.listing_id;
  target_user_id := report_row.reported_user_id;
  target_message_id := report_row.message_id;

  if report_row.report_type = 'listing' and target_listing_id is not null then
    select seller_id, title into target_user_id, target_listing_title from public.listings where id = target_listing_id;
  elsif report_row.report_type = 'message' and target_message_id is not null then
    select m.sender_id, c.listing_id into target_user_id, target_listing_id
    from public.messages m
    left join public.conversations c on c.id = m.conversation_id
    where m.id = target_message_id;

    if target_listing_id is not null then
      select title into target_listing_title from public.listings where id = target_listing_id;
    end if;
  elsif report_row.report_type = 'user' then
    target_user_id := report_row.reported_user_id;
  end if;

  if safe_action = 'remove_listing' then
    if target_listing_id is null then
      raise exception 'RETAIL_REPORT_LISTING_REQUIRED' using errcode = '22023';
    end if;

    update public.listings set status = 'removed'::public.listing_status, deleted_at = coalesce(deleted_at, now()), updated_at = now() where id = target_listing_id;
    safe_status := 'resolved'::public.report_status;
  elsif safe_action = 'delete_user' then
    if target_user_id is null then
      raise exception 'RETAIL_REPORT_USER_REQUIRED' using errcode = '22023';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_CANNOT_DELETE_SELF' using errcode = '42501';
    end if;

    select is_admin into target_user_is_admin from public.profiles where id = target_user_id;

    if coalesce(target_user_is_admin, false) then
      raise exception 'RETAIL_CANNOT_DELETE_ADMIN' using errcode = '42501';
    end if;

    update public.listings set status = 'removed'::public.listing_status, deleted_at = coalesce(deleted_at, now()), updated_at = now() where seller_id = target_user_id;

    update public.profiles
    set is_banned = true,
        deleted_at = coalesce(deleted_at, now()),
        display_name = 'Deleted user',
        username = ('deleted_' || substring(replace(target_user_id::text, '-', '') from 1 for 24))::public.citext,
        bio = null,
        avatar_url = null,
        city = null,
        state = null,
        zip_code = null,
        latitude = null,
        longitude = null,
        updated_at = now()
    where id = target_user_id;

    safe_status := 'resolved'::public.report_status;
  elsif safe_action = 'remove_message' then
    if target_message_id is null then
      raise exception 'RETAIL_REPORT_MESSAGE_REQUIRED' using errcode = '22023';
    end if;

    update public.messages set deleted_at = coalesce(deleted_at, now()) where id = target_message_id;
    safe_status := 'resolved'::public.report_status;
  else
    safe_status := requested_status::public.report_status;
  end if;

  perform set_config('retail.phase_e_trusted_report_write', 'true', true);

  update public.reports
  set status = safe_status,
      assigned_admin_id = caller_id,
      admin_notes = nullif(btrim(coalesce(requested_admin_note, '')), ''),
      resolved_at = case
        when safe_status in ('resolved'::public.report_status, 'dismissed'::public.report_status) then now()
        when safe_status in ('open'::public.report_status, 'reviewing'::public.report_status) then null
        else resolved_at
      end,
      updated_at = now()
  where id = target_report_id
  returning * into updated_report;

  perform set_config('retail.phase_e_trusted_report_write', 'false', true);

  reporter_title := case
    when safe_status = 'dismissed'::public.report_status then 'Report dismissed'
    when safe_status = 'reviewing'::public.report_status then 'Report under review'
    when safe_status = 'open'::public.report_status then 'Report moved to active review'
    when safe_action = 'remove_listing' then 'Reported listing removed'
    when safe_action = 'delete_user' then 'Reported account removed'
    when safe_action = 'remove_message' then 'Reported message removed'
    else 'Report resolved'
  end;

  reporter_body := case
    when safe_status = 'dismissed'::public.report_status then 'Thanks for helping keep ReTail safe. We reviewed your report and dismissed it.'
    when safe_status = 'reviewing'::public.report_status then 'Thanks for helping keep ReTail safe. Your report is being reviewed by a ReTail admin.'
    when safe_status = 'open'::public.report_status then 'Your report was moved back to active review by a ReTail admin.'
    when safe_action = 'remove_listing' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the listing.'
    when safe_action = 'delete_user' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the reported account.'
    when safe_action = 'remove_message' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the message.'
    else 'Thanks for helping keep ReTail safe. We reviewed your report and marked it resolved.'
  end;

  reporter_message_body := coalesce(admin_message, reporter_body);

  if report_row.reporter_id is not null then
    perform private.create_admin_report_message(target_report_id, caller_id, report_row.reporter_id, reporter_message_body);
  end if;

  if safe_status in ('resolved'::public.report_status, 'dismissed'::public.report_status) then
    perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

    if report_row.reporter_id is not null then
      insert into public.notifications (user_id, type, title, body, data)
      values (report_row.reporter_id, 'system'::public.notification_type, reporter_title, reporter_body, jsonb_build_object('reportId', target_report_id, 'reportStatus', safe_status, 'moderationAction', safe_action, 'listingId', target_listing_id, 'messageId', target_message_id));
    end if;

    if target_user_id is not null and target_user_id is distinct from report_row.reporter_id then
      reported_title := case
        when safe_status = 'dismissed'::public.report_status then 'Report reviewed'
        when safe_action = 'remove_listing' then 'Listing removed by ReTail'
        when safe_action = 'delete_user' then 'Account removed by ReTail'
        when safe_action = 'remove_message' then 'Message removed by ReTail'
        else 'Report reviewed'
      end;

      reported_body := case
        when safe_status = 'dismissed'::public.report_status then 'A report involving your account was reviewed and dismissed. No action was taken.'
        when safe_action = 'remove_listing' then 'A report involving one of your listings was reviewed, and the listing was removed.'
        when safe_action = 'delete_user' then 'A report involving your account was reviewed, and your account was removed from ReTail.'
        when safe_action = 'remove_message' then 'A report involving one of your messages was reviewed, and the message was removed.'
        else 'A report involving your account was reviewed. No listing or account removal was taken.'
      end;

      reported_message_body := coalesce(admin_message, reported_body);

      perform private.create_admin_report_message(target_report_id, caller_id, target_user_id, reported_message_body);

      insert into public.notifications (user_id, type, title, body, data)
      values (target_user_id, 'system'::public.notification_type, reported_title, reported_body, jsonb_build_object('reportId', target_report_id, 'reportStatus', safe_status, 'moderationAction', safe_action, 'listingId', target_listing_id, 'messageId', target_message_id));
    end if;

    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'moderator_action'::public.audit_event_type, 'reports', target_report_id, jsonb_build_object('status', safe_status, 'action', safe_action, 'listing_id', target_listing_id, 'message_id', target_message_id, 'reported_user_id', target_user_id, 'listing_title', target_listing_title, 'admin_message_sent', reporter_message_body is not null or reported_message_body is not null));

  return updated_report;
exception
  when others then
    perform set_config('retail.phase_e_trusted_report_write', 'false', true);
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
    raise;
end;
$$;


ALTER FUNCTION "public"."admin_moderate_report"("target_report_id" "uuid", "requested_status" "text", "requested_action" "text", "requested_admin_note" "text", "requested_admin_message" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rescue_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "zip_code" "text",
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "location_point" "public"."geography"(Point,4326),
    "website_url" "text",
    "contact_hint" "text",
    "is_verified" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "animals_rescued" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "contact_person" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "organization_type" "text" DEFAULT 'foster_based'::"text" NOT NULL,
    "has_501c3" boolean DEFAULT false NOT NULL,
    "ein" "text",
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "address_line1" "text",
    "address_line2" "text",
    "search_area_id" "uuid",
    CONSTRAINT "rescue_profiles_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 120))),
    CONSTRAINT "rescue_profiles_organization_type_check" CHECK (("organization_type" = ANY (ARRAY['foster_based'::"text", 'physical_location'::"text", 'hybrid'::"text"]))),
    CONSTRAINT "rescue_profiles_slug_check" CHECK (("slug" ~ '^[a-z0-9-]+$'::"text")),
    CONSTRAINT "rescue_profiles_summary_check" CHECK ((("char_length"("summary") >= 10) AND ("char_length"("summary") <= 1000))),
    CONSTRAINT "rescue_profiles_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'verified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."rescue_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_rescue_verification"("target_rescue_id" "uuid", "requested_verification_status" "text", "requested_admin_note" "text" DEFAULT NULL::"text") RETURNS "public"."rescue_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_rescue public.rescue_profiles;
begin
  if caller_id is null or not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if requested_verification_status not in ('pending', 'verified', 'rejected') then
    raise exception 'RETAIL_VERIFICATION_STATUS_INVALID' using errcode = '22023';
  end if;

  update public.rescue_profiles
  set
    verification_status = requested_verification_status,
    is_verified = requested_verification_status = 'verified',
    is_active = requested_verification_status <> 'rejected'
  where id = target_rescue_id
    and deleted_at is null
  returning * into updated_rescue;

  if not found then
    raise exception 'RETAIL_RESCUE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action',
    'rescue_profiles',
    target_rescue_id,
    jsonb_build_object(
      'action', 'set_rescue_verification',
      'status', requested_verification_status,
      'admin_note', nullif(trim(coalesce(requested_admin_note, '')), '')
    )
  );

  return updated_rescue;
end;
$$;


ALTER FUNCTION "public"."admin_set_rescue_verification"("target_rescue_id" "uuid", "requested_verification_status" "text", "requested_admin_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_report"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text" DEFAULT NULL::"text") RETURNS "public"."reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."admin_update_report"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_report_phase_f_base"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text" DEFAULT NULL::"text") RETURNS "public"."reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."admin_update_report_phase_f_base"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "requester_role" "public"."support_case_requester_role" NOT NULL,
    "issue_category" "public"."support_case_issue_category" NOT NULL,
    "description" "text" NOT NULL,
    "status" "public"."support_case_status" DEFAULT 'open'::"public"."support_case_status" NOT NULL,
    "assigned_admin_id" "uuid",
    "internal_admin_notes" "text",
    "customer_visible_message" "text",
    "current_payment_status" "text",
    "current_shipment_status" "text",
    "current_delivery_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "support_cases_admin_notes_length" CHECK ((("internal_admin_notes" IS NULL) OR ("char_length"("internal_admin_notes") <= 6000))),
    CONSTRAINT "support_cases_customer_message_length" CHECK ((("customer_visible_message" IS NULL) OR ("char_length"("customer_visible_message") <= 3000))),
    CONSTRAINT "support_cases_description_length" CHECK ((("char_length"("btrim"("description")) >= 10) AND ("char_length"("btrim"("description")) <= 4000))),
    CONSTRAINT "support_cases_distinct_parties" CHECK (("buyer_id" IS DISTINCT FROM "seller_id")),
    CONSTRAINT "support_cases_requester_is_party" CHECK (((("requester_role" = 'buyer'::"public"."support_case_requester_role") AND ("requester_id" = "buyer_id")) OR (("requester_role" = 'seller'::"public"."support_case_requester_role") AND ("requester_id" = "seller_id"))))
);


ALTER TABLE "public"."support_cases" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_transaction_support_case"("target_case_id" "uuid", "requested_status" "text", "requested_internal_note" "text" DEFAULT NULL::"text", "requested_customer_message" "text" DEFAULT NULL::"text") RETURNS "public"."support_cases"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
  safe_status public.support_case_status;
  safe_internal_note text := nullif(btrim(coalesce(requested_internal_note, '')), '');
  safe_customer_message text := nullif(btrim(coalesce(requested_customer_message, '')), '');
  updated_case public.support_cases;
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  if requested_status not in ('open', 'reviewing', 'waiting_on_buyer', 'waiting_on_seller', 'resolved', 'closed') then
    raise exception 'RETAIL_SUPPORT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  safe_status := requested_status::public.support_case_status;

  update public.support_cases
  set
    status = safe_status,
    assigned_admin_id = caller_id,
    internal_admin_notes = safe_internal_note,
    customer_visible_message = safe_customer_message,
    resolved_at = case
      when safe_status in ('resolved', 'closed') then coalesce(resolved_at, now())
      else null
    end
  where id = target_case_id
    and deleted_at is null
  returning * into updated_case;

  if not found then
    raise exception 'RETAIL_SUPPORT_CASE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if safe_customer_message is not null then
    perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

    insert into public.notifications (user_id, type, title, body, data)
    values (
      updated_case.requester_id,
      'system'::public.notification_type,
      'Support case updated',
      safe_customer_message,
      jsonb_build_object(
        'supportCaseId', updated_case.id,
        'transactionId', updated_case.transaction_id,
        'listingId', updated_case.listing_id,
        'supportStatus', updated_case.status
      )
    );

    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
  end if;

  return updated_case;
exception
  when others then
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
    raise;
end;
$$;


ALTER FUNCTION "public"."admin_update_transaction_support_case"("target_case_id" "uuid", "requested_status" "text", "requested_internal_note" "text", "requested_customer_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."allowed_distance_radius"("radius_miles" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when radius_miles in (10, 25, 50, 100) then radius_miles
    else null
  end;
$$;


ALTER FUNCTION "public"."allowed_distance_radius"("radius_miles" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approximate_distance_miles"("latitude_one" numeric, "longitude_one" numeric, "latitude_two" numeric, "longitude_two" numeric) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select 3958.8 * acos(
    least(
      1.0,
      greatest(
        -1.0,
        sin(radians(latitude_one::double precision)) * sin(radians(latitude_two::double precision))
        + cos(radians(latitude_one::double precision))
        * cos(radians(latitude_two::double precision))
        * cos(radians(longitude_two::double precision - longitude_one::double precision))
      )
    )
  );
$$;


ALTER FUNCTION "public"."approximate_distance_miles"("latitude_one" numeric, "longitude_one" numeric, "latitude_two" numeric, "longitude_two" numeric) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "price" numeric(10,2),
    "listing_type" "public"."listing_type" DEFAULT 'sale'::"public"."listing_type" NOT NULL,
    "condition" "public"."listing_condition" NOT NULL,
    "status" "public"."listing_status" DEFAULT 'active'::"public"."listing_status" NOT NULL,
    "brand" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "zip_code" "text",
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "pickup_available" boolean DEFAULT true NOT NULL,
    "shipping_available" boolean DEFAULT false NOT NULL,
    "view_count" integer DEFAULT 0 NOT NULL,
    "favorite_count" integer DEFAULT 0 NOT NULL,
    "message_count" integer DEFAULT 0 NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "location_point" "public"."geography"(Point,4326),
    "porch_pickup_available" boolean DEFAULT false NOT NULL,
    "meetup_available" boolean DEFAULT true NOT NULL,
    "item_dimensions" "text",
    "pet_size" "text",
    "condition_notes" "text",
    "availability_notes" "text",
    "reason_for_listing" "text",
    "safety_confirmed" boolean DEFAULT false NOT NULL,
    "shipping_payer" "text" DEFAULT 'buyer'::"text" NOT NULL,
    "shipping_cost_estimate" numeric(10,2),
    "handling_time" "text",
    "ship_from_zip_code" "text",
    "search_area_id" "uuid",
    "reserved_by" "uuid",
    "reserved_until" timestamp with time zone,
    "reservation_payment_intent_id" "text",
    "reservation_transaction_id" "uuid",
    CONSTRAINT "listing_availability_notes_length" CHECK ((("availability_notes" IS NULL) OR ("char_length"("availability_notes") <= 500))),
    CONSTRAINT "listing_condition_notes_length" CHECK ((("condition_notes" IS NULL) OR ("char_length"("condition_notes") <= 500))),
    CONSTRAINT "listing_handling_time_length" CHECK ((("handling_time" IS NULL) OR ("char_length"("handling_time") <= 80))),
    CONSTRAINT "listing_has_getting_option" CHECK (("porch_pickup_available" OR "meetup_available" OR "shipping_available")),
    CONSTRAINT "listing_item_dimensions_length" CHECK ((("item_dimensions" IS NULL) OR ("char_length"("item_dimensions") <= 120))),
    CONSTRAINT "listing_pet_size_length" CHECK ((("pet_size" IS NULL) OR ("char_length"("pet_size") <= 80))),
    CONSTRAINT "listing_price_matches_type" CHECK (((("listing_type" = 'sale'::"public"."listing_type") AND ("price" IS NOT NULL) AND ("price" >= (0)::numeric)) OR (("listing_type" = ANY (ARRAY['free'::"public"."listing_type", 'donation'::"public"."listing_type"])) AND (("price" IS NULL) OR ("price" = (0)::numeric))))),
    CONSTRAINT "listing_reason_for_listing_length" CHECK ((("reason_for_listing" IS NULL) OR ("char_length"("reason_for_listing") <= 300))),
    CONSTRAINT "listing_ship_from_zip_code_valid" CHECK ((("ship_from_zip_code" IS NULL) OR ("ship_from_zip_code" ~ '^[0-9]{5}$'::"text"))),
    CONSTRAINT "listing_shipping_cost_estimate_nonnegative" CHECK ((("shipping_cost_estimate" IS NULL) OR ("shipping_cost_estimate" >= (0)::numeric))),
    CONSTRAINT "listing_shipping_payer_valid" CHECK (("shipping_payer" = ANY (ARRAY['buyer'::"text", 'seller'::"text", 'discuss'::"text"]))),
    CONSTRAINT "listings_brand_check" CHECK ((("brand" IS NULL) OR ("char_length"("brand") <= 80))),
    CONSTRAINT "listings_checkout_reservation_consistent" CHECK (((("reserved_by" IS NULL) AND ("reserved_until" IS NULL) AND ("reservation_payment_intent_id" IS NULL) AND ("reservation_transaction_id" IS NULL)) OR (("reserved_by" IS NOT NULL) AND ("reserved_until" IS NOT NULL)))),
    CONSTRAINT "listings_description_check" CHECK ((("char_length"("description") >= 10) AND ("char_length"("description") <= 3000))),
    CONSTRAINT "listings_favorite_count_check" CHECK (("favorite_count" >= 0)),
    CONSTRAINT "listings_message_count_check" CHECK (("message_count" >= 0)),
    CONSTRAINT "listings_reservation_payment_intent_id_format" CHECK ((("reservation_payment_intent_id" IS NULL) OR ("reservation_payment_intent_id" ~ '^pi_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "listings_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 120))),
    CONSTRAINT "listings_view_count_check" CHECK (("view_count" >= 0))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_my_listing"("target_listing_id" "uuid") RETURNS "public"."listings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_listing public.listings;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.listings
  set status = 'archived'::public.listing_status
  where id = target_listing_id
    and seller_id = caller_id
    and deleted_at is null
    and status in ('draft'::public.listing_status, 'active'::public.listing_status, 'pending'::public.listing_status)
  returning * into updated_listing;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_updated', 'listings', target_listing_id, jsonb_build_object('status', 'archived'));

  return updated_listing;
end;
$$;


ALTER FUNCTION "public"."archive_my_listing"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attach_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text", "p_transaction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_listing_id is null
    or p_buyer_id is null
    or p_payment_intent_id is null
    or p_transaction_id is null then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST' using errcode = '22023';
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings
  set reservation_payment_intent_id = p_payment_intent_id,
      reservation_transaction_id = p_transaction_id,
      updated_at = now()
  where id = p_listing_id
    and reserved_by = p_buyer_id
    and reserved_until > now()
    and status = 'active'::public.listing_status
    and deleted_at is null;

  perform set_config('retail.checkout_reservation_context', 'false', true);

  if not found then
    raise exception 'RETAIL_CHECKOUT_RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;


ALTER FUNCTION "public"."attach_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text", "p_transaction_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "block_has_two_people" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."blocks" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_user"("target_user_id" "uuid") RETURNS "public"."blocks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  inserted_row public.blocks%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required'; end if;
  if target_user_id is null or target_user_id = caller_id then raise exception 'Blocked user is invalid'; end if;
  if not private.is_account_active(caller_id) then raise exception 'Account is not active'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id and p.deleted_at is null) then raise exception 'User is not available'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (caller_id, target_user_id)
  on conflict (blocker_id, blocked_id) do update set blocker_id = excluded.blocker_id returning * into inserted_row;
  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata) values (caller_id, 'moderator_action', 'blocks', inserted_row.id, jsonb_build_object('action', 'user_blocked', 'blocked_id', target_user_id));
  return inserted_row;
end;
$$;


ALTER FUNCTION "public"."block_user"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_stripe_webhook_event"("p_event_id" "text", "p_event_type" "text", "p_livemode" boolean, "p_stripe_created_at" timestamp with time zone) RETURNS TABLE("action" "text", "processing_status" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  existing_status text;
begin
  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    livemode,
    stripe_created_at,
    processing_status,
    received_at,
    updated_at
  )
  values (
    p_event_id,
    p_event_type,
    p_livemode,
    p_stripe_created_at,
    'processing',
    now(),
    now()
  )
  on conflict (event_id) do nothing;

  if found then
    return query select 'claimed'::text, 'processing'::text;
    return;
  end if;

  select swe.processing_status
  into existing_status
  from public.stripe_webhook_events swe
  where swe.event_id = p_event_id
  for update;

  if existing_status in ('processed', 'ignored') then
    return query select 'already_processed'::text, existing_status;
    return;
  end if;

  if existing_status = 'failed' then
    update public.stripe_webhook_events swe
    set processing_status = 'processing',
        last_error = null,
        updated_at = now()
    where swe.event_id = p_event_id;

    return query select 'claimed_retry'::text, 'processing'::text;
    return;
  end if;

  return query select 'already_processing'::text, coalesce(existing_status, 'processing')::text;
end;
$$;


ALTER FUNCTION "public"."claim_stripe_webhook_event"("p_event_id" "text", "p_event_type" "text", "p_livemode" boolean, "p_stripe_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_listing_transaction"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("transaction_id" "uuid", "listing_id" "uuid", "buyer_id" "uuid", "seller_id" "uuid", "outcome" "public"."transaction_outcome", "listing_status" "public"."listing_status", "completed_at" timestamp with time zone, "linked_transaction" boolean, "notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."complete_listing_transaction"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_listing_transaction_phase_f_base"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("transaction_id" "uuid", "listing_id" "uuid", "buyer_id" "uuid", "seller_id" "uuid", "outcome" "public"."transaction_outcome", "listing_status" "public"."listing_status", "completed_at" timestamp with time zone, "linked_transaction" boolean, "notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."complete_listing_transaction_phase_f_base"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_favorite_notification_after_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_favorite_notification_after_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_listing"("requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type" DEFAULT 'sale'::"public"."listing_type", "requested_price" numeric DEFAULT NULL::numeric, "requested_brand" "text" DEFAULT NULL::"text", "requested_city" "text" DEFAULT NULL::"text", "requested_state" "text" DEFAULT NULL::"text", "requested_zip_code" "text" DEFAULT NULL::"text", "requested_pickup_available" boolean DEFAULT true, "requested_porch_pickup_available" boolean DEFAULT false, "requested_meetup_available" boolean DEFAULT true, "requested_shipping_available" boolean DEFAULT false, "requested_shipping_payer" "text" DEFAULT 'buyer'::"text", "requested_shipping_cost_estimate" numeric DEFAULT NULL::numeric, "requested_handling_time" "text" DEFAULT NULL::"text", "requested_ship_from_zip_code" "text" DEFAULT NULL::"text", "requested_item_dimensions" "text" DEFAULT NULL::"text", "requested_pet_size" "text" DEFAULT NULL::"text", "requested_condition_notes" "text" DEFAULT NULL::"text", "requested_availability_notes" "text" DEFAULT NULL::"text", "requested_reason_for_listing" "text" DEFAULT NULL::"text", "requested_safety_confirmed" boolean DEFAULT false) RETURNS "public"."listings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  normalized_price numeric;
  created_listing public.listings;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  if trim(coalesce(requested_title, '')) = '' then
    raise exception 'RETAIL_TITLE_REQUIRED' using errcode = '22023';
  end if;

  if trim(coalesce(requested_description, '')) = '' then
    raise exception 'RETAIL_DESCRIPTION_REQUIRED' using errcode = '22023';
  end if;

  if requested_category_id is null then
    raise exception 'RETAIL_CATEGORY_REQUIRED' using errcode = '22023';
  end if;

  if trim(coalesce(requested_city, '')) = '' or trim(coalesce(requested_state, '')) = '' then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  if requested_listing_type = 'sale'::public.listing_type then
    if requested_price is null or requested_price < 0 then
      raise exception 'RETAIL_PRICE_REQUIRED' using errcode = '22023';
    end if;
    normalized_price := requested_price;
  else
    normalized_price := 0;
  end if;

  if not coalesce(requested_pickup_available, false)
    and not coalesce(requested_porch_pickup_available, false)
    and not coalesce(requested_meetup_available, false)
    and not coalesce(requested_shipping_available, false) then
    raise exception 'RETAIL_GETTING_OPTION_REQUIRED' using errcode = '22023';
  end if;

  insert into public.listings (
    seller_id,
    category_id,
    title,
    description,
    price,
    listing_type,
    condition,
    status,
    brand,
    city,
    state,
    zip_code,
    pickup_available,
    porch_pickup_available,
    meetup_available,
    shipping_available,
    shipping_payer,
    shipping_cost_estimate,
    handling_time,
    ship_from_zip_code,
    item_dimensions,
    pet_size,
    condition_notes,
    availability_notes,
    reason_for_listing,
    safety_confirmed
  )
  values (
    caller_id,
    requested_category_id,
    trim(requested_title),
    trim(requested_description),
    normalized_price,
    requested_listing_type,
    requested_condition,
    'active'::public.listing_status,
    nullif(trim(coalesce(requested_brand, '')), ''),
    trim(requested_city),
    trim(requested_state),
    nullif(trim(coalesce(requested_zip_code, '')), ''),
    coalesce(requested_pickup_available, false)
      or coalesce(requested_porch_pickup_available, false)
      or coalesce(requested_meetup_available, false),
    coalesce(requested_porch_pickup_available, false),
    coalesce(requested_meetup_available, false),
    coalesce(requested_shipping_available, false),
    case when coalesce(requested_shipping_available, false) then coalesce(nullif(trim(requested_shipping_payer), ''), 'buyer') else 'buyer' end,
    case when coalesce(requested_shipping_available, false) then requested_shipping_cost_estimate else null end,
    case when coalesce(requested_shipping_available, false) then nullif(trim(coalesce(requested_handling_time, '')), '') else null end,
    case when coalesce(requested_shipping_available, false) then nullif(trim(coalesce(requested_ship_from_zip_code, requested_zip_code, '')), '') else null end,
    nullif(trim(coalesce(requested_item_dimensions, '')), ''),
    nullif(trim(coalesce(requested_pet_size, '')), ''),
    nullif(trim(coalesce(requested_condition_notes, '')), ''),
    nullif(trim(coalesce(requested_availability_notes, '')), ''),
    nullif(trim(coalesce(requested_reason_for_listing, '')), ''),
    coalesce(requested_safety_confirmed, false)
  )
  returning * into created_listing;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_created', 'listings', created_listing.id, jsonb_build_object('source', 'create_listing'));

  return created_listing;
end;
$$;


ALTER FUNCTION "public"."create_listing"("requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "account_type" "public"."account_type" DEFAULT 'regular'::"public"."account_type" NOT NULL,
    "display_name" "text" NOT NULL,
    "username" "public"."citext" NOT NULL,
    "bio" "text",
    "avatar_url" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "buyer_rating" numeric(3,2) DEFAULT 0,
    "seller_rating" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0 NOT NULL,
    "listings_count" integer DEFAULT 0 NOT NULL,
    "completed_sales_count" integer DEFAULT 0 NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "is_banned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "stripe_connect_account_id" "text",
    "stripe_connect_charges_enabled" boolean DEFAULT false NOT NULL,
    "stripe_connect_payouts_enabled" boolean DEFAULT false NOT NULL,
    "stripe_connect_details_submitted" boolean DEFAULT false NOT NULL,
    "stripe_connect_onboarding_complete_at" timestamp with time zone,
    "stripe_connect_updated_at" timestamp with time zone,
    CONSTRAINT "profiles_bio_check" CHECK ((("bio" IS NULL) OR ("char_length"("bio") <= 500))),
    CONSTRAINT "profiles_buyer_rating_check" CHECK ((("buyer_rating" >= (0)::numeric) AND ("buyer_rating" <= (5)::numeric))),
    CONSTRAINT "profiles_completed_sales_count_check" CHECK (("completed_sales_count" >= 0)),
    CONSTRAINT "profiles_display_name_check" CHECK ((("char_length"("display_name") >= 2) AND ("char_length"("display_name") <= 80))),
    CONSTRAINT "profiles_listings_count_check" CHECK (("listings_count" >= 0)),
    CONSTRAINT "profiles_review_count_check" CHECK (("review_count" >= 0)),
    CONSTRAINT "profiles_seller_rating_check" CHECK ((("seller_rating" >= (0)::numeric) AND ("seller_rating" <= (5)::numeric))),
    CONSTRAINT "profiles_stripe_connect_account_id_format" CHECK ((("stripe_connect_account_id" IS NULL) OR ("stripe_connect_account_id" ~ '^acct_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "profiles_username_check" CHECK ((("char_length"(("username")::"text") >= 3) AND ("char_length"(("username")::"text") <= 32)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_account_type" "public"."account_type" DEFAULT 'regular'::"public"."account_type") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  created_profile public.profiles;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if trim(coalesce(requested_display_name, '')) = '' then
    raise exception 'RETAIL_DISPLAY_NAME_REQUIRED' using errcode = '22023';
  end if;

  if trim(coalesce(requested_username, '')) = '' then
    raise exception 'RETAIL_USERNAME_REQUIRED' using errcode = '22023';
  end if;

  select *
  into created_profile
  from public.profiles
  where id = caller_id;

  if found then
    return created_profile;
  end if;

  insert into public.profiles (
    id,
    account_type,
    display_name,
    username
  )
  values (
    caller_id,
    requested_account_type,
    trim(requested_display_name),
    trim(requested_username)
  )
  returning * into created_profile;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'account_created', 'profiles', caller_id, jsonb_build_object('source', 'create_my_profile'));

  return created_profile;
end;
$$;


ALTER FUNCTION "public"."create_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_account_type" "public"."account_type") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid",
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "rescue_id" "uuid",
    "report_id" "uuid",
    CONSTRAINT "conversation_has_two_people" CHECK (("buyer_id" <> "seller_id"))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_or_get_conversation"("target_listing_id" "uuid") RETURNS "public"."conversations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
  listing_row public.listings%rowtype;
  caller_profile public.profiles%rowtype;
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

  if caller_id = listing_row.seller_id then
    raise exception 'Users cannot message themselves' using errcode = '42501';
  end if;

  select *
  into caller_profile
  from public.profiles p
  where p.id = caller_id
    and p.deleted_at is null
    and p.is_banned = false;

  if not found then
    raise exception 'RETAIL_ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  if listing_row.listing_type = 'donation'::public.listing_type then
    if caller_profile.account_type <> 'rescue'::public.account_type then
      raise exception 'RETAIL_RESCUE_DONATION_RESERVED' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.rescue_profiles rp
      where rp.owner_id = caller_id
        and rp.deleted_at is null
        and rp.is_active = true
        and rp.is_verified = true
        and rp.verification_status = 'verified'
    ) then
      raise exception 'RETAIL_VERIFIED_RESCUE_REQUIRED' using errcode = '42501';
    end if;
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


ALTER FUNCTION "public"."create_or_get_conversation"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_or_get_conversation_phase_f_base"("target_listing_id" "uuid") RETURNS "public"."conversations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  listing_row public.listings%rowtype;
  existing_row public.conversations%rowtype;
  inserted_row public.conversations%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required'; end if;
  if not private.is_account_active(caller_id) then raise exception 'Account is not active'; end if;
  select * into listing_row from public.listings l where l.id = target_listing_id and l.status = 'active' and l.deleted_at is null;
  if not found then raise exception 'Listing is not available'; end if;
  if listing_row.seller_id = caller_id then raise exception 'Users cannot message themselves'; end if;
  if not private.is_account_active(listing_row.seller_id) then raise exception 'Seller account is not active'; end if;
  if private.is_blocked_between(caller_id, listing_row.seller_id) then raise exception 'Blocked users cannot start conversations'; end if;
  select * into existing_row from public.conversations c where c.listing_id = target_listing_id and c.buyer_id = caller_id and c.seller_id = listing_row.seller_id and c.deleted_at is null;
  if found then return existing_row; end if;
  perform set_config('retail.trusted_conversation_update', 'true', true);
  insert into public.conversations (listing_id, buyer_id, seller_id, created_at, updated_at)
  values (target_listing_id, caller_id, listing_row.seller_id, now(), now())
  on conflict (listing_id, buyer_id, seller_id) do update set deleted_at = null, updated_at = now()
  returning * into inserted_row;
  perform set_config('retail.trusted_conversation_update', 'false', true);
  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'moderator_action', 'conversations', inserted_row.id, jsonb_build_object('action', 'conversation_created', 'listing_id', target_listing_id));
  return inserted_row;
end;
$$;


ALTER FUNCTION "public"."create_or_get_conversation_phase_f_base"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_saved_search_notifications_for_listing"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
        or pg_catalog.btrim(ss.search_query) = ''
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

  perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'true', true);

  update public.saved_searches ss
  set last_notified_at = now()
  where ss.deleted_at is null
    and ss.notifications_enabled = true
    and ss.user_id <> new.seller_id
    and (
      ss.search_query is null
      or pg_catalog.btrim(ss.search_query) = ''
      or new.title ilike '%' || ss.search_query || '%'
      or new.description ilike '%' || ss.search_query || '%'
      or coalesce(new.brand, '') ilike '%' || ss.search_query || '%'
    )
    and (ss.category_id is null or ss.category_id = new.category_id)
    and (ss.min_price is null or coalesce(new.price, 0) >= ss.min_price)
    and (ss.max_price is null or coalesce(new.price, 0) <= ss.max_price)
    and (ss.condition is null or ss.condition = new.condition)
    and (ss.listing_type is null or ss.listing_type = new.listing_type);

  perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'false', true);

  return new;
exception
  when others then
    perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'false', true);
    raise;
end;
$$;


ALTER FUNCTION "public"."create_saved_search_notifications_for_listing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_stripe_payment_notification"("p_user_id" "uuid", "p_notification_type" "public"."notification_type", "p_title" "text", "p_body" "text", "p_route" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb", "p_dedupe_key" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_notification_type not in (
    'transaction_completed'::public.notification_type,
    'listing_sold'::public.notification_type,
    'system'::public.notification_type
  ) then
    raise exception 'RETAIL_STRIPE_NOTIFICATION_INVALID'
      using errcode = '22023';
  end if;

  return private.create_notification_for_event(
    p_user_id,
    p_notification_type,
    p_title,
    p_body,
    p_route,
    p_data,
    p_dedupe_key
  );
end;
$$;


ALTER FUNCTION "public"."create_stripe_payment_notification"("p_user_id" "uuid", "p_notification_type" "public"."notification_type", "p_title" "text", "p_body" "text", "p_route" "text", "p_data" "jsonb", "p_dedupe_key" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "reviewee_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "review_has_two_people" CHECK (("reviewer_id" <> "reviewee_id")),
    CONSTRAINT "reviews_comment_check" CHECK ((("comment" IS NULL) OR ("char_length"("comment") <= 1000))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_transaction_review"("target_transaction_id" "uuid", "requested_rating" integer, "requested_comment" "text" DEFAULT NULL::"text") RETURNS "public"."reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_transaction_review"("target_transaction_id" "uuid", "requested_rating" integer, "requested_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_transaction_support_case"("target_transaction_id" "uuid", "requested_requester_role" "text", "requested_issue_category" "text", "requested_description" "text") RETURNS "public"."support_cases"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
  transaction_row public.transactions;
  inserted_case public.support_cases;
  safe_role public.support_case_requester_role;
  safe_category public.support_case_issue_category;
  safe_description text := btrim(coalesce(requested_description, ''));
begin
  if target_transaction_id is null then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into transaction_row
  from public.transactions
  where id = target_transaction_id
    and deleted_at is null
  for share;

  if not found then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if transaction_row.buyer_id is null or transaction_row.seller_id is null then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_PARTIES_REQUIRED'
      using errcode = '22023';
  end if;

  if caller_id not in (transaction_row.buyer_id, transaction_row.seller_id) then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_FORBIDDEN'
      using errcode = '42501';
  end if;

  if safe_description = '' or char_length(safe_description) < 10 then
    raise exception 'RETAIL_SUPPORT_DESCRIPTION_REQUIRED'
      using errcode = '22023';
  end if;

  if char_length(safe_description) > 4000 then
    raise exception 'RETAIL_SUPPORT_DESCRIPTION_TOO_LONG'
      using errcode = '22023';
  end if;

  if requested_requester_role not in ('buyer', 'seller') then
    raise exception 'RETAIL_SUPPORT_REQUESTER_ROLE_INVALID'
      using errcode = '22023';
  end if;

  safe_role := requested_requester_role::public.support_case_requester_role;

  if safe_role = 'buyer' and caller_id is distinct from transaction_row.buyer_id then
    raise exception 'RETAIL_SUPPORT_BUYER_REQUIRED'
      using errcode = '42501';
  end if;

  if safe_role = 'seller' and caller_id is distinct from transaction_row.seller_id then
    raise exception 'RETAIL_SUPPORT_SELLER_REQUIRED'
      using errcode = '42501';
  end if;

  if requested_issue_category not in (
    'cancel_order',
    'seller_not_shipped',
    'package_not_arrived',
    'item_arrived_damaged',
    'item_not_as_described',
    'wrong_item_received',
    'return_refund_request',
    'payment_problem',
    'payout_problem',
    'shipping_problem',
    'buyer_transaction_issue',
    'other_order_issue',
    'other_sale_issue'
  ) then
    raise exception 'RETAIL_SUPPORT_ISSUE_CATEGORY_INVALID'
      using errcode = '22023';
  end if;

  safe_category := requested_issue_category::public.support_case_issue_category;

  insert into public.support_cases (
    transaction_id,
    listing_id,
    buyer_id,
    seller_id,
    requester_id,
    requester_role,
    issue_category,
    description,
    current_payment_status
  )
  values (
    transaction_row.id,
    transaction_row.listing_id,
    transaction_row.buyer_id,
    transaction_row.seller_id,
    caller_id,
    safe_role,
    safe_category,
    safe_description,
    transaction_row.payment_status
  )
  returning * into inserted_case;

  return inserted_case;
end;
$$;


ALTER FUNCTION "public"."create_transaction_support_case"("target_transaction_id" "uuid", "requested_requester_role" "text", "requested_issue_category" "text", "requested_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_notification"("target_user_id" "uuid", "notification_type_value" "public"."notification_type", "notification_title" "text" DEFAULT NULL::"text", "notification_body" "text" DEFAULT NULL::"text", "notification_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  active_user_id uuid := auth.uid();
  inserted_notification_id uuid;
  safe_title text;
  safe_body text;
  conversation_id uuid := public.uuid_or_null(notification_data ->> 'conversationId');
  message_id uuid := public.uuid_or_null(notification_data ->> 'messageId');
  listing_id uuid := public.uuid_or_null(notification_data ->> 'listingId');
  review_id uuid := public.uuid_or_null(notification_data ->> 'reviewId');
  transaction_id uuid := public.uuid_or_null(notification_data ->> 'transactionId');
begin
  if active_user_id is null or not private.is_account_active(active_user_id) then
    raise exception 'Not authenticated';
  end if;

  if notification_type_value = 'message' then
    if not exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_id
        and c.id = conversation_id
        and m.sender_id = active_user_id
        and target_user_id in (c.buyer_id, c.seller_id)
        and target_user_id <> active_user_id
        and not private.is_blocked_between(c.buyer_id, c.seller_id)
    ) then
      raise exception 'Invalid message notification';
    end if;
    safe_title := 'New message';
    safe_body := 'You received a message.';
  elsif notification_type_value = 'favorite' then
    if not exists (
      select 1
      from public.favorites f
      join public.listings l on l.id = f.listing_id
      where f.user_id = active_user_id
        and f.listing_id = listing_id
        and l.seller_id = target_user_id
        and target_user_id <> active_user_id
        and not private.is_blocked_between(active_user_id, target_user_id)
    ) then
      raise exception 'Invalid favorite notification';
    end if;
    safe_title := 'Listing favorited';
    safe_body := 'Someone saved your listing.';
  elsif notification_type_value = 'review' then
    if not exists (
      select 1
      from public.reviews r
      where r.id = review_id
        and r.reviewer_id = active_user_id
        and r.reviewee_id = target_user_id
        and r.deleted_at is null
    ) then
      raise exception 'Invalid review notification';
    end if;
    safe_title := 'New review';
    safe_body := 'You received a review.';
  elsif notification_type_value = 'transaction_completed' then
    if not exists (
      select 1
      from public.transactions t
      where t.id = transaction_id
        and t.status = 'completed'
        and active_user_id = t.seller_id
        and target_user_id = t.buyer_id
    ) then
      raise exception 'Invalid transaction notification';
    end if;
    safe_title := 'Transaction completed';
    safe_body := 'A listing was marked complete. You can leave a review.';
  elsif notification_type_value in ('listing_sold', 'listing_donated') then
    if target_user_id <> active_user_id
      or not exists (
        select 1
        from public.listings l
        where l.id = listing_id
          and l.seller_id = active_user_id
          and l.status in ('sold', 'donated')
      ) then
      raise exception 'Invalid listing status notification';
    end if;
    safe_title := coalesce(nullif(btrim(notification_title), ''), 'Listing updated');
    safe_body := 'Your listing status was updated.';
  elsif notification_type_value = 'system' then
    if not private.is_admin(active_user_id) then
      raise exception 'Only admins can create system notifications';
    end if;
    safe_title := coalesce(nullif(btrim(notification_title), ''), 'ReTail update');
    safe_body := coalesce(nullif(btrim(notification_body), ''), 'You have a ReTail update.');
  else
    raise exception 'Unsupported client notification type';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (target_user_id, notification_type_value, safe_title, safe_body, coalesce(notification_data, '{}'::jsonb))
  returning id into inserted_notification_id;

  return inserted_notification_id;
end;
$$;


ALTER FUNCTION "public"."create_user_notification"("target_user_id" "uuid", "notification_type_value" "public"."notification_type", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_favorite_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update listings
  set favorite_count = greatest(favorite_count - 1, 0)
  where id = old.listing_id;
  return old;
end;
$$;


ALTER FUNCTION "public"."decrement_favorite_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_listing"("target_listing_id" "uuid") RETURNS "public"."listings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_listing public.listings;
begin
  if caller_id is null or not private.is_account_active(caller_id) then raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501'; end if;
  insert into public.storage_cleanup_jobs (bucket_id, object_path, source_table, source_id, reason)
  select 'listings', private.public_storage_path_from_url('listings', li.image_url), 'listings', target_listing_id, 'listing_removed'
  from public.listing_images li join public.listings l on l.id = li.listing_id
  where li.listing_id = target_listing_id and l.seller_id = caller_id and private.public_storage_path_from_url('listings', li.image_url) is not null
  on conflict (bucket_id, object_path, source_table, source_id, reason) do nothing;
  update public.listings set status = 'removed'::public.listing_status, deleted_at = now() where id = target_listing_id and seller_id = caller_id and deleted_at is null returning * into updated_listing;
  if not found then raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata) values (caller_id, 'listing_deleted', 'listings', target_listing_id, jsonb_build_object('source', 'delete_my_listing', 'storage_cleanup', 'queued'));
  return updated_listing;
end;
$$;


ALTER FUNCTION "public"."delete_my_listing"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."notification_type" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dedupe_key" "text",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "notifications_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 500))),
    CONSTRAINT "notifications_dedupe_key_length" CHECK ((("dedupe_key" IS NULL) OR (("char_length"("dedupe_key") >= 1) AND ("char_length"("dedupe_key") <= 240)))),
    CONSTRAINT "notifications_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 120)))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_notification"("target_notification_id" "uuid") RETURNS "public"."notifications"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."delete_my_notification"("target_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."distance_band"("distance_miles" double precision) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when distance_miles is null then null
    when distance_miles < 5 then 'Under 5 miles'
    when distance_miles < 10 then '5-10 miles'
    when distance_miles < 25 then '10-25 miles'
    when distance_miles < 50 then '25-50 miles'
    else '50+ miles'
  end;
$$;


ALTER FUNCTION "public"."distance_band"("distance_miles" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_listing_image_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if (select count(*) from public.listing_images where listing_id = new.listing_id) >= 15 then
    raise exception 'RETAIL_LISTING_IMAGE_LIMIT'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_listing_image_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_paid_listing_payout_readiness"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  requires_guard boolean;
begin
  requires_guard := new.deleted_at is null
    and new.status = 'active'::public.listing_status
    and new.listing_type = 'sale'::public.listing_type
    and coalesce(new.price, 0) > 0
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.listing_type is distinct from new.listing_type
      or coalesce(old.price, 0) <= 0
      or old.seller_id is distinct from new.seller_id
    );

  if requires_guard and not private.seller_payout_ready(new.seller_id) then
    raise exception 'RETAIL_SELLER_PAYOUT_REQUIRED'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_paid_listing_payout_readiness"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_report_queue"("requested_view" "text" DEFAULT 'active'::"text") RETURNS SETOF "public"."reports"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
  safe_view text := coalesce(nullif(btrim(requested_view), ''), 'active');
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if safe_view not in ('active', 'archived') then
    raise exception 'RETAIL_REPORT_VIEW_INVALID' using errcode = '22023';
  end if;

  return query
  select r.*
  from public.reports r
  where r.report_type in ('listing'::public.report_type, 'message'::public.report_type, 'user'::public.report_type)
    and (
      (safe_view = 'archived' and r.status in ('resolved'::public.report_status, 'dismissed'::public.report_status))
      or (safe_view = 'active' and r.status in ('open'::public.report_status, 'reviewing'::public.report_status))
    )
  order by r.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_admin_report_queue"("requested_view" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_transaction_support_cases"("requested_view" "text" DEFAULT 'active'::"text") RETURNS SETOF "public"."support_cases"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
  safe_view text := coalesce(nullif(btrim(requested_view), ''), 'active');
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  if safe_view not in ('active', 'archived') then
    raise exception 'RETAIL_SUPPORT_VIEW_INVALID'
      using errcode = '22023';
  end if;

  return query
  select sc.*
  from public.support_cases sc
  where sc.deleted_at is null
    and (
      (safe_view = 'active' and sc.status in ('open', 'reviewing', 'waiting_on_buyer', 'waiting_on_seller'))
      or (safe_view = 'archived' and sc.status in ('resolved', 'closed'))
    )
  order by sc.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_admin_transaction_support_cases"("requested_view" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_marketplace_search_areas"() RETURNS TABLE("id" "uuid", "slug" "text", "label" "text", "city" "text", "state" "text", "region_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    msa.id,
    msa.slug,
    msa.label,
    msa.city,
    msa.state,
    msa.region_name
  from public.marketplace_search_areas msa
  where msa.is_active = true
  order by msa.state asc, msa.label asc;
$$;


ALTER FUNCTION "public"."get_marketplace_search_areas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_consent_state"() RETURNS TABLE("has_current_policy_acceptance" boolean, "terms_accepted" boolean, "community_guidelines_accepted" boolean, "privacy_acknowledged" boolean, "marketing_email_opt_in" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  return query
  select
    private.has_current_policy_acceptance(caller_id),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'terms_of_service'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    ),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'community_guidelines'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    ),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'privacy_acknowledgment'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    ),
    private.latest_marketing_email_preference(caller_id);
end;
$$;


ALTER FUNCTION "public"."get_my_consent_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_listings"() RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
begin
  return query
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', p.city,
      'state', p.state,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc, li.created_at asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    null::text as distance_band
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  where l.seller_id = caller_id
    and l.deleted_at is null
  order by l.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_my_listings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_marketplace_search_preference"() RETURNS TABLE("search_area_id" "uuid", "radius_miles" integer, "label" "text", "city" "text", "state" "text", "region_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    pref.search_area_id,
    pref.radius_miles,
    msa.label,
    msa.city,
    msa.state,
    msa.region_name
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = (select auth.uid())
    and msa.is_active = true
    and public.is_account_active();
$$;


ALTER FUNCTION "public"."get_my_marketplace_search_preference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_notification_preferences"() RETURNS TABLE("in_app_messages" boolean, "in_app_favorites" boolean, "in_app_reviews" boolean, "in_app_marketplace_updates" boolean, "in_app_system" boolean, "push_messages" boolean, "push_favorites" boolean, "push_reviews" boolean, "push_marketplace_updates" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_my_notification_preferences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_reports"() RETURNS TABLE("id" "uuid", "report_type" "public"."report_type", "reported_user_id" "uuid", "listing_id" "uuid", "message_id" "uuid", "reason" "public"."report_reason", "details" "text", "status" "public"."report_status", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "resolved_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_my_reports"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_transaction_support_cases"() RETURNS SETOF "public"."support_cases"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := private.require_active_account();
begin
  return query
  select sc.*
  from public.support_cases sc
  where sc.deleted_at is null
    and (
      sc.requester_id = caller_id
      or sc.buyer_id = caller_id
      or sc.seller_id = caller_id
    )
  order by sc.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_my_transaction_support_cases"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_listings"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "category_filter" "uuid" DEFAULT NULL::"uuid", "search_query" "text" DEFAULT NULL::"text", "min_price_filter" numeric DEFAULT NULL::numeric, "max_price_filter" numeric DEFAULT NULL::numeric, "condition_filter" "public"."listing_condition" DEFAULT NULL::"public"."listing_condition", "listing_type_filter" "public"."listing_type" DEFAULT NULL::"public"."listing_type") RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_nearby_listings"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_listings_phase_f_base"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "category_filter" "uuid" DEFAULT NULL::"uuid", "search_query" "text" DEFAULT NULL::"text", "min_price_filter" numeric DEFAULT NULL::numeric, "max_price_filter" numeric DEFAULT NULL::numeric, "condition_filter" "public"."listing_condition" DEFAULT NULL::"public"."listing_condition", "listing_type_filter" "public"."listing_type" DEFAULT NULL::"public"."listing_type") RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := (select auth.uid());
  origin_search_area_id uuid;
  origin_centroid public.geography;
  caller_radius_miles integer;
begin
  if caller_id is null or not public.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select
    pref.search_area_id,
    msa.centroid,
    pref.radius_miles
  into origin_search_area_id, origin_centroid, caller_radius_miles
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = caller_id
    and msa.is_active = true
    and pref.radius_miles in (10, 25, 50, 100);

  if origin_search_area_id is null or origin_centroid is null or caller_radius_miles is null then
    raise exception 'RETAIL_SEARCH_AREA_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      l.*,
      public.st_distance(destination_area.centroid, origin_centroid) / 1609.344 as coarse_distance_miles,
      destination_area.id = origin_search_area_id as same_search_area
    from public.listings l
    join public.marketplace_search_areas destination_area
      on destination_area.id = l.search_area_id
      and destination_area.is_active = true
    where public.st_dwithin(destination_area.centroid, origin_centroid, caller_radius_miles * 1609.344)
  )
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    case when coalesce(ps.allow_approximate_distance, true)
      then public.marketplace_area_distance_band(l.coarse_distance_miles, l.same_search_area)
      else null
    end as distance_band
  from ranked l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
    and (category_filter is null or l.category_id = category_filter)
    and (search_query is null or search_query = '' or (
      l.title ilike '%' || search_query || '%'
      or l.description ilike '%' || search_query || '%'
      or coalesce(l.brand, '') ilike '%' || search_query || '%'
    ))
    and (min_price_filter is null or l.price >= min_price_filter)
    and (max_price_filter is null or l.price <= max_price_filter)
    and (condition_filter is null or l.condition = condition_filter)
    and (listing_type_filter is null or l.listing_type = listing_type_filter)
    and not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = caller_id and b.blocked_id = l.seller_id)
         or (b.blocked_id = caller_id and b.blocker_id = l.seller_id)
    )
  order by
    public.marketplace_area_distance_rank(l.coarse_distance_miles, l.same_search_area) asc,
    l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;


ALTER FUNCTION "public"."get_nearby_listings_phase_f_base"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_listings_sorted"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "category_filter" "uuid" DEFAULT NULL::"uuid", "search_query" "text" DEFAULT NULL::"text", "min_price_filter" numeric DEFAULT NULL::numeric, "max_price_filter" numeric DEFAULT NULL::numeric, "condition_filter" "public"."listing_condition" DEFAULT NULL::"public"."listing_condition", "listing_type_filter" "public"."listing_type" DEFAULT NULL::"public"."listing_type", "sort_order" "text" DEFAULT 'recent'::"text") RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := (select auth.uid());
  origin_search_area_id uuid;
  origin_centroid public.geography;
  caller_radius_miles integer;
  safe_sort text := case
    when sort_order in ('recent', 'price_asc', 'price_desc', 'distance', 'favorites') then sort_order
    else 'recent'
  end;
begin
  perform private.require_active_account();
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  select
    pref.search_area_id,
    msa.centroid,
    pref.radius_miles
  into origin_search_area_id, origin_centroid, caller_radius_miles
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = caller_id
    and msa.is_active = true
    and pref.radius_miles in (10, 25, 50, 100);

  if origin_search_area_id is null or origin_centroid is null or caller_radius_miles is null then
    raise exception 'RETAIL_SEARCH_AREA_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      l.*,
      public.st_distance(destination_area.centroid, origin_centroid) / 1609.344 as coarse_distance_miles,
      destination_area.id = origin_search_area_id as same_search_area
    from public.listings l
    join public.marketplace_search_areas destination_area
      on destination_area.id = l.search_area_id
      and destination_area.is_active = true
    where public.st_dwithin(destination_area.centroid, origin_centroid, caller_radius_miles * 1609.344)
  )
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    case when coalesce(ps.allow_approximate_distance, true)
      then public.marketplace_area_distance_band(l.coarse_distance_miles, l.same_search_area)
      else null
    end as distance_band
  from ranked l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
    and (category_filter is null or l.category_id = category_filter)
    and (search_query is null or search_query = '' or (
      l.title ilike '%' || search_query || '%'
      or l.description ilike '%' || search_query || '%'
      or coalesce(l.brand, '') ilike '%' || search_query || '%'
    ))
    and (min_price_filter is null or l.price >= min_price_filter)
    and (max_price_filter is null or l.price <= max_price_filter)
    and (condition_filter is null or l.condition = condition_filter)
    and (listing_type_filter is null or l.listing_type = listing_type_filter)
    and not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = caller_id and b.blocked_id = l.seller_id)
         or (b.blocked_id = caller_id and b.blocker_id = l.seller_id)
    )
  order by
    case when safe_sort = 'distance' then public.marketplace_area_distance_rank(l.coarse_distance_miles, l.same_search_area) end asc,
    case when safe_sort = 'price_asc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else 0 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then 0 else 1 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else -1 end end desc,
    case when safe_sort = 'favorites' then l.favorite_count end desc,
    l.published_at desc nulls last,
    l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;


ALTER FUNCTION "public"."get_nearby_listings_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_rescues"("search_query" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "website_url" "text", "contact_hint" "text", "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.require_active_account();
  perform private.ensure_public_search_bounds(1, 20, search_query);

  return query
  select *
  from public.get_nearby_rescues_phase_f_base(search_query);
end;
$$;


ALTER FUNCTION "public"."get_nearby_rescues"("search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_rescues_phase_f_base"("search_query" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "website_url" "text", "contact_hint" "text", "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := (select auth.uid());
  origin_search_area_id uuid;
  origin_centroid public.geography;
  caller_radius_miles integer;
begin
  if caller_id is null or not public.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select
    pref.search_area_id,
    msa.centroid,
    pref.radius_miles
  into origin_search_area_id, origin_centroid, caller_radius_miles
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = caller_id
    and msa.is_active = true
    and pref.radius_miles in (10, 25, 50, 100);

  if origin_search_area_id is null or origin_centroid is null or caller_radius_miles is null then
    raise exception 'RETAIL_SEARCH_AREA_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      rp.*,
      public.st_distance(destination_area.centroid, origin_centroid) / 1609.344 as coarse_distance_miles,
      destination_area.id = origin_search_area_id as same_search_area
    from public.rescue_profiles rp
    join public.marketplace_search_areas destination_area
      on destination_area.id = rp.search_area_id
      and destination_area.is_active = true
    where public.st_dwithin(destination_area.centroid, origin_centroid, caller_radius_miles * 1609.344)
  )
  select
    rp.id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rn.id,
            'item', rn.item,
            'quantity', rn.quantity,
            'urgency', rn.urgency,
            'notes', rn.notes
          )
          order by rn.created_at desc
        ),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id
        and rn.is_active = true
        and rn.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rwi.id,
            'item', rwi.item,
            'quantity', rwi.quantity,
            'priority', rwi.priority,
            'notes', rwi.notes
          )
          order by rwi.created_at desc
        ),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id
        and rwi.is_active = true
        and rwi.deleted_at is null
    ) as wishlist_items,
    case when coalesce(ps.allow_approximate_distance, true)
      then public.marketplace_area_distance_band(rp.coarse_distance_miles, rp.same_search_area)
      else null
    end as distance_band
  from ranked rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null
    and (search_query is null or search_query = '' or (
      rp.name ilike '%' || search_query || '%'
      or rp.summary ilike '%' || search_query || '%'
      or coalesce(rp.website_url, '') ilike '%' || search_query || '%'
      or array_to_string(rp.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1
        from public.rescue_needs rn
        where rn.rescue_id = rp.id
          and rn.is_active = true
          and rn.deleted_at is null
          and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1
        from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id
          and rwi.is_active = true
          and rwi.deleted_at is null
          and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by
    public.marketplace_area_distance_rank(rp.coarse_distance_miles, rp.same_search_area) asc,
    rp.name asc;
end;
$$;


ALTER FUNCTION "public"."get_nearby_rescues_phase_f_base"("search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_rescues_v2"("search_query" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "owner_id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "zip_code" "text", "address_line1" "text", "address_line2" "text", "website_url" "text", "contact_hint" "text", "organization_type" "text", "has_501c3" boolean, "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := (select auth.uid());
  origin_search_area_id uuid;
  origin_centroid public.geography;
  caller_radius_miles integer;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform private.ensure_public_search_bounds(1, 20, search_query);

  select pref.search_area_id, msa.centroid, pref.radius_miles
  into origin_search_area_id, origin_centroid, caller_radius_miles
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = caller_id and msa.is_active = true and pref.radius_miles in (10, 25, 50, 100);

  if origin_search_area_id is null or origin_centroid is null or caller_radius_miles is null then
    raise exception 'RETAIL_SEARCH_AREA_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      rp.*,
      public.st_distance(destination_area.centroid, origin_centroid) / 1609.344 as coarse_distance_miles,
      destination_area.id = origin_search_area_id as same_search_area
    from public.rescue_profiles rp
    join public.marketplace_search_areas destination_area on destination_area.id = rp.search_area_id and destination_area.is_active = true
    where public.st_dwithin(destination_area.centroid, origin_centroid, caller_radius_miles * 1609.344)
  )
  select
    rp.id,
    rp.owner_id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    case when rp.organization_type = 'physical_location' then rp.zip_code else null end,
    case when rp.organization_type = 'physical_location' then rp.address_line1 else null end,
    case when rp.organization_type = 'physical_location' then rp.address_line2 else null end,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end,
    rp.organization_type,
    rp.has_501c3,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ),
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ),
    case when coalesce(ps.allow_approximate_distance, true)
      then public.marketplace_area_distance_band(rp.coarse_distance_miles, rp.same_search_area)
      else null
    end
  from ranked rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null
    and (search_query is null or search_query = '' or (
      rp.name ilike '%' || search_query || '%'
      or rp.summary ilike '%' || search_query || '%'
      or coalesce(rp.website_url, '') ilike '%' || search_query || '%'
      or array_to_string(rp.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1 from public.rescue_needs rn
        where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1 from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by public.marketplace_area_distance_rank(rp.coarse_distance_miles, rp.same_search_area) asc, rp.name asc;
end;
$$;


ALTER FUNCTION "public"."get_nearby_rescues_v2"("search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_listing_detail"("target_listing_id" "uuid") RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "related_listings" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', rl.id,
            'seller_id', rl.seller_id,
            'category_id', rl.category_id,
            'title', rl.title,
            'description', rl.description,
            'price', rl.price,
            'listing_type', rl.listing_type,
            'condition', rl.condition,
            'status', rl.status,
            'brand', rl.brand,
            'city', rl.city,
            'state', rl.state,
            'pickup_available', rl.pickup_available,
            'porch_pickup_available', rl.porch_pickup_available,
            'meetup_available', rl.meetup_available,
            'shipping_available', rl.shipping_available,
            'published_at', rl.published_at,
            'created_at', rl.created_at,
            'category', jsonb_build_object('id', rc.id, 'name', rc.name, 'slug', rc.slug, 'icon', rc.icon),
            'seller', jsonb_build_object(
              'id', rp.id,
              'account_type', rp.account_type,
              'display_name', rp.display_name,
              'username', rp.username,
              'avatar_url', rp.avatar_url,
              'seller_rating', rp.seller_rating,
              'review_count', rp.review_count,
              'listings_count', rp.listings_count,
              'is_verified', rp.is_verified
            ),
            'images', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', rli.id,
                  'listing_id', rli.listing_id,
                  'image_url', rli.image_url,
                  'thumbnail_url', rli.thumbnail_url,
                  'sort_order', rli.sort_order,
                  'alt_text', rli.alt_text,
                  'created_at', rli.created_at
                )
                order by rli.sort_order asc
              )
              from public.listing_images rli
              where rli.listing_id = rl.id
            ), '[]'::jsonb)
          )
          order by rl.created_at desc
        )
        from public.listings rl
        join public.categories rc on rc.id = rl.category_id
        join public.profiles rp on rp.id = rl.seller_id
        left join public.privacy_settings rps on rps.user_id = rp.id
        where rl.category_id = l.category_id
          and rl.id <> l.id
          and rl.status = 'active'
          and rl.deleted_at is null
          and rp.deleted_at is null
          and rp.is_banned = false
          and coalesce(rps.profile_discoverable, true) = true
        limit 4
      ),
      '[]'::jsonb
    ) as related_listings
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.id = target_listing_id
    and l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true;
$$;


ALTER FUNCTION "public"."get_public_listing_detail"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_listing_feed"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "category_filter" "uuid" DEFAULT NULL::"uuid", "search_query" "text" DEFAULT NULL::"text", "min_price_filter" numeric DEFAULT NULL::numeric, "max_price_filter" numeric DEFAULT NULL::numeric, "condition_filter" "public"."listing_condition" DEFAULT NULL::"public"."listing_condition", "listing_type_filter" "public"."listing_type" DEFAULT NULL::"public"."listing_type", "city_filter" "text" DEFAULT NULL::"text", "state_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_public_listing_feed"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_listing_feed_phase_f_base"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "category_filter" "uuid" DEFAULT NULL::"uuid", "search_query" "text" DEFAULT NULL::"text", "min_price_filter" numeric DEFAULT NULL::numeric, "max_price_filter" numeric DEFAULT NULL::numeric, "condition_filter" "public"."listing_condition" DEFAULT NULL::"public"."listing_condition", "listing_type_filter" "public"."listing_type" DEFAULT NULL::"public"."listing_type", "city_filter" "text" DEFAULT NULL::"text", "state_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    null::text as distance_band
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
    and (category_filter is null or l.category_id = category_filter)
    and (city_filter is null or city_filter = '' or lower(l.city) = lower(city_filter))
    and (state_filter is null or state_filter = '' or lower(l.state) = lower(state_filter))
    and (search_query is null or search_query = '' or (
      l.title ilike '%' || search_query || '%'
      or l.description ilike '%' || search_query || '%'
      or coalesce(l.brand, '') ilike '%' || search_query || '%'
    ))
    and (min_price_filter is null or l.price >= min_price_filter)
    and (max_price_filter is null or l.price <= max_price_filter)
    and (condition_filter is null or l.condition = condition_filter)
    and (listing_type_filter is null or l.listing_type = listing_type_filter)
    and not exists (
      select 1
      from public.blocks b
      where (select auth.uid()) is not null
        and (
          (b.blocker_id = (select auth.uid()) and b.blocked_id = l.seller_id)
          or (b.blocked_id = (select auth.uid()) and b.blocker_id = l.seller_id)
        )
    )
  order by l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;


ALTER FUNCTION "public"."get_public_listing_feed_phase_f_base"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_listing_feed_sorted"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "category_filter" "uuid" DEFAULT NULL::"uuid", "search_query" "text" DEFAULT NULL::"text", "min_price_filter" numeric DEFAULT NULL::numeric, "max_price_filter" numeric DEFAULT NULL::numeric, "condition_filter" "public"."listing_condition" DEFAULT NULL::"public"."listing_condition", "listing_type_filter" "public"."listing_type" DEFAULT NULL::"public"."listing_type", "city_filter" "text" DEFAULT NULL::"text", "state_filter" "text" DEFAULT NULL::"text", "sort_order" "text" DEFAULT 'recent'::"text") RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  safe_sort text := case
    when sort_order in ('recent', 'price_asc', 'price_desc', 'distance', 'favorites') then sort_order
    else 'recent'
  end;
begin
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  return query
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    null::text as distance_band
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
    and (category_filter is null or l.category_id = category_filter)
    and (city_filter is null or city_filter = '' or lower(l.city) = lower(city_filter))
    and (state_filter is null or state_filter = '' or lower(l.state) = lower(state_filter))
    and (search_query is null or search_query = '' or (
      l.title ilike '%' || search_query || '%'
      or l.description ilike '%' || search_query || '%'
      or coalesce(l.brand, '') ilike '%' || search_query || '%'
    ))
    and (min_price_filter is null or l.price >= min_price_filter)
    and (max_price_filter is null or l.price <= max_price_filter)
    and (condition_filter is null or l.condition = condition_filter)
    and (listing_type_filter is null or l.listing_type = listing_type_filter)
    and not exists (
      select 1
      from public.blocks b
      where (select auth.uid()) is not null
        and (
          (b.blocker_id = (select auth.uid()) and b.blocked_id = l.seller_id)
          or (b.blocked_id = (select auth.uid()) and b.blocker_id = l.seller_id)
        )
    )
  order by
    case when safe_sort = 'price_asc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else 0 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then 0 else 1 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else -1 end end desc,
    case when safe_sort = 'favorites' then l.favorite_count end desc,
    l.published_at desc nulls last,
    l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;


ALTER FUNCTION "public"."get_public_listing_feed_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_profile"("target_user_id" "uuid") RETURNS TABLE("id" "uuid", "account_type" "public"."account_type", "display_name" "text", "username" "text", "bio" "text", "avatar_url" "text", "city" "text", "state" "text", "buyer_rating" numeric, "seller_rating" numeric, "review_count" integer, "listings_count" integer, "completed_sales_count" integer, "is_verified" boolean, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    p.id,
    p.account_type,
    p.display_name,
    p.username::text,
    p.bio,
    p.avatar_url,
    case when coalesce(ps.show_city_state, true) then p.city else null end as city,
    case when coalesce(ps.show_city_state, true) then p.state else null end as state,
    p.buyer_rating,
    p.seller_rating,
    p.review_count,
    p.listings_count,
    p.completed_sales_count,
    p.is_verified,
    p.created_at
  from public.profiles p
  left join public.privacy_settings ps on ps.user_id = p.id
  where p.id = target_user_id
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true;
$$;


ALTER FUNCTION "public"."get_public_profile"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_rescue"("target_rescue_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "website_url" "text", "contact_hint" "text", "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    rp.id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ) as wishlist_items,
    null::text as distance_band
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.id = target_rescue_id
    and rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null;
$$;


ALTER FUNCTION "public"."get_public_rescue"("target_rescue_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_rescue_by_owner"("target_owner_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "website_url" "text", "contact_hint" "text", "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    rp.id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ) as wishlist_items,
    null::text as distance_band
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.owner_id = target_owner_id
    and rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null;
$$;


ALTER FUNCTION "public"."get_public_rescue_by_owner"("target_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_rescue_by_owner_v2"("target_owner_id" "uuid") RETURNS TABLE("id" "uuid", "owner_id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "zip_code" "text", "address_line1" "text", "address_line2" "text", "website_url" "text", "contact_hint" "text", "organization_type" "text", "has_501c3" boolean, "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    rp.id,
    rp.owner_id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.zip_code else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line1 else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line2 else null end,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end,
    rp.organization_type,
    rp.has_501c3,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ),
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ),
    null::text
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.owner_id = target_owner_id
    and rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null;
$$;


ALTER FUNCTION "public"."get_public_rescue_by_owner_v2"("target_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_rescue_feed"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "search_query" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "website_url" "text", "contact_hint" "text", "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  return query
  select *
  from public.get_public_rescue_feed_phase_f_base(page_number, page_size, search_query);
end;
$$;


ALTER FUNCTION "public"."get_public_rescue_feed"("page_number" integer, "page_size" integer, "search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_rescue_feed_phase_f_base"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "search_query" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "website_url" "text", "contact_hint" "text", "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    rp.id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rn.id,
            'item', rn.item,
            'quantity', rn.quantity,
            'urgency', rn.urgency,
            'notes', rn.notes
          )
          order by rn.created_at desc
        ),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id
        and rn.is_active = true
        and rn.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rwi.id,
            'item', rwi.item,
            'quantity', rwi.quantity,
            'priority', rwi.priority,
            'notes', rwi.notes
          )
          order by rwi.created_at desc
        ),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id
        and rwi.is_active = true
        and rwi.deleted_at is null
    ) as wishlist_items,
    null::text as distance_band
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null
    and (search_query is null or search_query = '' or (
      rp.name ilike '%' || search_query || '%'
      or rp.summary ilike '%' || search_query || '%'
      or coalesce(rp.website_url, '') ilike '%' || search_query || '%'
      or array_to_string(rp.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1
        from public.rescue_needs rn
        where rn.rescue_id = rp.id
          and rn.is_active = true
          and rn.deleted_at is null
          and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1
        from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id
          and rwi.is_active = true
          and rwi.deleted_at is null
          and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by rp.name asc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;


ALTER FUNCTION "public"."get_public_rescue_feed_phase_f_base"("page_number" integer, "page_size" integer, "search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_rescue_feed_v2"("page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20, "search_query" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "owner_id" "uuid", "name" "text", "slug" "text", "summary" "text", "animals_rescued" "text"[], "city" "text", "state" "text", "zip_code" "text", "address_line1" "text", "address_line2" "text", "website_url" "text", "contact_hint" "text", "organization_type" "text", "has_501c3" boolean, "is_verified" boolean, "needs" "jsonb", "wishlist_items" "jsonb", "distance_band" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    rp.id,
    rp.owner_id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.zip_code else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line1 else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line2 else null end,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end,
    rp.organization_type,
    rp.has_501c3,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ),
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ),
    null::text
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null
    and (search_query is null or search_query = '' or (
      rp.name ilike '%' || search_query || '%'
      or rp.summary ilike '%' || search_query || '%'
      or coalesce(rp.website_url, '') ilike '%' || search_query || '%'
      or array_to_string(rp.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1 from public.rescue_needs rn
        where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1 from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by rp.name asc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;


ALTER FUNCTION "public"."get_public_rescue_feed_v2"("page_number" integer, "page_size" integer, "search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_user_listings"("target_user_id" "uuid", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.ensure_public_search_bounds(page_number, page_size, null);

  return query
  select *
  from public.get_public_user_listings_phase_f_base(target_user_id, page_number, page_size);
end;
$$;


ALTER FUNCTION "public"."get_public_user_listings"("target_user_id" "uuid", "page_number" integer, "page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_user_listings_phase_f_base"("target_user_id" "uuid", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "seller_id" "uuid", "category_id" "uuid", "title" "text", "description" "text", "price" numeric, "listing_type" "public"."listing_type", "condition" "public"."listing_condition", "status" "public"."listing_status", "brand" "text", "item_dimensions" "text", "pet_size" "text", "condition_notes" "text", "availability_notes" "text", "reason_for_listing" "text", "safety_confirmed" boolean, "city" "text", "state" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "handling_time" "text", "view_count" integer, "favorite_count" integer, "message_count" integer, "published_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "category" "jsonb", "seller" "jsonb", "images" "jsonb", "distance_band" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    null::text as distance_band
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.seller_id = target_user_id
    and l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
  order by l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;


ALTER FUNCTION "public"."get_public_user_listings_phase_f_base"("target_user_id" "uuid", "page_number" integer, "page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_review_summary"("target_user_id" "uuid") RETURNS TABLE("average_rating" numeric, "review_count" integer, "rating_1_count" integer, "rating_2_count" integer, "rating_3_count" integer, "rating_4_count" integer, "rating_5_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_user_review_summary"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_existing_report"("report_target_type" "public"."report_type", "report_target_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."has_existing_report"("report_target_type" "public"."report_type", "report_target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_favorite_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update listings
  set favorite_count = favorite_count + 1
  where id = new.listing_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."increment_favorite_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_account_active"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.is_account_active(user_id);
$$;


ALTER FUNCTION "public"."is_account_active"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.is_admin(user_id);
$$;


ALTER FUNCTION "public"."is_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."mark_all_notifications_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_conversation_read"("target_conversation_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_count integer;
begin
  if caller_id is null then raise exception 'Authentication is required'; end if;
  if not private.is_account_active(caller_id) then raise exception 'Account is not active'; end if;
  if not private.is_conversation_participant(target_conversation_id, caller_id) then raise exception 'Conversation is not available'; end if;
  update public.messages m set is_read = true, read_at = coalesce(read_at, now()) where m.conversation_id = target_conversation_id and m.sender_id <> caller_id and m.is_read = false and m.deleted_at is null;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;


ALTER FUNCTION "public"."mark_conversation_read"("target_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_my_listing_donated"("target_listing_id" "uuid") RETURNS "public"."listings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_listing public.listings;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.listings
  set status = 'donated'::public.listing_status
  where id = target_listing_id
    and seller_id = caller_id
    and deleted_at is null
    and status in ('active'::public.listing_status, 'pending'::public.listing_status)
  returning * into updated_listing;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_updated', 'listings', target_listing_id, jsonb_build_object('status', 'donated'));

  return updated_listing;
end;
$$;


ALTER FUNCTION "public"."mark_my_listing_donated"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_my_listing_sold"("target_listing_id" "uuid") RETURNS "public"."listings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_listing public.listings;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.listings
  set status = 'sold'::public.listing_status
  where id = target_listing_id
    and seller_id = caller_id
    and deleted_at is null
    and status in ('active'::public.listing_status, 'pending'::public.listing_status)
  returning * into updated_listing;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_updated', 'listings', target_listing_id, jsonb_build_object('status', 'sold'));

  return updated_listing;
end;
$$;


ALTER FUNCTION "public"."mark_my_listing_sold"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("target_notification_id" "uuid") RETURNS "public"."notifications"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."mark_notification_read"("target_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_stripe_webhook_event_failed"("p_event_id" "text", "p_last_error" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  update public.stripe_webhook_events swe
  set processing_status = 'failed',
      last_error = left(nullif(btrim(coalesce(p_last_error, '')), ''), 1000),
      updated_at = now()
  where swe.event_id = p_event_id;
end;
$$;


ALTER FUNCTION "public"."mark_stripe_webhook_event_failed"("p_event_id" "text", "p_last_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_stripe_webhook_event_processed"("p_event_id" "text", "p_processing_status" "text" DEFAULT 'processed'::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if p_processing_status not in ('processed', 'ignored') then
    raise exception 'RETAIL_STRIPE_WEBHOOK_INVALID_STATUS'
      using errcode = '22023';
  end if;

  update public.stripe_webhook_events swe
  set processing_status = p_processing_status,
      processed_at = now(),
      last_error = null,
      updated_at = now()
  where swe.event_id = p_event_id;
end;
$$;


ALTER FUNCTION "public"."mark_stripe_webhook_event_processed"("p_event_id" "text", "p_processing_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marketplace_area_distance_band"("distance_miles" double precision, "same_area" boolean DEFAULT false) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when same_area then 'Same area'
    when distance_miles is null then null
    when distance_miles <= 10 then 'Nearby area'
    when distance_miles <= 25 then 'Within 25 miles'
    when distance_miles <= 50 then '25 to 50 miles'
    when distance_miles <= 100 then '50 to 100 miles'
    else '100+ miles'
  end;
$$;


ALTER FUNCTION "public"."marketplace_area_distance_band"("distance_miles" double precision, "same_area" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marketplace_area_distance_rank"("distance_miles" double precision, "same_area" boolean DEFAULT false) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when same_area then 0
    when distance_miles is null then 99
    when distance_miles <= 10 then 1
    when distance_miles <= 25 then 2
    when distance_miles <= 50 then 3
    when distance_miles <= 100 then 4
    else 5
  end;
$$;


ALTER FUNCTION "public"."marketplace_area_distance_rank"("distance_miles" double precision, "same_area" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marketplace_search_area_for_city_state"("input_city" "text", "input_state" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select msa.id
  from public.marketplace_search_areas msa
  where msa.is_active = true
    and msa.slug = case
      when lower(trim(coalesce(input_state, ''))) = 'il'
        and lower(trim(coalesce(input_city, ''))) in (
          'alton',
          'belleville',
          'bethalto',
          'collinsville',
          'edwardsville',
          'glen carbon',
          'granite city',
          'highland',
          'maryville',
          'ofallon',
          'o fallon',
          'st jacob',
          'st. jacob',
          'troy',
          'wood river'
        )
        then 'metro-east-area'
      when lower(trim(coalesce(input_state, ''))) = 'mo'
        and lower(trim(coalesce(input_city, ''))) in ('st louis', 'st. louis', 'saint louis')
        then 'greater-st-louis-area'
      when lower(trim(coalesce(input_state, ''))) = 'il'
        and lower(trim(coalesce(input_city, ''))) = 'springfield'
        then 'springfield-il-area'
      else null
    end
  limit 1;
$$;


ALTER FUNCTION "public"."marketplace_search_area_for_city_state"("input_city" "text", "input_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_account_deletion_for_user"("target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  profile_exists boolean := false;
  profile_updated integer := 0;
  archived_listings integer := 0;
  removed_favorites integer := 0;
  removed_saved_searches integer := 0;
  removed_notifications integer := 0;
  removed_device_tokens integer := 0;
  removed_notification_preferences integer := 0;
  removed_privacy_settings integer := 0;
  removed_owned_blocks integer := 0;
begin
  if target_user_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('retail-account-deletion:' || target_user_id::text, 0)
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', target_user_id::text, true);
  perform pg_catalog.set_config('retail.account_deletion_context', 'on', true);

  select exists (
    select 1
    from public.profiles profile
    where profile.id = target_user_id
  )
  into profile_exists;

  update public.listings listing
  set status = 'archived'::public.listing_status,
      deleted_at = coalesce(listing.deleted_at, now()),
      updated_at = now()
  where listing.seller_id = target_user_id
    and listing.status in (
      'draft'::public.listing_status,
      'active'::public.listing_status,
      'pending'::public.listing_status
    );
  get diagnostics archived_listings = row_count;

  delete from public.favorites favorite
  where favorite.user_id = target_user_id;
  get diagnostics removed_favorites = row_count;

  delete from public.saved_searches saved_search
  where saved_search.user_id = target_user_id;
  get diagnostics removed_saved_searches = row_count;

  delete from public.notifications notification
  where notification.user_id = target_user_id;
  get diagnostics removed_notifications = row_count;

  delete from public.device_tokens device_token
  where device_token.user_id = target_user_id;
  get diagnostics removed_device_tokens = row_count;

  delete from public.notification_preferences preference
  where preference.user_id = target_user_id;
  get diagnostics removed_notification_preferences = row_count;

  delete from public.privacy_settings privacy
  where privacy.user_id = target_user_id;
  get diagnostics removed_privacy_settings = row_count;

  delete from public.blocks block
  where block.blocker_id = target_user_id;
  get diagnostics removed_owned_blocks = row_count;

  update public.profiles profile
  set display_name = 'Deleted User',
      username = ('deleted_' || pg_catalog.substr(pg_catalog.md5(target_user_id::text), 1, 24))::public.citext,
      bio = null,
      avatar_url = null,
      city = null,
      state = null,
      zip_code = null,
      latitude = null,
      longitude = null,
      is_banned = true,
      deleted_at = coalesce(profile.deleted_at, now()),
      updated_at = now()
  where profile.id = target_user_id;
  get diagnostics profile_updated = row_count;

  if not exists (
    select 1
    from public.audit_logs audit
    where audit.event_type = 'account_deleted'::public.audit_event_type
      and audit.target_table = 'profiles'
      and audit.target_id = target_user_id
  ) then
    insert into public.audit_logs (
      actor_id,
      event_type,
      target_table,
      target_id,
      metadata,
      created_at
    )
    values (
      case when profile_exists then target_user_id else null end,
      'account_deleted'::public.audit_event_type,
      'profiles',
      target_user_id,
      pg_catalog.jsonb_build_object(
        'source', 'secure_account_deletion',
        'authDeletion', 'edge_function_required',
        'preparation', 'server_only',
        'profileFound', profile_exists,
        'profileUpdated', profile_updated > 0,
        'archivedListings', archived_listings,
        'removedFavorites', removed_favorites,
        'removedSavedSearches', removed_saved_searches,
        'removedNotifications', removed_notifications,
        'removedDeviceTokens', removed_device_tokens,
        'removedNotificationPreferences', removed_notification_preferences,
        'removedPrivacySettings', removed_privacy_settings,
        'removedOwnedBlocks', removed_owned_blocks,
        'retainedSafetyRecords', pg_catalog.jsonb_build_array(
          'transactions',
          'reviews',
          'messages',
          'reports',
          'report_moderation_events',
          'audit_logs'
        )
      ),
      now()
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'prepared', true,
    'profileFound', profile_exists,
    'profileAnonymized', profile_updated > 0,
    'archivedListings', archived_listings,
    'removedConvenienceRecords',
      removed_favorites
      + removed_saved_searches
      + removed_notifications
      + removed_device_tokens
      + removed_notification_preferences
      + removed_privacy_settings
      + removed_owned_blocks
  );
end;
$$;


ALTER FUNCTION "public"."prepare_account_deletion_for_user"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_coordinate_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and (new.latitude is not null or new.longitude is not null) then
      raise exception 'RETAIL_PROFILE_COORDINATES_LOCKED' using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
      and (new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude) then
      raise exception 'RETAIL_PROFILE_COORDINATES_LOCKED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_profile_coordinate_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_privilege_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  account_deletion_context boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.account_deletion_context', true), ''),
    'off'
  ) = 'on';
begin
  if account_deletion_context
    and tg_op = 'UPDATE'
    and new.is_admin is not distinct from old.is_admin
    and new.is_verified is not distinct from old.is_verified
    and new.is_banned is true
    and new.deleted_at is not null then
    return new;
  end if;

  if not private.is_admin() then
    if new.is_admin is distinct from old.is_admin
      or new.is_banned is distinct from old.is_banned
      or new.is_verified is distinct from old.is_verified then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_profile_privilege_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_checkout_reservation_listing_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
  trusted_checkout_write boolean := coalesce(
    nullif(current_setting('retail.checkout_reservation_context', true), ''),
    'false'
  )::boolean or jwt_role = 'service_role';
  active_reservation boolean;
begin
  if tg_op = 'INSERT' then
    if not trusted_checkout_write and (
      new.reserved_by is not null
      or new.reserved_until is not null
      or new.reservation_payment_intent_id is not null
      or new.reservation_transaction_id is not null
    ) then
      raise exception 'RETAIL_CHECKOUT_RESERVATION_PROTECTED'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    active_reservation := old.reserved_by is not null
      and old.reserved_until is not null
      and old.reserved_until > now();

    if not trusted_checkout_write and (
      new.reserved_by is distinct from old.reserved_by
      or new.reserved_until is distinct from old.reserved_until
      or new.reservation_payment_intent_id is distinct from old.reservation_payment_intent_id
      or new.reservation_transaction_id is distinct from old.reservation_transaction_id
    ) then
      raise exception 'RETAIL_CHECKOUT_RESERVATION_PROTECTED'
        using errcode = '42501';
    end if;

    if active_reservation and not trusted_checkout_write and (
      new.price is distinct from old.price
      or new.listing_type is distinct from old.listing_type
      or new.status is distinct from old.status
      or new.deleted_at is distinct from old.deleted_at
    ) then
      raise exception 'RETAIL_LISTING_RESERVED'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_checkout_reservation_listing_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_conversation_phase_d_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  trusted_update boolean := coalesce(nullif(current_setting('retail.trusted_conversation_update', true), ''), 'false')::boolean;
begin
  if tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id or new.created_at is distinct from old.created_at then
      raise exception 'Immutable conversation fields cannot be changed';
    end if;
    if not trusted_update and (new.last_message_at is distinct from old.last_message_at or new.updated_at is distinct from old.updated_at or new.deleted_at is distinct from old.deleted_at) then
      raise exception 'Conversation metadata can only be changed by trusted server logic';
    end if;
  end if;
  if new.buyer_id = new.seller_id then raise exception 'Buyer cannot be seller'; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_conversation_phase_d_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_listing_image_phase_d_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  listing_owner_id uuid;
  storage_path text;
  path_parts text[];
  existing_count integer;
begin
  select l.seller_id into listing_owner_id from public.listings l where l.id = new.listing_id and l.deleted_at is null;
  if listing_owner_id is null then raise exception 'Listing is not available'; end if;
  storage_path := private.public_storage_path_from_url('listings', new.image_url);
  if storage_path is null then raise exception 'Listing images must use ReTail listing storage'; end if;
  path_parts := storage.foldername(storage_path);
  if array_length(path_parts, 1) < 2 or path_parts[1] <> listing_owner_id::text or private.uuid_from_text(path_parts[2]) <> new.listing_id or lower(storage.extension(storage_path)) not in ('jpg', 'jpeg', 'png', 'webp') then
    raise exception 'Listing image path is invalid';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into existing_count from public.listing_images li where li.listing_id = new.listing_id;
    if existing_count >= 15 then raise exception 'Listing image limit exceeded'; end if;
  elsif tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id or new.created_at is distinct from old.created_at then raise exception 'Immutable listing image fields cannot be changed'; end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_listing_image_phase_d_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_listing_phase_c_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.seller_id is distinct from auth.uid()
      or new.status not in ('draft'::public.listing_status, 'active'::public.listing_status)
      or coalesce(new.view_count, 0) <> 0
      or coalesce(new.favorite_count, 0) <> 0
      or coalesce(new.message_count, 0) <> 0
      or new.deleted_at is not null
      or new.latitude is not null
      or new.longitude is not null
      or new.location_point is not null
      or new.search_area_id is not null then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.seller_id is distinct from old.seller_id
      or new.status is distinct from old.status
      or new.view_count is distinct from old.view_count
      or new.favorite_count is distinct from old.favorite_count
      or new.message_count is distinct from old.message_count
      or new.published_at is distinct from old.published_at
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.deleted_at is distinct from old.deleted_at
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.location_point is distinct from old.location_point
      or new.search_area_id is distinct from old.search_area_id then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_listing_phase_c_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_message_phase_d_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  trusted_system_message boolean := coalesce(
    nullif(current_setting('retail.trusted_system_message', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'UPDATE' then
    if new.conversation_id is distinct from old.conversation_id
      or new.sender_id is distinct from old.sender_id
      or new.message_type is distinct from old.message_type
      or new.body is distinct from old.body
      or new.image_url is distinct from old.image_url
      or new.attachment_bucket is distinct from old.attachment_bucket
      or new.attachment_path is distinct from old.attachment_path
      or new.attachment_mime_type is distinct from old.attachment_mime_type
      or new.attachment_size_bytes is distinct from old.attachment_size_bytes
      or new.attachment_width is distinct from old.attachment_width
      or new.attachment_height is distinct from old.attachment_height
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Immutable message fields cannot be changed';
    end if;

    return new;
  end if;

  if new.sender_id is null then
    raise exception 'Message sender is required';
  end if;

  if not private.is_conversation_participant(new.conversation_id, new.sender_id) then
    raise exception 'Sender must belong to the conversation';
  end if;

  if not private.is_account_active(new.sender_id) then
    raise exception 'Sender account is not active';
  end if;

  if private.is_blocked_between(
    new.sender_id,
    private.other_conversation_participant(new.conversation_id, new.sender_id)
  ) then
    raise exception 'RETAIL_MESSAGE_BLOCKED';
  end if;

  if new.message_type = 'system' then
    if not trusted_system_message then
      raise exception 'RETAIL_SYSTEM_MESSAGE_FORBIDDEN';
    end if;

    new.body := nullif(trim(coalesce(new.body, '')), '');

    if new.body is null or length(new.body) > 2000 then
      raise exception 'Text message body is invalid';
    end if;

    if new.image_url is not null
      or new.attachment_bucket is not null
      or new.attachment_path is not null
      or new.attachment_mime_type is not null
      or new.attachment_size_bytes is not null
    then
      raise exception 'System messages cannot include image attachment metadata';
    end if;
  elsif new.message_type = 'text' then
    new.body := nullif(trim(coalesce(new.body, '')), '');

    if new.body is null or length(new.body) > 2000 then
      raise exception 'Text message body is invalid';
    end if;

    if new.image_url is not null
      or new.attachment_bucket is not null
      or new.attachment_path is not null
      or new.attachment_mime_type is not null
      or new.attachment_size_bytes is not null
    then
      raise exception 'Text messages cannot include image attachment metadata';
    end if;
  elsif new.message_type = 'image' then
    if new.image_url is not null then
      raise exception 'Image messages must store private attachment metadata, not external URLs';
    end if;

    if new.body is not null and length(new.body) > 2000 then
      raise exception 'Image message caption is too long';
    end if;

    if not private.message_attachment_path_is_valid(
      new.conversation_id,
      new.sender_id,
      new.attachment_bucket,
      new.attachment_path,
      new.attachment_mime_type,
      new.attachment_size_bytes
    ) then
      raise exception 'RETAIL_INVALID_MESSAGE_ATTACHMENT';
    end if;
  else
    raise exception 'Unsupported message type';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_message_phase_d_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_notification_phase_e_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."protect_notification_phase_e_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_phase_c_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  account_deletion_context boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.account_deletion_context', true), ''),
    'off'
  ) = 'on';
  deletion_anonymization boolean;
  counter_refresh boolean;
begin
  if tg_op = 'UPDATE' and account_deletion_context then
    counter_refresh :=
      new.id is not distinct from old.id
      and new.account_type is not distinct from old.account_type
      and new.display_name is not distinct from old.display_name
      and new.username is not distinct from old.username
      and new.bio is not distinct from old.bio
      and new.avatar_url is not distinct from old.avatar_url
      and new.city is not distinct from old.city
      and new.state is not distinct from old.state
      and new.zip_code is not distinct from old.zip_code
      and new.latitude is not distinct from old.latitude
      and new.longitude is not distinct from old.longitude
      and new.is_verified is not distinct from old.is_verified
      and new.is_admin is not distinct from old.is_admin
      and new.is_banned is not distinct from old.is_banned
      and new.stripe_connect_account_id is not distinct from old.stripe_connect_account_id
      and new.stripe_connect_charges_enabled is not distinct from old.stripe_connect_charges_enabled
      and new.stripe_connect_payouts_enabled is not distinct from old.stripe_connect_payouts_enabled
      and new.stripe_connect_details_submitted is not distinct from old.stripe_connect_details_submitted
      and new.stripe_connect_onboarding_complete_at is not distinct from old.stripe_connect_onboarding_complete_at
      and new.stripe_connect_updated_at is not distinct from old.stripe_connect_updated_at
      and new.created_at is not distinct from old.created_at
      and new.deleted_at is not distinct from old.deleted_at;

    if counter_refresh then
      return new;
    end if;

    deletion_anonymization :=
      new.id is not distinct from old.id
      and new.account_type is not distinct from old.account_type
      and new.buyer_rating is not distinct from old.buyer_rating
      and new.seller_rating is not distinct from old.seller_rating
      and new.review_count is not distinct from old.review_count
      and new.listings_count is not distinct from old.listings_count
      and new.completed_sales_count is not distinct from old.completed_sales_count
      and new.is_verified is not distinct from old.is_verified
      and new.is_admin is not distinct from old.is_admin
      and new.stripe_connect_account_id is not distinct from old.stripe_connect_account_id
      and new.stripe_connect_charges_enabled is not distinct from old.stripe_connect_charges_enabled
      and new.stripe_connect_payouts_enabled is not distinct from old.stripe_connect_payouts_enabled
      and new.stripe_connect_details_submitted is not distinct from old.stripe_connect_details_submitted
      and new.stripe_connect_onboarding_complete_at is not distinct from old.stripe_connect_onboarding_complete_at
      and new.stripe_connect_updated_at is not distinct from old.stripe_connect_updated_at
      and new.created_at is not distinct from old.created_at
      and new.display_name = 'Deleted User'
      and new.bio is null
      and new.avatar_url is null
      and new.city is null
      and new.state is null
      and new.zip_code is null
      and new.latitude is null
      and new.longitude is null
      and new.is_banned is true
      and new.deleted_at is not null;

    if deletion_anonymization then
      return new;
    end if;

    raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
      using errcode = '42501';
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is distinct from auth.uid()
      or coalesce(new.buyer_rating, 0) <> 0
      or coalesce(new.seller_rating, 0) <> 0
      or coalesce(new.review_count, 0) <> 0
      or coalesce(new.listings_count, 0) <> 0
      or coalesce(new.completed_sales_count, 0) <> 0
      or coalesce(new.is_verified, false) <> false
      or coalesce(new.is_admin, false) <> false
      or coalesce(new.is_banned, false) <> false
      or new.deleted_at is not null
      or new.latitude is not null
      or new.longitude is not null
      or new.stripe_connect_account_id is not null
      or coalesce(new.stripe_connect_charges_enabled, false) <> false
      or coalesce(new.stripe_connect_payouts_enabled, false) <> false
      or coalesce(new.stripe_connect_details_submitted, false) <> false
      or new.stripe_connect_onboarding_complete_at is not null
      or new.stripe_connect_updated_at is not null then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.account_type is distinct from old.account_type
      or new.buyer_rating is distinct from old.buyer_rating
      or new.seller_rating is distinct from old.seller_rating
      or new.review_count is distinct from old.review_count
      or new.listings_count is distinct from old.listings_count
      or new.completed_sales_count is distinct from old.completed_sales_count
      or new.is_verified is distinct from old.is_verified
      or new.is_admin is distinct from old.is_admin
      or new.is_banned is distinct from old.is_banned
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.deleted_at is distinct from old.deleted_at
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.stripe_connect_account_id is distinct from old.stripe_connect_account_id
      or new.stripe_connect_charges_enabled is distinct from old.stripe_connect_charges_enabled
      or new.stripe_connect_payouts_enabled is distinct from old.stripe_connect_payouts_enabled
      or new.stripe_connect_details_submitted is distinct from old.stripe_connect_details_submitted
      or new.stripe_connect_onboarding_complete_at is distinct from old.stripe_connect_onboarding_complete_at
      or new.stripe_connect_updated_at is distinct from old.stripe_connect_updated_at then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_phase_c_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_report_moderation_event_phase_e"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."protect_report_moderation_event_phase_e"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_report_phase_e_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."protect_report_phase_e_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_rescue_profile_phase_c_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is distinct from auth.uid()
      or coalesce(new.is_verified, false) <> false
      or coalesce(new.is_active, true) <> true
      or coalesce(new.verification_status, 'pending') not in ('draft', 'pending')
      or new.deleted_at is not null
      or new.latitude is not null
      or new.longitude is not null
      or new.location_point is not null
      or new.search_area_id is not null then
      raise exception 'RETAIL_PROTECTED_RESCUE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.owner_id is distinct from old.owner_id
      or new.is_verified is distinct from old.is_verified
      or new.is_active is distinct from old.is_active
      or new.verification_status is distinct from old.verification_status
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.deleted_at is distinct from old.deleted_at
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.location_point is distinct from old.location_point
      or new.search_area_id is distinct from old.search_area_id then
      raise exception 'RETAIL_PROTECTED_RESCUE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_rescue_profile_phase_c_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_review_phase_e_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."protect_review_phase_e_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_transaction_phase_e_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_transaction_write', true), ''),
    'false'
  )::boolean or jwt_role = 'service_role';
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
      or new.payment_method is distinct from old.payment_method
      or new.payment_status is distinct from old.payment_status
      or new.amount_cents is distinct from old.amount_cents
      or new.item_amount_cents is distinct from old.item_amount_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.seller_amount_cents is distinct from old.seller_amount_cents
      or new.fulfillment_method is distinct from old.fulfillment_method
      or new.shipping_payer is distinct from old.shipping_payer
      or new.shipping_amount_cents is distinct from old.shipping_amount_cents
      or new.shipping_collected_cents is distinct from old.shipping_collected_cents
      or new.shipping_carrier is distinct from old.shipping_carrier
      or new.shipping_service is distinct from old.shipping_service
      or new.tax_amount_cents is distinct from old.tax_amount_cents
      or new.currency is distinct from old.currency
      or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
      or new.stripe_transfer_destination is distinct from old.stripe_transfer_destination
      or new.stripe_tax_calculation_id is distinct from old.stripe_tax_calculation_id
      or new.stripe_tax_transaction_id is distinct from old.stripe_tax_transaction_id
      or new.tax_behavior is distinct from old.tax_behavior
      or new.tax_liability is distinct from old.tax_liability
      or new.product_tax_code is distinct from old.product_tax_code
      or new.shipping_tax_code is distinct from old.shipping_tax_code
      or new.retail_fee_tax_code is distinct from old.retail_fee_tax_code
      or new.buyer_tax_address_source is distinct from old.buyer_tax_address_source
      or new.buyer_tax_country is distinct from old.buyer_tax_country
      or new.buyer_tax_state is distinct from old.buyer_tax_state
      or new.buyer_tax_postal_code is distinct from old.buyer_tax_postal_code
      or new.payment_error is distinct from old.payment_error
      or new.paid_at is distinct from old.paid_at
      or new.refunded_amount_cents is distinct from old.refunded_amount_cents
      or new.refunded_at is distinct from old.refunded_at
      or new.last_stripe_charge_id is distinct from old.last_stripe_charge_id
      or new.stripe_dispute_id is distinct from old.stripe_dispute_id
      or new.dispute_status is distinct from old.dispute_status
      or new.dispute_amount_cents is distinct from old.dispute_amount_cents
      or new.dispute_reason is distinct from old.dispute_reason
      or new.dispute_created_at is distinct from old.dispute_created_at
      or new.dispute_resolved_at is distinct from old.dispute_resolved_at
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


ALTER FUNCTION "public"."protect_transaction_phase_e_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_my_policy_acceptance"("requested_terms_version" "text", "requested_community_guidelines_version" "text", "requested_privacy_version" "text", "requested_marketing_email_opt_in" boolean, "requested_source" "text") RETURNS TABLE("has_current_policy_acceptance" boolean, "terms_accepted" boolean, "community_guidelines_accepted" boolean, "privacy_acknowledged" boolean, "marketing_email_opt_in" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  acceptance_was_current boolean;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  if requested_terms_version <> '2026-08-10'
    or requested_community_guidelines_version <> '2026-08-10'
    or requested_privacy_version <> '2026-08-10' then
    raise exception 'RETAIL_POLICY_VERSION_MISMATCH'
      using errcode = '22023';
  end if;

  if requested_source not in ('email_signup', 'google_signup', 'legacy_user_gate') then
    raise exception 'RETAIL_CONSENT_SOURCE_INVALID'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('retail-policy-consent:' || caller_id::text, 0)
  );

  acceptance_was_current := private.has_current_policy_acceptance(caller_id);

  if not exists (
    select 1 from public.user_consents consent
    where consent.user_id = caller_id
      and consent.consent_type = 'terms_of_service'
      and consent.policy_version = requested_terms_version
      and consent.granted = true
  ) then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'terms_of_service', requested_terms_version, true, requested_source);
  end if;

  if not exists (
    select 1 from public.user_consents consent
    where consent.user_id = caller_id
      and consent.consent_type = 'community_guidelines'
      and consent.policy_version = requested_community_guidelines_version
      and consent.granted = true
  ) then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'community_guidelines', requested_community_guidelines_version, true, requested_source);
  end if;

  if not exists (
    select 1 from public.user_consents consent
    where consent.user_id = caller_id
      and consent.consent_type = 'privacy_acknowledgment'
      and consent.policy_version = requested_privacy_version
      and consent.granted = true
  ) then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'privacy_acknowledgment', requested_privacy_version, true, requested_source);
  end if;

  if not acceptance_was_current then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'marketing_email', null, coalesce(requested_marketing_email_opt_in, false), requested_source);
  end if;

  return query select * from public.get_my_consent_state();
end;
$$;


ALTER FUNCTION "public"."record_my_policy_acceptance"("requested_terms_version" "text", "requested_community_guidelines_version" "text", "requested_privacy_version" "text", "requested_marketing_email_opt_in" boolean, "requested_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_stripe_transaction_payment_event"("p_transaction_id" "uuid", "p_stripe_event_id" "text", "p_event_type" "text", "p_amount_cents" integer DEFAULT NULL::integer, "p_stripe_created_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_payment_intent_id" "text" DEFAULT NULL::"text", "p_charge_id" "text" DEFAULT NULL::"text", "p_dispute_id" "text" DEFAULT NULL::"text", "p_event_status" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  inserted_id uuid;
begin
  if p_transaction_id is null
    or p_stripe_event_id is null
    or p_event_type is null then
    raise exception 'RETAIL_STRIPE_PAYMENT_EVENT_INVALID'
      using errcode = '22023';
  end if;

  insert into public.transaction_payment_events (
    transaction_id,
    stripe_event_id,
    event_type,
    amount_cents,
    stripe_created_at,
    payment_intent_id,
    charge_id,
    dispute_id,
    event_status,
    metadata
  )
  values (
    p_transaction_id,
    p_stripe_event_id,
    p_event_type,
    p_amount_cents,
    p_stripe_created_at,
    p_payment_intent_id,
    p_charge_id,
    p_dispute_id,
    nullif(btrim(coalesce(p_event_status, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (stripe_event_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select tpe.id
    into inserted_id
    from public.transaction_payment_events tpe
    where tpe.stripe_event_id = p_stripe_event_id;
  end if;

  return inserted_id;
end;
$$;


ALTER FUNCTION "public"."record_stripe_transaction_payment_event"("p_transaction_id" "uuid", "p_stripe_event_id" "text", "p_event_type" "text", "p_amount_cents" integer, "p_stripe_created_at" timestamp with time zone, "p_payment_intent_id" "text", "p_charge_id" "text", "p_dispute_id" "text", "p_event_status" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_profile_listing_count"("profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update profiles
  set listings_count = (
    select count(*) from listings
    where listings.seller_id = profile_id
      and listings.deleted_at is null
      and listings.status in ('active', 'pending')
  )
  where id = profile_id;
end;
$$;


ALTER FUNCTION "public"."refresh_profile_listing_count"("profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_my_device_token"("requested_token" "text", "requested_platform" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."register_my_device_token"("requested_token" "text", "requested_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_listing_id is null or p_buyer_id is null then
    return;
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings
  set reserved_by = null,
      reserved_until = null,
      reservation_payment_intent_id = null,
      reservation_transaction_id = null,
      updated_at = now()
  where id = p_listing_id
    and reserved_by = p_buyer_id
    and status = 'active'::public.listing_status
    and deleted_at is null
    and (
      p_payment_intent_id is null
      or reservation_payment_intent_id = p_payment_intent_id
    );

  perform set_config('retail.checkout_reservation_context', 'false', true);
end;
$$;


ALTER FUNCTION "public"."release_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_my_device_token"("requested_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."remove_my_device_token"("requested_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_stripe_checkout_listing"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_requested_amount_cents" integer) RETURNS TABLE("listing_id" "uuid", "listing_title" "text", "seller_id" "uuid", "seller_display_name" "text", "seller_city" "text", "seller_state" "text", "seller_zip_code" "text", "stripe_connect_account_id" "text", "amount_cents" integer, "shipping_available" boolean, "shipping_payer" "text", "shipping_cost_estimate" numeric, "ship_from_zip_code" "text", "pickup_available" boolean, "porch_pickup_available" boolean, "meetup_available" boolean, "reserved_until" timestamp with time zone, "existing_payment_intent_id" "text", "existing_transaction_id" "uuid", "stale_payment_intent_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  listing_row public.listings%rowtype;
  seller_row record;
  listing_amount_cents integer;
  next_reserved_until timestamptz := now() + interval '15 minutes';
  previous_payment_intent_id text;
begin
  if p_listing_id is null or p_buyer_id is null then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST' using errcode = '22023';
  end if;

  if p_requested_amount_cents is null or p_requested_amount_cents <= 0 then
    raise exception 'RETAIL_CHECKOUT_AMOUNT_INVALID' using errcode = '22023';
  end if;

  if not private.is_account_active(p_buyer_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  select *
  into listing_row
  from public.listings
  where id = p_listing_id
  for update;

  if not found or listing_row.deleted_at is not null then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if listing_row.seller_id = p_buyer_id then
    raise exception 'RETAIL_CHECKOUT_BUYER_NOT_ELIGIBLE' using errcode = '42501';
  end if;

  if not private.is_account_active(listing_row.seller_id) then
    raise exception 'RETAIL_SELLER_INACTIVE' using errcode = '42501';
  end if;

  if listing_row.status <> 'active'::public.listing_status
    or listing_row.listing_type <> 'sale'::public.listing_type then
    raise exception 'RETAIL_CHECKOUT_LISTING_INELIGIBLE' using errcode = '22023';
  end if;

  listing_amount_cents := round(coalesce(listing_row.price, 0) * 100)::integer;
  if listing_amount_cents <= 0 then
    raise exception 'RETAIL_CHECKOUT_AMOUNT_INVALID' using errcode = '22023';
  end if;

  if listing_amount_cents <> p_requested_amount_cents then
    raise exception 'RETAIL_CHECKOUT_AMOUNT_CHANGED' using errcode = '40001';
  end if;

  select
    p.id,
    p.display_name,
    p.city,
    p.state,
    p.zip_code,
    p.stripe_connect_account_id,
    p.stripe_connect_details_submitted,
    p.stripe_connect_charges_enabled,
    p.stripe_connect_payouts_enabled
  into seller_row
  from public.profiles p
  where p.id = listing_row.seller_id;

  if seller_row.id is null or seller_row.stripe_connect_account_id is null then
    raise exception 'RETAIL_SELLER_STRIPE_NOT_READY' using errcode = '22023';
  end if;

  if not coalesce(seller_row.stripe_connect_details_submitted, false)
    or not coalesce(seller_row.stripe_connect_charges_enabled, false)
    or not coalesce(seller_row.stripe_connect_payouts_enabled, false) then
    raise exception 'RETAIL_SELLER_STRIPE_INCOMPLETE' using errcode = '22023';
  end if;

  if listing_row.reserved_by is not null
    and listing_row.reserved_until is not null
    and listing_row.reserved_until > now()
    and listing_row.reserved_by <> p_buyer_id then
    raise exception 'RETAIL_CHECKOUT_LISTING_RESERVED' using errcode = '55P03';
  end if;

  if listing_row.reserved_by = p_buyer_id
    and listing_row.reserved_until is not null
    and listing_row.reserved_until > now()
    and listing_row.reservation_payment_intent_id is not null then
    perform set_config('retail.checkout_reservation_context', 'true', true);

    update public.listings
    set reserved_until = next_reserved_until,
        updated_at = now()
    where id = listing_row.id
    returning * into listing_row;

    perform set_config('retail.checkout_reservation_context', 'false', true);

    return query
      select
        listing_row.id,
        listing_row.title,
        listing_row.seller_id,
        seller_row.display_name::text,
        seller_row.city::text,
        seller_row.state::text,
        seller_row.zip_code::text,
        seller_row.stripe_connect_account_id::text,
        listing_amount_cents,
        listing_row.shipping_available,
        listing_row.shipping_payer::text,
        listing_row.shipping_cost_estimate,
        listing_row.ship_from_zip_code::text,
        listing_row.pickup_available,
        listing_row.porch_pickup_available,
        listing_row.meetup_available,
        listing_row.reserved_until,
        listing_row.reservation_payment_intent_id,
        listing_row.reservation_transaction_id,
        null::text;
    return;
  end if;

  if listing_row.reserved_until is not null
    and listing_row.reserved_until <= now()
    and listing_row.reservation_payment_intent_id is not null then
    previous_payment_intent_id := listing_row.reservation_payment_intent_id;
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings
  set reserved_by = p_buyer_id,
      reserved_until = next_reserved_until,
      reservation_payment_intent_id = null,
      reservation_transaction_id = null,
      updated_at = now()
  where id = listing_row.id
  returning * into listing_row;

  perform set_config('retail.checkout_reservation_context', 'false', true);

  return query
    select
      listing_row.id,
      listing_row.title,
      listing_row.seller_id,
      seller_row.display_name::text,
      seller_row.city::text,
      seller_row.state::text,
      seller_row.zip_code::text,
      seller_row.stripe_connect_account_id::text,
      listing_amount_cents,
      listing_row.shipping_available,
      listing_row.shipping_payer::text,
      listing_row.shipping_cost_estimate,
      listing_row.ship_from_zip_code::text,
      listing_row.pickup_available,
      listing_row.porch_pickup_available,
      listing_row.meetup_available,
      listing_row.reserved_until,
      null::text,
      null::uuid,
      previous_payment_intent_id;
end;
$$;


ALTER FUNCTION "public"."reserve_stripe_checkout_listing"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_requested_amount_cents" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_uuid"("value" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;


ALTER FUNCTION "public"."safe_uuid"("value" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message_type" "public"."message_type" DEFAULT 'text'::"public"."message_type" NOT NULL,
    "body" "text",
    "image_url" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "attachment_bucket" "text",
    "attachment_path" "text",
    "attachment_mime_type" "text",
    "attachment_size_bytes" integer,
    "attachment_width" integer,
    "attachment_height" integer,
    CONSTRAINT "message_has_content" CHECK (((("message_type" = 'text'::"public"."message_type") AND ("body" IS NOT NULL) AND (("char_length"("body") >= 1) AND ("char_length"("body") <= 2000)) AND ("image_url" IS NULL) AND ("attachment_bucket" IS NULL) AND ("attachment_path" IS NULL) AND ("attachment_mime_type" IS NULL) AND ("attachment_size_bytes" IS NULL)) OR (("message_type" = 'image'::"public"."message_type") AND ("image_url" IS NULL) AND ("attachment_bucket" IS NOT NULL) AND ("attachment_path" IS NOT NULL) AND ("attachment_mime_type" IS NOT NULL) AND ("attachment_size_bytes" IS NOT NULL) AND ("attachment_size_bytes" > 0)) OR (("message_type" = 'system'::"public"."message_type") AND ("body" IS NOT NULL) AND (("char_length"("body") >= 1) AND ("char_length"("body") <= 2000)) AND ("image_url" IS NULL) AND ("attachment_bucket" IS NULL) AND ("attachment_path" IS NULL) AND ("attachment_mime_type" IS NULL) AND ("attachment_size_bytes" IS NULL))))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_message"("target_conversation_id" "uuid", "requested_message_type" "public"."message_type", "requested_body" "text" DEFAULT NULL::"text", "requested_attachment_bucket" "text" DEFAULT NULL::"text", "requested_attachment_path" "text" DEFAULT NULL::"text", "requested_attachment_mime_type" "text" DEFAULT NULL::"text", "requested_attachment_size_bytes" integer DEFAULT NULL::integer, "requested_attachment_width" integer DEFAULT NULL::integer, "requested_attachment_height" integer DEFAULT NULL::integer) RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."send_message"("target_conversation_id" "uuid", "requested_message_type" "public"."message_type", "requested_body" "text", "requested_attachment_bucket" "text", "requested_attachment_path" "text", "requested_attachment_mime_type" "text", "requested_attachment_size_bytes" integer, "requested_attachment_width" integer, "requested_attachment_height" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_listing_search_area_from_city_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  derived_search_area_id uuid;
begin
  derived_search_area_id := public.marketplace_search_area_for_city_state(new.city, new.state);

  if derived_search_area_id is not null then
    new.search_area_id := derived_search_area_id;
  elsif new.search_area_id is not null then
    perform 1
    from public.marketplace_search_areas msa
    where msa.id = new.search_area_id
      and msa.is_active = true;

    if not found then
      raise exception 'RETAIL_INVALID_SEARCH_AREA' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_listing_search_area_from_city_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_marketplace_search_area"("requested_search_area_id" "uuid", "requested_radius_miles" integer DEFAULT 25) RETURNS TABLE("search_area_id" "uuid", "radius_miles" integer, "label" "text", "city" "text", "state" "text", "region_name" "text", "changed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := (select auth.uid());
  normalized_radius integer := coalesce(requested_radius_miles, 25);
  selected_area record;
  existing_search_area_id uuid;
  existing_radius_miles integer;
  recent_successful_changes integer := 0;
  preference_changed boolean := false;
begin
  if caller_id is null or not public.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if normalized_radius not in (10, 25, 50, 100) then
    raise exception 'RETAIL_INVALID_SEARCH_RADIUS' using errcode = '22023';
  end if;

  select msa.id, msa.label, msa.city, msa.state, msa.region_name
  into selected_area
  from public.marketplace_search_areas msa
  where msa.id = requested_search_area_id
    and msa.is_active = true;

  if selected_area.id is null then
    raise exception 'RETAIL_SEARCH_AREA_NOT_FOUND' using errcode = 'P0001';
  end if;

  select pref.search_area_id, pref.radius_miles
  into existing_search_area_id, existing_radius_miles
  from public.marketplace_search_preferences pref
  where pref.user_id = caller_id;

  preference_changed :=
    existing_search_area_id is null
    or existing_search_area_id is distinct from selected_area.id
    or existing_radius_miles is distinct from normalized_radius;

  if preference_changed then
    select count(*)::integer
    into recent_successful_changes
    from public.marketplace_search_area_change_events event
    where event.user_id = caller_id
      and event.created_at >= now() - interval '24 hours';

    if recent_successful_changes >= 3 then
      raise exception 'RETAIL_SEARCH_AREA_RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.marketplace_search_preferences (
    user_id,
    search_area_id,
    radius_miles,
    created_at,
    updated_at,
    last_changed_at
  )
  values (
    caller_id,
    selected_area.id,
    normalized_radius,
    now(),
    now(),
    now()
  )
  on conflict (user_id) do update
  set search_area_id = excluded.search_area_id,
      radius_miles = excluded.radius_miles,
      updated_at = now(),
      last_changed_at = case
        when public.marketplace_search_preferences.search_area_id is distinct from excluded.search_area_id
          or public.marketplace_search_preferences.radius_miles is distinct from excluded.radius_miles
        then now()
        else public.marketplace_search_preferences.last_changed_at
      end;

  if preference_changed then
    insert into public.marketplace_search_area_change_events (
      user_id,
      search_area_id,
      radius_miles
    )
    values (
      caller_id,
      selected_area.id,
      normalized_radius
    );

    insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
    values (
      caller_id,
      'moderator_action',
      'marketplace_search_preferences',
      caller_id,
      jsonb_build_object(
        'action', 'marketplace_search_area_changed',
        'search_area_id', selected_area.id,
        'radius_miles', normalized_radius
      )
    );
  end if;

  return query
  select
    selected_area.id,
    normalized_radius,
    selected_area.label,
    selected_area.city,
    selected_area.state,
    selected_area.region_name,
    preference_changed;
end;
$$;


ALTER FUNCTION "public"."set_marketplace_search_area"("requested_search_area_id" "uuid", "requested_radius_miles" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_rescue_search_area_from_city_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  derived_search_area_id uuid;
begin
  derived_search_area_id := public.marketplace_search_area_for_city_state(new.city, new.state);

  if derived_search_area_id is not null then
    new.search_area_id := derived_search_area_id;
  elsif new.search_area_id is not null then
    perform 1
    from public.marketplace_search_areas msa
    where msa.id = new.search_area_id
      and msa.is_active = true;

    if not found then
      raise exception 'RETAIL_INVALID_SEARCH_AREA' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_rescue_search_area_from_city_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_own_message"("target_message_id" "uuid") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_row public.messages%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required'; end if;
  if not private.is_account_active(caller_id) then raise exception 'Account is not active'; end if;
  update public.messages m set deleted_at = coalesce(deleted_at, now()) where m.id = target_message_id and m.sender_id = caller_id returning * into updated_row;
  if not found then raise exception 'Message is not available'; end if;
  return updated_row;
end;
$$;


ALTER FUNCTION "public"."soft_delete_own_message"("target_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_report"("report_target_type" "public"."report_type", "report_target_id" "uuid", "report_reason_value" "public"."report_reason", "report_details" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."submit_report"("report_target_type" "public"."report_type", "report_target_id" "uuid", "report_reason_value" "public"."report_reason", "report_details" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_listing_location_point"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.location_point = case
    when new.latitude is not null and new.longitude is not null then
      public.st_setsrid(public.st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::public.geography
    else null
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_listing_location_point"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_rescue_location_point"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.location_point = case
    when new.latitude is not null and new.longitude is not null then
      public.st_setsrid(public.st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::public.geography
    else null
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_rescue_location_point"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unblock_user"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  deleted_count integer;
begin
  if caller_id is null then raise exception 'Authentication is required'; end if;
  if target_user_id is null or target_user_id = caller_id then raise exception 'Blocked user is invalid'; end if;
  if not private.is_account_active(caller_id) then raise exception 'Account is not active'; end if;
  delete from public.blocks b where b.blocker_id = caller_id and b.blocked_id = target_user_id;
  get diagnostics deleted_count = row_count;
  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata) values (caller_id, 'moderator_action', 'blocks', null, jsonb_build_object('action', 'user_unblocked', 'blocked_id', target_user_id));
  return deleted_count > 0;
end;
$$;


ALTER FUNCTION "public"."unblock_user"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_after_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform set_config('retail.trusted_conversation_update', 'true', true);
  update public.conversations set last_message_at = new.created_at, updated_at = now() where id = new.conversation_id;
  perform set_config('retail.trusted_conversation_update', 'false', true);
  update public.listings
  set message_count = message_count + 1
  where id = (select c.listing_id from public.conversations c where c.id = new.conversation_id)
    and deleted_at is null;
  return new;
end;
$$;


ALTER FUNCTION "public"."update_conversation_after_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_listing"("target_listing_id" "uuid", "requested_category_id" "uuid" DEFAULT NULL::"uuid", "requested_title" "text" DEFAULT NULL::"text", "requested_description" "text" DEFAULT NULL::"text", "requested_condition" "public"."listing_condition" DEFAULT NULL::"public"."listing_condition", "requested_listing_type" "public"."listing_type" DEFAULT NULL::"public"."listing_type", "requested_price" numeric DEFAULT NULL::numeric, "requested_brand" "text" DEFAULT NULL::"text", "requested_city" "text" DEFAULT NULL::"text", "requested_state" "text" DEFAULT NULL::"text", "requested_zip_code" "text" DEFAULT NULL::"text", "requested_pickup_available" boolean DEFAULT NULL::boolean, "requested_porch_pickup_available" boolean DEFAULT NULL::boolean, "requested_meetup_available" boolean DEFAULT NULL::boolean, "requested_shipping_available" boolean DEFAULT NULL::boolean, "requested_shipping_payer" "text" DEFAULT NULL::"text", "requested_shipping_cost_estimate" numeric DEFAULT NULL::numeric, "requested_handling_time" "text" DEFAULT NULL::"text", "requested_ship_from_zip_code" "text" DEFAULT NULL::"text", "requested_item_dimensions" "text" DEFAULT NULL::"text", "requested_pet_size" "text" DEFAULT NULL::"text", "requested_condition_notes" "text" DEFAULT NULL::"text", "requested_availability_notes" "text" DEFAULT NULL::"text", "requested_reason_for_listing" "text" DEFAULT NULL::"text", "requested_safety_confirmed" boolean DEFAULT NULL::boolean) RETURNS "public"."listings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  existing_listing public.listings;
  normalized_type public.listing_type;
  normalized_price numeric;
  normalized_shipping_available boolean;
  normalized_porch_pickup boolean;
  normalized_meetup boolean;
  normalized_pickup boolean;
  updated_listing public.listings;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  select *
  into existing_listing
  from public.listings
  where id = target_listing_id
    and seller_id = caller_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if existing_listing.status in ('sold'::public.listing_status, 'donated'::public.listing_status, 'removed'::public.listing_status) then
    raise exception 'RETAIL_LISTING_LOCKED' using errcode = '42501';
  end if;

  if requested_title is not null and trim(requested_title) = '' then
    raise exception 'RETAIL_TITLE_REQUIRED' using errcode = '22023';
  end if;

  if requested_description is not null and trim(requested_description) = '' then
    raise exception 'RETAIL_DESCRIPTION_REQUIRED' using errcode = '22023';
  end if;

  if requested_city is not null and trim(requested_city) = '' then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  if requested_state is not null and trim(requested_state) = '' then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  normalized_type := coalesce(requested_listing_type, existing_listing.listing_type);
  normalized_shipping_available := coalesce(requested_shipping_available, existing_listing.shipping_available);
  normalized_porch_pickup := coalesce(requested_porch_pickup_available, existing_listing.porch_pickup_available);
  normalized_meetup := coalesce(requested_meetup_available, existing_listing.meetup_available);
  normalized_pickup := coalesce(requested_pickup_available, existing_listing.pickup_available)
    or normalized_porch_pickup
    or normalized_meetup;

  if normalized_type = 'sale'::public.listing_type then
    normalized_price := coalesce(requested_price, existing_listing.price);
    if normalized_price is null or normalized_price < 0 then
      raise exception 'RETAIL_PRICE_REQUIRED' using errcode = '22023';
    end if;
  else
    normalized_price := 0;
  end if;

  if not normalized_pickup and not normalized_porch_pickup and not normalized_meetup and not normalized_shipping_available then
    raise exception 'RETAIL_GETTING_OPTION_REQUIRED' using errcode = '22023';
  end if;

  update public.listings
  set
    category_id = coalesce(requested_category_id, category_id),
    title = coalesce(nullif(trim(requested_title), ''), title),
    description = coalesce(nullif(trim(requested_description), ''), description),
    price = normalized_price,
    listing_type = normalized_type,
    condition = coalesce(requested_condition, condition),
    brand = case when requested_brand is null then brand else nullif(trim(requested_brand), '') end,
    city = coalesce(nullif(trim(requested_city), ''), city),
    state = coalesce(nullif(trim(requested_state), ''), state),
    zip_code = case when requested_zip_code is null then zip_code else nullif(trim(requested_zip_code), '') end,
    pickup_available = normalized_pickup,
    porch_pickup_available = normalized_porch_pickup,
    meetup_available = normalized_meetup,
    shipping_available = normalized_shipping_available,
    shipping_payer = case when normalized_shipping_available then coalesce(nullif(trim(requested_shipping_payer), ''), shipping_payer, 'buyer') else 'buyer' end,
    shipping_cost_estimate = case when normalized_shipping_available then coalesce(requested_shipping_cost_estimate, shipping_cost_estimate) else null end,
    handling_time = case when normalized_shipping_available then case when requested_handling_time is null then handling_time else nullif(trim(requested_handling_time), '') end else null end,
    ship_from_zip_code = case when normalized_shipping_available then case when requested_ship_from_zip_code is null then ship_from_zip_code else nullif(trim(requested_ship_from_zip_code), '') end else null end,
    item_dimensions = case when requested_item_dimensions is null then item_dimensions else nullif(trim(requested_item_dimensions), '') end,
    pet_size = case when requested_pet_size is null then pet_size else nullif(trim(requested_pet_size), '') end,
    condition_notes = case when requested_condition_notes is null then condition_notes else nullif(trim(requested_condition_notes), '') end,
    availability_notes = case when requested_availability_notes is null then availability_notes else nullif(trim(requested_availability_notes), '') end,
    reason_for_listing = case when requested_reason_for_listing is null then reason_for_listing else nullif(trim(requested_reason_for_listing), '') end,
    safety_confirmed = coalesce(requested_safety_confirmed, safety_confirmed)
  where id = target_listing_id
    and seller_id = caller_id
  returning * into updated_listing;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_updated', 'listings', target_listing_id, jsonb_build_object('source', 'update_my_listing'));

  return updated_listing;
end;
$$;


ALTER FUNCTION "public"."update_my_listing"("target_listing_id" "uuid", "requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_marketing_email_preference"("requested_granted" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
  values (caller_id, 'marketing_email', null, coalesce(requested_granted, false), 'settings');

  return coalesce(requested_granted, false);
end;
$$;


ALTER FUNCTION "public"."update_my_marketing_email_preference"("requested_granted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_notification_preferences"("requested_in_app_messages" boolean, "requested_in_app_favorites" boolean, "requested_in_app_reviews" boolean, "requested_in_app_marketplace_updates" boolean, "requested_in_app_system" boolean, "requested_push_messages" boolean, "requested_push_favorites" boolean, "requested_push_reviews" boolean, "requested_push_marketplace_updates" boolean) RETURNS TABLE("in_app_messages" boolean, "in_app_favorites" boolean, "in_app_reviews" boolean, "in_app_marketplace_updates" boolean, "in_app_system" boolean, "push_messages" boolean, "push_favorites" boolean, "push_reviews" boolean, "push_marketplace_updates" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."update_my_notification_preferences"("requested_in_app_messages" boolean, "requested_in_app_favorites" boolean, "requested_in_app_reviews" boolean, "requested_in_app_marketplace_updates" boolean, "requested_in_app_system" boolean, "requested_push_messages" boolean, "requested_push_favorites" boolean, "requested_push_reviews" boolean, "requested_push_marketplace_updates" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_profile"("requested_display_name" "text" DEFAULT NULL::"text", "requested_username" "text" DEFAULT NULL::"text", "requested_bio" "text" DEFAULT NULL::"text", "requested_avatar_url" "text" DEFAULT NULL::"text", "requested_city" "text" DEFAULT NULL::"text", "requested_state" "text" DEFAULT NULL::"text", "requested_zip_code" "text" DEFAULT NULL::"text") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  updated_profile public.profiles;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  if requested_display_name is not null and trim(requested_display_name) = '' then
    raise exception 'RETAIL_DISPLAY_NAME_REQUIRED' using errcode = '22023';
  end if;

  if requested_username is not null and trim(requested_username) = '' then
    raise exception 'RETAIL_USERNAME_REQUIRED' using errcode = '22023';
  end if;

  update public.profiles
  set
    display_name = coalesce(nullif(trim(requested_display_name), ''), display_name),
    username = coalesce(nullif(trim(requested_username), ''), username),
    bio = case when requested_bio is null then bio else nullif(trim(requested_bio), '') end,
    avatar_url = case when requested_avatar_url is null then avatar_url else nullif(trim(requested_avatar_url), '') end,
    city = case when requested_city is null then city else nullif(trim(requested_city), '') end,
    state = case when requested_state is null then state else nullif(trim(requested_state), '') end,
    zip_code = case when requested_zip_code is null then zip_code else nullif(trim(requested_zip_code), '') end
  where id = caller_id
  returning * into updated_profile;

  if not found then
    raise exception 'RETAIL_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return updated_profile;
end;
$$;


ALTER FUNCTION "public"."update_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_bio" "text", "requested_avatar_url" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_rescue_profile"("requested_name" "text", "requested_summary" "text", "requested_animals_rescued" "text"[], "requested_city" "text", "requested_state" "text", "requested_zip_code" "text" DEFAULT NULL::"text", "requested_address_line1" "text" DEFAULT NULL::"text", "requested_address_line2" "text" DEFAULT NULL::"text", "requested_contact_person" "text" DEFAULT NULL::"text", "requested_contact_email" "text" DEFAULT NULL::"text", "requested_contact_phone" "text" DEFAULT NULL::"text", "requested_organization_type" "text" DEFAULT 'foster_based'::"text", "requested_has_501c3" boolean DEFAULT false, "requested_ein" "text" DEFAULT NULL::"text", "requested_website_url" "text" DEFAULT NULL::"text", "requested_contact_hint" "text" DEFAULT NULL::"text") RETURNS "public"."rescue_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller_id uuid := auth.uid();
  caller_profile public.profiles;
  normalized_slug text;
  updated_rescue public.rescue_profiles;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
  into caller_profile
  from public.profiles
  where id = caller_id
    and account_type = 'rescue'::public.account_type
    and is_banned = false
    and deleted_at is null;

  if not found then
    raise exception 'RETAIL_RESCUE_ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  if trim(coalesce(requested_name, '')) = ''
    or trim(coalesce(requested_summary, '')) = ''
    or trim(coalesce(requested_city, '')) = ''
    or trim(coalesce(requested_state, '')) = ''
    or trim(coalesce(requested_contact_person, '')) = '' then
    raise exception 'RETAIL_RESCUE_PROFILE_REQUIRED' using errcode = '22023';
  end if;

  if requested_organization_type not in ('foster_based', 'physical_location', 'hybrid') then
    raise exception 'RETAIL_RESCUE_ORGANIZATION_TYPE_INVALID' using errcode = '22023';
  end if;

  normalized_slug := lower(regexp_replace(trim(requested_name), '[^a-zA-Z0-9]+', '-', 'g'));
  normalized_slug := trim(both '-' from normalized_slug);
  normalized_slug := left(coalesce(nullif(normalized_slug, ''), 'rescue'), 48) || '-' || left(caller_id::text, 8);

  insert into public.rescue_profiles (
    owner_id,
    name,
    slug,
    summary,
    animals_rescued,
    city,
    state,
    zip_code,
    address_line1,
    address_line2,
    contact_person,
    contact_email,
    contact_phone,
    organization_type,
    has_501c3,
    ein,
    website_url,
    contact_hint,
    verification_status,
    is_verified,
    is_active
  )
  values (
    caller_id,
    trim(requested_name),
    normalized_slug,
    trim(requested_summary),
    coalesce(requested_animals_rescued, '{}'::text[]),
    trim(requested_city),
    trim(requested_state),
    nullif(trim(coalesce(requested_zip_code, '')), ''),
    nullif(trim(coalesce(requested_address_line1, '')), ''),
    nullif(trim(coalesce(requested_address_line2, '')), ''),
    trim(requested_contact_person),
    nullif(trim(coalesce(requested_contact_email, '')), ''),
    nullif(trim(coalesce(requested_contact_phone, '')), ''),
    requested_organization_type,
    coalesce(requested_has_501c3, false),
    nullif(trim(coalesce(requested_ein, '')), ''),
    nullif(trim(coalesce(requested_website_url, '')), ''),
    nullif(trim(coalesce(requested_contact_hint, '')), ''),
    'pending',
    false,
    true
  )
  on conflict (owner_id)
  do update set
    name = excluded.name,
    summary = excluded.summary,
    animals_rescued = excluded.animals_rescued,
    city = excluded.city,
    state = excluded.state,
    zip_code = excluded.zip_code,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    contact_person = excluded.contact_person,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    organization_type = excluded.organization_type,
    has_501c3 = excluded.has_501c3,
    ein = excluded.ein,
    website_url = excluded.website_url,
    contact_hint = excluded.contact_hint
  returning * into updated_rescue;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action',
    'rescue_profiles',
    updated_rescue.id,
    jsonb_build_object('source', 'update_my_rescue_profile', 'verification_status_preserved', updated_rescue.verification_status)
  );

  return updated_rescue;
end;
$$;


ALTER FUNCTION "public"."update_my_rescue_profile"("requested_name" "text", "requested_summary" "text", "requested_animals_rescued" "text"[], "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_address_line1" "text", "requested_address_line2" "text", "requested_contact_person" "text", "requested_contact_email" "text", "requested_contact_phone" "text", "requested_organization_type" "text", "requested_has_501c3" boolean, "requested_ein" "text", "requested_website_url" "text", "requested_contact_hint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profile_listing_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform refresh_profile_listing_count(old.seller_id);
    return old;
  end if;

  perform refresh_profile_listing_count(new.seller_id);
  if tg_op = 'UPDATE' and old.seller_id is distinct from new.seller_id then
    perform refresh_profile_listing_count(old.seller_id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."update_profile_listing_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."uuid_or_null"("value" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."uuid_or_null"("value" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "event_type" "public"."audit_event_type" NOT NULL,
    "target_table" "text",
    "target_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "icon" "text",
    "parent_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "categories_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 80))),
    CONSTRAINT "categories_slug_check" CHECK (("slug" ~ '^[a-z0-9-]+$'::"text"))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"]))),
    CONSTRAINT "device_tokens_token_length" CHECK ((("char_length"("btrim"("token")) >= 1) AND ("char_length"("btrim"("token")) <= 4096)))
);


ALTER TABLE "public"."device_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "thumbnail_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "alt_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "listing_images_alt_text_check" CHECK ((("alt_text" IS NULL) OR ("char_length"("alt_text") <= 160))),
    CONSTRAINT "listing_images_sort_order_check" CHECK ((("sort_order" >= 0) AND ("sort_order" < 15)))
);


ALTER TABLE "public"."listing_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_search_area_change_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "search_area_id" "uuid" NOT NULL,
    "radius_miles" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketplace_search_area_change_events_radius_miles_check" CHECK (("radius_miles" = ANY (ARRAY[10, 25, 50, 100])))
);


ALTER TABLE "public"."marketplace_search_area_change_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketplace_search_area_change_events" IS 'Server-managed rate-limit log for successful marketplace search-area changes.';



CREATE TABLE IF NOT EXISTS "public"."marketplace_search_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "region_name" "text",
    "centroid" "public"."geography"(Point,4326) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."marketplace_search_areas" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketplace_search_areas" IS 'Server-controlled coarse marketplace areas. Clients must use safe RPCs and never receive centroids.';



CREATE TABLE IF NOT EXISTS "public"."marketplace_search_preferences" (
    "user_id" "uuid" NOT NULL,
    "search_area_id" "uuid" NOT NULL,
    "radius_miles" integer DEFAULT 25 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketplace_search_preferences_radius_miles_check" CHECK (("radius_miles" = ANY (ARRAY[10, 25, 50, 100])))
);


ALTER TABLE "public"."marketplace_search_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketplace_search_preferences" IS 'Owner-private marketplace search preference. Writes are allowed only through set_marketplace_search_area.';



CREATE TABLE IF NOT EXISTS "public"."notification_email_deliveries" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "public"."notification_type" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "resend_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_email_deliveries_recipient_email_check" CHECK ((POSITION(('@'::"text") IN ("recipient_email")) > 1)),
    CONSTRAINT "notification_email_deliveries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."notification_email_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "in_app_messages" boolean DEFAULT true NOT NULL,
    "in_app_favorites" boolean DEFAULT true NOT NULL,
    "in_app_reviews" boolean DEFAULT true NOT NULL,
    "in_app_marketplace_updates" boolean DEFAULT true NOT NULL,
    "in_app_system" boolean DEFAULT true NOT NULL,
    "push_messages" boolean DEFAULT false NOT NULL,
    "push_favorites" boolean DEFAULT false NOT NULL,
    "push_reviews" boolean DEFAULT false NOT NULL,
    "push_marketplace_updates" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_messages" boolean DEFAULT true NOT NULL,
    "email_favorites" boolean DEFAULT false NOT NULL,
    "email_reviews" boolean DEFAULT true NOT NULL,
    "email_marketplace_updates" boolean DEFAULT true NOT NULL,
    "email_system" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."privacy_settings" (
    "user_id" "uuid" NOT NULL,
    "profile_discoverable" boolean DEFAULT true NOT NULL,
    "show_city_state" boolean DEFAULT true NOT NULL,
    "allow_approximate_distance" boolean DEFAULT true NOT NULL,
    "allow_messages_from_buyers" boolean DEFAULT true NOT NULL,
    "rescue_public_contact_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rescue_public_address_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."privacy_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject_key" "text" DEFAULT 'global'::"text" NOT NULL,
    "request_fingerprint_hash" "text",
    "expires_at" timestamp with time zone,
    CONSTRAINT "rate_limit_events_action_length" CHECK ((("char_length"("action") >= 1) AND ("char_length"("action") <= 80))),
    CONSTRAINT "rate_limit_events_fingerprint_safe" CHECK ((("request_fingerprint_hash" IS NULL) OR ("request_fingerprint_hash" ~ '^[a-f0-9]{32,128}$'::"text"))),
    CONSTRAINT "rate_limit_events_subject_key_length" CHECK ((("char_length"("subject_key") >= 1) AND ("char_length"("subject_key") <= 160)))
);


ALTER TABLE "public"."rate_limit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_moderation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "admin_id" "uuid",
    "previous_status" "public"."report_status" NOT NULL,
    "new_status" "public"."report_status" NOT NULL,
    "note_present" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_moderation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rescue_needs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rescue_id" "uuid" NOT NULL,
    "item" "text" NOT NULL,
    "quantity" "text",
    "urgency" "text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "rescue_needs_item_check" CHECK ((("char_length"("item") >= 2) AND ("char_length"("item") <= 120))),
    CONSTRAINT "rescue_needs_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 500))),
    CONSTRAINT "rescue_needs_urgency_check" CHECK (("urgency" = ANY (ARRAY['High'::"text", 'Medium'::"text", 'Low'::"text"])))
);


ALTER TABLE "public"."rescue_needs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rescue_wishlist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rescue_id" "uuid" NOT NULL,
    "item" "text" NOT NULL,
    "quantity" "text",
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "rescue_wishlist_items_item_check" CHECK ((("char_length"("item") >= 2) AND ("char_length"("item") <= 120))),
    CONSTRAINT "rescue_wishlist_items_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 500))),
    CONSTRAINT "rescue_wishlist_items_priority_check" CHECK (("priority" = ANY (ARRAY['High'::"text", 'Medium'::"text", 'Low'::"text"])))
);


ALTER TABLE "public"."rescue_wishlist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_searches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "search_query" "text",
    "category_id" "uuid",
    "category_slug" "text",
    "category_name" "text",
    "min_price" numeric(10,2),
    "max_price" numeric(10,2),
    "condition" "public"."listing_condition",
    "listing_type" "public"."listing_type",
    "radius_miles" numeric DEFAULT 25 NOT NULL,
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "notifications_enabled" boolean DEFAULT true NOT NULL,
    "last_notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "saved_search_price_range" CHECK ((("min_price" IS NULL) OR ("max_price" IS NULL) OR ("min_price" <= "max_price"))),
    CONSTRAINT "saved_searches_max_price_check" CHECK ((("max_price" IS NULL) OR ("max_price" >= (0)::numeric))),
    CONSTRAINT "saved_searches_min_price_check" CHECK ((("min_price" IS NULL) OR ("min_price" >= (0)::numeric))),
    CONSTRAINT "saved_searches_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120))),
    CONSTRAINT "saved_searches_radius_miles_check" CHECK ((("radius_miles" > (0)::numeric) AND ("radius_miles" <= (500)::numeric))),
    CONSTRAINT "saved_searches_search_query_check" CHECK ((("search_query" IS NULL) OR ("char_length"("search_query") <= 120)))
);


ALTER TABLE "public"."saved_searches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storage_cleanup_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_id" "text" NOT NULL,
    "object_path" "text" NOT NULL,
    "source_table" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "storage_cleanup_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."storage_cleanup_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "livemode" boolean,
    "stripe_created_at" timestamp with time zone,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "processing_status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "last_error" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stripe_webhook_events_event_id_format" CHECK (("event_id" ~ '^evt_[A-Za-z0-9]+$'::"text")),
    CONSTRAINT "stripe_webhook_events_event_type_length" CHECK ((("char_length"("btrim"("event_type")) >= 1) AND ("char_length"("btrim"("event_type")) <= 120))),
    CONSTRAINT "stripe_webhook_events_processing_status_known" CHECK (("processing_status" = ANY (ARRAY['processing'::"text", 'processed'::"text", 'failed'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_payment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "amount_cents" integer,
    "stripe_created_at" timestamp with time zone,
    "payment_intent_id" "text",
    "charge_id" "text",
    "dispute_id" "text",
    "event_status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transaction_payment_events_amount_nonnegative" CHECK ((("amount_cents" IS NULL) OR ("amount_cents" >= 0))),
    CONSTRAINT "transaction_payment_events_charge_id_format" CHECK ((("charge_id" IS NULL) OR ("charge_id" ~ '^ch_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transaction_payment_events_dispute_id_format" CHECK ((("dispute_id" IS NULL) OR ("dispute_id" ~ '^dp_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transaction_payment_events_event_type_known" CHECK (("event_type" = ANY (ARRAY['payment_intent.succeeded'::"text", 'payment_intent.payment_failed'::"text", 'payment_intent.canceled'::"text", 'charge.refunded'::"text", 'charge.dispute.created'::"text", 'charge.dispute.updated'::"text", 'charge.dispute.closed'::"text"]))),
    CONSTRAINT "transaction_payment_events_payment_intent_format" CHECK ((("payment_intent_id" IS NULL) OR ("payment_intent_id" ~ '^pi_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transaction_payment_events_stripe_event_id_format" CHECK (("stripe_event_id" ~ '^evt_[A-Za-z0-9]+$'::"text"))
);


ALTER TABLE "public"."transaction_payment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "status" "public"."transaction_status" DEFAULT 'pending'::"public"."transaction_status" NOT NULL,
    "outcome" "public"."transaction_outcome",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "payment_method" "text",
    "payment_status" "text",
    "amount_cents" integer,
    "platform_fee_cents" integer,
    "seller_amount_cents" integer,
    "currency" "text" DEFAULT 'usd'::"text",
    "stripe_payment_intent_id" "text",
    "stripe_transfer_destination" "text",
    "payment_error" "text",
    "paid_at" timestamp with time zone,
    "refunded_amount_cents" integer DEFAULT 0 NOT NULL,
    "refunded_at" timestamp with time zone,
    "last_stripe_charge_id" "text",
    "stripe_dispute_id" "text",
    "dispute_status" "text",
    "dispute_amount_cents" integer,
    "dispute_reason" "text",
    "dispute_created_at" timestamp with time zone,
    "dispute_resolved_at" timestamp with time zone,
    "item_amount_cents" integer,
    "fulfillment_method" "text",
    "shipping_payer" "text",
    "shipping_amount_cents" integer,
    "shipping_collected_cents" integer,
    "shipping_carrier" "text",
    "shipping_service" "text",
    "tax_amount_cents" integer,
    "stripe_tax_calculation_id" "text",
    "stripe_tax_transaction_id" "text",
    "tax_behavior" "text",
    "tax_liability" "text",
    "product_tax_code" "text",
    "shipping_tax_code" "text",
    "retail_fee_tax_code" "text",
    "buyer_tax_address_source" "text",
    "buyer_tax_country" "text",
    "buyer_tax_state" "text",
    "buyer_tax_postal_code" "text",
    CONSTRAINT "completed_transaction_has_outcome" CHECK (((("status" = 'completed'::"public"."transaction_status") AND ("outcome" IS NOT NULL) AND ("completed_at" IS NOT NULL)) OR ("status" <> 'completed'::"public"."transaction_status"))),
    CONSTRAINT "transaction_has_two_people" CHECK (("buyer_id" <> "seller_id")),
    CONSTRAINT "transactions_authoritative_checkout_amounts_balance" CHECK ((("amount_cents" IS NULL) OR ("item_amount_cents" IS NULL) OR ("platform_fee_cents" IS NULL) OR ("seller_amount_cents" IS NULL) OR ("shipping_collected_cents" IS NULL) OR ("tax_amount_cents" IS NULL) OR (((("seller_amount_cents" + "platform_fee_cents") + "shipping_collected_cents") + "tax_amount_cents") = "amount_cents"))),
    CONSTRAINT "transactions_authoritative_checkout_amounts_nonnegative" CHECK (((("item_amount_cents" IS NULL) OR ("item_amount_cents" >= 0)) AND (("shipping_amount_cents" IS NULL) OR ("shipping_amount_cents" >= 0)) AND (("shipping_collected_cents" IS NULL) OR ("shipping_collected_cents" >= 0)) AND (("tax_amount_cents" IS NULL) OR ("tax_amount_cents" >= 0)))),
    CONSTRAINT "transactions_buyer_tax_country_format" CHECK ((("buyer_tax_country" IS NULL) OR ("buyer_tax_country" ~ '^[A-Z]{2}$'::"text"))),
    CONSTRAINT "transactions_buyer_tax_postal_code_length" CHECK ((("buyer_tax_postal_code" IS NULL) OR (("length"("buyer_tax_postal_code") >= 2) AND ("length"("buyer_tax_postal_code") <= 16)))),
    CONSTRAINT "transactions_buyer_tax_state_length" CHECK ((("buyer_tax_state" IS NULL) OR (("length"("buyer_tax_state") >= 2) AND ("length"("buyer_tax_state") <= 64)))),
    CONSTRAINT "transactions_currency_format" CHECK ((("currency" IS NULL) OR ("currency" ~ '^[a-z]{3}$'::"text"))),
    CONSTRAINT "transactions_dispute_amount_bounds" CHECK ((("dispute_amount_cents" IS NULL) OR (("dispute_amount_cents" >= 0) AND (("amount_cents" IS NULL) OR ("dispute_amount_cents" <= "amount_cents"))))),
    CONSTRAINT "transactions_dispute_reason_length" CHECK ((("dispute_reason" IS NULL) OR (("char_length"("dispute_reason") >= 1) AND ("char_length"("dispute_reason") <= 80)))),
    CONSTRAINT "transactions_dispute_status_known" CHECK ((("dispute_status" IS NULL) OR ("dispute_status" = ANY (ARRAY['warning_needs_response'::"text", 'warning_under_review'::"text", 'warning_closed'::"text", 'needs_response'::"text", 'under_review'::"text", 'won'::"text", 'lost'::"text", 'prevented'::"text"])))),
    CONSTRAINT "transactions_fulfillment_method_known" CHECK ((("fulfillment_method" IS NULL) OR ("fulfillment_method" = ANY (ARRAY['pickup'::"text", 'shipping'::"text"])))),
    CONSTRAINT "transactions_last_stripe_charge_id_format" CHECK ((("last_stripe_charge_id" IS NULL) OR ("last_stripe_charge_id" ~ '^ch_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transactions_payment_amounts_nonnegative" CHECK (((("amount_cents" IS NULL) OR ("amount_cents" >= 0)) AND (("platform_fee_cents" IS NULL) OR ("platform_fee_cents" >= 0)) AND (("seller_amount_cents" IS NULL) OR ("seller_amount_cents" >= 0)))),
    CONSTRAINT "transactions_payment_method_known" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['stripe'::"text", 'outside_app'::"text"])))),
    CONSTRAINT "transactions_payment_status_known" CHECK ((("payment_status" IS NULL) OR ("payment_status" = ANY (ARRAY['requires_payment_method'::"text", 'requires_confirmation'::"text", 'requires_action'::"text", 'processing'::"text", 'requires_capture'::"text", 'canceled'::"text", 'succeeded'::"text", 'failed'::"text", 'partially_refunded'::"text", 'refunded'::"text", 'disputed'::"text"])))),
    CONSTRAINT "transactions_refund_amount_bounds" CHECK ((("refunded_amount_cents" >= 0) AND (("amount_cents" IS NULL) OR ("refunded_amount_cents" <= "amount_cents")))),
    CONSTRAINT "transactions_shipping_payer_known" CHECK ((("shipping_payer" IS NULL) OR ("shipping_payer" = ANY (ARRAY['buyer'::"text", 'seller'::"text"])))),
    CONSTRAINT "transactions_stripe_dispute_id_format" CHECK ((("stripe_dispute_id" IS NULL) OR ("stripe_dispute_id" ~ '^dp_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transactions_stripe_payment_intent_id_format" CHECK ((("stripe_payment_intent_id" IS NULL) OR ("stripe_payment_intent_id" ~ '^pi_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transactions_stripe_tax_calculation_id_format" CHECK ((("stripe_tax_calculation_id" IS NULL) OR ("stripe_tax_calculation_id" ~ '^taxcalc_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transactions_stripe_tax_transaction_id_format" CHECK ((("stripe_tax_transaction_id" IS NULL) OR ("stripe_tax_transaction_id" ~ '^tax_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transactions_stripe_transfer_destination_format" CHECK ((("stripe_transfer_destination" IS NULL) OR ("stripe_transfer_destination" ~ '^acct_[A-Za-z0-9]+$'::"text"))),
    CONSTRAINT "transactions_tax_behavior_known" CHECK ((("tax_behavior" IS NULL) OR ("tax_behavior" = ANY (ARRAY['exclusive'::"text", 'inclusive'::"text"])))),
    CONSTRAINT "transactions_tax_code_format" CHECK (((("product_tax_code" IS NULL) OR ("product_tax_code" ~ '^txcd_[0-9]{8}$'::"text")) AND (("shipping_tax_code" IS NULL) OR ("shipping_tax_code" ~ '^txcd_[0-9]{8}$'::"text")) AND (("retail_fee_tax_code" IS NULL) OR ("retail_fee_tax_code" ~ '^txcd_[0-9]{8}$'::"text")))),
    CONSTRAINT "transactions_tax_liability_known" CHECK ((("tax_liability" IS NULL) OR ("tax_liability" = 'platform'::"text")))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "consent_type" "text" NOT NULL,
    "policy_version" "text",
    "granted" boolean NOT NULL,
    "source" "text" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_consents_check" CHECK (((("consent_type" = 'marketing_email'::"text") AND ("policy_version" IS NULL)) OR (("consent_type" <> 'marketing_email'::"text") AND ("policy_version" IS NOT NULL)))),
    CONSTRAINT "user_consents_consent_type_check" CHECK (("consent_type" = ANY (ARRAY['terms_of_service'::"text", 'community_guidelines'::"text", 'privacy_acknowledgment'::"text", 'marketing_email'::"text"]))),
    CONSTRAINT "user_consents_source_check" CHECK (("source" = ANY (ARRAY['email_signup'::"text", 'google_signup'::"text", 'legacy_user_gate'::"text", 'settings'::"text", 'unsubscribe'::"text", 'account_deletion'::"text"])))
);

ALTER TABLE ONLY "public"."user_consents" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_consents" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_consents" IS 'Append-only evidence of policy acceptance and marketing email preference changes. user_id intentionally remains as retained compliance evidence after Auth deletion.';



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE "public"."conversations"
    ADD CONSTRAINT "conversation_has_context" CHECK (((("listing_id" IS NOT NULL) AND ("rescue_id" IS NULL) AND ("report_id" IS NULL)) OR (("listing_id" IS NULL) AND ("rescue_id" IS NOT NULL) AND ("report_id" IS NULL)) OR (("listing_id" IS NULL) AND ("rescue_id" IS NULL) AND ("report_id" IS NOT NULL)))) NOT VALID;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_buyer_id_seller_id_key" UNIQUE ("listing_id", "buyer_id", "seller_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_listing_id_key" UNIQUE ("user_id", "listing_id");



ALTER TABLE ONLY "public"."listing_images"
    ADD CONSTRAINT "listing_images_listing_id_sort_order_key" UNIQUE ("listing_id", "sort_order");



ALTER TABLE ONLY "public"."listing_images"
    ADD CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_search_area_change_events"
    ADD CONSTRAINT "marketplace_search_area_change_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_search_areas"
    ADD CONSTRAINT "marketplace_search_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_search_areas"
    ADD CONSTRAINT "marketplace_search_areas_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."marketplace_search_preferences"
    ADD CONSTRAINT "marketplace_search_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_email_deliveries"
    ADD CONSTRAINT "notification_email_deliveries_pkey" PRIMARY KEY ("notification_id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."privacy_settings"
    ADD CONSTRAINT "privacy_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE "public"."rate_limit_events"
    ADD CONSTRAINT "rate_limit_events_metadata_size" CHECK (("char_length"(("metadata")::"text") <= 1200)) NOT VALID;



ALTER TABLE ONLY "public"."rate_limit_events"
    ADD CONSTRAINT "rate_limit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_moderation_events"
    ADD CONSTRAINT "report_moderation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rescue_needs"
    ADD CONSTRAINT "rescue_needs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rescue_profiles"
    ADD CONSTRAINT "rescue_profiles_owner_unique" UNIQUE ("owner_id");



ALTER TABLE ONLY "public"."rescue_profiles"
    ADD CONSTRAINT "rescue_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rescue_profiles"
    ADD CONSTRAINT "rescue_profiles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."rescue_wishlist_items"
    ADD CONSTRAINT "rescue_wishlist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_cleanup_jobs"
    ADD CONSTRAINT "storage_cleanup_jobs_bucket_id_object_path_source_table_sou_key" UNIQUE ("bucket_id", "object_path", "source_table", "source_id", "reason");



ALTER TABLE ONLY "public"."storage_cleanup_jobs"
    ADD CONSTRAINT "storage_cleanup_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."support_cases"
    ADD CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_payment_events"
    ADD CONSTRAINT "transaction_payment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_listing_id_buyer_id_seller_id_key" UNIQUE ("listing_id", "buyer_id", "seller_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "conversations_report_buyer_seller_unique" ON "public"."conversations" USING "btree" ("report_id", "buyer_id", "seller_id") WHERE (("report_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "conversations_rescue_buyer_seller_unique" ON "public"."conversations" USING "btree" ("rescue_id", "buyer_id", "seller_id") WHERE (("rescue_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "device_tokens_unique_token" ON "public"."device_tokens" USING "btree" ("token");



CREATE INDEX "idx_audit_logs_actor" ON "public"."audit_logs" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "idx_blocks_blocked" ON "public"."blocks" USING "btree" ("blocked_id");



CREATE INDEX "idx_blocks_blocker" ON "public"."blocks" USING "btree" ("blocker_id");



CREATE INDEX "idx_blocks_pair_lookup" ON "public"."blocks" USING "btree" ("blocker_id", "blocked_id");



CREATE INDEX "idx_categories_parent" ON "public"."categories" USING "btree" ("parent_id");



CREATE INDEX "idx_categories_slug" ON "public"."categories" USING "btree" ("slug");



CREATE INDEX "idx_conversations_buyer" ON "public"."conversations" USING "btree" ("buyer_id");



CREATE INDEX "idx_conversations_listing" ON "public"."conversations" USING "btree" ("listing_id");



CREATE INDEX "idx_conversations_participants_listing" ON "public"."conversations" USING "btree" ("buyer_id", "seller_id", "listing_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_conversations_report" ON "public"."conversations" USING "btree" ("report_id") WHERE ("report_id" IS NOT NULL);



CREATE INDEX "idx_conversations_rescue" ON "public"."conversations" USING "btree" ("rescue_id") WHERE ("rescue_id" IS NOT NULL);



CREATE INDEX "idx_conversations_seller" ON "public"."conversations" USING "btree" ("seller_id");



CREATE INDEX "idx_device_tokens_user" ON "public"."device_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_favorites_listing" ON "public"."favorites" USING "btree" ("listing_id");



CREATE INDEX "idx_favorites_user" ON "public"."favorites" USING "btree" ("user_id");



CREATE INDEX "idx_listing_images_listing" ON "public"."listing_images" USING "btree" ("listing_id", "sort_order");



CREATE INDEX "idx_listings_active_checkout_reservations" ON "public"."listings" USING "btree" ("id", "reserved_by", "reserved_until") WHERE ("reserved_until" IS NOT NULL);



CREATE INDEX "idx_listings_category" ON "public"."listings" USING "btree" ("category_id");



CREATE INDEX "idx_listings_created_at" ON "public"."listings" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_listings_location" ON "public"."listings" USING "btree" ("city", "state");



CREATE INDEX "idx_listings_location_point" ON "public"."listings" USING "gist" ("location_point");



CREATE INDEX "idx_listings_price" ON "public"."listings" USING "btree" ("price");



CREATE INDEX "idx_listings_search_area" ON "public"."listings" USING "btree" ("search_area_id") WHERE (("deleted_at" IS NULL) AND ("status" = 'active'::"public"."listing_status"));



CREATE INDEX "idx_listings_seller" ON "public"."listings" USING "btree" ("seller_id");



CREATE INDEX "idx_listings_status" ON "public"."listings" USING "btree" ("status");



CREATE INDEX "idx_listings_type" ON "public"."listings" USING "btree" ("listing_type");



CREATE INDEX "idx_marketplace_search_area_change_events_search_area" ON "public"."marketplace_search_area_change_events" USING "btree" ("search_area_id");



CREATE INDEX "idx_marketplace_search_area_change_events_user_created" ON "public"."marketplace_search_area_change_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_marketplace_search_areas_active" ON "public"."marketplace_search_areas" USING "btree" ("is_active", "state", "city");



CREATE INDEX "idx_marketplace_search_preferences_area" ON "public"."marketplace_search_preferences" USING "btree" ("search_area_id");



CREATE INDEX "idx_messages_attachment_path" ON "public"."messages" USING "btree" ("attachment_bucket", "attachment_path") WHERE ("attachment_path" IS NOT NULL);



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_messages_sender" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_messages_unread_by_conversation" ON "public"."messages" USING "btree" ("conversation_id", "is_read", "created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_notification_email_deliveries_status" ON "public"."notification_email_deliveries" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_notification_email_deliveries_user" ON "public"."notification_email_deliveries" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_notifications_user_live" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_profiles_city_state" ON "public"."profiles" USING "btree" ("city", "state");



CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "idx_rate_limit_events_action_created" ON "public"."rate_limit_events" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "idx_rate_limit_events_cleanup" ON "public"."rate_limit_events" USING "btree" ("created_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "idx_rate_limit_events_user_action_subject_created" ON "public"."rate_limit_events" USING "btree" ("user_id", "action", "subject_key", "created_at" DESC);



CREATE INDEX "idx_rate_limit_events_user_created" ON "public"."rate_limit_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_report_moderation_events_admin" ON "public"."report_moderation_events" USING "btree" ("admin_id", "created_at" DESC);



CREATE INDEX "idx_report_moderation_events_report" ON "public"."report_moderation_events" USING "btree" ("report_id", "created_at" DESC);



CREATE INDEX "idx_reports_reporter" ON "public"."reports" USING "btree" ("reporter_id");



CREATE INDEX "idx_reports_status" ON "public"."reports" USING "btree" ("status", "created_at");



CREATE INDEX "idx_reports_type" ON "public"."reports" USING "btree" ("report_type");



CREATE INDEX "idx_rescue_needs_rescue" ON "public"."rescue_needs" USING "btree" ("rescue_id", "is_active");



CREATE INDEX "idx_rescue_profiles_active" ON "public"."rescue_profiles" USING "btree" ("is_active", "is_verified", "deleted_at");



CREATE INDEX "idx_rescue_profiles_location_point" ON "public"."rescue_profiles" USING "gist" ("location_point");



CREATE INDEX "idx_rescue_profiles_search_area" ON "public"."rescue_profiles" USING "btree" ("search_area_id") WHERE (("deleted_at" IS NULL) AND ("is_active" = true));



CREATE INDEX "idx_rescue_wishlist_items_rescue" ON "public"."rescue_wishlist_items" USING "btree" ("rescue_id", "is_active");



CREATE INDEX "idx_reviews_listing" ON "public"."reviews" USING "btree" ("listing_id");



CREATE INDEX "idx_reviews_reviewee" ON "public"."reviews" USING "btree" ("reviewee_id", "created_at" DESC);



CREATE INDEX "idx_reviews_reviewer" ON "public"."reviews" USING "btree" ("reviewer_id");



CREATE INDEX "idx_saved_searches_alerts" ON "public"."saved_searches" USING "btree" ("notifications_enabled", "deleted_at");



CREATE INDEX "idx_saved_searches_category" ON "public"."saved_searches" USING "btree" ("category_id");



CREATE INDEX "idx_saved_searches_user" ON "public"."saved_searches" USING "btree" ("user_id", "deleted_at", "created_at" DESC);



CREATE INDEX "idx_storage_cleanup_jobs_status" ON "public"."storage_cleanup_jobs" USING "btree" ("status", "created_at");



CREATE INDEX "idx_stripe_webhook_events_status_received" ON "public"."stripe_webhook_events" USING "btree" ("processing_status", "received_at");



CREATE INDEX "idx_support_cases_admin_queue" ON "public"."support_cases" USING "btree" ("status", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_support_cases_parties" ON "public"."support_cases" USING "btree" ("buyer_id", "seller_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_support_cases_requester" ON "public"."support_cases" USING "btree" ("requester_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_support_cases_transaction" ON "public"."support_cases" USING "btree" ("transaction_id", "created_at" DESC);



CREATE INDEX "idx_transaction_payment_events_transaction" ON "public"."transaction_payment_events" USING "btree" ("transaction_id", "created_at" DESC);



CREATE INDEX "idx_transactions_buyer" ON "public"."transactions" USING "btree" ("buyer_id");



CREATE INDEX "idx_transactions_last_stripe_charge_id" ON "public"."transactions" USING "btree" ("last_stripe_charge_id") WHERE ("last_stripe_charge_id" IS NOT NULL);



CREATE INDEX "idx_transactions_listing" ON "public"."transactions" USING "btree" ("listing_id");



CREATE INDEX "idx_transactions_seller" ON "public"."transactions" USING "btree" ("seller_id");



CREATE INDEX "idx_transactions_stripe_tax_calculation_id" ON "public"."transactions" USING "btree" ("stripe_tax_calculation_id") WHERE ("stripe_tax_calculation_id" IS NOT NULL);



CREATE UNIQUE INDEX "notifications_unique_user_dedupe_key" ON "public"."notifications" USING "btree" ("user_id", "dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_stripe_connect_account_id_unique" ON "public"."profiles" USING "btree" ("stripe_connect_account_id") WHERE ("stripe_connect_account_id" IS NOT NULL);



CREATE UNIQUE INDEX "reports_one_active_listing_report" ON "public"."reports" USING "btree" ("reporter_id", "listing_id") WHERE (("report_type" = 'listing'::"public"."report_type") AND ("status" = ANY (ARRAY['open'::"public"."report_status", 'reviewing'::"public"."report_status"])) AND ("reporter_id" IS NOT NULL) AND ("listing_id" IS NOT NULL));



CREATE UNIQUE INDEX "reports_one_active_message_report" ON "public"."reports" USING "btree" ("reporter_id", "message_id") WHERE (("report_type" = 'message'::"public"."report_type") AND ("status" = ANY (ARRAY['open'::"public"."report_status", 'reviewing'::"public"."report_status"])) AND ("reporter_id" IS NOT NULL) AND ("message_id" IS NOT NULL));



CREATE UNIQUE INDEX "reports_one_active_user_report" ON "public"."reports" USING "btree" ("reporter_id", "reported_user_id") WHERE (("report_type" = 'user'::"public"."report_type") AND ("status" = ANY (ARRAY['open'::"public"."report_status", 'reviewing'::"public"."report_status"])) AND ("reporter_id" IS NOT NULL) AND ("reported_user_id" IS NOT NULL) AND ("message_id" IS NULL));



CREATE UNIQUE INDEX "reviews_one_per_reviewer_transaction" ON "public"."reviews" USING "btree" ("reviewer_id", "transaction_id") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "transaction_payment_events_stripe_event_id_unique" ON "public"."transaction_payment_events" USING "btree" ("stripe_event_id");



CREATE UNIQUE INDEX "transactions_one_completed_per_listing" ON "public"."transactions" USING "btree" ("listing_id") WHERE (("status" = 'completed'::"public"."transaction_status") AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "transactions_stripe_dispute_id_unique" ON "public"."transactions" USING "btree" ("stripe_dispute_id") WHERE ("stripe_dispute_id" IS NOT NULL);



CREATE UNIQUE INDEX "transactions_stripe_payment_intent_id_unique" ON "public"."transactions" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "user_consents_user_type_recorded_idx" ON "public"."user_consents" USING "btree" ("user_id", "consent_type", "recorded_at" DESC, "id" DESC);



CREATE OR REPLACE TRIGGER "enforce_listing_image_limit" BEFORE INSERT ON "public"."listing_images" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_listing_image_limit"();



CREATE OR REPLACE TRIGGER "enforce_paid_listing_payout_readiness_before_write" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_paid_listing_payout_readiness"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_block_delete" BEFORE DELETE ON "public"."blocks" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_block_write"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_block_insert" BEFORE INSERT ON "public"."blocks" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_block_write"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_conversation_insert" BEFORE INSERT ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_conversation_insert"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_device_token_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."device_tokens" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_device_token_write"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_favorite_delete" BEFORE DELETE ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_favorite_write"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_favorite_insert" BEFORE INSERT ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_favorite_write"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_listing_write" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_listing_write"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_message_insert" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_message_insert"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_report_insert" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_report_insert"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_review_insert" BEFORE INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_review_insert"();



CREATE OR REPLACE TRIGGER "enforce_phase_f_saved_search_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."saved_searches" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_phase_f_saved_search_write"();



CREATE OR REPLACE TRIGGER "favorite_delete_count" AFTER DELETE ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "public"."decrement_favorite_count"();



CREATE OR REPLACE TRIGGER "favorite_insert_count" AFTER INSERT ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "public"."increment_favorite_count"();



CREATE OR REPLACE TRIGGER "favorite_insert_notification" AFTER INSERT ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "public"."create_favorite_notification_after_insert"();



CREATE OR REPLACE TRIGGER "listing_delete_count" AFTER DELETE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_listing_count"();



CREATE OR REPLACE TRIGGER "listing_insert_count" AFTER INSERT ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_listing_count"();



CREATE OR REPLACE TRIGGER "listing_insert_saved_search_alerts" AFTER INSERT ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."create_saved_search_notifications_for_listing"();



CREATE OR REPLACE TRIGGER "listing_update_count" AFTER UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_listing_count"();



CREATE OR REPLACE TRIGGER "message_insert_update_conversation" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_after_message"();



CREATE OR REPLACE TRIGGER "prevent_profile_coordinate_mutation_before_write" BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_coordinate_mutation"();



CREATE OR REPLACE TRIGGER "prevent_profile_privilege_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_privilege_escalation"();



CREATE OR REPLACE TRIGGER "protect_checkout_reservation_listing_fields_before_write" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."protect_checkout_reservation_listing_fields"();



CREATE OR REPLACE TRIGGER "protect_conversation_phase_d_fields" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."protect_conversation_phase_d_fields"();



CREATE OR REPLACE TRIGGER "protect_listing_image_phase_d_fields" BEFORE INSERT OR UPDATE ON "public"."listing_images" FOR EACH ROW EXECUTE FUNCTION "public"."protect_listing_image_phase_d_fields"();



CREATE OR REPLACE TRIGGER "protect_listing_phase_c_fields_before_write" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."protect_listing_phase_c_fields"();



CREATE OR REPLACE TRIGGER "protect_message_phase_d_fields" BEFORE INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."protect_message_phase_d_fields"();



CREATE OR REPLACE TRIGGER "protect_notification_phase_e_fields" BEFORE INSERT OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."protect_notification_phase_e_fields"();



CREATE OR REPLACE TRIGGER "protect_profile_phase_c_fields_before_write" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_phase_c_fields"();



CREATE OR REPLACE TRIGGER "protect_report_moderation_event_phase_e" BEFORE INSERT OR DELETE OR UPDATE ON "public"."report_moderation_events" FOR EACH ROW EXECUTE FUNCTION "public"."protect_report_moderation_event_phase_e"();



CREATE OR REPLACE TRIGGER "protect_report_phase_e_fields" BEFORE INSERT OR UPDATE ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."protect_report_phase_e_fields"();



CREATE OR REPLACE TRIGGER "protect_rescue_profile_phase_c_fields_before_write" BEFORE INSERT OR UPDATE ON "public"."rescue_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_rescue_profile_phase_c_fields"();



CREATE OR REPLACE TRIGGER "protect_review_phase_e_fields" BEFORE INSERT OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."protect_review_phase_e_fields"();



CREATE OR REPLACE TRIGGER "protect_transaction_phase_e_fields" BEFORE INSERT OR UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."protect_transaction_phase_e_fields"();



CREATE OR REPLACE TRIGGER "record_account_deletion_marketing_opt_out" AFTER UPDATE OF "deleted_at" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."record_account_deletion_marketing_opt_out"();



CREATE OR REPLACE TRIGGER "set_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_device_tokens_updated_at" BEFORE UPDATE ON "public"."device_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_listing_search_area_before_write" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."set_listing_search_area_from_city_state"();



CREATE OR REPLACE TRIGGER "set_listings_updated_at" BEFORE UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_marketplace_search_areas_updated_at" BEFORE UPDATE ON "public"."marketplace_search_areas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_marketplace_search_preferences_updated_at" BEFORE UPDATE ON "public"."marketplace_search_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_notification_email_deliveries_updated_at" BEFORE UPDATE ON "public"."notification_email_deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_notification_preferences_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_privacy_settings_updated_at" BEFORE UPDATE ON "public"."privacy_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_reports_updated_at" BEFORE UPDATE ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_rescue_search_area_before_write" BEFORE INSERT OR UPDATE ON "public"."rescue_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_rescue_search_area_from_city_state"();



CREATE OR REPLACE TRIGGER "set_reviews_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_saved_searches_updated_at" BEFORE UPDATE ON "public"."saved_searches" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_support_cases_updated_at" BEFORE UPDATE ON "public"."support_cases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_listing_location_point_trigger" BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."sync_listing_location_point"();



CREATE OR REPLACE TRIGGER "sync_rescue_location_point_trigger" BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "public"."rescue_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_rescue_location_point"();



CREATE OR REPLACE TRIGGER "update_rescue_needs_updated_at" BEFORE UPDATE ON "public"."rescue_needs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "update_rescue_profiles_updated_at" BEFORE UPDATE ON "public"."rescue_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "update_rescue_wishlist_items_updated_at" BEFORE UPDATE ON "public"."rescue_wishlist_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_consents_reject_mutation" BEFORE DELETE OR UPDATE ON "public"."user_consents" FOR EACH ROW EXECUTE FUNCTION "private"."reject_user_consent_mutation"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_rescue_id_fkey" FOREIGN KEY ("rescue_id") REFERENCES "public"."rescue_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_images"
    ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_reservation_transaction_id_fkey" FOREIGN KEY ("reservation_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_reserved_by_fkey" FOREIGN KEY ("reserved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_search_area_id_fkey" FOREIGN KEY ("search_area_id") REFERENCES "public"."marketplace_search_areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_search_area_change_events"
    ADD CONSTRAINT "marketplace_search_area_change_events_search_area_id_fkey" FOREIGN KEY ("search_area_id") REFERENCES "public"."marketplace_search_areas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."marketplace_search_area_change_events"
    ADD CONSTRAINT "marketplace_search_area_change_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_search_preferences"
    ADD CONSTRAINT "marketplace_search_preferences_search_area_id_fkey" FOREIGN KEY ("search_area_id") REFERENCES "public"."marketplace_search_areas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."marketplace_search_preferences"
    ADD CONSTRAINT "marketplace_search_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_email_deliveries"
    ADD CONSTRAINT "notification_email_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_email_deliveries"
    ADD CONSTRAINT "notification_email_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."privacy_settings"
    ADD CONSTRAINT "privacy_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limit_events"
    ADD CONSTRAINT "rate_limit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_moderation_events"
    ADD CONSTRAINT "report_moderation_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."report_moderation_events"
    ADD CONSTRAINT "report_moderation_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rescue_needs"
    ADD CONSTRAINT "rescue_needs_rescue_id_fkey" FOREIGN KEY ("rescue_id") REFERENCES "public"."rescue_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rescue_profiles"
    ADD CONSTRAINT "rescue_profiles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rescue_profiles"
    ADD CONSTRAINT "rescue_profiles_search_area_id_fkey" FOREIGN KEY ("search_area_id") REFERENCES "public"."marketplace_search_areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rescue_wishlist_items"
    ADD CONSTRAINT "rescue_wishlist_items_rescue_id_fkey" FOREIGN KEY ("rescue_id") REFERENCES "public"."rescue_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewee_id_fkey" FOREIGN KEY ("reviewee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_cases"
    ADD CONSTRAINT "support_cases_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_cases"
    ADD CONSTRAINT "support_cases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_cases"
    ADD CONSTRAINT "support_cases_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_cases"
    ADD CONSTRAINT "support_cases_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_cases"
    ADD CONSTRAINT "support_cases_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_cases"
    ADD CONSTRAINT "support_cases_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transaction_payment_events"
    ADD CONSTRAINT "transaction_payment_events_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



CREATE POLICY "Active rescue needs are publicly readable" ON "public"."rescue_needs" FOR SELECT USING ((("is_active" = true) AND ("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."rescue_profiles"
  WHERE (("rescue_profiles"."id" = "rescue_needs"."rescue_id") AND ("rescue_profiles"."is_active" = true) AND ("rescue_profiles"."is_verified" = true) AND ("rescue_profiles"."deleted_at" IS NULL))))));



CREATE POLICY "Active rescue wishlist items are publicly readable" ON "public"."rescue_wishlist_items" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) AND ("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."rescue_profiles"
  WHERE (("rescue_profiles"."id" = "rescue_wishlist_items"."rescue_id") AND ("rescue_profiles"."is_active" = true) AND ("rescue_profiles"."is_verified" = true) AND ("rescue_profiles"."deleted_at" IS NULL))))));



CREATE POLICY "Admins can read support cases" ON "public"."support_cases" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND "private"."is_admin"("auth"."uid"())));



CREATE POLICY "Admins can read transaction payment events" ON "public"."transaction_payment_events" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND "private"."is_admin"("auth"."uid"())));



CREATE POLICY "Admins delete any listing" ON "public"."listings" FOR DELETE USING ("private"."is_admin"());



CREATE POLICY "Admins insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK ("private"."is_admin"());



CREATE POLICY "Admins manage categories" ON "public"."categories" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "Admins manage rescue needs" ON "public"."rescue_needs" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "Admins manage rescue profiles" ON "public"."rescue_profiles" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "Admins read any listing" ON "public"."listings" FOR SELECT USING ("private"."is_admin"());



CREATE POLICY "Admins read audit logs" ON "public"."audit_logs" FOR SELECT USING ("private"."is_admin"());



CREATE POLICY "Admins read marketplace search change events" ON "public"."marketplace_search_area_change_events" FOR SELECT TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "Admins read marketplace search preferences" ON "public"."marketplace_search_preferences" FOR SELECT TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "Admins read privacy settings" ON "public"."privacy_settings" FOR SELECT TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "Admins update any listing" ON "public"."listings" FOR UPDATE USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "Admins update any profile" ON "public"."profiles" FOR UPDATE USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "Authenticated rescue owners and admins manage wishlist items" ON "public"."rescue_wishlist_items" TO "authenticated" USING (("private"."is_account_active"() AND ("private"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."rescue_profiles"
  WHERE (("rescue_profiles"."id" = "rescue_wishlist_items"."rescue_id") AND ("rescue_profiles"."owner_id" = "auth"."uid"()))))))) WITH CHECK (("private"."is_account_active"() AND ("private"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."rescue_profiles"
  WHERE (("rescue_profiles"."id" = "rescue_wishlist_items"."rescue_id") AND ("rescue_profiles"."owner_id" = "auth"."uid"())))))));



CREATE POLICY "Buyers create conversations for themselves" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "buyer_id") AND ("buyer_id" <> "seller_id") AND "private"."is_account_active"("auth"."uid"()) AND ((("listing_id" IS NOT NULL) AND ("rescue_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "conversations"."listing_id") AND ("listings"."seller_id" = "conversations"."seller_id") AND ("listings"."status" = 'active'::"public"."listing_status") AND ("listings"."deleted_at" IS NULL))))) OR (("listing_id" IS NULL) AND ("rescue_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."rescue_profiles"
  WHERE (("rescue_profiles"."id" = "conversations"."rescue_id") AND ("rescue_profiles"."owner_id" = "conversations"."seller_id") AND ("rescue_profiles"."is_active" = true) AND ("rescue_profiles"."is_verified" = true) AND ("rescue_profiles"."verification_status" = 'verified'::"text") AND ("rescue_profiles"."deleted_at" IS NULL))))))));



CREATE POLICY "Categories are publicly readable" ON "public"."categories" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Listing images follow public listings" ON "public"."listing_images" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_images"."listing_id") AND ("listings"."status" = 'active'::"public"."listing_status") AND ("listings"."deleted_at" IS NULL)))));



CREATE POLICY "Listing owners delete own listings" ON "public"."listings" FOR DELETE USING ((("auth"."uid"() = "seller_id") AND "private"."is_account_active"()));



CREATE POLICY "Listing owners manage images" ON "public"."listing_images" USING (("private"."is_account_active"() AND (EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_images"."listing_id") AND ("listings"."seller_id" = "auth"."uid"())))))) WITH CHECK (("private"."is_account_active"() AND (EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_images"."listing_id") AND ("listings"."seller_id" = "auth"."uid"()))))));



CREATE POLICY "Phase D admins can update storage cleanup jobs" ON "public"."storage_cleanup_jobs" FOR UPDATE TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND "private"."is_admin"("auth"."uid"()))) WITH CHECK (("private"."is_account_active"("auth"."uid"()) AND "private"."is_admin"("auth"."uid"())));



CREATE POLICY "Phase D admins can view storage cleanup jobs" ON "public"."storage_cleanup_jobs" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND "private"."is_admin"("auth"."uid"())));



CREATE POLICY "Phase D participants can send messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "sender_id") AND "private"."is_account_active"("auth"."uid"()) AND ((("message_type" = 'text'::"public"."message_type") AND ("body" IS NOT NULL) AND (("char_length"(TRIM(BOTH FROM "body")) >= 1) AND ("char_length"(TRIM(BOTH FROM "body")) <= 2000))) OR (("message_type" = 'system'::"public"."message_type") AND ("body" IS NOT NULL) AND (("char_length"(TRIM(BOTH FROM "body")) >= 1) AND ("char_length"(TRIM(BOTH FROM "body")) <= 2000))) OR (("message_type" = 'image'::"public"."message_type") AND ("image_url" IS NOT NULL))) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ("c"."deleted_at" IS NULL) AND (("c"."buyer_id" = "auth"."uid"()) OR ("c"."seller_id" = "auth"."uid"())) AND (NOT "private"."is_blocked_between"("c"."buyer_id", "c"."seller_id")))))));



CREATE POLICY "Phase D participants can view conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND "private"."is_account_active"("auth"."uid"()) AND ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")) OR "private"."is_admin"("auth"."uid"()))));



CREATE POLICY "Phase D participants can view messages" ON "public"."messages" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND ("private"."is_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ("c"."deleted_at" IS NULL) AND (("auth"."uid"() = "c"."buyer_id") OR ("auth"."uid"() = "c"."seller_id"))))))));



CREATE POLICY "Phase D users can view own blocks" ON "public"."blocks" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND (("blocker_id" = "auth"."uid"()) OR "private"."is_admin"("auth"."uid"()))));



CREATE POLICY "Phase E admins can read report moderation events" ON "public"."report_moderation_events" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND "private"."is_admin"("auth"."uid"())));



CREATE POLICY "Phase E admins can read reports" ON "public"."reports" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND "private"."is_admin"("auth"."uid"())));



CREATE POLICY "Phase E public can read reviews" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING (("deleted_at" IS NULL));



CREATE POLICY "Phase E transaction participants can read" ON "public"."transactions" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")) OR "private"."is_admin"("auth"."uid"()))));



CREATE POLICY "Phase E users can read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND ("auth"."uid"() = "user_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "Rescue owners manage their needs" ON "public"."rescue_needs" USING (("private"."is_account_active"() AND (EXISTS ( SELECT 1
   FROM "public"."rescue_profiles"
  WHERE (("rescue_profiles"."id" = "rescue_needs"."rescue_id") AND ("rescue_profiles"."owner_id" = "auth"."uid"())))))) WITH CHECK (("private"."is_account_active"() AND (EXISTS ( SELECT 1
   FROM "public"."rescue_profiles"
  WHERE (("rescue_profiles"."id" = "rescue_needs"."rescue_id") AND ("rescue_profiles"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "Rescue owners manage their profiles" ON "public"."rescue_profiles" USING ((("owner_id" = "auth"."uid"()) AND "private"."is_account_active"())) WITH CHECK ((("owner_id" = "auth"."uid"()) AND "private"."is_account_active"()));



CREATE POLICY "Rescue owners read private profiles" ON "public"."rescue_profiles" FOR SELECT TO "authenticated" USING ((((( SELECT "auth"."uid"() AS "uid") = "owner_id") AND "private"."is_account_active"()) OR "private"."is_admin"()));



CREATE POLICY "Support case parties can read their cases" ON "public"."support_cases" FOR SELECT TO "authenticated" USING (("private"."is_account_active"("auth"."uid"()) AND ("deleted_at" IS NULL) AND (("requester_id" = "auth"."uid"()) OR ("buyer_id" = "auth"."uid"()) OR ("seller_id" = "auth"."uid"()))));



CREATE POLICY "Users create their own favorites" ON "public"."favorites" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "private"."is_account_active"()));



CREATE POLICY "Users create their own listings" ON "public"."listings" FOR INSERT WITH CHECK ((("auth"."uid"() = "seller_id") AND "private"."is_account_active"()));



CREATE POLICY "Users delete their own favorites" ON "public"."favorites" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "private"."is_account_active"()));



CREATE POLICY "Users insert own privacy settings" ON "public"."privacy_settings" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_account_active"()));



CREATE POLICY "Users insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((("auth"."uid"() = "id") AND ("is_admin" = false) AND ("is_banned" = false) AND ("is_verified" = false)));



CREATE POLICY "Users manage their own saved searches" ON "public"."saved_searches" USING ((("auth"."uid"() = "user_id") AND "private"."is_account_active"())) WITH CHECK ((("auth"."uid"() = "user_id") AND "private"."is_account_active"()));



CREATE POLICY "Users read own marketplace search preference" ON "public"."marketplace_search_preferences" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_account_active"()));



CREATE POLICY "Users read own notification email deliveries" ON "public"."notification_email_deliveries" FOR SELECT USING ((("auth"."uid"() = "user_id") AND "public"."is_account_active"()));



CREATE POLICY "Users read own privacy settings" ON "public"."privacy_settings" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_account_active"()));



CREATE POLICY "Users read own private listings" ON "public"."listings" FOR SELECT TO "authenticated" USING ((((( SELECT "auth"."uid"() AS "uid") = "seller_id") AND "private"."is_account_active"()) OR "private"."is_admin"()));



CREATE POLICY "Users read own private profile rows" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((((( SELECT "auth"."uid"() AS "uid") = "id") AND "private"."is_account_active"()) OR "private"."is_admin"()));



CREATE POLICY "Users read their own consent history" ON "public"."user_consents" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users read their own favorites" ON "public"."favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own privacy settings" ON "public"."privacy_settings" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_account_active"())) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_account_active"()));



CREATE POLICY "Users update their own listings" ON "public"."listings" FOR UPDATE USING ((("auth"."uid"() = "seller_id") AND "private"."is_account_active"())) WITH CHECK ((("auth"."uid"() = "seller_id") AND "private"."is_account_active"()));



CREATE POLICY "Users update their own profile" ON "public"."profiles" FOR UPDATE USING ((("auth"."uid"() = "id") AND "private"."is_account_active"())) WITH CHECK ((("auth"."uid"() = "id") AND "private"."is_account_active"()));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_search_area_change_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_search_areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_search_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_email_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."privacy_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_moderation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rescue_needs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rescue_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rescue_wishlist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_searches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_cleanup_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_payment_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_consents" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



-- Normalize app object privileges before replaying the verified remote grants.
-- Local Supabase defaults can differ from hosted defaults; the following grant
-- section should be authoritative for this baseline.
do $$
declare
  object_record record;
begin
  for object_record in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      object_record.nspname,
      object_record.proname,
      object_record.args
    );
  end loop;

  for object_record in
    select schemaname, tablename
    from pg_tables
    where schemaname in ('public')
  loop
    execute format(
      'revoke all on table %I.%I from public, anon, authenticated',
      object_record.schemaname,
      object_record.tablename
    );
  end loop;
end $$;



GRANT USAGE ON SCHEMA "private" TO "anon";
GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"("inet") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "anon";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("path") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("point") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "service_role";


























































































































































































REVOKE ALL ON FUNCTION "private"."can_access_message_attachment"("target_bucket" "text", "target_path" "text", "target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_message_attachment"("target_bucket" "text", "target_path" "text", "target_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."check_rate_limit"("requested_action" "text", "requested_subject_key" "text", "requested_limit" integer, "requested_window" interval, "requested_fingerprint_hash" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."cleanup_rate_limit_events"("batch_size" integer, "retention" interval) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."create_admin_report_message"("target_report_id" "uuid", "admin_user_id" "uuid", "recipient_user_id" "uuid", "message_body" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."create_notification_for_event"("target_user_id" "uuid", "requested_type" "public"."notification_type", "requested_title" "text", "requested_body" "text", "requested_route" "text", "requested_data" "jsonb", "requested_dedupe_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_block_write"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_conversation_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_device_token_write"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_favorite_write"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_listing_write"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_message_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_report_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_review_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_phase_f_saved_search_write"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."ensure_public_search_bounds"("page_number" integer, "page_size" integer, "search_query" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."has_current_policy_acceptance"("target_user_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_account_active"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_account_active"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."is_account_active"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_account_active"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_account_deletion_context"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_admin"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."is_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_admin"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_blocked_between"("first_user_id" "uuid", "second_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_blocked_between"("first_user_id" "uuid", "second_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_valid_message_attachment_path"("target_path" "text", "expected_conversation_id" "uuid", "expected_uploader_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_valid_message_attachment_path"("target_path" "text", "expected_conversation_id" "uuid", "expected_uploader_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."latest_marketing_email_preference"("target_user_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."message_attachment_path_is_valid"("target_conversation_id" "uuid", "target_sender_id" "uuid", "target_bucket" "text", "target_path" "text", "target_mime_type" "text", "target_size_bytes" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."normalized_message_fingerprint"("message_body" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."notification_preference_allows"("target_user_id" "uuid", "requested_type" "public"."notification_type") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."other_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."other_conversation_participant"("target_conversation_id" "uuid", "target_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."public_storage_path_from_url"("target_bucket" "text", "target_url" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."record_account_deletion_marketing_opt_out"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."record_auth_user_deletion_marketing_opt_out"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."record_email_signup_consents"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."reject_user_consent_mutation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."require_active_account"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."seller_payout_ready"("p_seller_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."uuid_from_text"("target_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."uuid_from_text"("target_text" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."addauth"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "service_role";
GRANT SELECT ON TABLE "public"."reports" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_moderate_report"("target_report_id" "uuid", "requested_status" "text", "requested_action" "text", "requested_admin_note" "text", "requested_admin_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_moderate_report"("target_report_id" "uuid", "requested_status" "text", "requested_action" "text", "requested_admin_note" "text", "requested_admin_message" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_moderate_report"("target_report_id" "uuid", "requested_status" "text", "requested_action" "text", "requested_admin_note" "text", "requested_admin_message" "text") TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."rescue_profiles" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."rescue_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."rescue_profiles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_rescue_verification"("target_rescue_id" "uuid", "requested_verification_status" "text", "requested_admin_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_rescue_verification"("target_rescue_id" "uuid", "requested_verification_status" "text", "requested_admin_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_set_rescue_verification"("target_rescue_id" "uuid", "requested_verification_status" "text", "requested_admin_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_report"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_report"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_update_report"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_report_phase_f_base"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_report_phase_f_base"("target_report_id" "uuid", "requested_status" "public"."report_status", "requested_admin_notes" "text") TO "service_role";



GRANT ALL ON TABLE "public"."support_cases" TO "service_role";
GRANT SELECT ON TABLE "public"."support_cases" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_transaction_support_case"("target_case_id" "uuid", "requested_status" "text", "requested_internal_note" "text", "requested_customer_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_transaction_support_case"("target_case_id" "uuid", "requested_status" "text", "requested_internal_note" "text", "requested_customer_message" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_update_transaction_support_case"("target_case_id" "uuid", "requested_status" "text", "requested_internal_note" "text", "requested_customer_message" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."allowed_distance_radius"("radius_miles" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."allowed_distance_radius"("radius_miles" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."approximate_distance_miles"("latitude_one" numeric, "longitude_one" numeric, "latitude_two" numeric, "longitude_two" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."approximate_distance_miles"("latitude_one" numeric, "longitude_one" numeric, "latitude_two" numeric, "longitude_two" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."approximate_distance_miles"("latitude_one" numeric, "longitude_one" numeric, "latitude_two" numeric, "longitude_two" numeric) TO "service_role";



GRANT MAINTAIN ON TABLE "public"."listings" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_my_listing"("target_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_my_listing"("target_listing_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."archive_my_listing"("target_listing_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."attach_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text", "p_transaction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text", "p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."blocks" TO "service_role";
GRANT SELECT ON TABLE "public"."blocks" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."block_user"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_user"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_stripe_webhook_event"("p_event_id" "text", "p_event_type" "text", "p_livemode" boolean, "p_stripe_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_stripe_webhook_event"("p_event_id" "text", "p_event_type" "text", "p_livemode" boolean, "p_stripe_created_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_listing_transaction"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_listing_transaction"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."complete_listing_transaction"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_listing_transaction_phase_f_base"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_listing_transaction_phase_f_base"("target_listing_id" "uuid", "target_outcome" "public"."transaction_outcome", "target_buyer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_favorite_notification_after_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_favorite_notification_after_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_listing"("requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_listing"("requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."create_listing"("requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_account_type" "public"."account_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_account_type" "public"."account_type") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_account_type" "public"."account_type") TO "authenticated";



GRANT ALL ON TABLE "public"."conversations" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."conversations" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_or_get_conversation"("target_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_or_get_conversation"("target_listing_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_or_get_conversation"("target_listing_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_or_get_conversation_phase_f_base"("target_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_or_get_conversation_phase_f_base"("target_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_saved_search_notifications_for_listing"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_saved_search_notifications_for_listing"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_stripe_payment_notification"("p_user_id" "uuid", "p_notification_type" "public"."notification_type", "p_title" "text", "p_body" "text", "p_route" "text", "p_data" "jsonb", "p_dedupe_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_stripe_payment_notification"("p_user_id" "uuid", "p_notification_type" "public"."notification_type", "p_title" "text", "p_body" "text", "p_route" "text", "p_data" "jsonb", "p_dedupe_key" "text") TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "service_role";
GRANT SELECT ON TABLE "public"."reviews" TO "anon";
GRANT SELECT ON TABLE "public"."reviews" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_transaction_review"("target_transaction_id" "uuid", "requested_rating" integer, "requested_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_transaction_review"("target_transaction_id" "uuid", "requested_rating" integer, "requested_comment" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_transaction_review"("target_transaction_id" "uuid", "requested_rating" integer, "requested_comment" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_transaction_support_case"("target_transaction_id" "uuid", "requested_requester_role" "text", "requested_issue_category" "text", "requested_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_transaction_support_case"("target_transaction_id" "uuid", "requested_requester_role" "text", "requested_issue_category" "text", "requested_description" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_transaction_support_case"("target_transaction_id" "uuid", "requested_requester_role" "text", "requested_issue_category" "text", "requested_description" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_user_notification"("target_user_id" "uuid", "notification_type_value" "public"."notification_type", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_user_notification"("target_user_id" "uuid", "notification_type_value" "public"."notification_type", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_notification"("target_user_id" "uuid", "notification_type_value" "public"."notification_type", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decrement_favorite_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrement_favorite_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_listing"("target_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_listing"("target_listing_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_my_listing"("target_listing_id" "uuid") TO "authenticated";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."notifications" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_my_notification"("target_notification_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_notification"("target_notification_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_my_notification"("target_notification_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."distance_band"("distance_miles" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."distance_band"("distance_miles" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_listing_image_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_listing_image_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_paid_listing_payout_readiness"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_paid_listing_payout_readiness"() TO "service_role";



GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_report_queue"("requested_view" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_report_queue"("requested_view" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_admin_report_queue"("requested_view" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_transaction_support_cases"("requested_view" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_transaction_support_cases"("requested_view" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_admin_transaction_support_cases"("requested_view" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_marketplace_search_areas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_marketplace_search_areas"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_marketplace_search_areas"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_marketplace_search_areas"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_consent_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_consent_state"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_consent_state"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_listings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_listings"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_listings"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_marketplace_search_preference"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_marketplace_search_preference"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_marketplace_search_preference"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_notification_preferences"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_notification_preferences"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_notification_preferences"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_reports"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_reports"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_reports"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_transaction_support_cases"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_transaction_support_cases"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_transaction_support_cases"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_nearby_listings"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_nearby_listings"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_nearby_listings"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_nearby_listings_phase_f_base"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_nearby_listings_phase_f_base"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_nearby_listings_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_nearby_listings_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "sort_order" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_nearby_listings_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_nearby_rescues"("search_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_nearby_rescues"("search_query" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_nearby_rescues"("search_query" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_nearby_rescues_phase_f_base"("search_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_nearby_rescues_phase_f_base"("search_query" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_nearby_rescues_v2"("search_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_nearby_rescues_v2"("search_query" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_nearby_rescues_v2"("search_query" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_listing_detail"("target_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_listing_detail"("target_listing_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_listing_detail"("target_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_listing_detail"("target_listing_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_listing_feed"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_listing_feed"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_listing_feed"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_listing_feed"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_listing_feed_phase_f_base"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_listing_feed_phase_f_base"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_listing_feed_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_listing_feed_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text", "sort_order" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_listing_feed_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text", "sort_order" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_listing_feed_sorted"("page_number" integer, "page_size" integer, "category_filter" "uuid", "search_query" "text", "min_price_filter" numeric, "max_price_filter" numeric, "condition_filter" "public"."listing_condition", "listing_type_filter" "public"."listing_type", "city_filter" "text", "state_filter" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_profile"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_profile"("target_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_profile"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_profile"("target_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_rescue"("target_rescue_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_rescue"("target_rescue_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_rescue"("target_rescue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_rescue"("target_rescue_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_rescue_by_owner"("target_owner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_rescue_by_owner"("target_owner_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_rescue_by_owner"("target_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_rescue_by_owner"("target_owner_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_rescue_by_owner_v2"("target_owner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_rescue_by_owner_v2"("target_owner_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_rescue_by_owner_v2"("target_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_rescue_by_owner_v2"("target_owner_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_rescue_feed"("page_number" integer, "page_size" integer, "search_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_rescue_feed"("page_number" integer, "page_size" integer, "search_query" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_rescue_feed"("page_number" integer, "page_size" integer, "search_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_rescue_feed"("page_number" integer, "page_size" integer, "search_query" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_rescue_feed_phase_f_base"("page_number" integer, "page_size" integer, "search_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_rescue_feed_phase_f_base"("page_number" integer, "page_size" integer, "search_query" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_rescue_feed_v2"("page_number" integer, "page_size" integer, "search_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_rescue_feed_v2"("page_number" integer, "page_size" integer, "search_query" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_rescue_feed_v2"("page_number" integer, "page_size" integer, "search_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_rescue_feed_v2"("page_number" integer, "page_size" integer, "search_query" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_user_listings"("target_user_id" "uuid", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_user_listings"("target_user_id" "uuid", "page_number" integer, "page_size" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_user_listings"("target_user_id" "uuid", "page_number" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_user_listings"("target_user_id" "uuid", "page_number" integer, "page_size" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_user_listings_phase_f_base"("target_user_id" "uuid", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_user_listings_phase_f_base"("target_user_id" "uuid", "page_number" integer, "page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_review_summary"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_review_summary"("target_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_review_summary"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_review_summary"("target_user_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "postgres";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "anon";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_existing_report"("report_target_type" "public"."report_type", "report_target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_existing_report"("report_target_type" "public"."report_type", "report_target_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_existing_report"("report_target_type" "public"."report_type", "report_target_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."increment_favorite_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_favorite_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_account_active"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_account_active"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "postgres";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_all_notifications_read"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_conversation_read"("target_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("target_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("target_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_my_listing_donated"("target_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_my_listing_donated"("target_listing_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_my_listing_donated"("target_listing_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_my_listing_sold"("target_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_my_listing_sold"("target_listing_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_my_listing_sold"("target_listing_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_notification_read"("target_notification_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_read"("target_notification_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("target_notification_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_stripe_webhook_event_failed"("p_event_id" "text", "p_last_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_stripe_webhook_event_failed"("p_event_id" "text", "p_last_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_stripe_webhook_event_processed"("p_event_id" "text", "p_processing_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_stripe_webhook_event_processed"("p_event_id" "text", "p_processing_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."marketplace_area_distance_band"("distance_miles" double precision, "same_area" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marketplace_area_distance_band"("distance_miles" double precision, "same_area" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."marketplace_area_distance_rank"("distance_miles" double precision, "same_area" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marketplace_area_distance_rank"("distance_miles" double precision, "same_area" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."marketplace_search_area_for_city_state"("input_city" "text", "input_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marketplace_search_area_for_city_state"("input_city" "text", "input_state" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_account_deletion_for_user"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_account_deletion_for_user"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_profile_coordinate_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_profile_coordinate_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_profile_privilege_escalation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_profile_privilege_escalation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_checkout_reservation_listing_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_checkout_reservation_listing_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_conversation_phase_d_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_conversation_phase_d_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_listing_image_phase_d_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_listing_image_phase_d_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_listing_phase_c_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_listing_phase_c_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_listing_phase_c_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_message_phase_d_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_message_phase_d_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_notification_phase_e_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_notification_phase_e_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_phase_c_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_phase_c_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_report_moderation_event_phase_e"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_report_moderation_event_phase_e"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_report_phase_e_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_report_phase_e_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_rescue_profile_phase_c_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_rescue_profile_phase_c_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_rescue_profile_phase_c_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_review_phase_e_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_review_phase_e_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_transaction_phase_e_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_transaction_phase_e_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_my_policy_acceptance"("requested_terms_version" "text", "requested_community_guidelines_version" "text", "requested_privacy_version" "text", "requested_marketing_email_opt_in" boolean, "requested_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_my_policy_acceptance"("requested_terms_version" "text", "requested_community_guidelines_version" "text", "requested_privacy_version" "text", "requested_marketing_email_opt_in" boolean, "requested_source" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."record_my_policy_acceptance"("requested_terms_version" "text", "requested_community_guidelines_version" "text", "requested_privacy_version" "text", "requested_marketing_email_opt_in" boolean, "requested_source" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_stripe_transaction_payment_event"("p_transaction_id" "uuid", "p_stripe_event_id" "text", "p_event_type" "text", "p_amount_cents" integer, "p_stripe_created_at" timestamp with time zone, "p_payment_intent_id" "text", "p_charge_id" "text", "p_dispute_id" "text", "p_event_status" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_stripe_transaction_payment_event"("p_transaction_id" "uuid", "p_stripe_event_id" "text", "p_event_type" "text", "p_amount_cents" integer, "p_stripe_created_at" timestamp with time zone, "p_payment_intent_id" "text", "p_charge_id" "text", "p_dispute_id" "text", "p_event_status" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_profile_listing_count"("profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_profile_listing_count"("profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_my_device_token"("requested_token" "text", "requested_platform" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_my_device_token"("requested_token" "text", "requested_platform" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."register_my_device_token"("requested_token" "text", "requested_platform" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."release_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_stripe_checkout_reservation"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_intent_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_my_device_token"("requested_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_my_device_token"("requested_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."remove_my_device_token"("requested_token" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_stripe_checkout_listing"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_requested_amount_cents" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_stripe_checkout_listing"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_requested_amount_cents" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_uuid"("value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_uuid"("value" "text") TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."messages" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."send_message"("target_conversation_id" "uuid", "requested_message_type" "public"."message_type", "requested_body" "text", "requested_attachment_bucket" "text", "requested_attachment_path" "text", "requested_attachment_mime_type" "text", "requested_attachment_size_bytes" integer, "requested_attachment_width" integer, "requested_attachment_height" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_message"("target_conversation_id" "uuid", "requested_message_type" "public"."message_type", "requested_body" "text", "requested_attachment_bucket" "text", "requested_attachment_path" "text", "requested_attachment_mime_type" "text", "requested_attachment_size_bytes" integer, "requested_attachment_width" integer, "requested_attachment_height" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."send_message"("target_conversation_id" "uuid", "requested_message_type" "public"."message_type", "requested_body" "text", "requested_attachment_bucket" "text", "requested_attachment_path" "text", "requested_attachment_mime_type" "text", "requested_attachment_size_bytes" integer, "requested_attachment_width" integer, "requested_attachment_height" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_listing_search_area_from_city_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_listing_search_area_from_city_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_marketplace_search_area"("requested_search_area_id" "uuid", "requested_radius_miles" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_marketplace_search_area"("requested_search_area_id" "uuid", "requested_radius_miles" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."set_marketplace_search_area"("requested_search_area_id" "uuid", "requested_radius_miles" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_rescue_search_area_from_city_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_rescue_search_area_from_city_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."soft_delete_own_message"("target_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."soft_delete_own_message"("target_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_own_message"("target_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_report"("report_target_type" "public"."report_type", "report_target_id" "uuid", "report_reason_value" "public"."report_reason", "report_details" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_report"("report_target_type" "public"."report_type", "report_target_id" "uuid", "report_reason_value" "public"."report_reason", "report_details" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."submit_report"("report_target_type" "public"."report_type", "report_target_id" "uuid", "report_reason_value" "public"."report_reason", "report_details" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sync_listing_location_point"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_listing_location_point"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_rescue_location_point"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_rescue_location_point"() TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unblock_user"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unblock_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unblock_user"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_conversation_after_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_conversation_after_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_my_listing"("target_listing_id" "uuid", "requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_listing"("target_listing_id" "uuid", "requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_my_listing"("target_listing_id" "uuid", "requested_category_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_condition" "public"."listing_condition", "requested_listing_type" "public"."listing_type", "requested_price" numeric, "requested_brand" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_pickup_available" boolean, "requested_porch_pickup_available" boolean, "requested_meetup_available" boolean, "requested_shipping_available" boolean, "requested_shipping_payer" "text", "requested_shipping_cost_estimate" numeric, "requested_handling_time" "text", "requested_ship_from_zip_code" "text", "requested_item_dimensions" "text", "requested_pet_size" "text", "requested_condition_notes" "text", "requested_availability_notes" "text", "requested_reason_for_listing" "text", "requested_safety_confirmed" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_my_marketing_email_preference"("requested_granted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_marketing_email_preference"("requested_granted" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_my_marketing_email_preference"("requested_granted" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_my_notification_preferences"("requested_in_app_messages" boolean, "requested_in_app_favorites" boolean, "requested_in_app_reviews" boolean, "requested_in_app_marketplace_updates" boolean, "requested_in_app_system" boolean, "requested_push_messages" boolean, "requested_push_favorites" boolean, "requested_push_reviews" boolean, "requested_push_marketplace_updates" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_notification_preferences"("requested_in_app_messages" boolean, "requested_in_app_favorites" boolean, "requested_in_app_reviews" boolean, "requested_in_app_marketplace_updates" boolean, "requested_in_app_system" boolean, "requested_push_messages" boolean, "requested_push_favorites" boolean, "requested_push_reviews" boolean, "requested_push_marketplace_updates" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_my_notification_preferences"("requested_in_app_messages" boolean, "requested_in_app_favorites" boolean, "requested_in_app_reviews" boolean, "requested_in_app_marketplace_updates" boolean, "requested_in_app_system" boolean, "requested_push_messages" boolean, "requested_push_favorites" boolean, "requested_push_reviews" boolean, "requested_push_marketplace_updates" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_bio" "text", "requested_avatar_url" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_bio" "text", "requested_avatar_url" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_my_profile"("requested_display_name" "text", "requested_username" "text", "requested_bio" "text", "requested_avatar_url" "text", "requested_city" "text", "requested_state" "text", "requested_zip_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_my_rescue_profile"("requested_name" "text", "requested_summary" "text", "requested_animals_rescued" "text"[], "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_address_line1" "text", "requested_address_line2" "text", "requested_contact_person" "text", "requested_contact_email" "text", "requested_contact_phone" "text", "requested_organization_type" "text", "requested_has_501c3" boolean, "requested_ein" "text", "requested_website_url" "text", "requested_contact_hint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_rescue_profile"("requested_name" "text", "requested_summary" "text", "requested_animals_rescued" "text"[], "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_address_line1" "text", "requested_address_line2" "text", "requested_contact_person" "text", "requested_contact_email" "text", "requested_contact_phone" "text", "requested_organization_type" "text", "requested_has_501c3" boolean, "requested_ein" "text", "requested_website_url" "text", "requested_contact_hint" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_my_rescue_profile"("requested_name" "text", "requested_summary" "text", "requested_animals_rescued" "text"[], "requested_city" "text", "requested_state" "text", "requested_zip_code" "text", "requested_address_line1" "text", "requested_address_line2" "text", "requested_contact_person" "text", "requested_contact_email" "text", "requested_contact_phone" "text", "requested_organization_type" "text", "requested_has_501c3" boolean, "requested_ein" "text", "requested_website_url" "text", "requested_contact_hint" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_profile_listing_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_profile_listing_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."uuid_or_null"("value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."uuid_or_null"("value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."uuid_or_null"("value" "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "service_role";















GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."device_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."listing_images" TO "anon";
GRANT ALL ON TABLE "public"."listing_images" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_images" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_search_area_change_events" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_search_areas" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_search_preferences" TO "service_role";
GRANT SELECT ON TABLE "public"."marketplace_search_preferences" TO "authenticated";



GRANT ALL ON TABLE "public"."notification_email_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."notification_email_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_email_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."privacy_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."privacy_settings" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_events" TO "service_role";



GRANT ALL ON TABLE "public"."report_moderation_events" TO "service_role";
GRANT SELECT ON TABLE "public"."report_moderation_events" TO "authenticated";



GRANT ALL ON TABLE "public"."rescue_needs" TO "anon";
GRANT ALL ON TABLE "public"."rescue_needs" TO "authenticated";
GRANT ALL ON TABLE "public"."rescue_needs" TO "service_role";



GRANT ALL ON TABLE "public"."rescue_wishlist_items" TO "anon";
GRANT ALL ON TABLE "public"."rescue_wishlist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rescue_wishlist_items" TO "service_role";



GRANT ALL ON TABLE "public"."saved_searches" TO "anon";
GRANT ALL ON TABLE "public"."saved_searches" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_searches" TO "service_role";



GRANT ALL ON TABLE "public"."storage_cleanup_jobs" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."storage_cleanup_jobs" TO "authenticated";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_payment_events" TO "service_role";
GRANT SELECT ON TABLE "public"."transaction_payment_events" TO "authenticated";



GRANT ALL ON TABLE "public"."transactions" TO "service_role";
GRANT SELECT ON TABLE "public"."transactions" TO "authenticated";



GRANT ALL ON TABLE "public"."user_consents" TO "service_role";
GRANT SELECT ON TABLE "public"."user_consents" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




































-- ReTail storage bucket seed and storage.objects policies.
-- Schema-only dumps do not preserve storage.buckets rows, so ReTail-owned buckets are seeded explicitly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('listings', 'listings', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('message-images', 'message-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Phase D listing owners can manage listing images" on storage.objects;
drop policy if exists "Phase D owner can manage avatar images" on storage.objects;
drop policy if exists "Phase D participants can read message images" on storage.objects;
drop policy if exists "Phase D participants can upload message images" on storage.objects;
drop policy if exists "Phase D uploader can delete message images" on storage.objects;
drop policy if exists "Phase D uploader can inspect own unsent message images for clea" on storage.objects;
drop policy if exists "Phase D uploader can update message images" on storage.objects;

CREATE POLICY "Phase D listing owners can manage listing images" ON "storage"."objects" TO "authenticated" USING ((("bucket_id" = 'listings'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "private"."is_account_active"("auth"."uid"()) AND ("array_length"("storage"."foldername"("name"), 1) >= 2) AND (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "private"."uuid_from_text"(("storage"."foldername"("objects"."name"))[2])) AND ("l"."seller_id" = "auth"."uid"()) AND ("l"."deleted_at" IS NULL)))) AND "storage"."allow_any_operation"(ARRAY['object.get_authenticated'::"text", 'object.get_authenticated_info'::"text", 'object.upload'::"text", 'object.update'::"text", 'object.delete'::"text"]))) WITH CHECK ((("bucket_id" = 'listings'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND ("array_length"("storage"."foldername"("name"), 1) >= 2) AND ("lower"("storage"."extension"("name")) = ANY (ARRAY['jpg'::"text", 'jpeg'::"text", 'png'::"text", 'webp'::"text"])) AND "private"."is_account_active"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "private"."uuid_from_text"(("storage"."foldername"("objects"."name"))[2])) AND ("l"."seller_id" = "auth"."uid"()) AND ("l"."deleted_at" IS NULL))))));



CREATE POLICY "Phase D owner can manage avatar images" ON "storage"."objects" TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "private"."is_account_active"("auth"."uid"()) AND "storage"."allow_any_operation"(ARRAY['object.get_authenticated'::"text", 'object.get_authenticated_info'::"text", 'object.upload'::"text", 'object.update'::"text", 'object.delete'::"text"]))) WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND ("lower"("storage"."extension"("name")) = ANY (ARRAY['jpg'::"text", 'jpeg'::"text", 'png'::"text", 'webp'::"text"])) AND "private"."is_account_active"("auth"."uid"())));



CREATE POLICY "Phase D participants can read message images" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'message-images'::"text") AND "private"."can_access_message_attachment"("bucket_id", "name", "auth"."uid"()) AND "storage"."allow_any_operation"(ARRAY['object.get_authenticated'::"text", 'object.get_authenticated_info'::"text", 'object.sign'::"text"])));



CREATE POLICY "Phase D participants can upload message images" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'message-images'::"text") AND "private"."is_valid_message_attachment_path"("name", "private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND ("lower"("storage"."extension"("name")) = ANY (ARRAY['jpg'::"text", 'jpeg'::"text", 'png'::"text", 'webp'::"text"])) AND "private"."is_account_active"("auth"."uid"()) AND "private"."is_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND (NOT "private"."is_blocked_between"("auth"."uid"(), "private"."other_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"())))));



CREATE POLICY "Phase D uploader can delete message images" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'message-images'::"text") AND "private"."is_valid_message_attachment_path"("name", "private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND "private"."is_account_active"("auth"."uid"()) AND "private"."is_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"())));



CREATE POLICY "Phase D uploader can inspect own unsent message images for clea" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'message-images'::"text") AND "private"."is_valid_message_attachment_path"("name", "private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND "private"."is_account_active"("auth"."uid"()) AND "private"."is_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"())));



CREATE POLICY "Phase D uploader can update message images" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'message-images'::"text") AND "private"."is_valid_message_attachment_path"("name", "private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND "private"."is_account_active"("auth"."uid"()) AND "private"."is_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND (NOT "private"."is_blocked_between"("auth"."uid"(), "private"."other_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()))))) WITH CHECK ((("bucket_id" = 'message-images'::"text") AND "private"."is_valid_message_attachment_path"("name", "private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND ("lower"("storage"."extension"("name")) = ANY (ARRAY['jpg'::"text", 'jpeg'::"text", 'png'::"text", 'webp'::"text"])) AND "private"."is_account_active"("auth"."uid"()) AND "private"."is_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"()) AND (NOT "private"."is_blocked_between"("auth"."uid"(), "private"."other_conversation_participant"("private"."uuid_from_text"(("storage"."foldername"("name"))[1]), "auth"."uid"())))));
