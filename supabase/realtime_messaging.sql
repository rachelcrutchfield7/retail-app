-- ReTail Sprint 4 persistent realtime messaging hardening
-- Run after supabase/schema.sql and supabase/policies.sql.

create or replace function is_blocked_between(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from blocks
    where (blocker_id = first_user_id and blocked_id = second_user_id)
       or (blocker_id = second_user_id and blocked_id = first_user_id)
  );
$$;

create or replace function prevent_conversation_identity_update()
returns trigger
language plpgsql
as $$
begin
  if new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.listing_id is distinct from old.listing_id then
    raise exception 'Conversation participants and listing cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_conversation_identity_update on conversations;
create trigger prevent_conversation_identity_update
  before update on conversations
  for each row execute function prevent_conversation_identity_update();

create index if not exists idx_conversations_buyer_recent
  on conversations(buyer_id, last_message_at desc);

create index if not exists idx_conversations_seller_recent
  on conversations(seller_id, last_message_at desc);

create index if not exists idx_messages_unread_by_conversation
  on messages(conversation_id, is_read, created_at desc);

drop policy if exists "Conversation participants can read conversations" on conversations;
drop policy if exists "Buyers create conversations for themselves" on conversations;
drop policy if exists "Conversation participants can update conversations" on conversations;
drop policy if exists "Conversation participants can read messages" on messages;
drop policy if exists "Conversation participants can send messages" on messages;
drop policy if exists "Conversation participants can mark messages read" on messages;
drop policy if exists "Message sender can soft delete own messages" on messages;
drop policy if exists "Conversation participants read listing context" on listings;
drop policy if exists "Conversation participants read listing images" on listing_images;

create policy "Conversation participants can read conversations"
  on conversations for select
  using (
    deleted_at is null
    and (auth.uid() = buyer_id or auth.uid() = seller_id)
  );

create policy "Buyers create conversations for themselves"
  on conversations for insert
  with check (
    auth.uid() = buyer_id
    and buyer_id <> seller_id
    and is_account_active(buyer_id)
    and is_account_active(seller_id)
    and not is_blocked_between(buyer_id, seller_id)
    and exists (
      select 1
      from listings
      where listings.id = conversations.listing_id
        and listings.seller_id = conversations.seller_id
        and listings.status = 'active'
        and listings.deleted_at is null
    )
  );

create policy "Conversation participants can update conversations"
  on conversations for update
  using (
    deleted_at is null
    and (auth.uid() = buyer_id or auth.uid() = seller_id)
    and is_account_active(auth.uid())
  )
  with check (
    deleted_at is null
    and (auth.uid() = buyer_id or auth.uid() = seller_id)
    and is_account_active(auth.uid())
  );

create policy "Conversation participants can read messages"
  on messages for select
  using (
    exists (
      select 1
      from conversations
      where conversations.id = messages.conversation_id
        and conversations.deleted_at is null
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Conversation participants can send messages"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and is_account_active(sender_id)
    and (
      (message_type = 'text' and body is not null and char_length(trim(body)) between 1 and 2000)
      or (message_type = 'system' and body is not null and char_length(trim(body)) between 1 and 2000)
      or (message_type = 'image' and image_url is not null)
    )
    and exists (
      select 1
      from conversations
      where conversations.id = messages.conversation_id
        and conversations.deleted_at is null
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
        and not is_blocked_between(conversations.buyer_id, conversations.seller_id)
    )
  );

create policy "Conversation participants can mark messages read"
  on messages for update
  using (
    sender_id <> auth.uid()
    and exists (
      select 1
      from conversations
      where conversations.id = messages.conversation_id
        and conversations.deleted_at is null
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1
      from conversations
      where conversations.id = messages.conversation_id
        and conversations.deleted_at is null
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Message sender can soft delete own messages"
  on messages for update
  using (
    sender_id = auth.uid()
    and is_account_active(auth.uid())
  )
  with check (
    sender_id = auth.uid()
    and is_account_active(auth.uid())
  );

create policy "Conversation participants read listing context"
  on listings for select
  using (
    exists (
      select 1
      from conversations
      where conversations.listing_id = listings.id
        and conversations.deleted_at is null
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

create policy "Conversation participants read listing images"
  on listing_images for select
  using (
    exists (
      select 1
      from conversations
      where conversations.listing_id = listing_images.listing_id
        and conversations.deleted_at is null
        and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
    )
  );

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
