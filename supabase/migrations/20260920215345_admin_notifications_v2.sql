-- ReTail Admin Notifications v2
--
-- Creates durable, server-authoritative operational notifications for admins.
-- These alerts are separate from a user's ordinary message/favorite/system
-- notification preferences and are intended for the Admin workspace.

create or replace function private.create_admin_action_notification(
  target_admin_id uuid,
  requested_title text,
  requested_body text,
  requested_admin_tab text,
  requested_data jsonb default '{}'::jsonb,
  requested_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_title text := nullif(btrim(coalesce(requested_title, '')), '');
  safe_body text := nullif(btrim(coalesce(requested_body, '')), '');
  safe_admin_tab text := nullif(btrim(coalesce(requested_admin_tab, '')), '');
  safe_dedupe_key text := nullif(btrim(coalesce(requested_dedupe_key, '')), '');
  safe_data jsonb := coalesce(requested_data, '{}'::jsonb);
  inserted_id uuid;
begin
  if target_admin_id is null
     or not private.is_account_active(target_admin_id)
     or not private.is_admin(target_admin_id) then
    return null;
  end if;

  if safe_title is null or char_length(safe_title) > 120 then
    raise exception 'RETAIL_ADMIN_NOTIFICATION_INVALID'
      using errcode = '22023';
  end if;

  if safe_body is null or char_length(safe_body) > 500 then
    raise exception 'RETAIL_ADMIN_NOTIFICATION_INVALID'
      using errcode = '22023';
  end if;

  if safe_admin_tab not in ('rescues', 'reports', 'support') then
    raise exception 'RETAIL_ADMIN_NOTIFICATION_INVALID_TAB'
      using errcode = '22023';
  end if;

  if safe_dedupe_key is not null and char_length(safe_dedupe_key) > 240 then
    raise exception 'RETAIL_ADMIN_NOTIFICATION_INVALID'
      using errcode = '22023';
  end if;

  if safe_dedupe_key is not null then
    select n.id
      into inserted_id
    from public.notifications n
    where n.user_id = target_admin_id
      and n.dedupe_key = safe_dedupe_key
    limit 1;

    if inserted_id is not null then
      return inserted_id;
    end if;
  end if;

  safe_data := jsonb_strip_nulls(
    safe_data ||
    jsonb_build_object(
      'adminAction', true,
      'adminTab', safe_admin_tab,
      'route', 'admin'
    )
  );

  perform set_config(
    'retail.phase_e_trusted_notification_write',
    'true',
    true
  );

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    dedupe_key,
    is_read,
    created_at
  )
  values (
    target_admin_id,
    'system'::public.notification_type,
    safe_title,
    safe_body,
    safe_data,
    safe_dedupe_key,
    false,
    now()
  )
  returning id into inserted_id;

  perform set_config(
    'retail.phase_e_trusted_notification_write',
    'false',
    true
  );

  return inserted_id;

exception
  when unique_violation then
    perform set_config(
      'retail.phase_e_trusted_notification_write',
      'false',
      true
    );

    select n.id
      into inserted_id
    from public.notifications n
    where n.user_id = target_admin_id
      and n.dedupe_key = safe_dedupe_key
    limit 1;

    return inserted_id;

  when others then
    perform set_config(
      'retail.phase_e_trusted_notification_write',
      'false',
      true
    );
    raise;
end;
$$;


create or replace function private.notify_admins_of_pending_rescue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid;
begin
  if new.deleted_at is not null
     or new.verification_status is distinct from 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.verification_status is not distinct from 'pending' then
    return new;
  end if;

  for admin_id in
    select p.id
    from public.profiles p
    where p.is_admin = true
      and p.deleted_at is null
  loop
    perform private.create_admin_action_notification(
      admin_id,
      'Rescue verification request',
      'A rescue organization submitted an application for admin review.',
      'rescues',
      jsonb_build_object(
        'rescueId', new.id,
        'adminPriority', 'normal'
      ),
      'admin:rescue-pending:' || new.id::text
    );
  end loop;

  return new;
exception
  when others then
    raise warning
      'ReTail admin rescue notification failed for rescue %: %',
      new.id,
      sqlerrm;
    return new;
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
    from public.profiles p
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


create or replace function private.notify_admins_of_new_support_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  for admin_id in
    select p.id
    from public.profiles p
    where p.is_admin = true
      and p.deleted_at is null
  loop
    perform private.create_admin_action_notification(
      admin_id,
      'New support case',
      'A new transaction support case is waiting for admin review.',
      'support',
      jsonb_build_object(
        'supportCaseId', new.id,
        'transactionId', new.transaction_id,
        'listingId', new.listing_id,
        'issueCategory', new.issue_category::text,
        'requesterRole', new.requester_role::text,
        'adminPriority', 'high'
      ),
      'admin:support:' || new.id::text
    );
  end loop;

  return new;
exception
  when others then
    raise warning
      'ReTail admin support notification failed for support case %: %',
      new.id,
      sqlerrm;
    return new;
end;
$$;


revoke all on function private.create_admin_action_notification(
  uuid, text, text, text, jsonb, text
) from public, anon, authenticated;

revoke all on function private.notify_admins_of_pending_rescue()
from public, anon, authenticated;

revoke all on function private.notify_admins_of_new_report()
from public, anon, authenticated;

revoke all on function private.notify_admins_of_new_support_case()
from public, anon, authenticated;


drop trigger if exists notify_admins_of_pending_rescue
on public.rescue_profiles;

create trigger notify_admins_of_pending_rescue
after insert or update of verification_status
on public.rescue_profiles
for each row
execute function private.notify_admins_of_pending_rescue();


drop trigger if exists notify_admins_of_new_report
on public.reports;

create trigger notify_admins_of_new_report
after insert
on public.reports
for each row
execute function private.notify_admins_of_new_report();


drop trigger if exists notify_admins_of_new_support_case
on public.support_cases;

create trigger notify_admins_of_new_support_case
after insert
on public.support_cases
for each row
execute function private.notify_admins_of_new_support_case();


create or replace function public.get_admin_action_notifications(
  requested_limit integer default 100
)
returns setof public.notifications
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_limit integer := greatest(1, least(coalesce(requested_limit, 100), 200));
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  return query
  select n.*
  from public.notifications n
  where n.user_id = caller_id
    and n.deleted_at is null
    and n.data @> '{"adminAction": true}'::jsonb
  order by n.created_at desc
  limit safe_limit;
end;
$$;


create or replace function public.mark_all_admin_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  updated_count integer := 0;
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  perform set_config(
    'retail.phase_e_trusted_notification_write',
    'true',
    true
  );

  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.user_id = caller_id
    and n.deleted_at is null
    and n.is_read = false
    and n.data @> '{"adminAction": true}'::jsonb;

  get diagnostics updated_count = row_count;

  perform set_config(
    'retail.phase_e_trusted_notification_write',
    'false',
    true
  );

  return updated_count;

exception
  when others then
    perform set_config(
      'retail.phase_e_trusted_notification_write',
      'false',
      true
    );
    raise;
end;
$$;


revoke all on function public.get_admin_action_notifications(integer)
from public, anon;

revoke all on function public.mark_all_admin_notifications_read()
from public, anon;

grant execute on function public.get_admin_action_notifications(integer)
to authenticated, service_role;

grant execute on function public.mark_all_admin_notifications_read()
to authenticated, service_role;


comment on function public.get_admin_action_notifications(integer)
is 'Returns operational admin notifications belonging to the authenticated admin.';

comment on function public.mark_all_admin_notifications_read()
is 'Marks only operational admin notifications read for the authenticated admin.';
