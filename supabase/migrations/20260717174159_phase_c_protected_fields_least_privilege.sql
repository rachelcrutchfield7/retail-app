-- ReTail Security Remediation Phase C
-- Protected fields, least-privilege grants, and database function hardening.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and is_admin = true
      and is_banned = false
      and deleted_at is null
  );
$$;

create or replace function private.is_account_active(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and is_banned = false
      and deleted_at is null
  );
$$;

revoke all on function private.is_admin(uuid) from public, anon, authenticated;
revoke all on function private.is_account_active(uuid) from public, anon, authenticated;
grant execute on function private.is_admin(uuid) to anon, authenticated, service_role;
grant execute on function private.is_account_active(uuid) to anon, authenticated, service_role;

-- Keep public compatibility helpers for database internals, but stop exposing
-- them as direct client-callable RPCs. Policies are rewritten to use private.
create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(user_id);
$$;

create or replace function public.is_account_active(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_account_active(user_id);
$$;

do $$
declare
  policy_record record;
  next_qual text;
  next_check text;
  alter_statement text;
begin
  for policy_record in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      p.polname as policy_name,
      pg_get_expr(p.polqual, p.polrelid) as qual,
      pg_get_expr(p.polwithcheck, p.polrelid) as with_check
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%is_admin(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%is_admin(%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%is_account_active(%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%is_account_active(%'
      )
  loop
    next_qual := replace(replace(policy_record.qual, 'is_admin(', 'private.is_admin('), 'is_account_active(', 'private.is_account_active(');
    next_check := replace(replace(policy_record.with_check, 'is_admin(', 'private.is_admin('), 'is_account_active(', 'private.is_account_active(');
    alter_statement := format('alter policy %I on %I.%I', policy_record.policy_name, policy_record.schema_name, policy_record.table_name);

    if next_qual is not null then
      alter_statement := alter_statement || format(' using (%s)', next_qual);
    end if;

    if next_check is not null then
      alter_statement := alter_statement || format(' with check (%s)', next_check);
    end if;

    execute alter_statement;
  end loop;
end;
$$;

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

create or replace function public.protect_profile_phase_c_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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
      or new.longitude is not null then
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
      or new.longitude is distinct from old.longitude then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_phase_c_fields_before_write on public.profiles;
create trigger protect_profile_phase_c_fields_before_write
before insert or update on public.profiles
for each row execute function public.protect_profile_phase_c_fields();

create or replace function public.protect_listing_phase_c_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
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

drop trigger if exists protect_listing_phase_c_fields_before_write on public.listings;
create trigger protect_listing_phase_c_fields_before_write
before insert or update on public.listings
for each row execute function public.protect_listing_phase_c_fields();

create or replace function public.protect_rescue_profile_phase_c_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
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

drop trigger if exists protect_rescue_profile_phase_c_fields_before_write on public.rescue_profiles;
create trigger protect_rescue_profile_phase_c_fields_before_write
before insert or update on public.rescue_profiles
for each row execute function public.protect_rescue_profile_phase_c_fields();

create or replace function public.create_my_profile(
  requested_display_name text,
  requested_username text,
  requested_account_type public.account_type default 'regular'::public.account_type
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.update_my_profile(
  requested_display_name text default null,
  requested_username text default null,
  requested_bio text default null,
  requested_avatar_url text default null,
  requested_city text default null,
  requested_state text default null,
  requested_zip_code text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.create_listing(
  requested_category_id uuid,
  requested_title text,
  requested_description text,
  requested_condition public.listing_condition,
  requested_listing_type public.listing_type default 'sale'::public.listing_type,
  requested_price numeric default null,
  requested_brand text default null,
  requested_city text default null,
  requested_state text default null,
  requested_zip_code text default null,
  requested_pickup_available boolean default true,
  requested_porch_pickup_available boolean default false,
  requested_meetup_available boolean default true,
  requested_shipping_available boolean default false,
  requested_shipping_payer text default 'buyer',
  requested_shipping_cost_estimate numeric default null,
  requested_handling_time text default null,
  requested_ship_from_zip_code text default null,
  requested_item_dimensions text default null,
  requested_pet_size text default null,
  requested_condition_notes text default null,
  requested_availability_notes text default null,
  requested_reason_for_listing text default null,
  requested_safety_confirmed boolean default false
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.update_my_listing(
  target_listing_id uuid,
  requested_category_id uuid default null,
  requested_title text default null,
  requested_description text default null,
  requested_condition public.listing_condition default null,
  requested_listing_type public.listing_type default null,
  requested_price numeric default null,
  requested_brand text default null,
  requested_city text default null,
  requested_state text default null,
  requested_zip_code text default null,
  requested_pickup_available boolean default null,
  requested_porch_pickup_available boolean default null,
  requested_meetup_available boolean default null,
  requested_shipping_available boolean default null,
  requested_shipping_payer text default null,
  requested_shipping_cost_estimate numeric default null,
  requested_handling_time text default null,
  requested_ship_from_zip_code text default null,
  requested_item_dimensions text default null,
  requested_pet_size text default null,
  requested_condition_notes text default null,
  requested_availability_notes text default null,
  requested_reason_for_listing text default null,
  requested_safety_confirmed boolean default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.archive_my_listing(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.delete_my_listing(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_listing public.listings;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.listings
  set
    status = 'removed'::public.listing_status,
    deleted_at = now()
  where id = target_listing_id
    and seller_id = caller_id
    and deleted_at is null
  returning * into updated_listing;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_deleted', 'listings', target_listing_id, jsonb_build_object('source', 'delete_my_listing'));

  return updated_listing;
end;
$$;

create or replace function public.mark_my_listing_sold(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.mark_my_listing_donated(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.update_my_rescue_profile(
  requested_name text,
  requested_summary text,
  requested_animals_rescued text[],
  requested_city text,
  requested_state text,
  requested_zip_code text default null,
  requested_address_line1 text default null,
  requested_address_line2 text default null,
  requested_contact_person text default null,
  requested_contact_email text default null,
  requested_contact_phone text default null,
  requested_organization_type text default 'foster_based',
  requested_has_501c3 boolean default false,
  requested_ein text default null,
  requested_website_url text default null,
  requested_contact_hint text default null
)
returns public.rescue_profiles
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.admin_set_rescue_verification(
  target_rescue_id uuid,
  requested_verification_status text,
  requested_admin_note text default null
)
returns public.rescue_profiles
language plpgsql
security definer
set search_path = ''
as $$
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

revoke insert, update, delete, truncate, references, trigger on table public.profiles from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.listings from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.rescue_profiles from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.listings to authenticated;
grant select on table public.rescue_profiles to authenticated;

revoke all on function public.create_my_profile(text, text, public.account_type) from public, anon, authenticated;
revoke all on function public.update_my_profile(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_listing(uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.update_my_listing(uuid, uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.archive_my_listing(uuid) from public, anon, authenticated;
revoke all on function public.delete_my_listing(uuid) from public, anon, authenticated;
revoke all on function public.mark_my_listing_sold(uuid) from public, anon, authenticated;
revoke all on function public.mark_my_listing_donated(uuid) from public, anon, authenticated;
revoke all on function public.update_my_rescue_profile(text, text, text[], text, text, text, text, text, text, text, text, text, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_rescue_verification(uuid, text, text) from public, anon, authenticated;

grant execute on function public.create_my_profile(text, text, public.account_type) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_listing(uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_my_listing(uuid, uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.archive_my_listing(uuid) to authenticated;
grant execute on function public.delete_my_listing(uuid) to authenticated;
grant execute on function public.mark_my_listing_sold(uuid) to authenticated;
grant execute on function public.mark_my_listing_donated(uuid) to authenticated;
grant execute on function public.update_my_rescue_profile(text, text, text[], text, text, text, text, text, text, text, text, text, boolean, text, text, text) to authenticated;
grant execute on function public.admin_set_rescue_verification(uuid, text, text) to authenticated;

revoke execute on function public.is_admin(uuid) from public, anon, authenticated;
revoke execute on function public.is_account_active(uuid) from public, anon, authenticated;
revoke execute on function public.marketplace_search_area_for_city_state(text, text) from public, anon, authenticated;
revoke execute on function public.marketplace_area_distance_band(double precision, boolean) from public, anon, authenticated;
revoke execute on function public.marketplace_area_distance_rank(double precision, boolean) from public, anon, authenticated;
revoke execute on function public.prevent_profile_coordinate_mutation() from public, anon, authenticated;
revoke execute on function public.set_listing_search_area_from_city_state() from public, anon, authenticated;
revoke execute on function public.set_rescue_search_area_from_city_state() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.prevent_profile_privilege_escalation() from public, anon, authenticated;
revoke execute on function public.enforce_listing_image_limit() from public, anon, authenticated;
revoke execute on function public.safe_uuid(text) from public, anon, authenticated;
revoke execute on function public.sync_listing_location_point() from public, anon, authenticated;
revoke execute on function public.sync_rescue_location_point() from public, anon, authenticated;
revoke execute on function public.increment_favorite_count() from public, anon, authenticated;
revoke execute on function public.decrement_favorite_count() from public, anon, authenticated;
revoke execute on function public.refresh_profile_listing_count(uuid) from public, anon, authenticated;
revoke execute on function public.update_profile_listing_count() from public, anon, authenticated;
revoke execute on function public.update_conversation_after_message() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
