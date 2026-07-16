-- ReTail Sprint 5.5 security remediation gate.
-- Run after schema.sql, policies.sql, distance.sql, rescue_accounts.sql,
-- realtime_messaging.sql, and sprint5_trust_settings.sql.
--
-- This file is intentionally additive and reviewable. It tightens direct API
-- writes, creates safe public discovery RPCs, and moves sensitive client actions
-- behind server-controlled database functions.

create extension if not exists pgcrypto;
create extension if not exists postgis;

alter table profiles
  add column if not exists completed_sales_count integer not null default 0 check (completed_sales_count >= 0);

alter table rescue_profiles
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references profiles(id) on delete set null,
  add column if not exists public_address_enabled boolean not null default false;

create or replace function protect_profile_system_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if is_admin() then
    return new;
  end if;

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
    or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Profile system fields cannot be changed directly.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_privilege_escalation on profiles;
drop trigger if exists protect_profile_system_fields on profiles;
create trigger protect_profile_system_fields
  before update on profiles
  for each row execute function protect_profile_system_fields();

create or replace function protect_rescue_verification_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is distinct from auth.uid()
      or new.is_verified = true
      or new.verification_status = 'verified'
      or new.verified_at is not null
      or new.verified_by is not null then
      raise exception 'Rescue verification is admin-controlled.';
    end if;

    new.is_verified := false;
    if new.verification_status is null or new.verification_status = 'verified' then
      new.verification_status := 'pending';
    end if;
    new.verified_at := null;
    new.verified_by := null;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
    or new.is_verified is distinct from old.is_verified
    or new.verification_status is distinct from old.verification_status
    or new.verified_at is distinct from old.verified_at
    or new.verified_by is distinct from old.verified_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Rescue verification fields cannot be changed directly.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_rescue_verification_fields on rescue_profiles;
create trigger protect_rescue_verification_fields
  before insert or update on rescue_profiles
  for each row execute function protect_rescue_verification_fields();

create or replace function prevent_conversation_identity_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.listing_id is distinct from old.listing_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Conversation participants, listing, and creation time cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_conversation_identity_update on conversations;
create trigger prevent_conversation_identity_update
  before update on conversations
  for each row execute function prevent_conversation_identity_update();

create or replace function prevent_message_content_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
    or new.sender_id is distinct from old.sender_id
    or new.message_type is distinct from old.message_type
    or new.body is distinct from old.body
    or new.image_url is distinct from old.image_url
    or new.created_at is distinct from old.created_at then
    raise exception 'Message contents and identity cannot be edited after sending.';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and old.sender_id is distinct from auth.uid()
    and not is_admin() then
    raise exception 'Only the sender can soft delete their message.';
  end if;

  if (new.is_read is distinct from old.is_read or new.read_at is distinct from old.read_at)
    and old.sender_id = auth.uid()
    and not is_admin() then
    raise exception 'Senders cannot mark their own messages read.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_message_content_update on messages;
create trigger prevent_message_content_update
  before update on messages
  for each row execute function prevent_message_content_update();

create or replace function protect_transaction_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Transaction participants and listing cannot be changed.';
    end if;

    if old.status in ('completed', 'cancelled') and new.status is distinct from old.status then
      raise exception 'Completed or cancelled transactions cannot be reopened directly.';
    end if;

    if old.status = 'pending' and new.status not in ('completed', 'cancelled') then
      raise exception 'Invalid transaction status transition.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_transaction_state on transactions;
create trigger protect_transaction_state
  before update on transactions
  for each row execute function protect_transaction_state();

create or replace function prevent_review_identity_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not is_admin() and (
    new.transaction_id is distinct from old.transaction_id
    or new.listing_id is distinct from old.listing_id
    or new.reviewer_id is distinct from old.reviewer_id
    or new.reviewee_id is distinct from old.reviewee_id
    or new.rating is distinct from old.rating
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Review identity and rating cannot be edited after submission.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_review_identity_update on reviews;
create trigger prevent_review_identity_update
  before update on reviews
  for each row execute function prevent_review_identity_update();

create or replace function get_nearby_listings(
  user_latitude numeric,
  user_longitude numeric,
  radius_miles numeric default 25,
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter listing_condition default null,
  listing_type_filter listing_type default null
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type listing_type,
  condition listing_condition,
  status listing_status,
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
  distance_miles double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with origin as (
    select st_setsrid(st_makepoint(user_longitude::double precision, user_latitude::double precision), 4326)::geography as point
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
          order by li.sort_order asc
        )
        from listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    round((st_distance(l.location_point, origin.point) / 1609.344)::numeric, 1)::double precision as distance_miles
  from listings l
  cross join origin
  join categories c on c.id = l.category_id
  join profiles p on p.id = l.seller_id
  where l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and l.location_point is not null
    and st_dwithin(l.location_point, origin.point, least(greatest(radius_miles, 1), 500) * 1609.344)
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
      from blocks
      where auth.uid() is not null
        and (
          (blocks.blocker_id = auth.uid() and blocks.blocked_id = l.seller_id)
          or (blocks.blocked_id = auth.uid() and blocks.blocker_id = l.seller_id)
        )
    )
  order by distance_miles asc, l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create or replace function get_public_listing_detail(target_listing_id uuid)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type listing_type,
  condition listing_condition,
  status listing_status,
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
  related_listings jsonb
)
language sql
stable
security definer
set search_path = public
as $$
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
          order by li.sort_order asc
        )
        from listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    coalesce(
      (
        select jsonb_agg(to_jsonb(related_safe))
        from (
          select *
          from get_nearby_listings(
            coalesce(l.latitude, 0),
            coalesce(l.longitude, 0),
            500,
            1,
            4,
            l.category_id,
            null,
            null,
            null,
            null,
            null
          ) related
          where related.id <> l.id
          limit 4
        ) related_safe
      ),
      '[]'::jsonb
    ) as related_listings
  from listings l
  join categories c on c.id = l.category_id
  join profiles p on p.id = l.seller_id
  where l.id = target_listing_id
    and l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false;
$$;

create or replace function get_nearby_rescues(
  user_latitude numeric,
  user_longitude numeric,
  radius_miles numeric default 25,
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
  organization_type text,
  has_501c3 boolean,
  verification_status text,
  is_verified boolean,
  needs jsonb,
  wishlist_items jsonb,
  distance_miles double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with origin as (
    select st_setsrid(st_makepoint(user_longitude::double precision, user_latitude::double precision), 4326)::geography as point
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
    rp.contact_hint,
    rp.organization_type,
    rp.has_501c3,
    rp.verification_status,
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
      from rescue_needs rn
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
      from rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id
        and rwi.is_active = true
        and rwi.deleted_at is null
    ) as wishlist_items,
    round((st_distance(rp.location_point, origin.point) / 1609.344)::numeric, 1)::double precision as distance_miles
  from rescue_profiles rp
  cross join origin
  where rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null
    and rp.location_point is not null
    and st_dwithin(rp.location_point, origin.point, least(greatest(radius_miles, 1), 500) * 1609.344)
    and (search_query is null or search_query = '' or (
      rp.name ilike '%' || search_query || '%'
      or rp.summary ilike '%' || search_query || '%'
      or coalesce(rp.website_url, '') ilike '%' || search_query || '%'
      or array_to_string(rp.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1
        from rescue_needs rn
        where rn.rescue_id = rp.id
          and rn.is_active = true
          and rn.deleted_at is null
          and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1
        from rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id
          and rwi.is_active = true
          and rwi.deleted_at is null
          and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by distance_miles asc, rp.name asc;
$$;

create or replace function get_public_profile(target_user_id uuid)
returns table (
  id uuid,
  account_type account_type,
  display_name text,
  username citext,
  bio text,
  avatar_url text,
  city text,
  state text,
  buyer_rating numeric,
  seller_rating numeric,
  review_count integer,
  listings_count integer,
  completed_sales_count integer,
  is_verified boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.account_type,
    p.display_name,
    p.username,
    p.bio,
    p.avatar_url,
    p.city,
    p.state,
    p.buyer_rating,
    p.seller_rating,
    p.review_count,
    p.listings_count,
    p.completed_sales_count,
    p.is_verified,
    p.created_at
  from profiles p
  where p.id = target_user_id
    and p.deleted_at is null
    and p.is_banned = false;
$$;

create or replace function has_existing_report(
  report_target_type report_type,
  report_target_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
begin
  if active_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return exists (
    select 1
    from reports r
    where r.reporter_id = active_user_id
      and r.report_type = report_target_type
      and (
        (report_target_type = 'listing' and r.listing_id = report_target_id)
        or (report_target_type = 'user' and r.reported_user_id = report_target_id)
        or (report_target_type = 'message' and r.message_id = report_target_id)
      )
  );
end;
$$;

create or replace function submit_report(
  report_target_type report_type,
  report_target_id uuid,
  report_reason_value report_reason,
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  inserted_report_id uuid;
  target_user_id uuid;
begin
  if active_user_id is null or not is_account_active(active_user_id) then
    raise exception 'Not authenticated';
  end if;

  if has_existing_report(report_target_type, report_target_id) then
    raise exception 'Report already submitted';
  end if;

  if report_target_type = 'user' and report_target_id = active_user_id then
    raise exception 'Users cannot report themselves';
  end if;

  if report_target_type = 'listing' then
    select seller_id into target_user_id from listings where id = report_target_id;

    insert into reports (reporter_id, report_type, reason, details, listing_id, status)
    values (active_user_id, report_target_type, report_reason_value, nullif(btrim(report_details), ''), report_target_id, 'open')
    returning id into inserted_report_id;
  elsif report_target_type = 'user' then
    insert into reports (reporter_id, report_type, reason, details, reported_user_id, status)
    values (active_user_id, report_target_type, report_reason_value, nullif(btrim(report_details), ''), report_target_id, 'open')
    returning id into inserted_report_id;
  elsif report_target_type = 'message' then
    select sender_id into target_user_id from messages where id = report_target_id;

    insert into reports (reporter_id, report_type, reason, details, message_id, reported_user_id, status)
    values (active_user_id, report_target_type, report_reason_value, nullif(btrim(report_details), ''), report_target_id, target_user_id, 'open')
    returning id into inserted_report_id;
  else
    raise exception 'Unsupported report target';
  end if;

  insert into audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    active_user_id,
    case
      when report_target_type = 'listing' then 'listing_reported'::audit_event_type
      when report_target_type = 'user' then 'user_reported'::audit_event_type
      else 'message_reported'::audit_event_type
    end,
    'reports',
    inserted_report_id,
    jsonb_build_object('report_type', report_target_type, 'target_id', report_target_id)
  );

  return inserted_report_id;
end;
$$;

create or replace function mark_conversation_read(target_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  changed_count integer := 0;
begin
  if active_user_id is null or not is_account_active(active_user_id) then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from conversations c
    where c.id = target_conversation_id
      and c.deleted_at is null
      and active_user_id in (c.buyer_id, c.seller_id)
  ) then
    raise exception 'Conversation not available';
  end if;

  update messages
    set is_read = true,
        read_at = coalesce(read_at, now())
  where conversation_id = target_conversation_id
    and sender_id <> active_user_id
    and is_read = false
    and deleted_at is null;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function soft_delete_own_message(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
begin
  if active_user_id is null or not is_account_active(active_user_id) then
    raise exception 'Not authenticated';
  end if;

  update messages
    set deleted_at = coalesce(deleted_at, now())
  where id = target_message_id
    and sender_id = active_user_id;

  if not found then
    raise exception 'Message not available';
  end if;
end;
$$;

create or replace function complete_listing_transaction(
  target_listing_id uuid,
  target_buyer_id uuid,
  target_outcome transaction_outcome
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  listing_title text;
  transaction_id uuid;
begin
  if active_user_id is null or not is_account_active(active_user_id) then
    raise exception 'Not authenticated';
  end if;

  select title into listing_title
  from listings
  where id = target_listing_id
    and seller_id = active_user_id
    and deleted_at is null
  for update;

  if listing_title is null then
    raise exception 'Only the seller can complete this transaction';
  end if;

  if target_buyer_id is null or target_buyer_id = active_user_id then
    raise exception 'Choose a valid buyer or recipient';
  end if;

  if not is_account_active(target_buyer_id) then
    raise exception 'Buyer account is not active';
  end if;

  if is_blocked_between(active_user_id, target_buyer_id) then
    raise exception 'Blocked users cannot complete transactions together';
  end if;

  if exists (
    select 1 from transactions
    where listing_id = target_listing_id
      and status = 'completed'
      and deleted_at is null
  ) then
    select id into transaction_id
    from transactions
    where listing_id = target_listing_id
      and status = 'completed'
      and deleted_at is null
    limit 1;

    return transaction_id;
  end if;

  insert into transactions (listing_id, buyer_id, seller_id, status, outcome, completed_at)
  values (target_listing_id, target_buyer_id, active_user_id, 'completed', target_outcome, now())
  returning id into transaction_id;

  update listings
    set status = case when target_outcome = 'donated' then 'donated'::listing_status else 'sold'::listing_status end,
        updated_at = now()
  where id = target_listing_id
    and seller_id = active_user_id;

  update profiles
    set completed_sales_count = completed_sales_count + 1
  where id = active_user_id;

  return transaction_id;
end;
$$;

create or replace function create_user_notification(
  target_user_id uuid,
  notification_type_value notification_type,
  notification_title text default null,
  notification_body text default null,
  notification_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  inserted_notification_id uuid;
  safe_title text;
  safe_body text;
  conversation_id uuid := uuid_or_null(notification_data ->> 'conversationId');
  message_id uuid := uuid_or_null(notification_data ->> 'messageId');
  listing_id uuid := uuid_or_null(notification_data ->> 'listingId');
  review_id uuid := uuid_or_null(notification_data ->> 'reviewId');
  transaction_id uuid := uuid_or_null(notification_data ->> 'transactionId');
begin
  if active_user_id is null or not is_account_active(active_user_id) then
    raise exception 'Not authenticated';
  end if;

  if notification_type_value = 'message' then
    if not exists (
      select 1
      from messages m
      join conversations c on c.id = m.conversation_id
      where m.id = message_id
        and c.id = conversation_id
        and m.sender_id = active_user_id
        and target_user_id in (c.buyer_id, c.seller_id)
        and target_user_id <> active_user_id
        and not is_blocked_between(c.buyer_id, c.seller_id)
    ) then
      raise exception 'Invalid message notification';
    end if;
    safe_title := 'New message';
    safe_body := 'You received a message.';
  elsif notification_type_value = 'favorite' then
    if not exists (
      select 1
      from favorites f
      join listings l on l.id = f.listing_id
      where f.user_id = active_user_id
        and f.listing_id = listing_id
        and l.seller_id = target_user_id
        and target_user_id <> active_user_id
        and not is_blocked_between(active_user_id, target_user_id)
    ) then
      raise exception 'Invalid favorite notification';
    end if;
    safe_title := 'Listing favorited';
    safe_body := 'Someone saved your listing.';
  elsif notification_type_value = 'review' then
    if not exists (
      select 1
      from reviews r
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
      from transactions t
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
        from listings l
        where l.id = listing_id
          and l.seller_id = active_user_id
          and l.status in ('sold', 'donated')
      ) then
      raise exception 'Invalid listing status notification';
    end if;
    safe_title := coalesce(nullif(btrim(notification_title), ''), 'Listing updated');
    safe_body := 'Your listing status was updated.';
  elsif notification_type_value = 'system' then
    if not is_admin(active_user_id) then
      raise exception 'Only admins can create system notifications';
    end if;
    safe_title := coalesce(nullif(btrim(notification_title), ''), 'ReTail update');
    safe_body := coalesce(nullif(btrim(notification_body), ''), 'You have a ReTail update.');
  else
    raise exception 'Unsupported client notification type';
  end if;

  insert into notifications (user_id, type, title, body, data)
  values (target_user_id, notification_type_value, safe_title, safe_body, coalesce(notification_data, '{}'::jsonb))
  returning id into inserted_notification_id;

  return inserted_notification_id;
end;
$$;

drop policy if exists "Conversation participants can update conversations" on conversations;
drop policy if exists "Admins update conversations" on conversations;
create policy "Admins update conversations"
  on conversations for update
  using (is_admin())
  with check (is_admin());

drop policy if exists "Conversation participants can mark messages read" on messages;
drop policy if exists "Message sender can soft delete own messages" on messages;
drop policy if exists "Admins update messages" on messages;
create policy "Admins update messages"
  on messages for update
  using (is_admin())
  with check (is_admin());

drop policy if exists "Transaction participants can update transactions" on transactions;
drop policy if exists "Sellers create transactions for own listings" on transactions;
drop policy if exists "Sellers create pending transactions for own listings" on transactions;
drop policy if exists "Admins update transactions" on transactions;
create policy "Sellers create pending transactions for own listings"
  on transactions for insert
  with check (
    auth.uid() = seller_id
    and status = 'pending'
    and buyer_id <> seller_id
    and is_account_active(auth.uid())
    and is_account_active(buyer_id)
    and exists (
      select 1
      from listings
      where listings.id = transactions.listing_id
        and listings.seller_id = auth.uid()
        and listings.deleted_at is null
    )
  );

create policy "Admins update transactions"
  on transactions for update
  using (is_admin())
  with check (is_admin());

drop policy if exists "Users update reviews they wrote" on reviews;
drop policy if exists "Admins update reviews" on reviews;
create policy "Admins update reviews"
  on reviews for update
  using (is_admin())
  with check (is_admin());

drop policy if exists "Users create reports" on reports;
drop policy if exists "Users read their own reports" on reports;
drop policy if exists "Users read own reports" on reports;

drop policy if exists "Service inserts notifications" on notifications;
drop policy if exists "Participants create message notifications" on notifications;
drop policy if exists "Users create favorite notifications" on notifications;
drop policy if exists "Participants create transaction notifications" on notifications;
drop policy if exists "Users create review notifications" on notifications;
drop policy if exists "Admins create notifications" on notifications;
create policy "Admins create notifications"
  on notifications for insert
  with check (is_admin());

drop policy if exists "Rescue owners manage their profiles" on rescue_profiles;
drop policy if exists "Rescue owners update descriptive profile fields" on rescue_profiles;
drop policy if exists "Rescue owners insert their own unverified profile" on rescue_profiles;
create policy "Rescue owners insert their own unverified profile"
  on rescue_profiles for insert
  with check (
    owner_id = auth.uid()
    and is_account_active()
    and is_verified = false
    and verification_status <> 'verified'
    and verified_at is null
    and verified_by is null
  );

create policy "Rescue owners update descriptive profile fields"
  on rescue_profiles for update
  using (owner_id = auth.uid() and is_account_active())
  with check (owner_id = auth.uid() and is_account_active());

drop policy if exists "Conversation participants upload message images" on storage.objects;
create policy "Conversation participants upload message images"
  on storage.objects for insert
  with check (
    bucket_id = 'message-images'
    and is_account_active()
    and exists (
      select 1 from conversations
      where conversations.id = public.safe_uuid((storage.foldername(name))[1])
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
        and not is_blocked_between(conversations.buyer_id, conversations.seller_id)
    )
  );

do $$
begin
  revoke execute on function protect_profile_system_fields() from public, anon, authenticated;
  revoke execute on function protect_rescue_verification_fields() from public, anon, authenticated;
  revoke execute on function prevent_conversation_identity_update() from public, anon, authenticated;
  revoke execute on function prevent_message_content_update() from public, anon, authenticated;
  revoke execute on function protect_transaction_state() from public, anon, authenticated;
  revoke execute on function prevent_review_identity_update() from public, anon, authenticated;
  revoke execute on function mark_conversation_read(uuid) from public, anon;
  revoke execute on function soft_delete_own_message(uuid) from public, anon;
  revoke execute on function complete_listing_transaction(uuid, uuid, transaction_outcome) from public, anon;
  revoke execute on function submit_report(report_type, uuid, report_reason, text) from public, anon;
  revoke execute on function has_existing_report(report_type, uuid) from public, anon;
  revoke execute on function create_user_notification(uuid, notification_type, text, text, jsonb) from public, anon;
exception when undefined_object then
  null;
end $$;

grant execute on function get_nearby_listings(
  numeric,
  numeric,
  numeric,
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  listing_condition,
  listing_type
) to anon, authenticated;
grant execute on function get_public_listing_detail(uuid) to anon, authenticated;
grant execute on function get_nearby_rescues(numeric, numeric, numeric, text) to anon, authenticated;
grant execute on function get_public_profile(uuid) to anon, authenticated;
grant execute on function mark_conversation_read(uuid) to authenticated;
grant execute on function soft_delete_own_message(uuid) to authenticated;
grant execute on function complete_listing_transaction(uuid, uuid, transaction_outcome) to authenticated;
grant execute on function submit_report(report_type, uuid, report_reason, text) to authenticated;
grant execute on function has_existing_report(report_type, uuid) to authenticated;
grant execute on function create_user_notification(uuid, notification_type, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
