create or replace function private.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_secret text;
  function_url text := 'https://ycwgsdigvpmprqreoqiz.supabase.co/functions/v1/send-notification';
begin
  select decrypted_secret
    into webhook_secret
  from vault.decrypted_secrets
  where name = 'retail_notification_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise warning 'Notification webhook secret is not configured';
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retail-notification-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(new)
    )
  );

  return new;
end;
$$;

revoke all on function private.dispatch_notification_push() from public, anon, authenticated;

drop trigger if exists dispatch_notification_push_after_insert
  on public.notifications;

create trigger dispatch_notification_push_after_insert
after insert on public.notifications
for each row
execute function private.dispatch_notification_push();
