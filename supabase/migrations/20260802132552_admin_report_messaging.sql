-- Add report-specific admin conversations so moderation updates can appear in
-- the normal in-app Messages tab from the admin account.

alter table public.conversations
  add column if not exists report_id uuid references public.reports(id) on delete set null;

create index if not exists idx_conversations_report
  on public.conversations(report_id)
  where report_id is not null;

create unique index if not exists conversations_report_buyer_seller_unique
  on public.conversations(report_id, buyer_id, seller_id)
  where report_id is not null and deleted_at is null;

alter table public.conversations
  drop constraint if exists conversation_has_listing_or_rescue;

alter table public.conversations
  drop constraint if exists conversation_has_context;

alter table public.conversations
  add constraint conversation_has_context
  check (
    (listing_id is not null and rescue_id is null and report_id is null)
    or (listing_id is null and rescue_id is not null and report_id is null)
    or (listing_id is null and rescue_id is null and report_id is not null)
  ) not valid;

create or replace function private.create_admin_report_message(
  target_report_id uuid,
  admin_user_id uuid,
  recipient_user_id uuid,
  message_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_body text := left(nullif(btrim(coalesce(message_body, '')), ''), 2000);
  conversation_id uuid;
  message_id uuid;
begin
  if target_report_id is null or admin_user_id is null or recipient_user_id is null or safe_body is null then
    return null;
  end if;

  if admin_user_id = recipient_user_id then
    return null;
  end if;

  select id
  into conversation_id
  from public.conversations
  where report_id = target_report_id
    and buyer_id = recipient_user_id
    and seller_id = admin_user_id
    and deleted_at is null
  limit 1;

  if conversation_id is null then
    insert into public.conversations (
      listing_id,
      rescue_id,
      report_id,
      buyer_id,
      seller_id,
      last_message_at
    )
    values (
      null,
      null,
      target_report_id,
      recipient_user_id,
      admin_user_id,
      now()
    )
    on conflict do nothing
    returning id into conversation_id;
  end if;

  if conversation_id is null then
    select id
    into conversation_id
    from public.conversations
    where report_id = target_report_id
      and buyer_id = recipient_user_id
      and seller_id = admin_user_id
      and deleted_at is null
    limit 1;
  end if;

  if conversation_id is null then
    return null;
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    is_read
  )
  values (
    conversation_id,
    admin_user_id,
    'text'::public.message_type,
    safe_body,
    false
  )
  returning id into message_id;

  return message_id;
end;
$$;

drop function if exists public.admin_moderate_report(uuid, text, text, text);

create or replace function public.admin_moderate_report(
  target_report_id uuid,
  requested_status text,
  requested_action text default 'none',
  requested_admin_note text default null,
  requested_admin_message text default null
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  report_row public.reports;
  updated_report public.reports;
  target_listing_id uuid;
  target_listing_title text;
  target_user_id uuid;
  target_user_is_admin boolean := false;
  target_message_id uuid;
  reporter_title text;
  reporter_body text;
  reported_title text;
  reported_body text;
  admin_message text := nullif(btrim(coalesce(requested_admin_message, '')), '');
  reporter_message_body text;
  reported_message_body text;
  safe_status public.report_status;
  safe_action text := coalesce(nullif(btrim(requested_action), ''), 'none');
begin
  if caller_id is null or not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if requested_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'RETAIL_REPORT_STATUS_INVALID' using errcode = '22023';
  end if;

  if safe_action not in ('none', 'remove_listing', 'delete_user', 'remove_message') then
    raise exception 'RETAIL_REPORT_ACTION_INVALID' using errcode = '22023';
  end if;

  select *
  into report_row
  from public.reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'RETAIL_REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  target_listing_id := report_row.listing_id;
  target_user_id := report_row.reported_user_id;
  target_message_id := report_row.message_id;

  if report_row.report_type = 'listing' and target_listing_id is not null then
    select seller_id, title
    into target_user_id, target_listing_title
    from public.listings
    where id = target_listing_id;
  elsif report_row.report_type = 'message' and target_message_id is not null then
    select m.sender_id, c.listing_id
    into target_user_id, target_listing_id
    from public.messages m
    left join public.conversations c on c.id = m.conversation_id
    where m.id = target_message_id;

    if target_listing_id is not null then
      select title
      into target_listing_title
      from public.listings
      where id = target_listing_id;
    end if;
  elsif report_row.report_type = 'user' then
    target_user_id := report_row.reported_user_id;
  end if;

  if safe_action = 'remove_listing' then
    if target_listing_id is null then
      raise exception 'RETAIL_REPORT_LISTING_REQUIRED' using errcode = '22023';
    end if;

    update public.listings
    set
      status = 'removed'::public.listing_status,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
    where id = target_listing_id;

    safe_status := 'resolved'::public.report_status;
  elsif safe_action = 'delete_user' then
    if target_user_id is null then
      raise exception 'RETAIL_REPORT_USER_REQUIRED' using errcode = '22023';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_CANNOT_DELETE_SELF' using errcode = '42501';
    end if;

    select is_admin
    into target_user_is_admin
    from public.profiles
    where id = target_user_id;

    if coalesce(target_user_is_admin, false) then
      raise exception 'RETAIL_CANNOT_DELETE_ADMIN' using errcode = '42501';
    end if;

    update public.listings
    set
      status = 'removed'::public.listing_status,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
    where seller_id = target_user_id;

    update public.profiles
    set
      is_banned = true,
      deleted_at = coalesce(deleted_at, now()),
      display_name = 'Deleted user',
      username = ('deleted_' || substring(replace(target_user_id::text, '-', '') from 1 for 24))::public.citext,
      bio = null,
      avatar_url = null,
      city = null,
      state = null,
      zip_code = null,
      latitude = null,
      longitude = null,
      updated_at = now()
    where id = target_user_id;

    safe_status := 'resolved'::public.report_status;
  elsif safe_action = 'remove_message' then
    if target_message_id is null then
      raise exception 'RETAIL_REPORT_MESSAGE_REQUIRED' using errcode = '22023';
    end if;

    update public.messages
    set deleted_at = coalesce(deleted_at, now())
    where id = target_message_id;

    safe_status := 'resolved'::public.report_status;
  else
    safe_status := requested_status::public.report_status;
  end if;

  update public.reports
  set
    status = safe_status,
    assigned_admin_id = caller_id,
    admin_notes = nullif(btrim(coalesce(requested_admin_note, '')), ''),
    resolved_at = case
      when safe_status in ('resolved'::public.report_status, 'dismissed'::public.report_status) then now()
      when safe_status in ('open'::public.report_status, 'reviewing'::public.report_status) then null
      else resolved_at
    end,
    updated_at = now()
  where id = target_report_id
  returning * into updated_report;

  reporter_title := case
    when safe_status = 'dismissed'::public.report_status then 'Report dismissed'
    when safe_status = 'reviewing'::public.report_status then 'Report under review'
    when safe_status = 'open'::public.report_status then 'Report moved to active review'
    when safe_action = 'remove_listing' then 'Reported listing removed'
    when safe_action = 'delete_user' then 'Reported account removed'
    when safe_action = 'remove_message' then 'Reported message removed'
    else 'Report resolved'
  end;

  reporter_body := case
    when safe_status = 'dismissed'::public.report_status then 'Thanks for helping keep ReTail safe. We reviewed your report and dismissed it.'
    when safe_status = 'reviewing'::public.report_status then 'Thanks for helping keep ReTail safe. Your report is being reviewed by a ReTail admin.'
    when safe_status = 'open'::public.report_status then 'Your report was moved back to active review by a ReTail admin.'
    when safe_action = 'remove_listing' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the listing.'
    when safe_action = 'delete_user' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the reported account.'
    when safe_action = 'remove_message' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the message.'
    else 'Thanks for helping keep ReTail safe. We reviewed your report and marked it resolved.'
  end;

  reporter_message_body := coalesce(admin_message, reporter_body);

  if report_row.reporter_id is not null then
    perform private.create_admin_report_message(
      target_report_id,
      caller_id,
      report_row.reporter_id,
      reporter_message_body
    );
  end if;

  if safe_status in ('resolved'::public.report_status, 'dismissed'::public.report_status) then
    if report_row.reporter_id is not null then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        report_row.reporter_id,
        'system'::public.notification_type,
        reporter_title,
        reporter_body,
        jsonb_build_object(
          'reportId', target_report_id,
          'reportStatus', safe_status,
          'moderationAction', safe_action,
          'listingId', target_listing_id,
          'messageId', target_message_id
        )
      );
    end if;

    if target_user_id is not null and target_user_id is distinct from report_row.reporter_id then
      reported_title := case
        when safe_status = 'dismissed'::public.report_status then 'Report reviewed'
        when safe_action = 'remove_listing' then 'Listing removed by ReTail'
        when safe_action = 'delete_user' then 'Account removed by ReTail'
        when safe_action = 'remove_message' then 'Message removed by ReTail'
        else 'Report reviewed'
      end;

      reported_body := case
        when safe_status = 'dismissed'::public.report_status then 'A report involving your account was reviewed and dismissed. No action was taken.'
        when safe_action = 'remove_listing' then 'A report involving one of your listings was reviewed, and the listing was removed.'
        when safe_action = 'delete_user' then 'A report involving your account was reviewed, and your account was removed from ReTail.'
        when safe_action = 'remove_message' then 'A report involving one of your messages was reviewed, and the message was removed.'
        else 'A report involving your account was reviewed. No listing or account removal was taken.'
      end;

      reported_message_body := coalesce(admin_message, reported_body);

      perform private.create_admin_report_message(
        target_report_id,
        caller_id,
        target_user_id,
        reported_message_body
      );

      insert into public.notifications (user_id, type, title, body, data)
      values (
        target_user_id,
        'system'::public.notification_type,
        reported_title,
        reported_body,
        jsonb_build_object(
          'reportId', target_report_id,
          'reportStatus', safe_status,
          'moderationAction', safe_action,
          'listingId', target_listing_id,
          'messageId', target_message_id
        )
      );
    end if;
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action'::public.audit_event_type,
    'reports',
    target_report_id,
    jsonb_build_object(
      'status', safe_status,
      'action', safe_action,
      'listing_id', target_listing_id,
      'message_id', target_message_id,
      'reported_user_id', target_user_id,
      'listing_title', target_listing_title,
      'admin_message_sent', reporter_message_body is not null or reported_message_body is not null
    )
  );

  return updated_report;
end;
$$;

revoke all on function public.admin_moderate_report(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_moderate_report(uuid, text, text, text, text) to authenticated;
