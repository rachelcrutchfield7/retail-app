-- Restore message sending after Phase D policy hardening.

drop policy if exists "Phase D participants can send messages" on messages;
drop policy if exists "Conversation participants can send messages" on messages;

create policy "Phase D participants can send messages"
  on messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and private.is_account_active(auth.uid())
    and (
      (message_type = 'text' and body is not null and char_length(trim(body)) between 1 and 2000)
      or (message_type = 'system' and body is not null and char_length(trim(body)) between 1 and 2000)
      or (message_type = 'image' and image_url is not null)
    )
    and exists (
      select 1
      from conversations c
      where c.id = messages.conversation_id
        and c.deleted_at is null
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        and not private.is_blocked_between(c.buyer_id, c.seller_id)
    )
  );
