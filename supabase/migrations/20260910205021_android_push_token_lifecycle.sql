-- Keep Android Expo push tokens current per installation and let the trusted
-- notification dispatcher remove provider-invalid token rows exactly.

create or replace function public.register_my_android_device_token(
  requested_token text,
  requested_previous_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  safe_token text := btrim(coalesce(requested_token, ''));
  safe_previous_token text := btrim(coalesce(requested_previous_token, ''));
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_DEVICE_TOKEN_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if safe_token = '' or char_length(safe_token) > 4096 then
    raise exception 'RETAIL_DEVICE_TOKEN_INVALID'
      using errcode = '22023';
  end if;

  if safe_previous_token <> '' and char_length(safe_previous_token) > 4096 then
    raise exception 'RETAIL_DEVICE_TOKEN_INVALID'
      using errcode = '22023';
  end if;

  perform private.check_rate_limit('device_token_change_hour', 'global', 20, interval '1 hour');
  perform set_config('retail.trusted_push_token_cleanup', 'true', true);

  if safe_previous_token <> '' and safe_previous_token <> safe_token then
    delete from public.device_tokens dt
    where dt.user_id = caller_id
      and dt.platform = 'android'
      and dt.token = safe_previous_token;
  end if;

  delete from public.device_tokens dt
  where dt.token = safe_token
    and dt.user_id <> caller_id;

  insert into public.device_tokens (user_id, token, platform, created_at, updated_at)
  values (caller_id, safe_token, 'android', now(), now())
  on conflict (token)
  do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    updated_at = now();

  perform set_config('retail.trusted_push_token_cleanup', 'false', true);
exception
  when others then
    perform set_config('retail.trusted_push_token_cleanup', 'false', true);
    raise;
end;
$$;

revoke all on function public.register_my_android_device_token(text, text)
  from public, anon;
grant execute on function public.register_my_android_device_token(text, text)
  to authenticated, service_role;

comment on function public.register_my_android_device_token(text, text) is
  'Registers the current Android installation token and retires only that user installation''s prior token.';

create or replace function public.remove_invalid_device_token_by_id(
  requested_device_token_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  if requested_device_token_id is null then
    raise exception 'RETAIL_DEVICE_TOKEN_INVALID'
      using errcode = '22023';
  end if;

  perform set_config('retail.trusted_push_token_cleanup', 'true', true);

  delete from public.device_tokens dt
  where dt.id = requested_device_token_id;

  get diagnostics deleted_count = row_count;
  perform set_config('retail.trusted_push_token_cleanup', 'false', true);

  return deleted_count > 0;
exception
  when others then
    perform set_config('retail.trusted_push_token_cleanup', 'false', true);
    raise;
end;
$$;

revoke all on function public.remove_invalid_device_token_by_id(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_invalid_device_token_by_id(uuid)
  to service_role;

comment on function public.remove_invalid_device_token_by_id(uuid) is
  'Service-role-only exact cleanup for a token rejected permanently by Expo, FCM, or APNs.';

-- Receipt reconciliation is authoritative for permanently invalid Expo tokens.
-- Retire any rows already proven invalid before this exact-ID cleanup existed.
select set_config('retail.trusted_push_token_cleanup', 'true', true);

delete from public.device_tokens dt
using public.notification_push_deliveries delivery
where delivery.device_token_id = dt.id
  and delivery.status = 'failed'
  and delivery.error_code = 'DeviceNotRegistered';

select set_config('retail.trusted_push_token_cleanup', 'false', true);
