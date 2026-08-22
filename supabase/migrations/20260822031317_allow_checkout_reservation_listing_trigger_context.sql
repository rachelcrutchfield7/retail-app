-- Allow the server-owned checkout reservation RPC to update listing
-- reservation fields without being blocked by the user-facing Phase F listing
-- write guard.
--
-- Authorization semantics are unchanged:
-- - normal user listing writes still require an active authenticated account
-- - reservation field mutations remain constrained by
--   public.protect_checkout_reservation_listing_fields()
-- - reserve_stripe_checkout_listing still validates buyer, seller, listing,
--   Stripe Connect readiness, and accepted-offer authority server-side

create or replace function private.enforce_phase_f_listing_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_checkout_reservation boolean := coalesce(
    nullif(current_setting('retail.checkout_reservation_context', true), ''),
    'false'
  )::boolean;
  caller_id uuid;
begin
  if trusted_checkout_reservation then
    return new;
  end if;

  caller_id := private.require_active_account();

  if tg_op = 'INSERT' then
    if new.seller_id is distinct from caller_id then
      raise exception 'RETAIL_LISTING_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    perform private.check_rate_limit('listing_create_hour', 'global', 10, interval '1 hour');
    perform private.check_rate_limit('listing_create_day', 'global', 30, interval '1 day');
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.seller_id is distinct from old.seller_id then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      perform private.check_rate_limit('listing_status_change_hour', 'global', 60, interval '1 hour');
    else
      perform private.check_rate_limit('listing_edit_hour', 'global', 60, interval '1 hour');
    end if;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_listing_write()
from public, anon, authenticated;
