-- ReTail Rescue Account Expansion
-- Run after distance.sql.

alter table rescue_profiles
  add column if not exists animals_rescued text[] not null default '{}',
  add column if not exists contact_person text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists organization_type text not null default 'foster_based',
  add column if not exists has_501c3 boolean not null default false,
  add column if not exists ein text,
  add column if not exists verification_status text not null default 'pending';

alter table rescue_profiles
  drop constraint if exists rescue_profiles_organization_type_check,
  add constraint rescue_profiles_organization_type_check
    check (organization_type in ('foster_based', 'physical_location', 'hybrid'));

alter table rescue_profiles
  drop constraint if exists rescue_profiles_verification_status_check,
  add constraint rescue_profiles_verification_status_check
    check (verification_status in ('draft', 'pending', 'verified', 'rejected'));

alter table rescue_profiles
  drop constraint if exists rescue_profiles_owner_unique,
  add constraint rescue_profiles_owner_unique unique (owner_id);

update rescue_profiles
set verification_status = case when is_verified then 'verified' else verification_status end
where verification_status <> 'verified'
  and is_verified = true;

create table if not exists rescue_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  rescue_id uuid not null references rescue_profiles(id) on delete cascade,
  item text not null check (char_length(item) between 2 and 120),
  quantity text,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  notes text check (notes is null or char_length(notes) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_rescue_wishlist_items_rescue
  on rescue_wishlist_items (rescue_id, is_active);

drop trigger if exists update_rescue_wishlist_items_updated_at on rescue_wishlist_items;

create trigger update_rescue_wishlist_items_updated_at
before update on rescue_wishlist_items
for each row execute function set_updated_at();

alter table rescue_wishlist_items enable row level security;

drop policy if exists "Active rescue wishlist items are publicly readable" on rescue_wishlist_items;
drop policy if exists "Rescue owners manage their wishlist items" on rescue_wishlist_items;
drop policy if exists "Admins manage rescue wishlist items" on rescue_wishlist_items;
drop policy if exists "Authenticated rescue owners and admins manage wishlist items" on rescue_wishlist_items;

create policy "Active rescue wishlist items are publicly readable"
  on rescue_wishlist_items for select
  to anon, authenticated
  using (
    is_active = true
    and deleted_at is null
    and exists (
      select 1
      from rescue_profiles
      where rescue_profiles.id = rescue_wishlist_items.rescue_id
        and rescue_profiles.is_active = true
        and rescue_profiles.is_verified = true
        and rescue_profiles.deleted_at is null
    )
  );

create policy "Authenticated rescue owners and admins manage wishlist items"
  on rescue_wishlist_items for all
  to authenticated
  using (
    is_account_active()
    and (
      is_admin()
      or exists (
        select 1
        from rescue_profiles
        where rescue_profiles.id = rescue_wishlist_items.rescue_id
          and rescue_profiles.owner_id = auth.uid()
      )
    )
  )
  with check (
    is_account_active()
    and (
      is_admin()
      or exists (
        select 1
        from rescue_profiles
        where rescue_profiles.id = rescue_wishlist_items.rescue_id
          and rescue_profiles.owner_id = auth.uid()
      )
    )
  );

grant select on rescue_profiles, rescue_needs, rescue_wishlist_items to anon, authenticated;
grant insert, update, delete on rescue_profiles, rescue_needs, rescue_wishlist_items to authenticated;

drop function if exists get_nearby_rescues(numeric, numeric, numeric, text);

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
  zip_code text,
  address_line1 text,
  address_line2 text,
  latitude numeric,
  longitude numeric,
  website_url text,
  contact_hint text,
  contact_person text,
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
set search_path = public
as $$
  with origin as (
    select st_setsrid(st_makepoint(user_longitude::double precision, user_latitude::double precision), 4326)::geography as point
  )
  select
    rescue_profiles.id,
    rescue_profiles.name,
    rescue_profiles.slug,
    rescue_profiles.summary,
    rescue_profiles.animals_rescued,
    rescue_profiles.city,
    rescue_profiles.state,
    rescue_profiles.zip_code,
    rescue_profiles.address_line1,
    rescue_profiles.address_line2,
    rescue_profiles.latitude,
    rescue_profiles.longitude,
    rescue_profiles.website_url,
    rescue_profiles.contact_hint,
    rescue_profiles.contact_person,
    rescue_profiles.organization_type,
    rescue_profiles.has_501c3,
    rescue_profiles.verification_status,
    rescue_profiles.is_verified,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rescue_needs.id,
            'item', rescue_needs.item,
            'quantity', rescue_needs.quantity,
            'urgency', rescue_needs.urgency,
            'notes', rescue_needs.notes
          )
          order by rescue_needs.created_at desc
        ),
        '[]'::jsonb
      )
      from rescue_needs
      where rescue_needs.rescue_id = rescue_profiles.id
        and rescue_needs.is_active = true
        and rescue_needs.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rescue_wishlist_items.id,
            'item', rescue_wishlist_items.item,
            'quantity', rescue_wishlist_items.quantity,
            'priority', rescue_wishlist_items.priority,
            'notes', rescue_wishlist_items.notes
          )
          order by rescue_wishlist_items.created_at desc
        ),
        '[]'::jsonb
      )
      from rescue_wishlist_items
      where rescue_wishlist_items.rescue_id = rescue_profiles.id
        and rescue_wishlist_items.is_active = true
        and rescue_wishlist_items.deleted_at is null
    ) as wishlist_items,
    st_distance(rescue_profiles.location_point, origin.point) / 1609.344 as distance_miles
  from rescue_profiles
  cross join origin
  where rescue_profiles.is_active = true
    and rescue_profiles.is_verified = true
    and rescue_profiles.deleted_at is null
    and rescue_profiles.location_point is not null
    and st_dwithin(rescue_profiles.location_point, origin.point, radius_miles * 1609.344)
    and (search_query is null or search_query = '' or (
      rescue_profiles.name ilike '%' || search_query || '%'
      or rescue_profiles.summary ilike '%' || search_query || '%'
      or rescue_profiles.website_url ilike '%' || search_query || '%'
      or rescue_profiles.address_line1 ilike '%' || search_query || '%'
      or rescue_profiles.address_line2 ilike '%' || search_query || '%'
      or array_to_string(rescue_profiles.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1
        from rescue_needs
        where rescue_needs.rescue_id = rescue_profiles.id
          and rescue_needs.is_active = true
          and rescue_needs.deleted_at is null
          and rescue_needs.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1
        from rescue_wishlist_items
        where rescue_wishlist_items.rescue_id = rescue_profiles.id
          and rescue_wishlist_items.is_active = true
          and rescue_wishlist_items.deleted_at is null
          and rescue_wishlist_items.item ilike '%' || search_query || '%'
      )
    ))
  order by distance_miles asc, rescue_profiles.name asc;
$$;

grant execute on function get_nearby_rescues(
  numeric,
  numeric,
  numeric,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
