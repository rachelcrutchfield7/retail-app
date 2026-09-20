create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_count integer := 0;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform set_config(
    'retail.phase_e_trusted_notification_write',
    'true',
    true
  );

  update public.notifications n
  set is_read = true,
      read_at = coalesce(n.read_at, now())
  where n.user_id = caller_id
    and n.is_read = false
    and n.deleted_at is null
    and (n.data ->> 'adminAction') is distinct from 'true';

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

revoke all on function public.mark_all_notifications_read()
  from public, anon;

grant execute on function public.mark_all_notifications_read()
  to authenticated, service_role;
