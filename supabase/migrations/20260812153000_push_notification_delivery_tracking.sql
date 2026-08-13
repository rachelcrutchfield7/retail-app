-- ReTail native push notification delivery tracking.
-- Push is an additional channel for canonical in-app notifications.

create table if not exists public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type public.notification_type not null,
  device_token_id uuid references public.device_tokens(id) on delete set null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  platform text not null check (platform in ('ios', 'android')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  provider_ticket_id text,
  error_code text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, token_hash)
);

create index if not exists notification_push_deliveries_user_created_idx
  on public.notification_push_deliveries(user_id, created_at desc);

create index if not exists notification_push_deliveries_status_created_idx
  on public.notification_push_deliveries(status, created_at desc);

drop trigger if exists set_notification_push_deliveries_updated_at
  on public.notification_push_deliveries;
create trigger set_notification_push_deliveries_updated_at
  before update on public.notification_push_deliveries
  for each row execute function public.set_updated_at();

alter table public.notification_push_deliveries enable row level security;
alter table public.notification_push_deliveries force row level security;

revoke all on table public.notification_push_deliveries from public, anon, authenticated;
grant select, insert, update on table public.notification_push_deliveries to service_role;

create or replace function private.enforce_phase_f_device_token_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_push_cleanup boolean := coalesce(
    nullif(current_setting('retail.trusted_push_token_cleanup', true), ''),
    'false'
  )::boolean;
  caller_id uuid;
  target_user_id uuid;
begin
  if trusted_push_cleanup then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  caller_id := private.require_active_account();
  target_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  if target_user_id is distinct from caller_id then
    raise exception 'RETAIL_DEVICE_TOKEN_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  perform private.check_rate_limit('device_token_change_hour', 'global', 20, interval '1 hour');

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_device_token_write()
  from public, anon, authenticated;

create or replace function public.remove_invalid_device_token_from_push_delivery(requested_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
  safe_token text := btrim(coalesce(requested_token, ''));
  deleted_count integer := 0;
begin
  if jwt_role <> 'service_role' then
    raise exception 'RETAIL_PUSH_TOKEN_CLEANUP_FORBIDDEN'
      using errcode = '42501';
  end if;

  if safe_token = '' or char_length(safe_token) > 4096 then
    raise exception 'RETAIL_DEVICE_TOKEN_INVALID'
      using errcode = '22023';
  end if;

  perform set_config('retail.trusted_push_token_cleanup', 'true', true);

  delete from public.device_tokens dt
  where dt.token = safe_token;

  get diagnostics deleted_count = row_count;
  perform set_config('retail.trusted_push_token_cleanup', 'false', true);

  return deleted_count > 0;
exception
  when others then
    perform set_config('retail.trusted_push_token_cleanup', 'false', true);
    raise;
end;
$$;

revoke all on function public.remove_invalid_device_token_from_push_delivery(text)
  from public, anon, authenticated;
grant execute on function public.remove_invalid_device_token_from_push_delivery(text)
  to service_role;
