create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type account_type as enum ('regular', 'rescue');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type listing_status as enum ('draft', 'active', 'pending', 'sold', 'donated', 'archived', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type listing_status add value if not exists 'draft' before 'active';
exception when undefined_object then null;
end $$;

do $$ begin
  create type listing_condition as enum ('new', 'like_new', 'good', 'fair', 'poor');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type listing_type as enum ('sale', 'free', 'donation');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type message_type as enum ('text', 'image', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type transaction_status as enum ('pending', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type transaction_outcome as enum ('sold', 'donated');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type report_type as enum ('listing', 'user', 'message');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type report_reason as enum (
    'spam',
    'fraud',
    'prohibited_item',
    'harassment',
    'inappropriate_content',
    'duplicate_listing',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type notification_type as enum (
    'message',
    'favorite',
    'review',
    'listing_sold',
    'saved_search',
    'system',
    'transaction_completed',
    'listing_donated'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type notification_type add value if not exists 'saved_search' before 'system';
exception when undefined_object then null;
end $$;

do $$ begin
  alter type notification_type add value if not exists 'transaction_completed';
  alter type notification_type add value if not exists 'listing_donated';
exception when undefined_object then null;
end $$;

do $$ begin
  create type audit_event_type as enum (
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
exception when duplicate_object then null;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function approximate_distance_miles(
  latitude_one numeric,
  longitude_one numeric,
  latitude_two numeric,
  longitude_two numeric
)
returns double precision
language sql
immutable
set search_path = public
as $$
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

create or replace function uuid_or_null(value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type account_type not null default 'regular',
  display_name text not null check (char_length(display_name) between 2 and 80),
  username citext unique not null check (char_length(username) between 3 and 32),
  bio text check (bio is null or char_length(bio) <= 500),
  avatar_url text,
  city text,
  state text,
  zip_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  buyer_rating numeric(3,2) default 0 check (buyer_rating >= 0 and buyer_rating <= 5),
  seller_rating numeric(3,2) default 0 check (seller_rating >= 0 and seller_rating <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  listings_count integer not null default 0 check (listings_count >= 0),
  is_verified boolean not null default false,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = user_id
      and is_admin = true
      and is_banned = false
      and deleted_at is null
  );
$$;

create or replace function is_account_active(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = user_id
      and is_banned = false
      and deleted_at is null
  );
$$;

create or replace function prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if not is_admin() then
    if new.is_admin is distinct from old.is_admin
      or new.is_banned is distinct from old.is_banned
      or new.is_verified is distinct from old.is_verified then
      raise exception 'Only admins can update profile trust and moderation fields.';
    end if;
  end if;

  return new;
end;
$$;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  icon text,
  parent_id uuid references categories(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 3000),
  price numeric(10,2),
  listing_type listing_type not null default 'sale',
  condition listing_condition not null,
  status listing_status not null default 'active',
  brand text check (brand is null or char_length(brand) <= 80),
  item_dimensions text check (item_dimensions is null or char_length(item_dimensions) <= 120),
  pet_size text check (pet_size is null or char_length(pet_size) <= 80),
  condition_notes text check (condition_notes is null or char_length(condition_notes) <= 500),
  availability_notes text check (availability_notes is null or char_length(availability_notes) <= 500),
  reason_for_listing text check (reason_for_listing is null or char_length(reason_for_listing) <= 300),
  safety_confirmed boolean not null default false,
  city text not null,
  state text not null,
  zip_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  pickup_available boolean not null default true,
  porch_pickup_available boolean not null default false,
  meetup_available boolean not null default true,
  shipping_available boolean not null default false,
  shipping_payer text not null default 'buyer' check (shipping_payer in ('buyer', 'seller', 'discuss')),
  shipping_cost_estimate numeric(10,2) check (shipping_cost_estimate is null or shipping_cost_estimate >= 0),
  handling_time text check (handling_time is null or char_length(handling_time) <= 80),
  ship_from_zip_code text check (ship_from_zip_code is null or ship_from_zip_code ~ '^[0-9]{5}$'),
  view_count integer not null default 0 check (view_count >= 0),
  favorite_count integer not null default 0 check (favorite_count >= 0),
  message_count integer not null default 0 check (message_count >= 0),
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint listing_price_matches_type check (
    (listing_type = 'sale' and price is not null and price >= 0)
    or (listing_type in ('free', 'donation') and (price is null or price = 0))
  ),
  constraint listing_has_getting_option check (
    porch_pickup_available or meetup_available or shipping_available
  )
);

create table if not exists listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,
  sort_order integer not null default 0 check (sort_order >= 0 and sort_order < 15),
  alt_text text check (alt_text is null or char_length(alt_text) <= 160),
  created_at timestamptz not null default now(),
  unique(listing_id, sort_order)
);

create or replace function enforce_listing_image_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from listing_images
    where listing_id = new.listing_id
  ) >= 15 then
    raise exception 'A listing can have at most 15 images.';
  end if;

  return new;
end;
$$;

create or replace function prevent_review_rating_update()
returns trigger
language plpgsql
as $$
begin
  if new.rating is distinct from old.rating then
    raise exception 'Review ratings cannot be edited after submission.';
  end if;

  return new;
end;
$$;

create or replace function prevent_message_content_update()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
    or new.sender_id is distinct from old.sender_id
    or new.message_type is distinct from old.message_type
    or new.body is distinct from old.body
    or new.image_url is distinct from old.image_url
    or new.created_at is distinct from old.created_at then
    raise exception 'Message content cannot be edited after sending.';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and old.sender_id is distinct from auth.uid()
    and not is_admin() then
    raise exception 'Only the sender can soft delete their message.';
  end if;

  return new;
end;
$$;

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, listing_id)
);

create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  search_query text check (search_query is null or char_length(search_query) <= 120),
  category_id uuid references categories(id) on delete set null,
  category_slug text,
  category_name text,
  min_price numeric(10,2) check (min_price is null or min_price >= 0),
  max_price numeric(10,2) check (max_price is null or max_price >= 0),
  condition listing_condition,
  listing_type listing_type,
  radius_miles numeric not null default 25 check (radius_miles > 0 and radius_miles <= 500),
  city text,
  state text,
  zip_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  notifications_enabled boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint saved_search_price_range check (
    min_price is null or max_price is null or min_price <= max_price
  )
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete set null,
  buyer_id uuid not null references profiles(id) on delete cascade,
  seller_id uuid not null references profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(listing_id, buyer_id, seller_id),
  constraint conversation_has_two_people check (buyer_id <> seller_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  message_type message_type not null default 'text',
  body text,
  image_url text,
  attachment_bucket text,
  attachment_path text,
  attachment_mime_type text,
  attachment_size_bytes integer,
  attachment_width integer,
  attachment_height integer,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint message_has_content check (
    (
      message_type = 'text'
      and body is not null
      and char_length(body) between 1 and 2000
      and image_url is null
      and attachment_bucket is null
      and attachment_path is null
      and attachment_mime_type is null
      and attachment_size_bytes is null
    )
    or (
      message_type = 'image'
      and image_url is null
      and attachment_bucket is not null
      and attachment_path is not null
      and attachment_mime_type is not null
      and attachment_size_bytes is not null
      and attachment_size_bytes > 0
    )
    or (
      message_type = 'system'
      and body is not null
      and char_length(body) between 1 and 2000
      and image_url is null
      and attachment_bucket is null
      and attachment_path is null
      and attachment_mime_type is null
      and attachment_size_bytes is null
    )
  )
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete restrict,
  buyer_id uuid not null references profiles(id) on delete restrict,
  seller_id uuid not null references profiles(id) on delete restrict,
  status transaction_status not null default 'pending',
  outcome transaction_outcome,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(listing_id, buyer_id, seller_id),
  constraint transaction_has_two_people check (buyer_id <> seller_id),
  constraint completed_transaction_has_outcome check (
    (status = 'completed' and outcome is not null and completed_at is not null)
    or (status <> 'completed')
  )
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete restrict,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  reviewee_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete restrict,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint review_has_two_people check (reviewer_id <> reviewee_id)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  reported_user_id uuid references profiles(id) on delete set null,
  listing_id uuid references listings(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  report_type report_type not null,
  reason report_reason not null,
  details text check (details is null or char_length(details) <= 2000),
  evidence jsonb not null default '{}'::jsonb,
  status report_status not null default 'open',
  assigned_admin_id uuid references profiles(id) on delete set null,
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_target_matches_type check (
    (report_type = 'listing' and listing_id is not null and reported_user_id is null and message_id is null)
    or (report_type = 'user' and reported_user_id is not null and listing_id is null and message_id is null)
    or (report_type = 'message' and message_id is not null and listing_id is null)
  )
);

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(blocker_id, blocked_id),
  constraint block_has_two_people check (blocker_id <> blocked_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) between 1 and 240),
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function create_saved_search_notifications_for_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' or new.deleted_at is not null then
    return new;
  end if;

  insert into notifications (user_id, type, title, body, data)
  select
    saved_searches.user_id,
    'saved_search'::notification_type,
    'New saved search match',
    '"' || new.title || '" matches "' || saved_searches.name || '".',
    jsonb_build_object(
      'savedSearchId', saved_searches.id,
      'listingId', new.id,
      'route', '/listing/' || new.id
    )
  from saved_searches
  where saved_searches.deleted_at is null
    and saved_searches.notifications_enabled = true
    and saved_searches.user_id <> new.seller_id
    and (
      saved_searches.search_query is null
      or btrim(saved_searches.search_query) = ''
      or new.title ilike '%' || saved_searches.search_query || '%'
      or new.description ilike '%' || saved_searches.search_query || '%'
      or coalesce(new.brand, '') ilike '%' || saved_searches.search_query || '%'
    )
    and (saved_searches.category_id is null or saved_searches.category_id = new.category_id)
    and (saved_searches.min_price is null or coalesce(new.price, 0) >= saved_searches.min_price)
    and (saved_searches.max_price is null or coalesce(new.price, 0) <= saved_searches.max_price)
    and (saved_searches.condition is null or saved_searches.condition = new.condition)
    and (saved_searches.listing_type is null or saved_searches.listing_type = new.listing_type)
    and (
      saved_searches.latitude is null
      or saved_searches.longitude is null
      or new.latitude is null
      or new.longitude is null
      or approximate_distance_miles(saved_searches.latitude, saved_searches.longitude, new.latitude, new.longitude) <= saved_searches.radius_miles
    )
    and (
      (saved_searches.latitude is not null and saved_searches.longitude is not null and new.latitude is not null and new.longitude is not null)
      or saved_searches.city is null
      or saved_searches.state is null
      or (lower(saved_searches.city) = lower(new.city) and lower(saved_searches.state) = lower(new.state))
    );

  update saved_searches
  set last_notified_at = now()
  where id in (
    select saved_searches.id
    from saved_searches
    where saved_searches.deleted_at is null
      and saved_searches.notifications_enabled = true
      and saved_searches.user_id <> new.seller_id
      and (
        saved_searches.search_query is null
        or btrim(saved_searches.search_query) = ''
        or new.title ilike '%' || saved_searches.search_query || '%'
        or new.description ilike '%' || saved_searches.search_query || '%'
        or coalesce(new.brand, '') ilike '%' || saved_searches.search_query || '%'
      )
      and (saved_searches.category_id is null or saved_searches.category_id = new.category_id)
      and (saved_searches.min_price is null or coalesce(new.price, 0) >= saved_searches.min_price)
      and (saved_searches.max_price is null or coalesce(new.price, 0) <= saved_searches.max_price)
      and (saved_searches.condition is null or saved_searches.condition = new.condition)
      and (saved_searches.listing_type is null or saved_searches.listing_type = new.listing_type)
      and (
        saved_searches.latitude is null
        or saved_searches.longitude is null
        or new.latitude is null
        or new.longitude is null
        or approximate_distance_miles(saved_searches.latitude, saved_searches.longitude, new.latitude, new.longitude) <= saved_searches.radius_miles
      )
      and (
        (saved_searches.latitude is not null and saved_searches.longitude is not null and new.latitude is not null and new.longitude is not null)
        or saved_searches.city is null
        or saved_searches.state is null
        or (lower(saved_searches.city) = lower(new.city) and lower(saved_searches.state) = lower(new.state))
      )
  );

  return new;
end;
$$;

create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null check (char_length(btrim(token)) between 1 and 4096),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

create table if not exists report_moderation_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  admin_id uuid references profiles(id) on delete set null,
  previous_status report_status not null,
  new_status report_status not null,
  note_present boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  event_type audit_event_type not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  ip_address inet,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function increment_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set favorite_count = favorite_count + 1
  where id = new.listing_id;

  return new;
end;
$$;

create or replace function decrement_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set favorite_count = greatest(favorite_count - 1, 0)
  where id = old.listing_id;

  return old;
end;
$$;

create or replace function update_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;

  update listings
  set message_count = message_count + 1
  where id = (
    select listing_id
    from conversations
    where conversations.id = new.conversation_id
      and conversations.listing_id is not null
  );

  return new;
end;
$$;

create or replace function refresh_profile_review_stats(profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set
    buyer_rating = (
      select coalesce(avg(reviews.rating), 0)
      from reviews
      join transactions on transactions.id = reviews.transaction_id
      where reviews.reviewee_id = profile_id
        and transactions.buyer_id = profile_id
        and reviews.deleted_at is null
    ),
    seller_rating = (
      select coalesce(avg(reviews.rating), 0)
      from reviews
      join transactions on transactions.id = reviews.transaction_id
      where reviews.reviewee_id = profile_id
        and transactions.seller_id = profile_id
        and reviews.deleted_at is null
    ),
    review_count = (
      select count(*)
      from reviews
      where reviews.reviewee_id = profile_id
        and reviews.deleted_at is null
    )
  where id = profile_id;
end;
$$;

create or replace function update_profile_review_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_profile_review_stats(old.reviewee_id);
    return old;
  end if;

  perform refresh_profile_review_stats(new.reviewee_id);

  if tg_op = 'UPDATE' and old.reviewee_id is distinct from new.reviewee_id then
    perform refresh_profile_review_stats(old.reviewee_id);
  end if;

  return new;
end;
$$;

create or replace function refresh_profile_listing_count(profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set listings_count = (
    select count(*)
    from listings
    where listings.seller_id = profile_id
      and listings.deleted_at is null
      and listings.status in ('active', 'pending')
  )
  where id = profile_id;
end;
$$;

create or replace function update_profile_listing_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function refresh_profile_review_stats(uuid) from anon;
    revoke execute on function refresh_profile_listing_count(uuid) from anon;
    revoke execute on function create_saved_search_notifications_for_listing() from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function refresh_profile_review_stats(uuid) from authenticated;
    revoke execute on function refresh_profile_listing_count(uuid) from authenticated;
    revoke execute on function create_saved_search_notifications_for_listing() from authenticated;
  end if;

  revoke execute on function create_saved_search_notifications_for_listing() from public;
end $$;

drop trigger if exists set_profiles_updated_at on profiles;
create trigger set_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists prevent_profile_privilege_escalation on profiles;
create trigger prevent_profile_privilege_escalation
  before update on profiles
  for each row execute function prevent_profile_privilege_escalation();

drop trigger if exists set_listings_updated_at on listings;
create trigger set_listings_updated_at
  before update on listings
  for each row execute function set_updated_at();

drop trigger if exists enforce_listing_image_limit on listing_images;
create trigger enforce_listing_image_limit
  before insert on listing_images
  for each row execute function enforce_listing_image_limit();

drop trigger if exists set_conversations_updated_at on conversations;
create trigger set_conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();

drop trigger if exists prevent_message_content_update on messages;
create trigger prevent_message_content_update
  before update on messages
  for each row execute function prevent_message_content_update();

drop trigger if exists set_transactions_updated_at on transactions;
create trigger set_transactions_updated_at
  before update on transactions
  for each row execute function set_updated_at();

drop trigger if exists set_reviews_updated_at on reviews;
create trigger set_reviews_updated_at
  before update on reviews
  for each row execute function set_updated_at();

drop trigger if exists prevent_review_rating_update on reviews;
create trigger prevent_review_rating_update
  before update on reviews
  for each row execute function prevent_review_rating_update();

drop trigger if exists review_insert_update_profile on reviews;
create trigger review_insert_update_profile
  after insert on reviews
  for each row execute function update_profile_review_stats();

drop trigger if exists review_update_update_profile on reviews;
create trigger review_update_update_profile
  after update on reviews
  for each row execute function update_profile_review_stats();

drop trigger if exists review_delete_update_profile on reviews;
create trigger review_delete_update_profile
  after delete on reviews
  for each row execute function update_profile_review_stats();

drop trigger if exists set_reports_updated_at on reports;
create trigger set_reports_updated_at
  before update on reports
  for each row execute function set_updated_at();

drop trigger if exists set_device_tokens_updated_at on device_tokens;
create trigger set_device_tokens_updated_at
  before update on device_tokens
  for each row execute function set_updated_at();

drop trigger if exists set_saved_searches_updated_at on saved_searches;
create trigger set_saved_searches_updated_at
  before update on saved_searches
  for each row execute function set_updated_at();

drop trigger if exists favorite_insert_count on favorites;
create trigger favorite_insert_count
  after insert on favorites
  for each row execute function increment_favorite_count();

drop trigger if exists favorite_delete_count on favorites;
create trigger favorite_delete_count
  after delete on favorites
  for each row execute function decrement_favorite_count();

drop trigger if exists message_insert_update_conversation on messages;
create trigger message_insert_update_conversation
  after insert on messages
  for each row execute function update_conversation_after_message();

drop trigger if exists listing_insert_count on listings;
create trigger listing_insert_count
  after insert on listings
  for each row execute function update_profile_listing_count();

drop trigger if exists listing_insert_saved_search_alerts on listings;
create trigger listing_insert_saved_search_alerts
  after insert on listings
  for each row execute function create_saved_search_notifications_for_listing();

drop trigger if exists listing_update_count on listings;
create trigger listing_update_count
  after update on listings
  for each row execute function update_profile_listing_count();

drop trigger if exists listing_delete_count on listings;
create trigger listing_delete_count
  after delete on listings
  for each row execute function update_profile_listing_count();

create index if not exists idx_profiles_username on profiles(username);
create index if not exists idx_profiles_city_state on profiles(city, state);
create index if not exists idx_categories_slug on categories(slug);
create index if not exists idx_categories_parent on categories(parent_id);
create index if not exists idx_listings_status on listings(status);
create index if not exists idx_listings_category on listings(category_id);
create index if not exists idx_listings_seller on listings(seller_id);
create index if not exists idx_listings_location on listings(city, state);
create index if not exists idx_listings_created_at on listings(created_at desc);
create index if not exists idx_listings_price on listings(price);
create index if not exists idx_listings_type on listings(listing_type);
create index if not exists idx_listings_search on listings using gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(brand, ''))
);
create index if not exists idx_listing_images_listing on listing_images(listing_id, sort_order);
create index if not exists idx_favorites_user on favorites(user_id);
create index if not exists idx_favorites_listing on favorites(listing_id);
create index if not exists idx_saved_searches_user on saved_searches(user_id, deleted_at, created_at desc);
create index if not exists idx_saved_searches_alerts on saved_searches(notifications_enabled, deleted_at);
create index if not exists idx_saved_searches_category on saved_searches(category_id);
create index if not exists idx_conversations_buyer on conversations(buyer_id);
create index if not exists idx_conversations_seller on conversations(seller_id);
create index if not exists idx_conversations_listing on conversations(listing_id);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);
create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_transactions_listing on transactions(listing_id);
create index if not exists idx_transactions_buyer on transactions(buyer_id);
create index if not exists idx_transactions_seller on transactions(seller_id);
create unique index if not exists transactions_one_completed_per_listing
  on transactions(listing_id)
  where status = 'completed' and deleted_at is null;
create index if not exists idx_reviews_reviewee on reviews(reviewee_id, created_at desc);
create index if not exists idx_reviews_reviewer on reviews(reviewer_id);
create index if not exists idx_reviews_listing on reviews(listing_id);
create unique index if not exists reviews_one_per_reviewer_transaction
  on reviews(reviewer_id, transaction_id)
  where deleted_at is null;
create index if not exists idx_reports_status on reports(status, created_at);
create index if not exists idx_reports_type on reports(report_type);
create index if not exists idx_reports_reporter on reports(reporter_id);
create unique index if not exists reports_one_active_listing_report
  on reports(reporter_id, listing_id)
  where report_type = 'listing'
    and status in ('open', 'reviewing')
    and reporter_id is not null
    and listing_id is not null;
create unique index if not exists reports_one_active_user_report
  on reports(reporter_id, reported_user_id)
  where report_type = 'user'
    and status in ('open', 'reviewing')
    and reporter_id is not null
    and reported_user_id is not null
    and message_id is null;
create unique index if not exists reports_one_active_message_report
  on reports(reporter_id, message_id)
  where report_type = 'message'
    and status in ('open', 'reviewing')
    and reporter_id is not null
    and message_id is not null;
create index if not exists idx_blocks_blocker on blocks(blocker_id);
create index if not exists idx_blocks_blocked on blocks(blocked_id);
create index if not exists idx_notifications_user on notifications(user_id, is_read, created_at desc);
create unique index if not exists notifications_unique_user_dedupe_key
  on notifications(user_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists idx_notifications_user_live
  on notifications(user_id, is_read, created_at desc)
  where deleted_at is null;
create index if not exists idx_device_tokens_user on device_tokens(user_id);
create unique index if not exists device_tokens_unique_token on device_tokens(token);
create index if not exists idx_report_moderation_events_report
  on report_moderation_events(report_id, created_at desc);
create index if not exists idx_report_moderation_events_admin
  on report_moderation_events(admin_id, created_at desc);
create index if not exists idx_audit_logs_actor on audit_logs(actor_id, created_at desc);
create index if not exists idx_rate_limit_events_lookup on rate_limit_events(action, user_id, ip_address, created_at desc);

do $$ begin
  alter publication supabase_realtime add table conversations;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
