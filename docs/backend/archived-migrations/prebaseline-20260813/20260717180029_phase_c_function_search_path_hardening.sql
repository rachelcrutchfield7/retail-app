-- ReTail Security Remediation Phase C follow-up
-- Harden internal function search paths flagged by Supabase advisors.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_listing_image_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_images where listing_id = new.listing_id) >= 15 then
    raise exception 'RETAIL_LISTING_IMAGE_LIMIT'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.sync_listing_location_point()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.location_point = case
    when new.latitude is not null and new.longitude is not null then
      public.st_setsrid(public.st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::public.geography
    else null
  end;

  return new;
end;
$$;

create or replace function public.sync_rescue_location_point()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.location_point = case
    when new.latitude is not null and new.longitude is not null then
      public.st_setsrid(public.st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::public.geography
    else null
  end;

  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_listing_image_limit() from public, anon, authenticated;
revoke execute on function public.safe_uuid(text) from public, anon, authenticated;
revoke execute on function public.sync_listing_location_point() from public, anon, authenticated;
revoke execute on function public.sync_rescue_location_point() from public, anon, authenticated;
