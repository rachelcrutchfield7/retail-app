-- Restore the notification RPC expected by app-created notifications.

create or replace function create_user_notification(
  target_user_id uuid,
  notification_type_value notification_type,
  notification_title text default null,
  notification_body text default null,
  notification_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  active_user_id uuid := auth.uid();
  inserted_notification_id uuid;
  safe_title text;
  safe_body text;
  conversation_id uuid := public.uuid_or_null(notification_data ->> 'conversationId');
  message_id uuid := public.uuid_or_null(notification_data ->> 'messageId');
  listing_id uuid := public.uuid_or_null(notification_data ->> 'listingId');
  review_id uuid := public.uuid_or_null(notification_data ->> 'reviewId');
  transaction_id uuid := public.uuid_or_null(notification_data ->> 'transactionId');
begin
  if active_user_id is null or not private.is_account_active(active_user_id) then
    raise exception 'Not authenticated';
  end if;

  if notification_type_value = 'message' then
    if not exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_id
        and c.id = conversation_id
        and m.sender_id = active_user_id
        and target_user_id in (c.buyer_id, c.seller_id)
        and target_user_id <> active_user_id
        and not private.is_blocked_between(c.buyer_id, c.seller_id)
    ) then
      raise exception 'Invalid message notification';
    end if;
    safe_title := 'New message';
    safe_body := 'You received a message.';
  elsif notification_type_value = 'favorite' then
    if not exists (
      select 1
      from public.favorites f
      join public.listings l on l.id = f.listing_id
      where f.user_id = active_user_id
        and f.listing_id = listing_id
        and l.seller_id = target_user_id
        and target_user_id <> active_user_id
        and not private.is_blocked_between(active_user_id, target_user_id)
    ) then
      raise exception 'Invalid favorite notification';
    end if;
    safe_title := 'Listing favorited';
    safe_body := 'Someone saved your listing.';
  elsif notification_type_value = 'review' then
    if not exists (
      select 1
      from public.reviews r
      where r.id = review_id
        and r.reviewer_id = active_user_id
        and r.reviewee_id = target_user_id
        and r.deleted_at is null
    ) then
      raise exception 'Invalid review notification';
    end if;
    safe_title := 'New review';
    safe_body := 'You received a review.';
  elsif notification_type_value = 'transaction_completed' then
    if not exists (
      select 1
      from public.transactions t
      where t.id = transaction_id
        and t.status = 'completed'
        and active_user_id = t.seller_id
        and target_user_id = t.buyer_id
    ) then
      raise exception 'Invalid transaction notification';
    end if;
    safe_title := 'Transaction completed';
    safe_body := 'A listing was marked complete. You can leave a review.';
  elsif notification_type_value in ('listing_sold', 'listing_donated') then
    if target_user_id <> active_user_id
      or not exists (
        select 1
        from public.listings l
        where l.id = listing_id
          and l.seller_id = active_user_id
          and l.status in ('sold', 'donated')
      ) then
      raise exception 'Invalid listing status notification';
    end if;
    safe_title := coalesce(nullif(btrim(notification_title), ''), 'Listing updated');
    safe_body := 'Your listing status was updated.';
  elsif notification_type_value = 'system' then
    if not private.is_admin(active_user_id) then
      raise exception 'Only admins can create system notifications';
    end if;
    safe_title := coalesce(nullif(btrim(notification_title), ''), 'ReTail update');
    safe_body := coalesce(nullif(btrim(notification_body), ''), 'You have a ReTail update.');
  else
    raise exception 'Unsupported client notification type';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (target_user_id, notification_type_value, safe_title, safe_body, coalesce(notification_data, '{}'::jsonb))
  returning id into inserted_notification_id;

  return inserted_notification_id;
end;
$$;

revoke execute on function create_user_notification(uuid, notification_type, text, text, jsonb) from public, anon;
grant execute on function create_user_notification(uuid, notification_type, text, text, jsonb) to authenticated;
