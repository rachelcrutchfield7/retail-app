-- ReTail ISO / In Search Of marketplace foundation.
-- ISO posts are intentionally separate from sale/donation listings.

create table if not exists public.iso_posts (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  subcategory_id uuid references public.categories(id) on delete restrict,

  title text not null,
  description text not null,

  desired_condition text not null default 'any',
  budget_max numeric(10,2),
  quantity integer not null default 1,
  urgency text not null default 'flexible',

  search_area_id uuid not null references public.marketplace_search_areas(id) on delete restrict,
  radius_miles integer not null default 25,

  status text not null default 'active',
  expires_at timestamptz not null default (now() + interval '30 days'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint iso_posts_title_length
    check (char_length(title) between 3 and 120),

  constraint iso_posts_description_length
    check (char_length(description) between 10 and 3000),

  constraint iso_posts_condition_valid
    check (desired_condition in ('any', 'new', 'used')),

  constraint iso_posts_budget_nonnegative
    check (budget_max is null or budget_max >= 0),

  constraint iso_posts_quantity_valid
    check (quantity between 1 and 99),

  constraint iso_posts_urgency_valid
    check (urgency in ('flexible', 'soon', 'urgent')),

  constraint iso_posts_radius_valid
    check (radius_miles in (10, 25, 50, 100)),

  constraint iso_posts_status_valid
    check (status in ('active', 'fulfilled', 'expired', 'closed')),

  constraint iso_posts_expiry_after_create
    check (expires_at > created_at),

  constraint iso_posts_expiry_window
    check (expires_at <= created_at + interval '90 days'),

  constraint iso_posts_subcategory_distinct
    check (subcategory_id is null or subcategory_id <> category_id)
);

create table if not exists public.iso_post_images (
  id uuid primary key default gen_random_uuid(),
  iso_post_id uuid not null references public.iso_posts(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,
  sort_order integer not null default 0,
  alt_text text,
  created_at timestamptz not null default now(),

  constraint iso_post_images_sort_order_valid
    check (sort_order between 0 and 4),

  constraint iso_post_images_unique_sort
    unique (iso_post_id, sort_order),

  constraint iso_post_images_alt_text_length
    check (alt_text is null or char_length(alt_text) <= 160)
);

create table if not exists public.iso_responses (
  id uuid primary key default gen_random_uuid(),
  iso_post_id uuid not null references public.iso_posts(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint iso_responses_unique_listing
    unique (iso_post_id, responder_id, listing_id)
);

create index if not exists iso_posts_active_feed_idx
  on public.iso_posts (status, expires_at, created_at desc)
  where deleted_at is null;

create index if not exists iso_posts_poster_idx
  on public.iso_posts (poster_id, created_at desc)
  where deleted_at is null;

create index if not exists iso_posts_search_area_idx
  on public.iso_posts (search_area_id, created_at desc)
  where deleted_at is null;

create index if not exists iso_posts_category_idx
  on public.iso_posts (category_id, created_at desc)
  where deleted_at is null;

create index if not exists iso_post_images_post_idx
  on public.iso_post_images (iso_post_id, sort_order);

create index if not exists iso_responses_post_idx
  on public.iso_responses (iso_post_id, created_at desc);

create index if not exists iso_responses_responder_idx
  on public.iso_responses (responder_id, created_at desc);


create or replace function private.set_iso_post_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_iso_post_updated_at() from public, anon, authenticated;

drop trigger if exists set_iso_post_updated_at on public.iso_posts;

create trigger set_iso_post_updated_at
before update on public.iso_posts
for each row
execute function private.set_iso_post_updated_at();


create or replace function private.expire_stale_iso_posts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.iso_posts
  set status = 'expired'
  where status = 'active'
    and deleted_at is null
    and expires_at <= now();
end;
$$;

revoke all on function private.expire_stale_iso_posts()
from public, anon, authenticated;


alter table public.iso_posts enable row level security;
alter table public.iso_post_images enable row level security;
alter table public.iso_responses enable row level security;


drop policy if exists "ISO active users read visible posts"
on public.iso_posts;

create policy "ISO active users read visible posts"
on public.iso_posts
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and deleted_at is null
  and (
    poster_id = auth.uid()
    or private.is_admin(auth.uid())
    or (
      status = 'active'
      and expires_at > now()
      and not private.is_blocked_between(auth.uid(), poster_id)
    )
  )
);


drop policy if exists "ISO users read visible images"
on public.iso_post_images;

create policy "ISO users read visible images"
on public.iso_post_images
for select
to authenticated
using (
  exists (
    select 1
    from public.iso_posts p
    where p.id = iso_post_images.iso_post_id
      and p.deleted_at is null
      and private.is_account_active(auth.uid())
      and (
        p.poster_id = auth.uid()
        or private.is_admin(auth.uid())
        or (
          p.status = 'active'
          and p.expires_at > now()
          and not private.is_blocked_between(auth.uid(), p.poster_id)
        )
      )
  )
);


drop policy if exists "ISO owners add images"
on public.iso_post_images;

create policy "ISO owners add images"
on public.iso_post_images
for insert
to authenticated
with check (
  private.is_account_active(auth.uid())
  and exists (
    select 1
    from public.iso_posts p
    where p.id = iso_post_images.iso_post_id
      and p.poster_id = auth.uid()
      and p.deleted_at is null
  )
);


drop policy if exists "ISO owners delete images"
on public.iso_post_images;

create policy "ISO owners delete images"
on public.iso_post_images
for delete
to authenticated
using (
  private.is_account_active(auth.uid())
  and exists (
    select 1
    from public.iso_posts p
    where p.id = iso_post_images.iso_post_id
      and p.poster_id = auth.uid()
      and p.deleted_at is null
  )
);


drop policy if exists "ISO response parties read responses"
on public.iso_responses;

create policy "ISO response parties read responses"
on public.iso_responses
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and (
    responder_id = auth.uid()
    or exists (
      select 1
      from public.iso_posts p
      where p.id = iso_responses.iso_post_id
        and p.poster_id = auth.uid()
        and p.deleted_at is null
    )
    or private.is_admin(auth.uid())
  )
);


revoke all on table public.iso_posts from public, anon;
revoke all on table public.iso_post_images from public, anon;
revoke all on table public.iso_responses from public, anon;

grant select on table public.iso_posts to authenticated;
grant select, insert, delete on table public.iso_post_images to authenticated;
grant select on table public.iso_responses to authenticated;

grant all on table public.iso_posts to service_role;
grant all on table public.iso_post_images to service_role;
grant all on table public.iso_responses to service_role;


create or replace function public.create_iso_post(
  requested_title text,
  requested_description text,
  requested_category_id uuid,
  requested_subcategory_id uuid default null,
  requested_condition text default 'any',
  requested_budget_max numeric default null,
  requested_quantity integer default 1,
  requested_urgency text default 'flexible',
  requested_search_area_id uuid default null,
  requested_radius_miles integer default 25,
  requested_expires_in_days integer default 30
)
returns public.iso_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  created_post public.iso_posts;
  safe_title text := btrim(coalesce(requested_title, ''));
  safe_description text := btrim(coalesce(requested_description, ''));
  safe_condition text := lower(btrim(coalesce(requested_condition, 'any')));
  safe_urgency text := lower(btrim(coalesce(requested_urgency, 'flexible')));
  safe_days integer := coalesce(requested_expires_in_days, 30);
begin
  perform private.check_rate_limit(
    'iso_post_create',
    'global',
    20,
    interval '1 hour'
  );

  if char_length(safe_title) < 3 or char_length(safe_title) > 120 then
    raise exception 'RETAIL_ISO_TITLE_INVALID' using errcode = '22023';
  end if;

  if char_length(safe_description) < 10 or char_length(safe_description) > 3000 then
    raise exception 'RETAIL_ISO_DESCRIPTION_INVALID' using errcode = '22023';
  end if;

  if requested_category_id is null then
    raise exception 'RETAIL_ISO_CATEGORY_REQUIRED' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.categories c
    where c.id = requested_category_id
      and c.parent_id is null
      and c.is_active = true
  ) then
    raise exception 'RETAIL_ISO_CATEGORY_INVALID' using errcode = '22023';
  end if;

  if requested_subcategory_id is not null
    and not exists (
      select 1
      from public.categories c
      where c.id = requested_subcategory_id
        and c.parent_id = requested_category_id
        and c.is_active = true
    ) then
    raise exception 'RETAIL_ISO_SUBCATEGORY_INVALID' using errcode = '22023';
  end if;

  if safe_condition not in ('any', 'new', 'used') then
    raise exception 'RETAIL_ISO_CONDITION_INVALID' using errcode = '22023';
  end if;

  if requested_budget_max is not null and requested_budget_max < 0 then
    raise exception 'RETAIL_ISO_BUDGET_INVALID' using errcode = '22023';
  end if;

  if requested_quantity is null or requested_quantity not between 1 and 99 then
    raise exception 'RETAIL_ISO_QUANTITY_INVALID' using errcode = '22023';
  end if;

  if safe_urgency not in ('flexible', 'soon', 'urgent') then
    raise exception 'RETAIL_ISO_URGENCY_INVALID' using errcode = '22023';
  end if;

  if requested_radius_miles not in (10, 25, 50, 100) then
    raise exception 'RETAIL_ISO_RADIUS_INVALID' using errcode = '22023';
  end if;

  if safe_days not between 1 and 90 then
    raise exception 'RETAIL_ISO_EXPIRY_INVALID' using errcode = '22023';
  end if;

  if requested_search_area_id is null or not exists (
    select 1
    from public.marketplace_search_areas msa
    where msa.id = requested_search_area_id
      and msa.is_active = true
  ) then
    raise exception 'RETAIL_ISO_AREA_INVALID' using errcode = '22023';
  end if;

  insert into public.iso_posts (
    poster_id,
    category_id,
    subcategory_id,
    title,
    description,
    desired_condition,
    budget_max,
    quantity,
    urgency,
    search_area_id,
    radius_miles,
    expires_at
  )
  values (
    caller_id,
    requested_category_id,
    requested_subcategory_id,
    safe_title,
    safe_description,
    safe_condition,
    requested_budget_max,
    requested_quantity,
    safe_urgency,
    requested_search_area_id,
    requested_radius_miles,
    now() + make_interval(days => safe_days)
  )
  returning *
  into created_post;

  return created_post;
end;
$$;


create or replace function public.update_my_iso_post(
  target_iso_post_id uuid,
  requested_title text,
  requested_description text,
  requested_category_id uuid,
  requested_subcategory_id uuid default null,
  requested_condition text default 'any',
  requested_budget_max numeric default null,
  requested_quantity integer default 1,
  requested_urgency text default 'flexible',
  requested_search_area_id uuid default null,
  requested_radius_miles integer default 25,
  requested_expires_at timestamptz default null
)
returns public.iso_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  current_post public.iso_posts;
  updated_post public.iso_posts;
  safe_title text := btrim(coalesce(requested_title, ''));
  safe_description text := btrim(coalesce(requested_description, ''));
  safe_condition text := lower(btrim(coalesce(requested_condition, 'any')));
  safe_urgency text := lower(btrim(coalesce(requested_urgency, 'flexible')));
begin
  select *
  into current_post
  from public.iso_posts p
  where p.id = target_iso_post_id
    and p.poster_id = caller_id
    and p.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_ISO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if current_post.status not in ('active', 'expired') then
    raise exception 'RETAIL_ISO_NOT_EDITABLE' using errcode = '55000';
  end if;

  if char_length(safe_title) < 3 or char_length(safe_title) > 120 then
    raise exception 'RETAIL_ISO_TITLE_INVALID' using errcode = '22023';
  end if;

  if char_length(safe_description) < 10 or char_length(safe_description) > 3000 then
    raise exception 'RETAIL_ISO_DESCRIPTION_INVALID' using errcode = '22023';
  end if;

  if requested_category_id is null then
    raise exception 'RETAIL_ISO_CATEGORY_REQUIRED' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.categories c
    where c.id = requested_category_id
      and c.parent_id is null
      and c.is_active = true
  ) then
    raise exception 'RETAIL_ISO_CATEGORY_INVALID' using errcode = '22023';
  end if;

  if requested_subcategory_id is not null
    and not exists (
      select 1
      from public.categories c
      where c.id = requested_subcategory_id
        and c.parent_id = requested_category_id
        and c.is_active = true
    ) then
    raise exception 'RETAIL_ISO_SUBCATEGORY_INVALID' using errcode = '22023';
  end if;

  if safe_condition not in ('any', 'new', 'used') then
    raise exception 'RETAIL_ISO_CONDITION_INVALID' using errcode = '22023';
  end if;

  if requested_budget_max is not null and requested_budget_max < 0 then
    raise exception 'RETAIL_ISO_BUDGET_INVALID' using errcode = '22023';
  end if;

  if requested_quantity is null or requested_quantity not between 1 and 99 then
    raise exception 'RETAIL_ISO_QUANTITY_INVALID' using errcode = '22023';
  end if;

  if safe_urgency not in ('flexible', 'soon', 'urgent') then
    raise exception 'RETAIL_ISO_URGENCY_INVALID' using errcode = '22023';
  end if;

  if requested_radius_miles not in (10, 25, 50, 100) then
    raise exception 'RETAIL_ISO_RADIUS_INVALID' using errcode = '22023';
  end if;

  if requested_search_area_id is null or not exists (
    select 1
    from public.marketplace_search_areas msa
    where msa.id = requested_search_area_id
      and msa.is_active = true
  ) then
    raise exception 'RETAIL_ISO_AREA_INVALID' using errcode = '22023';
  end if;

  if requested_expires_at is not null
    and (
      requested_expires_at <= now()
      or requested_expires_at > now() + interval '90 days'
    ) then
    raise exception 'RETAIL_ISO_EXPIRY_INVALID' using errcode = '22023';
  end if;

  update public.iso_posts
  set
    title = safe_title,
    description = safe_description,
    category_id = requested_category_id,
    subcategory_id = requested_subcategory_id,
    desired_condition = safe_condition,
    budget_max = requested_budget_max,
    quantity = requested_quantity,
    urgency = safe_urgency,
    search_area_id = requested_search_area_id,
    radius_miles = requested_radius_miles,
    expires_at = coalesce(requested_expires_at, expires_at),
    status = case
      when status = 'expired' and coalesce(requested_expires_at, expires_at) > now()
        then 'active'
      else status
    end
  where id = target_iso_post_id
  returning *
  into updated_post;

  return updated_post;
end;
$$;


create or replace function public.set_my_iso_post_status(
  target_iso_post_id uuid,
  requested_status text
)
returns public.iso_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_status text := lower(btrim(coalesce(requested_status, '')));
  updated_post public.iso_posts;
begin
  if safe_status not in ('active', 'fulfilled', 'closed') then
    raise exception 'RETAIL_ISO_STATUS_INVALID' using errcode = '22023';
  end if;

  update public.iso_posts
  set status = safe_status
  where id = target_iso_post_id
    and poster_id = caller_id
    and deleted_at is null
    and (
      safe_status <> 'active'
      or expires_at > now()
    )
  returning *
  into updated_post;

  if not found then
    raise exception 'RETAIL_ISO_NOT_FOUND_OR_EXPIRED' using errcode = 'P0002';
  end if;

  return updated_post;
end;
$$;


create or replace function public.get_iso_feed(
  requested_search_area_id uuid default null,
  requested_radius_miles integer default null,
  requested_category_id uuid default null,
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns table (
  id uuid,
  poster_id uuid,
  category_id uuid,
  subcategory_id uuid,
  title text,
  description text,
  desired_condition text,
  budget_max numeric,
  quantity integer,
  urgency text,
  search_area_id uuid,
  search_area_label text,
  radius_miles integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  image_url text,
  response_count bigint,
  distance_miles numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  effective_area_id uuid;
  effective_radius integer;
begin
  perform private.expire_stale_iso_posts();

  if requested_limit is null or requested_limit < 1 or requested_limit > 100 then
    raise exception 'RETAIL_ISO_LIMIT_INVALID' using errcode = '22023';
  end if;

  if requested_offset is null or requested_offset < 0 then
    raise exception 'RETAIL_ISO_OFFSET_INVALID' using errcode = '22023';
  end if;

  select
    coalesce(requested_search_area_id, pref.search_area_id),
    coalesce(requested_radius_miles, pref.radius_miles, 25)
  into
    effective_area_id,
    effective_radius
  from (select 1) seed
  left join public.marketplace_search_preferences pref
    on pref.user_id = caller_id;

  if effective_radius not in (10, 25, 50, 100) then
    raise exception 'RETAIL_ISO_RADIUS_INVALID' using errcode = '22023';
  end if;

  return query
  select
    p.id,
    p.poster_id,
    p.category_id,
    p.subcategory_id,
    p.title,
    p.description,
    p.desired_condition,
    p.budget_max,
    p.quantity,
    p.urgency,
    p.search_area_id,
    post_area.label as search_area_label,
    p.radius_miles,
    p.status,
    p.expires_at,
    p.created_at,
    (
      select i.thumbnail_url
      from public.iso_post_images i
      where i.iso_post_id = p.id
      order by i.sort_order asc, i.created_at asc
      limit 1
    ) as image_url,
    (
      select count(*)
      from public.iso_responses r
      where r.iso_post_id = p.id
    ) as response_count,
    case
      when viewer_area.id is null then null::numeric
      else round(
        (
          public.st_distance(post_area.centroid, viewer_area.centroid)
          / 1609.344
        )::numeric,
        1
      )
    end as distance_miles
  from public.iso_posts p
  join public.marketplace_search_areas post_area
    on post_area.id = p.search_area_id
   and post_area.is_active = true
  left join public.marketplace_search_areas viewer_area
    on viewer_area.id = effective_area_id
   and viewer_area.is_active = true
  where p.deleted_at is null
    and p.status = 'active'
    and p.expires_at > now()
    and p.poster_id <> caller_id
    and not private.is_blocked_between(caller_id, p.poster_id)
    and (
      requested_category_id is null
      or p.category_id = requested_category_id
      or p.subcategory_id = requested_category_id
    )
    and (
      effective_area_id is null
      or (
        viewer_area.id is not null
        and public.st_dwithin(
          post_area.centroid,
          viewer_area.centroid,
          least(effective_radius, p.radius_miles)::double precision * 1609.344
        )
      )
    )
  order by
    case p.urgency
      when 'urgent' then 0
      when 'soon' then 1
      else 2
    end,
    p.created_at desc
  limit requested_limit
  offset requested_offset;
end;
$$;


create or replace function public.respond_to_iso_post(
  target_iso_post_id uuid,
  target_listing_id uuid
)
returns public.iso_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  post_row public.iso_posts%rowtype;
  listing_row public.listings%rowtype;
  response_row public.iso_responses;
  post_area public.marketplace_search_areas%rowtype;
  listing_area public.marketplace_search_areas%rowtype;
begin
  perform private.expire_stale_iso_posts();

  perform private.check_rate_limit(
    'iso_response_create',
    'global',
    30,
    interval '1 hour'
  );

  select *
  into post_row
  from public.iso_posts p
  where p.id = target_iso_post_id
    and p.deleted_at is null
    and p.status = 'active'
    and p.expires_at > now()
  for update;

  if not found then
    raise exception 'RETAIL_ISO_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if post_row.poster_id = caller_id then
    raise exception 'RETAIL_ISO_SELF_RESPONSE' using errcode = '42501';
  end if;

  if private.is_blocked_between(caller_id, post_row.poster_id) then
    raise exception 'RETAIL_ISO_BLOCKED' using errcode = '42501';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.seller_id = caller_id
    and l.status = 'active'
    and l.deleted_at is null;

  if not found then
    raise exception 'RETAIL_ISO_LISTING_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if listing_row.category_id <> post_row.category_id then
    raise exception 'RETAIL_ISO_CATEGORY_MISMATCH' using errcode = '22023';
  end if;

  if listing_row.search_area_id is null then
    raise exception 'RETAIL_ISO_LISTING_AREA_REQUIRED' using errcode = '22023';
  end if;

  select *
  into post_area
  from public.marketplace_search_areas a
  where a.id = post_row.search_area_id
    and a.is_active = true;

  select *
  into listing_area
  from public.marketplace_search_areas a
  where a.id = listing_row.search_area_id
    and a.is_active = true;

  if post_area.id is null or listing_area.id is null then
    raise exception 'RETAIL_ISO_AREA_INVALID' using errcode = '22023';
  end if;

  if not public.st_dwithin(
    post_area.centroid,
    listing_area.centroid,
    post_row.radius_miles::double precision * 1609.344
  ) then
    raise exception 'RETAIL_ISO_LISTING_OUTSIDE_AREA' using errcode = '22023';
  end if;

  if post_row.desired_condition = 'new'
    and listing_row.condition::text <> 'new' then
    raise exception 'RETAIL_ISO_CONDITION_MISMATCH' using errcode = '22023';
  end if;

  if post_row.desired_condition = 'used'
    and listing_row.condition::text = 'new' then
    raise exception 'RETAIL_ISO_CONDITION_MISMATCH' using errcode = '22023';
  end if;

  insert into public.iso_responses (
    iso_post_id,
    responder_id,
    listing_id
  )
  values (
    post_row.id,
    caller_id,
    listing_row.id
  )
  on conflict (iso_post_id, responder_id, listing_id)
  do update set listing_id = excluded.listing_id
  returning *
  into response_row;

  return response_row;
end;
$$;


revoke all on function public.create_iso_post(
  text,
  text,
  uuid,
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  integer,
  integer
) from public, anon;

grant execute on function public.create_iso_post(
  text,
  text,
  uuid,
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  integer,
  integer
) to authenticated, service_role;


revoke all on function public.update_my_iso_post(
  uuid,
  text,
  text,
  uuid,
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  integer,
  timestamptz
) from public, anon;

grant execute on function public.update_my_iso_post(
  uuid,
  text,
  text,
  uuid,
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  integer,
  timestamptz
) to authenticated, service_role;


revoke all on function public.set_my_iso_post_status(uuid, text)
from public, anon;

grant execute on function public.set_my_iso_post_status(uuid, text)
to authenticated, service_role;


revoke all on function public.get_iso_feed(
  uuid,
  integer,
  uuid,
  integer,
  integer
) from public, anon;

grant execute on function public.get_iso_feed(
  uuid,
  integer,
  uuid,
  integer,
  integer
) to authenticated, service_role;


revoke all on function public.respond_to_iso_post(uuid, uuid)
from public, anon;

grant execute on function public.respond_to_iso_post(uuid, uuid)
to authenticated, service_role;


insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'iso-posts',
  'iso-posts',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


drop policy if exists "ISO images are publicly readable"
on storage.objects;

create policy "ISO images are publicly readable"
on storage.objects
for select
using (bucket_id = 'iso-posts');


drop policy if exists "ISO owners upload post images"
on storage.objects;

create policy "ISO owners upload post images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) >= 2
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  and private.is_account_active(auth.uid())
  and exists (
    select 1
    from public.iso_posts p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = auth.uid()
      and p.deleted_at is null
  )
);


drop policy if exists "ISO owners update post images"
on storage.objects;

create policy "ISO owners update post images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.is_account_active(auth.uid())
  and exists (
    select 1
    from public.iso_posts p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = auth.uid()
      and p.deleted_at is null
  )
)
with check (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.is_account_active(auth.uid())
  and exists (
    select 1
    from public.iso_posts p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = auth.uid()
      and p.deleted_at is null
  )
);


drop policy if exists "ISO owners delete post images"
on storage.objects;

create policy "ISO owners delete post images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.is_account_active(auth.uid())
  and exists (
    select 1
    from public.iso_posts p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = auth.uid()
      and p.deleted_at is null
  )
);
