-- Notify an ISO requester when another user offers an eligible ReTail listing.
-- Notification creation stays server-authoritative and respects the user's
-- existing notification preferences through private.create_notification_for_event().

create or replace function private.notify_iso_response_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_row public.iso_posts%rowtype;
begin
  select *
  into post_row
  from public.iso_posts p
  where p.id = new.iso_post_id
    and p.deleted_at is null;

  if not found then
    return new;
  end if;

  -- Defensive guard even though respond_to_iso_post already blocks self-response.
  if post_row.poster_id = new.responder_id then
    return new;
  end if;

  perform private.create_notification_for_event(
    post_row.poster_id,
    'system'::public.notification_type,
    'Someone may have what you need',
    'A ReTail seller responded to your ISO request "' ||
      left(post_row.title, 180) ||
      '". Tap to review the offered item.',
    '/iso/' || post_row.id::text,
    jsonb_build_object(
      'isoResponse', true,
      'isoPostId', post_row.id,
      'listingId', new.listing_id
    ),
    'iso-response:' || new.id::text
  );

  return new;
end;
$$;

revoke all on function private.notify_iso_response_after_insert()
from public, anon, authenticated;

drop trigger if exists iso_response_notification_after_insert
on public.iso_responses;

create trigger iso_response_notification_after_insert
after insert on public.iso_responses
for each row
execute function private.notify_iso_response_after_insert();
