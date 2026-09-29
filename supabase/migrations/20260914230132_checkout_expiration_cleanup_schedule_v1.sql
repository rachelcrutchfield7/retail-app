-- Stage A activation: schedule the already-deployed internal cleanup function.
-- Apply only after the matching Edge secret is present in Edge Functions and
-- Vault and stripe-cleanup-expired-checkouts is deployed successfully.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function private.dispatch_expired_stripe_checkout_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  webhook_secret text;
  function_url text := 'https://ycwgsdigvpmprqreoqiz.supabase.co/functions/v1/stripe-cleanup-expired-checkouts';
begin
  select decrypted_secret
    into webhook_secret
  from vault.decrypted_secrets
  where name = 'retail_checkout_cleanup_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise warning 'Expired Stripe checkout cleanup secret is not configured';
    return;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retail-checkout-cleanup-secret', webhook_secret
    ),
    body := jsonb_build_object('limit', 10)
  );
end;
$function$;
revoke all on function private.dispatch_expired_stripe_checkout_cleanup()
from public, anon, authenticated;
select cron.schedule(
  'retail-expired-stripe-checkout-cleanup-v1',
  '*/5 * * * *',
  $schedule$select private.dispatch_expired_stripe_checkout_cleanup();$schedule$
);
