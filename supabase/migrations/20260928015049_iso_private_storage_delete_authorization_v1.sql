-- Prevent authorized ISO viewers from using read access to select another
-- user's object for a mutating Storage API operation. Supabase Storage remove
-- requires both SELECT and DELETE; operation-aware SELECT policies keep those
-- permissions aligned without weakening signed reads.

drop policy if exists "ISO authorized users read post images"
on storage.objects;

create policy "ISO authorized users read post images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'iso-posts'
  and storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info',
    'object.sign'
  ])
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


drop policy if exists "ISO owners inspect post images for mutation"
on storage.objects;

create policy "ISO owners inspect post images for mutation"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'iso-posts'
  and storage.allow_any_operation(array[
    'object.upload',
    'object.upload_update',
    'object.delete',
    'object.delete_many'
  ])
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
