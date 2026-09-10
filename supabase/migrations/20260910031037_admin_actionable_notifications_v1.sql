create or replace function private.notify_admins_of_pending_rescue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_row record;
begin
  if new.verification_status <> 'pending'
    or (tg_op = 'UPDATE' and old.verification_status = 'pending') then
    return new;
  end if;

  for admin_row in
    select p.id
    from public.profiles p
    where p.is_admin = true
      and p.is_banned = false
      and p.deleted_at is null
  loop
    perform private.create_notification_for_event(
      admin_row.id,
      'system'::public.notification_type,
      'Rescue application needs review',
      'A rescue organization submitted an application for admin review.',
      'admin',
      jsonb_build_object('route', 'admin', 'rescueId', new.id, 'adminTab', 'rescues'),
      'admin:rescue-pending:' || new.id::text || ':' || extract(epoch from new.updated_at)::bigint::text
    );
  end loop;

  return new;
exception
  when others then
    raise warning 'ReTail admin rescue notification failed for rescue %', new.id;
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
  admin_row record;
begin
  for admin_row in
    select p.id
    from public.profiles p
    where p.is_admin = true
      and p.is_banned = false
      and p.deleted_at is null
  loop
    perform private.create_notification_for_event(
      admin_row.id,
      'system'::public.notification_type,
      'New report needs review',
      'A user or listing report is waiting in the admin moderation queue.',
      'admin',
      jsonb_build_object('route', 'admin', 'reportId', new.id, 'adminTab', 'reports'),
      'admin:report:' || new.id::text
    );
  end loop;

  return new;
exception
  when others then
    raise warning 'ReTail admin report notification failed for report %', new.id;
    return new;
end;
$$;

revoke all on function private.notify_admins_of_pending_rescue() from public, anon, authenticated;
revoke all on function private.notify_admins_of_new_report() from public, anon, authenticated;

drop trigger if exists notify_admins_of_pending_rescue on public.rescue_profiles;
create trigger notify_admins_of_pending_rescue
after insert or update of verification_status on public.rescue_profiles
for each row execute function private.notify_admins_of_pending_rescue();

drop trigger if exists notify_admins_of_new_report on public.reports;
create trigger notify_admins_of_new_report
after insert on public.reports
for each row execute function private.notify_admins_of_new_report();
