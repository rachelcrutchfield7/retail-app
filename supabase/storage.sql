create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('listings', 'listings', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('message-images', 'message-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads avatar images" on storage.objects;
drop policy if exists "Users manage own avatar images" on storage.objects;
drop policy if exists "Public reads listing images" on storage.objects;
drop policy if exists "Listing owners manage listing images" on storage.objects;
drop policy if exists "Conversation participants read message images" on storage.objects;
drop policy if exists "Conversation participants upload message images" on storage.objects;
drop policy if exists "Conversation participants delete own message images" on storage.objects;

create policy "Public reads avatar images"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users manage own avatar images"
  on storage.objects for all
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
    and is_account_active()
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
    and is_account_active()
  );

create policy "Public reads listing images"
  on storage.objects for select
  using (bucket_id = 'listings');

create policy "Listing owners manage listing images"
  on storage.objects for all
  using (
    bucket_id = 'listings'
    and auth.uid()::text = (storage.foldername(name))[1]
    and is_account_active()
  )
  with check (
    bucket_id = 'listings'
    and auth.uid()::text = (storage.foldername(name))[1]
    and is_account_active()
  );

create policy "Conversation participants read message images"
  on storage.objects for select
  using (
    bucket_id = 'message-images'
    and exists (
      select 1 from conversations
      where conversations.id = public.safe_uuid((storage.foldername(name))[1])
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Conversation participants upload message images"
  on storage.objects for insert
  with check (
    bucket_id = 'message-images'
    and is_account_active()
    and exists (
      select 1 from conversations
      where conversations.id = public.safe_uuid((storage.foldername(name))[1])
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Conversation participants delete own message images"
  on storage.objects for delete
  using (
    bucket_id = 'message-images'
    and owner = auth.uid()
    and is_account_active()
    and exists (
      select 1 from conversations
      where conversations.id = public.safe_uuid((storage.foldername(name))[1])
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

notify pgrst, 'reload schema';
