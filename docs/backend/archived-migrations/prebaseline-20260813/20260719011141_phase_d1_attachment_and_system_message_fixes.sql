-- ReTail Security Remediation Phase D.1
-- Message attachment validation and system message lockdown.

-- ---------------------------------------------------------------------------
-- Canonical message attachment path validation
-- ---------------------------------------------------------------------------

create or replace function private.is_valid_message_attachment_path(
  target_path text,
  expected_conversation_id uuid,
  expected_uploader_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  file_name text;
begin
  if target_path is null
    or expected_conversation_id is null
    or expected_uploader_id is null
  then
    return false;
  end if;

  path_parts := storage.foldername(target_path);
  file_name := storage.filename(target_path);

  if array_length(path_parts, 1) <> 2 then
    return false;
  end if;

  if path_parts[1] <> expected_conversation_id::text
    or path_parts[2] <> expected_uploader_id::text
  then
    return false;
  end if;

  return target_path ~ (
    '^' || expected_conversation_id::text || '/' ||
    expected_uploader_id::text || '/' ||
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|jpeg|png|webp)$'
  )
    and file_name !~ '[.](jpg|jpeg|png|webp)[.]';
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_message_attachment_path(text, uuid, uuid) from public;
revoke all on function private.is_valid_message_attachment_path(text, uuid, uuid) from anon;
revoke all on function private.is_valid_message_attachment_path(text, uuid, uuid) from authenticated;
grant execute on function private.is_valid_message_attachment_path(text, uuid, uuid) to authenticated;

create or replace function private.message_attachment_path_is_valid(
  target_conversation_id uuid,
  target_sender_id uuid,
  target_bucket text,
  target_path text,
  target_mime_type text,
  target_size_bytes integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  object_mime_type text;
  object_size_bytes bigint;
  bucket_limit_bytes bigint;
begin
  if target_bucket <> 'message-images'
    or target_conversation_id is null
    or target_sender_id is null
    or target_path is null
    or target_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or target_size_bytes is null
    or target_size_bytes <= 0
  then
    return false;
  end if;

  if not private.is_valid_message_attachment_path(target_path, target_conversation_id, target_sender_id) then
    return false;
  end if;

  select
    coalesce(
      nullif(o.metadata ->> 'mimetype', ''),
      nullif(o.metadata ->> 'mimeType', ''),
      nullif(o.metadata ->> 'contentType', '')
    ),
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      else null
    end,
    coalesce(b.file_size_limit, 10485760)
  into object_mime_type, object_size_bytes, bucket_limit_bytes
  from storage.objects o
  join storage.buckets b on b.id = o.bucket_id
  where o.bucket_id = target_bucket
    and o.name = target_path
    and o.owner_id = target_sender_id::text;

  if not found then
    return false;
  end if;

  return object_mime_type = target_mime_type
    and object_size_bytes = target_size_bytes::bigint
    and object_size_bytes > 0
    and object_size_bytes <= bucket_limit_bytes
    and target_size_bytes::bigint <= bucket_limit_bytes
    and private.is_conversation_participant(target_conversation_id, target_sender_id);
exception
  when others then
    return false;
end;
$$;

revoke all on function private.message_attachment_path_is_valid(uuid, uuid, text, text, text, integer) from public;
revoke all on function private.message_attachment_path_is_valid(uuid, uuid, text, text, text, integer) from anon;
revoke all on function private.message_attachment_path_is_valid(uuid, uuid, text, text, text, integer) from authenticated;

create or replace function private.can_access_message_attachment(target_bucket text, target_path text, target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  conversation_uuid uuid;
  uploader_uuid uuid;
begin
  if target_bucket <> 'message-images' or target_path is null or target_user_id is null then
    return false;
  end if;

  path_parts := storage.foldername(target_path);

  if array_length(path_parts, 1) <> 2 then
    return false;
  end if;

  begin
    conversation_uuid := path_parts[1]::uuid;
    uploader_uuid := path_parts[2]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if not private.is_valid_message_attachment_path(target_path, conversation_uuid, uploader_uuid) then
    return false;
  end if;

  if not private.is_account_active(target_user_id) then
    return false;
  end if;

  if not private.is_conversation_participant(conversation_uuid, target_user_id) then
    return false;
  end if;

  if not private.is_conversation_participant(conversation_uuid, uploader_uuid) then
    return false;
  end if;

  return exists (
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
-- System message lockdown
-- ---------------------------------------------------------------------------

create or replace function public.protect_message_phase_d_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_system_message boolean := coalesce(
    nullif(current_setting('retail.trusted_system_message', true), ''),
    'false'
  )::boolean;
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
    raise exception 'RETAIL_MESSAGE_BLOCKED';
  end if;

  if new.message_type = 'system' then
    if not trusted_system_message then
      raise exception 'RETAIL_SYSTEM_MESSAGE_FORBIDDEN';
    end if;

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
      raise exception 'System messages cannot include image attachment metadata';
    end if;
  elsif new.message_type = 'text' then
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
      raise exception 'RETAIL_INVALID_MESSAGE_ATTACHMENT';
    end if;
  else
    raise exception 'Unsupported message type';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_message_phase_d_fields() from public;
revoke all on function public.protect_message_phase_d_fields() from anon;
revoke all on function public.protect_message_phase_d_fields() from authenticated;

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

  if requested_message_type = 'system' then
    raise exception 'RETAIL_SYSTEM_MESSAGE_FORBIDDEN';
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
    raise exception 'RETAIL_MESSAGE_BLOCKED';
  end if;

  select count(*)
  into sent_count
  from public.messages m
  where m.sender_id = caller_id
    and m.created_at >= now() - interval '1 hour';

  if sent_count >= 100 then
    raise exception 'Message rate limit exceeded';
  end if;

  if requested_message_type = 'text' then
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
      raise exception 'RETAIL_INVALID_MESSAGE_ATTACHMENT';
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
) from authenticated;
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

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

drop policy if exists "Phase D participants can read message images" on storage.objects;
drop policy if exists "Phase D participants can upload message images" on storage.objects;
drop policy if exists "Phase D uploader can update message images" on storage.objects;
drop policy if exists "Phase D uploader can delete message images" on storage.objects;

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
  and private.is_valid_message_attachment_path(
    name,
    private.uuid_from_text((storage.foldername(name))[1]),
    auth.uid()
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
  and private.is_valid_message_attachment_path(
    name,
    private.uuid_from_text((storage.foldername(name))[1]),
    auth.uid()
  )
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
  and not private.is_blocked_between(
    auth.uid(),
    private.other_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
  )
)
with check (
  bucket_id = 'message-images'
  and private.is_valid_message_attachment_path(
    name,
    private.uuid_from_text((storage.foldername(name))[1]),
    auth.uid()
  )
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
  and not private.is_blocked_between(
    auth.uid(),
    private.other_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
  )
);

create policy "Phase D uploader can delete message images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-images'
  and private.is_valid_message_attachment_path(
    name,
    private.uuid_from_text((storage.foldername(name))[1]),
    auth.uid()
  )
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
);
