-- ReTail integrated shipping pause v1
--
-- Integrated shipping is intentionally paused while ReTail operates as a
-- local pickup / meetup marketplace.
--
-- Existing shipping infrastructure is preserved for future reactivation.
-- This guard prevents older clients from creating or updating listings with
-- shipping enabled while the feature is paused.

create or replace function private.guard_integrated_shipping_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.shipping_available, false) then
    raise exception 'RETAIL_SHIPPING_DISABLED'
      using
        errcode = '55000',
        detail = 'Integrated shipping is temporarily unavailable. Choose local pickup or meetup.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_integrated_shipping_pause()
from public, anon, authenticated;

drop trigger if exists guard_integrated_shipping_pause
on public.listings;

create trigger guard_integrated_shipping_pause
before insert or update of shipping_available
on public.listings
for each row
execute function private.guard_integrated_shipping_pause();

comment on function private.guard_integrated_shipping_pause()
is 'Server-side kill switch preventing shipping-enabled listings while integrated shipping is paused.';
