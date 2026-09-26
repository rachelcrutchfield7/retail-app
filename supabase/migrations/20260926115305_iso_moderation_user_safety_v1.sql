-- ReTail ISO Batch 2 - moderation, reporting, and user safety.
--
-- Extend the existing shared report architecture rather than introducing an
-- ISO-specific moderation system. ISO removal is soft and keeps report,
-- response, and notification history intact.

alter type public.report_type add value if not exists 'iso_post';
alter type public.audit_event_type add value if not exists 'iso_post_reported';

alter table public.reports
  add column iso_post_id uuid
  references public.iso_posts(id)
  on delete set null;

alter table public.reports
  drop constraint report_target_matches_type;

alter table public.reports
  add constraint report_target_matches_type check (
    (
      report_type::text = 'listing'
      and listing_id is not null
      and reported_user_id is null
      and message_id is null
      and iso_post_id is null
    )
    or (
      report_type::text = 'user'
      and reported_user_id is not null
      and listing_id is null
      and message_id is null
      and iso_post_id is null
    )
    or (
      report_type::text = 'message'
      and message_id is not null
      and listing_id is null
      and iso_post_id is null
    )
    or (
      report_type::text = 'iso_post'
      and iso_post_id is not null
      and reported_user_id is not null
      and listing_id is null
      and message_id is null
    )
  ) not valid;

alter table public.reports
  validate constraint report_target_matches_type;

create index reports_iso_post_idx
  on public.reports(iso_post_id, created_at desc)
  where iso_post_id is not null;

create unique index reports_one_active_iso_post_report
  on public.reports(reporter_id, iso_post_id)
  where iso_post_id is not null
    and status in ('open'::public.report_status, 'reviewing'::public.report_status);


create or replace function public.protect_report_phase_e_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_report_write', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'INSERT' and not trusted_write then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if not trusted_write then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    if new.reporter_id is distinct from old.reporter_id
      or new.reported_user_id is distinct from old.reported_user_id
      or new.listing_id is distinct from old.listing_id
      or new.message_id is distinct from old.message_id
      or new.iso_post_id is distinct from old.iso_post_id
      or new.report_type is distinct from old.report_type
      or new.reason is distinct from old.reason
      or new.evidence is distinct from old.evidence
      or new.created_at is distinct from old.created_at
    then
      raise exception 'RETAIL_REPORT_IMMUTABLE'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


create or replace function public.has_existing_report(
  report_target_type public.report_type,
  report_target_id uuid
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
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.reports as r
    where r.reporter_id = caller_id
      and r.status in ('open'::public.report_status, 'reviewing'::public.report_status)
      and (
        (report_target_type::text = 'listing' and r.report_type::text = 'listing' and r.listing_id = report_target_id)
        or (report_target_type::text = 'user' and r.report_type::text = 'user' and r.reported_user_id = report_target_id and r.message_id is null)
        or (report_target_type::text = 'message' and r.report_type::text = 'message' and r.message_id = report_target_id)
        or (report_target_type::text = 'iso_post' and r.report_type::text = 'iso_post' and r.iso_post_id = report_target_id)
      )
  );
end;
$$;


create or replace function public.submit_report(
  report_target_type public.report_type,
  report_target_id uuid,
  report_reason_value public.report_reason,
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  safe_details text := nullif(pg_catalog.btrim(coalesce(report_details, '')), '');
  target_user_id uuid;
  inserted_report_id uuid;
  evidence_payload jsonb := '{}'::jsonb;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_REPORT_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if report_target_id is null then
    raise exception 'RETAIL_REPORT_TARGET_INVALID';
  end if;

  if safe_details is not null and pg_catalog.char_length(safe_details) > 2000 then
    raise exception 'RETAIL_REPORT_DETAILS_TOO_LONG';
  end if;

  if public.has_existing_report(report_target_type, report_target_id) then
    raise exception 'RETAIL_REPORT_ALREADY_SUBMITTED';
  end if;

  if report_target_type::text = 'listing' then
    select l.seller_id
    into target_user_id
    from public.listings as l
    where l.id = report_target_id
      and l.deleted_at is null
      and l.status in ('active'::public.listing_status, 'pending'::public.listing_status);

    if target_user_id is null then
      raise exception 'RETAIL_REPORT_TARGET_INVALID';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED' using errcode = '42501';
    end if;

    evidence_payload := jsonb_build_object(
      'targetType', 'listing',
      'listingId', report_target_id,
      'reportedUserId', target_user_id
    );

    perform set_config('retail.phase_e_trusted_report_write', 'true', true);

    insert into public.reports (
      reporter_id, report_type, reason, details, listing_id, evidence,
      status, created_at, updated_at
    ) values (
      caller_id, report_target_type, report_reason_value, safe_details,
      report_target_id, evidence_payload, 'open'::public.report_status, now(), now()
    ) returning id into inserted_report_id;

  elsif report_target_type::text = 'user' then
    if report_target_id = caller_id then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED' using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.profiles as p
      where p.id = report_target_id and p.deleted_at is null
    ) then
      raise exception 'RETAIL_REPORT_TARGET_INVALID';
    end if;

    evidence_payload := jsonb_build_object(
      'targetType', 'user',
      'reportedUserId', report_target_id
    );

    perform set_config('retail.phase_e_trusted_report_write', 'true', true);

    insert into public.reports (
      reporter_id, report_type, reason, details, reported_user_id, evidence,
      status, created_at, updated_at
    ) values (
      caller_id, report_target_type, report_reason_value, safe_details,
      report_target_id, evidence_payload, 'open'::public.report_status, now(), now()
    ) returning id into inserted_report_id;

  elsif report_target_type::text = 'message' then
    select m.sender_id
    into target_user_id
    from public.messages as m
    join public.conversations as c on c.id = m.conversation_id
    where m.id = report_target_id
      and m.deleted_at is null
      and c.deleted_at is null
      and caller_id in (c.buyer_id, c.seller_id);

    if target_user_id is null then
      raise exception 'RETAIL_REPORT_TARGET_INVALID';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED' using errcode = '42501';
    end if;

    select jsonb_build_object(
      'targetType', 'message',
      'messageId', m.id,
      'conversationId', m.conversation_id,
      'reportedUserId', m.sender_id,
      'messageType', m.message_type,
      'body', case when m.message_type = 'text'::public.message_type then m.body else null end,
      'hasAttachment', m.attachment_path is not null
    )
    into evidence_payload
    from public.messages as m
    where m.id = report_target_id;

    perform set_config('retail.phase_e_trusted_report_write', 'true', true);

    insert into public.reports (
      reporter_id, report_type, reason, details, reported_user_id, message_id,
      evidence, status, created_at, updated_at
    ) values (
      caller_id, report_target_type, report_reason_value, safe_details,
      target_user_id, report_target_id, coalesce(evidence_payload, '{}'::jsonb),
      'open'::public.report_status, now(), now()
    ) returning id into inserted_report_id;

  elsif report_target_type::text = 'iso_post' then
    select
      p.poster_id,
      jsonb_build_object(
        'targetType', 'iso_post',
        'isoPostId', p.id,
        'reportedUserId', p.poster_id,
        'title', p.title,
        'description', p.description,
        'categoryId', p.category_id,
        'status', p.status
      )
    into target_user_id, evidence_payload
    from public.iso_posts as p
    where p.id = report_target_id
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
      and private.is_account_active(p.poster_id)
      and not private.is_blocked_between(caller_id, p.poster_id);

    if target_user_id is null then
      raise exception 'RETAIL_REPORT_TARGET_INVALID';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_REPORT_PERMISSION_DENIED' using errcode = '42501';
    end if;

    perform set_config('retail.phase_e_trusted_report_write', 'true', true);

    insert into public.reports (
      reporter_id, report_type, reason, details, reported_user_id, iso_post_id,
      evidence, status, created_at, updated_at
    ) values (
      caller_id, report_target_type, report_reason_value, safe_details,
      target_user_id, report_target_id, evidence_payload,
      'open'::public.report_status, now(), now()
    ) returning id into inserted_report_id;
  else
    raise exception 'RETAIL_REPORT_TARGET_INVALID';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    case
      when report_target_type::text = 'listing' then 'listing_reported'::public.audit_event_type
      when report_target_type::text = 'user' then 'user_reported'::public.audit_event_type
      when report_target_type::text = 'message' then 'message_reported'::public.audit_event_type
      else ('iso_post_reported'::text)::public.audit_event_type
    end,
    'reports',
    inserted_report_id,
    jsonb_build_object('report_type', report_target_type::text)
  );

  perform set_config('retail.phase_e_trusted_report_write', 'false', true);
  return inserted_report_id;
exception
  when unique_violation then
    perform set_config('retail.phase_e_trusted_report_write', 'false', true);
    raise exception 'RETAIL_REPORT_ALREADY_SUBMITTED';
  when others then
    perform set_config('retail.phase_e_trusted_report_write', 'false', true);
    raise;
end;
$$;


create or replace function public.get_admin_report_queue(
  requested_view text default 'active'
)
returns setof public.reports
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_view text := coalesce(nullif(pg_catalog.btrim(requested_view), ''), 'active');
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if safe_view not in ('active', 'archived') then
    raise exception 'RETAIL_REPORT_VIEW_INVALID' using errcode = '22023';
  end if;

  return query
  select r.*
  from public.reports as r
  where (
      (safe_view = 'archived' and r.status in ('resolved'::public.report_status, 'dismissed'::public.report_status))
      or (safe_view = 'active' and r.status in ('open'::public.report_status, 'reviewing'::public.report_status))
    )
  order by r.created_at desc;
end;
$$;


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
  target_iso_post_id uuid;
  target_iso_post_title text;
  reporter_title text;
  reporter_body text;
  reported_title text;
  reported_body text;
  admin_message text := nullif(pg_catalog.btrim(coalesce(requested_admin_message, '')), '');
  reporter_message_body text;
  reported_message_body text;
  safe_status public.report_status;
  safe_action text := coalesce(nullif(pg_catalog.btrim(requested_action), ''), 'none');
begin
  if caller_id is null or not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if requested_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'RETAIL_REPORT_STATUS_INVALID' using errcode = '22023';
  end if;

  if safe_action not in ('none', 'remove_listing', 'delete_user', 'remove_message', 'remove_iso_post') then
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
  target_iso_post_id := report_row.iso_post_id;

  if report_row.report_type::text = 'listing' and target_listing_id is not null then
    select seller_id, title
    into target_user_id, target_listing_title
    from public.listings
    where id = target_listing_id;
  elsif report_row.report_type::text = 'message' and target_message_id is not null then
    select m.sender_id, c.listing_id
    into target_user_id, target_listing_id
    from public.messages as m
    left join public.conversations as c on c.id = m.conversation_id
    where m.id = target_message_id;

    if target_listing_id is not null then
      select title into target_listing_title
      from public.listings where id = target_listing_id;
    end if;
  elsif report_row.report_type::text = 'user' then
    target_user_id := report_row.reported_user_id;
  elsif report_row.report_type::text = 'iso_post' and target_iso_post_id is not null then
    select poster_id, title
    into target_user_id, target_iso_post_title
    from public.iso_posts
    where id = target_iso_post_id;
  end if;

  if safe_action = 'remove_listing' then
    if target_listing_id is null then
      raise exception 'RETAIL_REPORT_LISTING_REQUIRED' using errcode = '22023';
    end if;

    update public.listings
    set status = 'removed'::public.listing_status,
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where id = target_listing_id;
    safe_status := 'resolved'::public.report_status;

  elsif safe_action = 'remove_iso_post' then
    if report_row.report_type::text <> 'iso_post' or target_iso_post_id is null then
      raise exception 'RETAIL_REPORT_ISO_POST_REQUIRED' using errcode = '22023';
    end if;

    update public.iso_posts
    set status = 'closed',
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where id = target_iso_post_id;

    if not found then
      raise exception 'RETAIL_ISO_NOT_FOUND' using errcode = 'P0002';
    end if;

    safe_status := 'resolved'::public.report_status;

  elsif safe_action = 'delete_user' then
    if target_user_id is null then
      raise exception 'RETAIL_REPORT_USER_REQUIRED' using errcode = '22023';
    end if;

    if target_user_id = caller_id then
      raise exception 'RETAIL_CANNOT_DELETE_SELF' using errcode = '42501';
    end if;

    select is_admin into target_user_is_admin
    from public.profiles where id = target_user_id;

    if coalesce(target_user_is_admin, false) then
      raise exception 'RETAIL_CANNOT_DELETE_ADMIN' using errcode = '42501';
    end if;

    update public.listings
    set status = 'removed'::public.listing_status,
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where seller_id = target_user_id;

    update public.iso_posts
    set status = 'closed',
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where poster_id = target_user_id
      and deleted_at is null;

    update public.profiles
    set is_banned = true,
        deleted_at = coalesce(deleted_at, now()),
        display_name = 'Deleted user',
        username = ('deleted_' || pg_catalog.substr(pg_catalog.replace(target_user_id::text, '-', ''), 1, 24))::public.citext,
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

  perform set_config('retail.phase_e_trusted_report_write', 'true', true);

  update public.reports
  set status = safe_status,
      assigned_admin_id = caller_id,
      admin_notes = nullif(pg_catalog.btrim(coalesce(requested_admin_note, '')), ''),
      resolved_at = case
        when safe_status in ('resolved'::public.report_status, 'dismissed'::public.report_status) then now()
        when safe_status in ('open'::public.report_status, 'reviewing'::public.report_status) then null
        else resolved_at
      end,
      updated_at = now()
  where id = target_report_id
  returning * into updated_report;

  perform set_config('retail.phase_e_trusted_report_write', 'false', true);

  reporter_title := case
    when safe_status = 'dismissed'::public.report_status then 'Report dismissed'
    when safe_status = 'reviewing'::public.report_status then 'Report under review'
    when safe_status = 'open'::public.report_status then 'Report moved to active review'
    when safe_action = 'remove_listing' then 'Reported listing removed'
    when safe_action = 'remove_iso_post' then 'Reported ISO request removed'
    when safe_action = 'delete_user' then 'Reported account removed'
    when safe_action = 'remove_message' then 'Reported message removed'
    else 'Report resolved'
  end;

  reporter_body := case
    when safe_status = 'dismissed'::public.report_status then 'Thanks for helping keep ReTail safe. We reviewed your report and dismissed it.'
    when safe_status = 'reviewing'::public.report_status then 'Thanks for helping keep ReTail safe. Your report is being reviewed by a ReTail admin.'
    when safe_status = 'open'::public.report_status then 'Your report was moved back to active review by a ReTail admin.'
    when safe_action = 'remove_listing' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the listing.'
    when safe_action = 'remove_iso_post' then 'Thanks for helping keep ReTail safe. We reviewed your report and removed the ISO request.'
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
    perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

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
          'messageId', target_message_id,
          'isoPostId', target_iso_post_id
        )
      );
    end if;

    if target_user_id is not null and target_user_id is distinct from report_row.reporter_id then
      reported_title := case
        when safe_status = 'dismissed'::public.report_status then 'Report reviewed'
        when safe_action = 'remove_listing' then 'Listing removed by ReTail'
        when safe_action = 'remove_iso_post' then 'ISO request removed by ReTail'
        when safe_action = 'delete_user' then 'Account removed by ReTail'
        when safe_action = 'remove_message' then 'Message removed by ReTail'
        else 'Report reviewed'
      end;

      reported_body := case
        when safe_status = 'dismissed'::public.report_status then 'A report involving your account was reviewed and dismissed. No action was taken.'
        when safe_action = 'remove_listing' then 'A report involving one of your listings was reviewed, and the listing was removed.'
        when safe_action = 'remove_iso_post' then 'A report involving one of your ISO requests was reviewed, and the request was removed.'
        when safe_action = 'delete_user' then 'A report involving your account was reviewed, and your account was removed from ReTail.'
        when safe_action = 'remove_message' then 'A report involving one of your messages was reviewed, and the message was removed.'
        else 'A report involving your account was reviewed. No listing, request, or account removal was taken.'
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
          'messageId', target_message_id,
          'isoPostId', target_iso_post_id
        )
      );
    end if;

    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
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
      'iso_post_id', target_iso_post_id,
      'reported_user_id', target_user_id,
      'listing_title', target_listing_title,
      'iso_post_title', target_iso_post_title,
      'admin_message_sent', reporter_message_body is not null or reported_message_body is not null
    )
  );

  return updated_report;
exception
  when others then
    perform set_config('retail.phase_e_trusted_report_write', 'false', true);
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
    raise;
end;
$$;


create or replace function private.notify_admins_of_new_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid;
begin
  for admin_id in
    select p.id
    from public.profiles as p
    where p.is_admin = true
      and p.deleted_at is null
  loop
    perform private.create_admin_action_notification(
      admin_id,
      'New safety report',
      'A new report is waiting in the admin moderation queue.',
      'reports',
      jsonb_build_object(
        'reportId', new.id,
        'reportType', new.report_type::text,
        'reportReason', new.reason::text,
        'listingId', new.listing_id,
        'messageId', new.message_id,
        'isoPostId', new.iso_post_id,
        'reportedUserId', new.reported_user_id,
        'adminPriority', 'high'
      ),
      'admin:report:' || new.id::text
    );
  end loop;

  return new;
exception
  when others then
    raise warning
      'ReTail admin report notification failed for report %: %',
      new.id,
      sqlerrm;
    return new;
end;
$$;


-- Lock the offered listing before validating it. This uses the existing lock
-- order (ISO request, then listing) and does not touch checkout or reservation
-- state. PostgreSQL rechecks the listing predicates after a concurrent updater
-- releases the row lock.
create or replace function public.respond_to_iso_post_v2(
  target_iso_post_id uuid,
  target_listing_id uuid
)
returns public.iso_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  post_row public.iso_posts%rowtype;
  listing_row public.listings%rowtype;
  post_location private.marketplace_locations;
  listing_location private.marketplace_locations;
  response_row public.iso_responses;
begin
  perform private.expire_stale_iso_posts();

  perform private.check_rate_limit(
    'iso_response_create',
    'global',
    30,
    interval '1 hour'
  );

  select p.*
  into post_row
  from public.iso_posts as p
  where p.id = target_iso_post_id
    and p.deleted_at is null
    and p.status = 'active'
    and p.expires_at > now()
  for update;

  if not found then
    raise exception 'RETAIL_ISO_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if not private.is_account_active(post_row.poster_id) then
    raise exception 'RETAIL_ISO_REQUESTER_INACTIVE' using errcode = '42501';
  end if;

  if post_row.poster_id = caller_id then
    raise exception 'RETAIL_ISO_SELF_RESPONSE' using errcode = '42501';
  end if;

  if private.is_blocked_between(caller_id, post_row.poster_id) then
    raise exception 'RETAIL_ISO_BLOCKED' using errcode = '42501';
  end if;

  select l.*
  into listing_row
  from public.listings as l
  where l.id = target_listing_id
    and l.seller_id = caller_id
    and l.status = 'active'::public.listing_status
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_ISO_LISTING_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if listing_row.category_id <> post_row.category_id then
    raise exception 'RETAIL_ISO_CATEGORY_MISMATCH' using errcode = '22023';
  end if;

  select ml.*
  into post_location
  from private.marketplace_locations as ml
  where ml.id = post_row.marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level = 'postal_code'
    and ml.postal_code ~ '^[0-9]{5}$'
    and ml.location_point is not null;

  if not found then
    raise exception 'RETAIL_ISO_LOCATION_INVALID' using errcode = '22023';
  end if;

  select ml.*
  into listing_location
  from private.marketplace_locations as ml
  where ml.id = listing_row.marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level = 'postal_code'
    and ml.postal_code ~ '^[0-9]{5}$'
    and ml.location_point is not null;

  if not found then
    raise exception 'RETAIL_ISO_LISTING_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  if not public.st_dwithin(
    post_location.location_point,
    listing_location.location_point,
    post_row.radius_miles::double precision * 1609.344
  ) then
    raise exception 'RETAIL_ISO_LISTING_OUTSIDE_AREA' using errcode = '22023';
  end if;

  if post_row.desired_condition = 'new'
    and listing_row.condition::text <> 'new' then
    raise exception 'RETAIL_ISO_CONDITION_MISMATCH' using errcode = '22023';
  end if;

  if post_row.desired_condition = 'used'
    and listing_row.condition::text = 'new' then
    raise exception 'RETAIL_ISO_CONDITION_MISMATCH' using errcode = '22023';
  end if;

  insert into public.iso_responses (iso_post_id, responder_id, listing_id)
  values (post_row.id, caller_id, listing_row.id)
  on conflict (iso_post_id, responder_id, listing_id)
  do update set listing_id = excluded.listing_id
  returning * into response_row;

  return response_row;
end;
$$;


revoke execute on function public.has_existing_report(public.report_type, uuid)
from public, anon;
grant execute on function public.has_existing_report(public.report_type, uuid)
to authenticated, service_role;

revoke execute on function public.submit_report(public.report_type, uuid, public.report_reason, text)
from public, anon;
grant execute on function public.submit_report(public.report_type, uuid, public.report_reason, text)
to authenticated, service_role;

revoke execute on function public.get_admin_report_queue(text)
from public, anon;
grant execute on function public.get_admin_report_queue(text)
to authenticated, service_role;

revoke execute on function public.admin_moderate_report(uuid, text, text, text, text)
from public, anon;
grant execute on function public.admin_moderate_report(uuid, text, text, text, text)
to authenticated, service_role;

revoke all on function public.protect_report_phase_e_fields()
from public, anon, authenticated;
grant execute on function public.protect_report_phase_e_fields()
to service_role;

revoke all on function private.notify_admins_of_new_report()
from public, anon, authenticated;
grant execute on function private.notify_admins_of_new_report()
to service_role;

revoke execute on function public.respond_to_iso_post_v2(uuid, uuid)
from public, anon;
grant execute on function public.respond_to_iso_post_v2(uuid, uuid)
to authenticated, service_role;
