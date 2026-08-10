-- ReTail beta bug fix: owner listings retrieval and admin report queue access.
-- These RPCs preserve RLS boundaries by deriving authority from auth.uid().

create or replace function public.get_my_listings()
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  return query
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', p.city,
      'state', p.state,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc, li.created_at asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    null::text as distance_band
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  where l.seller_id = caller_id
    and l.deleted_at is null
  order by l.created_at desc;
end;
$$;

revoke all on function public.get_my_listings() from public, anon, authenticated;
grant execute on function public.get_my_listings() to authenticated;

create or replace function public.get_admin_report_queue(requested_view text default 'active')
returns setof public.reports
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_view text := coalesce(nullif(btrim(requested_view), ''), 'active');
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if safe_view not in ('active', 'archived') then
    raise exception 'RETAIL_REPORT_VIEW_INVALID' using errcode = '22023';
  end if;

  return query
  select r.*
  from public.reports r
  where r.report_type in ('listing'::public.report_type, 'message'::public.report_type, 'user'::public.report_type)
    and (
      (safe_view = 'archived' and r.status in ('resolved'::public.report_status, 'dismissed'::public.report_status))
      or (safe_view = 'active' and r.status in ('open'::public.report_status, 'reviewing'::public.report_status))
    )
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_admin_report_queue(text) from public, anon, authenticated;
grant execute on function public.get_admin_report_queue(text) to authenticated;

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

  perform set_config('retail.phase_e_trusted_report_write', 'true', true);

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

  perform set_config('retail.phase_e_trusted_report_write', 'false', true);

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
      'reported_user_id', target_user_id,
      'listing_title', target_listing_title,
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

revoke all on function public.admin_moderate_report(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_moderate_report(uuid, text, text, text, text)
  to authenticated;
