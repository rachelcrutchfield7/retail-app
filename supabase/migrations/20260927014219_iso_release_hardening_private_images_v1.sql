-- ReTail ISO Batch 4 - release hardening for private reference images.
--
-- ISO image keys remain in the existing image_url columns for wire and schema
-- compatibility. Clients resolve those stable keys to short-lived signed URLs.
-- Production has no ISO images, so no public-URL data migration is required.

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
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


create or replace function private.can_read_iso_post_image(
  target_iso_post_id uuid
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
  if caller_id is null
    or not private.is_account_active(caller_id) then
    return false;
  end if;

  return exists (
    select 1
    from public.iso_posts as p
    where p.id = target_iso_post_id
      and (
        private.is_admin(caller_id)
        or (
          p.deleted_at is null
          and (
            p.poster_id = caller_id
            or (
              p.status = 'active'
              and p.expires_at > now()
              and private.is_account_active(p.poster_id)
              and not private.is_blocked_between(caller_id, p.poster_id)
            )
          )
        )
      )
  );
end;
$$;

revoke all on function private.can_read_iso_post_image(uuid)
from public, anon, authenticated;

grant execute on function private.can_read_iso_post_image(uuid)
to authenticated, service_role;


create or replace function private.validate_iso_post_image_storage_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner_id uuid;
  path_parts text[];
begin
  select p.poster_id
  into post_owner_id
  from public.iso_posts as p
  where p.id = new.iso_post_id;

  if not found then
    raise exception 'RETAIL_ISO_IMAGE_POST_INVALID' using errcode = '23503';
  end if;

  if new.image_url is null
    or new.image_url <> pg_catalog.btrim(new.image_url)
    or new.image_url like '%://%'
    or new.image_url like '%?%'
    or new.image_url like '%#%'
    or new.image_url like '/%'
    or new.image_url like '%..%'
    or pg_catalog.char_length(new.image_url) > 1024 then
    raise exception 'RETAIL_ISO_IMAGE_PATH_INVALID' using errcode = '22023';
  end if;

  path_parts := storage.foldername(new.image_url);

  if pg_catalog.array_length(path_parts, 1) <> 2
    or path_parts[1] <> post_owner_id::text
    or private.uuid_from_text(path_parts[2]) is distinct from new.iso_post_id
    or pg_catalog.lower(storage.extension(new.image_url)) <> all (
      array['jpg', 'jpeg', 'png', 'webp']
    ) then
    raise exception 'RETAIL_ISO_IMAGE_PATH_INVALID' using errcode = '22023';
  end if;

  if new.thumbnail_url is not null
    and new.thumbnail_url is distinct from new.image_url then
    raise exception 'RETAIL_ISO_IMAGE_THUMBNAIL_INVALID' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_iso_post_image_storage_key()
from public, anon, authenticated;

drop trigger if exists validate_iso_post_image_storage_key
on public.iso_post_images;

create trigger validate_iso_post_image_storage_key
before insert or update of iso_post_id, image_url, thumbnail_url
on public.iso_post_images
for each row
execute function private.validate_iso_post_image_storage_key();


drop policy if exists "ISO owners upload post images"
on storage.objects;

create policy "ISO owners upload post images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'iso-posts'
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) = any (
    array['jpg', 'jpeg', 'png', 'webp']
  )
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
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
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
)
with check (
  bucket_id = 'iso-posts'
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) = any (
    array['jpg', 'jpeg', 'png', 'webp']
  )
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
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
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
);


drop policy if exists "ISO users read visible images"
on public.iso_post_images;

create policy "ISO users read visible images"
on public.iso_post_images
for select
to authenticated
using (private.can_read_iso_post_image(iso_post_id));


drop policy if exists "ISO images are publicly readable"
on storage.objects;

drop policy if exists "ISO authorized users read post images"
on storage.objects;

create policy "ISO authorized users read post images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'iso-posts'
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and private.can_read_iso_post_image(
    private.uuid_from_text((storage.foldername(name))[2])
  )
  and exists (
    select 1
    from public.iso_post_images as i
    where i.iso_post_id = private.uuid_from_text((storage.foldername(name))[2])
      and (
        i.image_url = name
        or i.thumbnail_url = name
      )
  )
);
