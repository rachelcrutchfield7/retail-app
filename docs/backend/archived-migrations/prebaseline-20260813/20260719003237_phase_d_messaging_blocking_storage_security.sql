-- ReTail Security Remediation Phase D
-- Conversations, messages, blocking, and storage security.
--
-- This migration intentionally keeps marketplace, reviews, reports, payments,
-- and broad notification redesign work out of scope.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Message attachment metadata
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists attachment_bucket text,
  add column if not exists attachment_path text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes integer,
  add column if not exists attachment_width integer,
  add column if not exists attachment_height integer;

create index if not exists idx_messages_attachment_path
  on public.messages (attachment_bucket, attachment_path)
  where attachment_path is not null;

create index if not exists idx_messages_unread_by_conversation
  on public.messages (conversation_id, is_read, created_at)
  where deleted_at is null;

create index if not exists idx_blocks_pair_lookup
  on public.blocks (blocker_id, blocked_id);

create index if not exists idx_conversations_participants_listing
  on public.conversations (buyer_id, seller_id, listing_id)
  where deleted_at is null;

create table if not exists public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  object_path text not null,
  source_table text not null,
  source_id uuid not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (bucket_id, object_path, source_table, source_id, reason)
);

create index if not exists idx_storage_cleanup_jobs_status
  on public.storage_cleanup_jobs (status, created_at);

alter table public.storage_cleanup_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function private.is_blocked_between(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.blocks b
    where (
      b.blocker_id = first_user_id
      and b.blocked_id = second_user_id
    )
    or (
      b.blocker_id = second_user_id
      and b.blocked_id = first_user_id
    )
  );
$$;

revoke all on function private.is_blocked_between(uuid, uuid) from public;
revoke all on function private.is_blocked_between(uuid, uuid) from anon;
revoke all on function private.is_blocked_between(uuid, uuid) from authenticated;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated;

create or replace function private.is_conversation_participant(target_conversation_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and c.deleted_at is null
      and target_user_id in (c.buyer_id, c.seller_id)
  );
$$;

revoke all on function private.is_conversation_participant(uuid, uuid) from public;
revoke all on function private.is_conversation_participant(uuid, uuid) from anon;
revoke all on function private.is_conversation_participant(uuid, uuid) from authenticated;
grant execute on function private.is_conversation_participant(uuid, uuid) to authenticated;

create or replace function private.other_conversation_participant(target_conversation_id uuid, target_user_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when c.buyer_id = target_user_id then c.seller_id
    when c.seller_id = target_user_id then c.buyer_id
    else null
  end
  from public.conversations c
  where c.id = target_conversation_id
    and c.deleted_at is null;
$$;

revoke all on function private.other_conversation_participant(uuid, uuid) from public;
revoke all on function private.other_conversation_participant(uuid, uuid) from anon;
revoke all on function private.other_conversation_participant(uuid, uuid) from authenticated;
grant execute on function private.other_conversation_participant(uuid, uuid) to authenticated;

create or replace function private.uuid_from_text(target_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
immutable
as $$
begin
  if target_text is null then
    return null;
  end if;

  return target_text::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function private.uuid_from_text(text) from public;
revoke all on function private.uuid_from_text(text) from anon;
revoke all on function private.uuid_from_text(text) from authenticated;
grant execute on function private.uuid_from_text(text) to authenticated;

create or replace function private.public_storage_path_from_url(target_bucket text, target_url text)
returns text
language plpgsql
security definer
set search_path = ''
immutable
as $$
declare
  marker text := '/storage/v1/object/public/' || target_bucket || '/';
  marker_position integer;
begin
  if target_bucket is null or target_url is null then
    return null;
  end if;

  marker_position := position(marker in target_url);

  if marker_position <= 0 then
    return null;
  end if;

  return split_part(substring(target_url from marker_position + length(marker)), '?', 1);
end;
$$;

revoke all on function private.public_storage_path_from_url(text, text) from public;
revoke all on function private.public_storage_path_from_url(text, text) from anon;
revoke all on function private.public_storage_path_from_url(text, text) from authenticated;

create or replace function private.message_attachment_path_is_valid(
  target_conversation_id uuid,
  target_sender_id uuid,
  target_bucket text,
  target_path text,
  target_mime_type text,
  target_size_bytes integer
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    target_bucket = 'message-images'
    and target_path is not null
    and target_path ~ (
      '^' || target_conversation_id::text || '/' || target_sender_id::text ||
      '/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
    )
    and target_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    and target_size_bytes is not null
    and target_size_bytes > 0
    and target_size_bytes <= 10485760
    and exists (
      select 1
      from storage.objects o
      where o.bucket_id = target_bucket
        and o.name = target_path
        and o.owner_id = target_sender_id::text
    );
$$;

revoke all on function private.message_attachment_path_is_valid(uuid, uuid, text, text, text, integer) from public;
revoke all on function private.message_attachment_path_is_valid(uuid, uuid, text, text, text, integer) from anon;
revoke all on function private.message_attachment_path_is_valid(uuid, uuid, text, text, text, integer) from authenticated;

create or replace function private.can_access_message_attachment(target_bucket text, target_path text, target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  path_parts text[];
  conversation_uuid uuid;
  uploader_uuid uuid;
  other_uuid uuid;
begin
  if target_bucket <> 'message-images' or target_path is null or target_user_id is null then
    return false;
  end if;

  path_parts := storage.foldername(target_path);

  if array_length(path_parts, 1) < 2 then
    return false;
  end if;

  begin
    conversation_uuid := path_parts[1]::uuid;
    uploader_uuid := path_parts[2]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if not private.is_conversation_participant(conversation_uuid, target_user_id) then
    return false;
  end if;

  if not private.is_conversation_participant(conversation_uuid, uploader_uuid) then
    return false;
  end if;

  if target_path !~ (
    '^' || conversation_uuid::text || '/' || uploader_uuid::text ||
    '/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
  ) then
    return false;
  end if;

  if not private.is_account_active(target_user_id) then
    return false;
  end if;

  other_uuid := private.other_conversation_participant(conversation_uuid, target_user_id);

  return other_uuid is not null
    and not private.is_blocked_between(target_user_id, other_uuid)
    and exists (
      select 1
      from public.messages m
      where m.conversation_id = conversation_uuid
        and m.attachment_bucket = target_bucket
        and m.attachment_path = target_path
        and m.deleted_at is null
    );
end;
$$;

revoke all on function private.can_access_message_attachment(text, text, uuid) from public;
revoke all on function private.can_access_message_attachment(text, text, uuid) from anon;
revoke all on function private.can_access_message_attachment(text, text, uuid) from authenticated;
grant execute on function private.can_access_message_attachment(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Message and conversation integrity triggers
-- ---------------------------------------------------------------------------

create or replace function public.update_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('retail.trusted_conversation_update', 'true', true);

  update public.conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;

  perform set_config('retail.trusted_conversation_update', 'false', true);

  update public.listings
  set message_count = message_count + 1
  where id = (
    select c.listing_id
    from public.conversations c
    where c.id = new.conversation_id
  )
  and deleted_at is null;

  return new;
end;
$$;

revoke all on function public.update_conversation_after_message() from public;
revoke all on function public.update_conversation_after_message() from anon;
revoke all on function public.update_conversation_after_message() from authenticated;

create or replace function public.protect_message_phase_d_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception 'Blocked users cannot exchange messages';
  end if;

  if new.message_type in ('text', 'system') then
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
      raise exception 'Message attachment is invalid';
    end if;
  else
    raise exception 'Unsupported message type';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_message_phase_d_fields on public.messages;
create trigger protect_message_phase_d_fields
before insert or update on public.messages
for each row execute function public.protect_message_phase_d_fields();

revoke all on function public.protect_message_phase_d_fields() from public;
revoke all on function public.protect_message_phase_d_fields() from anon;
revoke all on function public.protect_message_phase_d_fields() from authenticated;

create or replace function public.protect_conversation_phase_d_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_update boolean := coalesce(
    nullif(current_setting('retail.trusted_conversation_update', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Immutable conversation fields cannot be changed';
    end if;

    if not trusted_update
      and (
        new.last_message_at is distinct from old.last_message_at
        or new.updated_at is distinct from old.updated_at
        or new.deleted_at is distinct from old.deleted_at
      )
    then
      raise exception 'Conversation metadata can only be changed by trusted server logic';
    end if;
  end if;

  if new.buyer_id = new.seller_id then
    raise exception 'Buyer cannot be seller';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_conversation_phase_d_fields on public.conversations;
create trigger protect_conversation_phase_d_fields
before update on public.conversations
for each row execute function public.protect_conversation_phase_d_fields();

revoke all on function public.protect_conversation_phase_d_fields() from public;
revoke all on function public.protect_conversation_phase_d_fields() from anon;
revoke all on function public.protect_conversation_phase_d_fields() from authenticated;

create or replace function public.protect_listing_image_phase_d_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_owner_id uuid;
  storage_path text;
  path_parts text[];
  existing_count integer;
begin
  select l.seller_id
  into listing_owner_id
  from public.listings l
  where l.id = new.listing_id
    and l.deleted_at is null;

  if listing_owner_id is null then
    raise exception 'Listing is not available';
  end if;

  storage_path := private.public_storage_path_from_url('listings', new.image_url);

  if storage_path is null then
    raise exception 'Listing images must use ReTail listing storage';
  end if;

  path_parts := storage.foldername(storage_path);

  if array_length(path_parts, 1) < 2
    or path_parts[1] <> listing_owner_id::text
    or private.uuid_from_text(path_parts[2]) <> new.listing_id
    or lower(storage.extension(storage_path)) not in ('jpg', 'jpeg', 'png', 'webp')
  then
    raise exception 'Listing image path is invalid';
  end if;

  if tg_op = 'INSERT' then
    select count(*)
    into existing_count
    from public.listing_images li
    where li.listing_id = new.listing_id;

    if existing_count >= 15 then
      raise exception 'Listing image limit exceeded';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Immutable listing image fields cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_listing_image_phase_d_fields on public.listing_images;
create trigger protect_listing_image_phase_d_fields
before insert or update on public.listing_images
for each row execute function public.protect_listing_image_phase_d_fields();

revoke all on function public.protect_listing_image_phase_d_fields() from public;
revoke all on function public.protect_listing_image_phase_d_fields() from anon;
revoke all on function public.protect_listing_image_phase_d_fields() from authenticated;

-- ---------------------------------------------------------------------------
-- RPC API for conversations, messages, reads, deletes, and blocking
-- ---------------------------------------------------------------------------

create or replace function public.create_or_get_conversation(target_listing_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  listing_row public.listings%rowtype;
  existing_row public.conversations%rowtype;
  inserted_row public.conversations%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.status = 'active'
    and l.deleted_at is null;

  if not found then
    raise exception 'Listing is not available';
  end if;

  if listing_row.seller_id = caller_id then
    raise exception 'Users cannot message themselves';
  end if;

  if not private.is_account_active(listing_row.seller_id) then
    raise exception 'Seller account is not active';
  end if;

  if private.is_blocked_between(caller_id, listing_row.seller_id) then
    raise exception 'Blocked users cannot start conversations';
  end if;

  select *
  into existing_row
  from public.conversations c
  where c.listing_id = target_listing_id
    and c.buyer_id = caller_id
    and c.seller_id = listing_row.seller_id
    and c.deleted_at is null;

  if found then
    return existing_row;
  end if;

  perform set_config('retail.trusted_conversation_update', 'true', true);

  insert into public.conversations (listing_id, buyer_id, seller_id, created_at, updated_at)
  values (target_listing_id, caller_id, listing_row.seller_id, now(), now())
  on conflict (listing_id, buyer_id, seller_id)
  do update set
    deleted_at = null,
    updated_at = now()
  returning * into inserted_row;

  perform set_config('retail.trusted_conversation_update', 'false', true);

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action',
    'conversations',
    inserted_row.id,
    jsonb_build_object('action', 'conversation_created', 'listing_id', target_listing_id)
  );

  return inserted_row;
end;
$$;

revoke all on function public.create_or_get_conversation(uuid) from public;
revoke all on function public.create_or_get_conversation(uuid) from anon;
grant execute on function public.create_or_get_conversation(uuid) to authenticated;

create or replace function public.send_message(
  target_conversation_id uuid,
  requested_message_type public.message_type,
  requested_body text default null,
  requested_attachment_bucket text default null,
  requested_attachment_path text default null,
  requested_attachment_mime_type text default null,
  requested_attachment_size_bytes integer default null,
  requested_attachment_width integer default null,
  requested_attachment_height integer default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception 'Blocked users cannot exchange messages';
  end if;

  select count(*)
  into sent_count
  from public.messages m
  where m.sender_id = caller_id
    and m.created_at >= now() - interval '1 hour';

  if sent_count >= 100 then
    raise exception 'Message rate limit exceeded';
  end if;

  if requested_message_type in ('text', 'system') then
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
  elsif requested_message_type = 'image' then
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
      raise exception 'Message attachment is invalid';
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

  insert into public.notifications (user_id, type, title, body, data, is_read)
  values (
    recipient_id,
    'message',
    'New message',
    'You have a new ReTail message.',
    jsonb_build_object(
      'conversationId', target_conversation_id,
      'listingId', conversation_row.listing_id,
      'messageId', inserted_row.id,
      'route', '/messages/' || target_conversation_id::text
    ),
    false
  );

  return inserted_row;
end;
$$;

revoke all on function public.send_message(
  uuid,
  public.message_type,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) from public;
revoke all on function public.send_message(
  uuid,
  public.message_type,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) from anon;
grant execute on function public.send_message(
  uuid,
  public.message_type,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) to authenticated;

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  if not private.is_conversation_participant(target_conversation_id, caller_id) then
    raise exception 'Conversation is not available';
  end if;

  update public.messages m
  set is_read = true,
      read_at = coalesce(read_at, now())
  where m.conversation_id = target_conversation_id
    and m.sender_id <> caller_id
    and m.is_read = false
    and m.deleted_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
revoke all on function public.mark_conversation_read(uuid) from anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.soft_delete_own_message(target_message_id uuid)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_row public.messages%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  update public.messages m
  set deleted_at = coalesce(deleted_at, now())
  where m.id = target_message_id
    and m.sender_id = caller_id
  returning * into updated_row;

  if not found then
    raise exception 'Message is not available';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.soft_delete_own_message(uuid) from public;
revoke all on function public.soft_delete_own_message(uuid) from anon;
grant execute on function public.soft_delete_own_message(uuid) to authenticated;

create or replace function public.block_user(target_user_id uuid)
returns public.blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  inserted_row public.blocks%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if target_user_id is null or target_user_id = caller_id then
    raise exception 'Blocked user is invalid';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.deleted_at is null
  ) then
    raise exception 'User is not available';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (caller_id, target_user_id)
  on conflict (blocker_id, blocked_id)
  do update set blocker_id = excluded.blocker_id
  returning * into inserted_row;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action',
    'blocks',
    inserted_row.id,
    jsonb_build_object('action', 'user_blocked', 'blocked_id', target_user_id)
  );

  return inserted_row;
end;
$$;

revoke all on function public.block_user(uuid) from public;
revoke all on function public.block_user(uuid) from anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  deleted_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if target_user_id is null or target_user_id = caller_id then
    raise exception 'Blocked user is invalid';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  delete from public.blocks b
  where b.blocker_id = caller_id
    and b.blocked_id = target_user_id;

  get diagnostics deleted_count = row_count;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action',
    'blocks',
    null,
    jsonb_build_object('action', 'user_unblocked', 'blocked_id', target_user_id)
  );

  return deleted_count > 0;
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
revoke all on function public.unblock_user(uuid) from anon;
grant execute on function public.unblock_user(uuid) to authenticated;

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

  insert into public.storage_cleanup_jobs (
    bucket_id,
    object_path,
    source_table,
    source_id,
    reason
  )
  select
    'listings',
    private.public_storage_path_from_url('listings', li.image_url),
    'listings',
    target_listing_id,
    'listing_removed'
  from public.listing_images li
  join public.listings l on l.id = li.listing_id
  where li.listing_id = target_listing_id
    and l.seller_id = caller_id
    and private.public_storage_path_from_url('listings', li.image_url) is not null
  on conflict (bucket_id, object_path, source_table, source_id, reason) do nothing;

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
  values (
    caller_id,
    'listing_deleted',
    'listings',
    target_listing_id,
    jsonb_build_object(
      'source', 'delete_my_listing',
      'storage_cleanup', 'queued'
    )
  );

  return updated_listing;
end;
$$;

revoke all on function public.delete_my_listing(uuid) from public;
revoke all on function public.delete_my_listing(uuid) from anon;
grant execute on function public.delete_my_listing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Table grants and row level security policies
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.storage_cleanup_jobs enable row level security;

revoke all on table public.conversations from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;
revoke all on table public.blocks from public, anon, authenticated;
revoke all on table public.storage_cleanup_jobs from public, anon, authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.messages to authenticated;
grant select on table public.blocks to authenticated;
grant select, update on table public.storage_cleanup_jobs to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('conversations', 'messages', 'blocks')
      and policyname not like 'Phase D %'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

drop policy if exists "Conversation participants can read" on public.conversations;
drop policy if exists "Buyers can create conversations" on public.conversations;
drop policy if exists "Participants can update conversations" on public.conversations;
drop policy if exists "Participants can view conversations" on public.conversations;
drop policy if exists "Active participants can view conversations" on public.conversations;

create policy "Phase D participants can view conversations"
on public.conversations
for select
to authenticated
using (
  deleted_at is null
  and private.is_account_active(auth.uid())
  and (
    auth.uid() in (buyer_id, seller_id)
    or private.is_admin(auth.uid())
  )
);

drop policy if exists "Conversation participants can read messages" on public.messages;
drop policy if exists "Conversation participants can send messages" on public.messages;
drop policy if exists "Message sender can soft delete own messages" on public.messages;
drop policy if exists "Participants can view messages" on public.messages;
drop policy if exists "Active participants can view messages" on public.messages;

create policy "Phase D participants can view messages"
on public.messages
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and (
    private.is_admin(auth.uid())
    or exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.deleted_at is null
        and auth.uid() in (c.buyer_id, c.seller_id)
    )
  )
);

drop policy if exists "Users can read own blocks" on public.blocks;
drop policy if exists "Users can create own blocks" on public.blocks;
drop policy if exists "Users can delete own blocks" on public.blocks;
drop policy if exists "Users manage their own blocks" on public.blocks;
drop policy if exists "Users can view own blocks" on public.blocks;

create policy "Phase D users can view own blocks"
on public.blocks
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and (
    blocker_id = auth.uid()
    or private.is_admin(auth.uid())
  )
);

drop policy if exists "Phase D admins can view storage cleanup jobs" on public.storage_cleanup_jobs;
drop policy if exists "Phase D admins can update storage cleanup jobs" on public.storage_cleanup_jobs;

create policy "Phase D admins can view storage cleanup jobs"
on public.storage_cleanup_jobs
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and private.is_admin(auth.uid())
);

create policy "Phase D admins can update storage cleanup jobs"
on public.storage_cleanup_jobs
for update
to authenticated
using (
  private.is_account_active(auth.uid())
  and private.is_admin(auth.uid())
)
with check (
  private.is_account_active(auth.uid())
  and private.is_admin(auth.uid())
);

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-images',
  'message-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

update storage.buckets
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('avatars', 'listings');

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname not like 'Phase D %'
      and (
        coalesce(qual, '') like '%avatars%'
        or coalesce(with_check, '') like '%avatars%'
        or coalesce(qual, '') like '%listings%'
        or coalesce(with_check, '') like '%listings%'
        or coalesce(qual, '') like '%message-images%'
        or coalesce(with_check, '') like '%message-images%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end $$;

drop policy if exists "Public reads avatar images" on storage.objects;
drop policy if exists "Public reads listing images" on storage.objects;
drop policy if exists "Users manage own avatar images" on storage.objects;
drop policy if exists "Listing owners manage listing images" on storage.objects;
drop policy if exists "Conversation participants read message images" on storage.objects;
drop policy if exists "Conversation participants upload message images" on storage.objects;
drop policy if exists "Message sender can delete own message images" on storage.objects;
drop policy if exists "Phase D owner can manage avatar images" on storage.objects;
drop policy if exists "Phase D listing owners can manage listing images" on storage.objects;
drop policy if exists "Phase D participants can read message images" on storage.objects;
drop policy if exists "Phase D participants can upload message images" on storage.objects;
drop policy if exists "Phase D uploader can update message images" on storage.objects;
drop policy if exists "Phase D uploader can delete message images" on storage.objects;

create policy "Phase D owner can manage avatar images"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.is_account_active(auth.uid())
  and (
    storage.allow_any_operation(array[
      'object.get_authenticated',
      'object.get_authenticated_info',
      'object.upload',
      'object.update',
      'object.delete'
    ])
  )
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and private.is_account_active(auth.uid())
);

create policy "Phase D listing owners can manage listing images"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'listings'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.is_account_active(auth.uid())
  and (
    array_length(storage.foldername(name), 1) >= 2
    and exists (
      select 1
      from public.listings l
      where l.id = private.uuid_from_text((storage.foldername(name))[2])
        and l.seller_id = auth.uid()
        and l.deleted_at is null
    )
  )
  and (
    storage.allow_any_operation(array[
      'object.get_authenticated',
      'object.get_authenticated_info',
      'object.upload',
      'object.update',
      'object.delete'
    ])
  )
)
with check (
  bucket_id = 'listings'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) >= 2
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and private.is_account_active(auth.uid())
  and exists (
    select 1
    from public.listings l
    where l.id = private.uuid_from_text((storage.foldername(name))[2])
      and l.seller_id = auth.uid()
      and l.deleted_at is null
  )
);

create policy "Phase D participants can read message images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-images'
  and private.can_access_message_attachment(bucket_id, name, auth.uid())
  and storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info',
    'object.sign'
  ])
);

create policy "Phase D participants can upload message images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-images'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = auth.uid()::text
  and name ~ (
    '^' || private.uuid_from_text((storage.foldername(name))[1])::text || '/' ||
    auth.uid()::text || '/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
  )
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
  and not private.is_blocked_between(
    auth.uid(),
    private.other_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
  )
);

create policy "Phase D uploader can update message images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'message-images'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = auth.uid()::text
  and name ~ (
    '^' || private.uuid_from_text((storage.foldername(name))[1])::text || '/' ||
    auth.uid()::text || '/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
  )
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
)
with check (
  bucket_id = 'message-images'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = auth.uid()::text
  and name ~ (
    '^' || private.uuid_from_text((storage.foldername(name))[1])::text || '/' ||
    auth.uid()::text || '/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
  )
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
);

create policy "Phase D uploader can delete message images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-images'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = auth.uid()::text
  and name ~ (
    '^' || private.uuid_from_text((storage.foldername(name))[1])::text || '/' ||
    auth.uid()::text || '/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
  )
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
);

-- ---------------------------------------------------------------------------
-- Realtime publication for participant-filtered tables
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';
