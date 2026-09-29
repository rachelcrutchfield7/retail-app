-- Stage A: additive checkout-expiration state and service-only reconciliation
-- primitives. Strict attached-PaymentIntent listing locks are intentionally
-- deferred to the separate Stage C enforcement migration.

alter table public.transactions
  add column if not exists checkout_expires_at timestamptz,
  add column if not exists checkout_invalidated_at timestamptz,
  add column if not exists checkout_invalidation_reason text,
  add column if not exists checkout_payment_succeeded_at timestamptz,
  add column if not exists checkout_reconciliation_required_at timestamptz,
  add column if not exists checkout_reconciliation_reason text,
  add column if not exists checkout_reconciliation_stripe_event_id text,
  add column if not exists checkout_cleanup_status text,
  add column if not exists checkout_cleanup_run_id uuid,
  add column if not exists checkout_cleanup_claim_token uuid,
  add column if not exists checkout_cleanup_claimed_at timestamptz,
  add column if not exists checkout_cleanup_lease_expires_at timestamptz,
  add column if not exists checkout_cleanup_stripe_contact_started_at timestamptz,
  add column if not exists checkout_cleanup_cancellation_confirmed_at timestamptz,
  add column if not exists checkout_cleanup_completed_at timestamptz,
  add column if not exists checkout_cleanup_attempts integer not null default 0,
  add column if not exists checkout_cleanup_last_attempt_at timestamptz,
  add column if not exists checkout_cleanup_last_stripe_status text,
  add column if not exists checkout_cleanup_last_action text,
  add column if not exists checkout_cleanup_last_error text;
alter table public.transactions
  drop constraint if exists transactions_checkout_invalidation_reason_length,
  add constraint transactions_checkout_invalidation_reason_length
    check (
      checkout_invalidation_reason is null
      or char_length(checkout_invalidation_reason) between 1 and 160
    ),
  drop constraint if exists transactions_checkout_reconciliation_reason_length,
  add constraint transactions_checkout_reconciliation_reason_length
    check (
      checkout_reconciliation_reason is null
      or char_length(checkout_reconciliation_reason) between 1 and 160
    ),
  drop constraint if exists transactions_checkout_reconciliation_event_format,
  add constraint transactions_checkout_reconciliation_event_format
    check (
      checkout_reconciliation_stripe_event_id is null
      or checkout_reconciliation_stripe_event_id ~ '^evt_[A-Za-z0-9]+$'
    ),
  drop constraint if exists transactions_checkout_cleanup_status_known,
  add constraint transactions_checkout_cleanup_status_known
    check (
      checkout_cleanup_status is null
      or checkout_cleanup_status in (
        'claimed',
        'contacting_stripe',
        'cancellation_confirmed',
        'completed',
        'reconciliation_required'
      )
    ),
  drop constraint if exists transactions_checkout_cleanup_attempts_nonnegative,
  add constraint transactions_checkout_cleanup_attempts_nonnegative
    check (checkout_cleanup_attempts >= 0),
  drop constraint if exists transactions_checkout_cleanup_text_lengths,
  add constraint transactions_checkout_cleanup_text_lengths
    check (
      (checkout_cleanup_last_stripe_status is null or char_length(checkout_cleanup_last_stripe_status) between 1 and 40)
      and (checkout_cleanup_last_action is null or char_length(checkout_cleanup_last_action) between 1 and 80)
      and (checkout_cleanup_last_error is null or char_length(checkout_cleanup_last_error) between 1 and 160)
    );
create index if not exists transactions_checkout_cleanup_candidates_idx
on public.transactions (checkout_expires_at, id)
where status = 'pending'::public.transaction_status
  and stripe_payment_intent_id is not null
  and checkout_invalidated_at is null;
update public.transactions t
set checkout_expires_at = l.reserved_until
from public.listings l
where l.reservation_transaction_id = t.id
  and l.reservation_payment_intent_id = t.stripe_payment_intent_id
  and l.reserved_until is not null
  and t.checkout_expires_at is null;
create or replace function private.sync_checkout_transaction_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.reservation_transaction_id is not null
    and new.reservation_payment_intent_id is not null
    and new.reserved_until is not null
    and (
      new.reserved_until is distinct from old.reserved_until
      or new.reservation_transaction_id is distinct from old.reservation_transaction_id
      or new.reservation_payment_intent_id is distinct from old.reservation_payment_intent_id
    ) then
    update public.transactions t
    set checkout_expires_at = new.reserved_until,
        updated_at = now()
    where t.id = new.reservation_transaction_id
      and t.listing_id = new.id
      and t.buyer_id = new.reserved_by
      and t.stripe_payment_intent_id = new.reservation_payment_intent_id
      and t.status = 'pending'::public.transaction_status
      and t.checkout_cleanup_status is null;
  end if;

  return new;
end;
$function$;
revoke all on function private.sync_checkout_transaction_expiry()
from public, anon, authenticated;
drop trigger if exists sync_checkout_transaction_expiry_after_update
on public.listings;
create trigger sync_checkout_transaction_expiry_after_update
after update of reserved_until, reservation_payment_intent_id, reservation_transaction_id
on public.listings
for each row
execute function private.sync_checkout_transaction_expiry();
create or replace function public.attach_stripe_checkout_reservation(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_payment_intent_id text,
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  reservation_expiry timestamptz;
begin
  if p_listing_id is null
    or p_buyer_id is null
    or p_payment_intent_id is null
    or p_transaction_id is null then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST' using errcode = '22023';
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings l
  set reservation_payment_intent_id = p_payment_intent_id,
      reservation_transaction_id = p_transaction_id,
      updated_at = now()
  where l.id = p_listing_id
    and l.reserved_by = p_buyer_id
    and l.reserved_until > now()
    and l.status = 'active'::public.listing_status
    and l.deleted_at is null
  returning l.reserved_until into reservation_expiry;

  perform set_config('retail.checkout_reservation_context', 'false', true);

  if reservation_expiry is null then
    raise exception 'RETAIL_CHECKOUT_RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.transactions t
  set checkout_expires_at = reservation_expiry,
      checkout_invalidated_at = null,
      checkout_invalidation_reason = null,
      checkout_reconciliation_required_at = null,
      checkout_reconciliation_reason = null,
      checkout_reconciliation_stripe_event_id = null,
      checkout_cleanup_status = null,
      checkout_cleanup_run_id = null,
      checkout_cleanup_claim_token = null,
      checkout_cleanup_claimed_at = null,
      checkout_cleanup_lease_expires_at = null,
      checkout_cleanup_stripe_contact_started_at = null,
      checkout_cleanup_cancellation_confirmed_at = null,
      checkout_cleanup_completed_at = null,
      checkout_cleanup_attempts = 0,
      checkout_cleanup_last_attempt_at = null,
      checkout_cleanup_last_stripe_status = null,
      checkout_cleanup_last_action = null,
      checkout_cleanup_last_error = null,
      updated_at = now()
  where t.id = p_transaction_id
    and t.listing_id = p_listing_id
    and t.buyer_id = p_buyer_id
    and t.stripe_payment_intent_id = p_payment_intent_id
    and t.status = 'pending'::public.transaction_status;

  if not found then
    raise exception 'RETAIL_CHECKOUT_TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
exception
  when others then
    perform set_config('retail.checkout_reservation_context', 'false', true);
    raise;
end;
$function$;
create or replace function public.release_stripe_checkout_reservation(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_payment_intent_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  listing_snapshot public.listings%rowtype;
  listing_row public.listings%rowtype;
  transaction_row public.transactions%rowtype;
  release_reason text;
begin
  if p_listing_id is null or p_buyer_id is null then
    return;
  end if;

  select *
  into listing_snapshot
  from public.listings l
  where l.id = p_listing_id;

  if not found or listing_snapshot.reserved_by is distinct from p_buyer_id then
    return;
  end if;

  if listing_snapshot.reservation_transaction_id is not null then
    select *
    into transaction_row
    from public.transactions t
    where t.id = listing_snapshot.reservation_transaction_id
      and t.listing_id = listing_snapshot.id
      and t.buyer_id = listing_snapshot.reserved_by
      and t.stripe_payment_intent_id is not distinct from listing_snapshot.reservation_payment_intent_id
    for update;
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = p_listing_id
  for update;

  if not found
    or listing_row.reserved_by is distinct from p_buyer_id
    or listing_row.reservation_transaction_id is distinct from listing_snapshot.reservation_transaction_id
    or listing_row.reservation_payment_intent_id is distinct from listing_snapshot.reservation_payment_intent_id then
    return;
  end if;

  if listing_row.reservation_payment_intent_id is not null
    and p_payment_intent_id is null then
    raise exception 'RETAIL_CHECKOUT_PAYMENT_INTENT_STILL_VIABLE'
      using errcode = '55P03';
  end if;

  if p_payment_intent_id is not null
    and listing_row.reservation_payment_intent_id is distinct from p_payment_intent_id then
    return;
  end if;

  select case
    when transaction_row.payment_status = 'failed' then 'payment_intent.payment_failed'
    when transaction_row.payment_status = 'canceled' then 'payment_intent.canceled'
    else 'checkout_released'
  end
  into release_reason;

  if listing_row.reservation_transaction_id is not null then
    update public.transactions t
    set checkout_invalidated_at = coalesce(t.checkout_invalidated_at, now()),
        checkout_invalidation_reason = coalesce(t.checkout_invalidation_reason, release_reason),
        checkout_cleanup_status = 'completed',
        checkout_cleanup_completed_at = coalesce(t.checkout_cleanup_completed_at, now()),
        checkout_cleanup_lease_expires_at = null,
        checkout_cleanup_last_stripe_status = coalesce(t.payment_status, t.checkout_cleanup_last_stripe_status),
        checkout_cleanup_last_action = 'released_by_payment_webhook',
        checkout_cleanup_last_error = null,
        updated_at = now()
    where t.id = listing_row.reservation_transaction_id
      and t.status <> 'completed'::public.transaction_status;
  end if;

  perform set_config('retail.checkout_invalidation_context', 'true', true);
  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings l
  set reserved_by = null,
      reserved_until = null,
      reservation_payment_intent_id = null,
      reservation_transaction_id = null,
      updated_at = now()
  where l.id = listing_row.id;

  perform set_config('retail.checkout_reservation_context', 'false', true);
  perform set_config('retail.checkout_invalidation_context', 'false', true);
exception
  when others then
    perform set_config('retail.checkout_reservation_context', 'false', true);
    perform set_config('retail.checkout_invalidation_context', 'false', true);
    raise;
end;
$function$;
create or replace function public.claim_expired_stripe_checkout_cleanups(
  p_run_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 300,
  p_listing_id uuid default null
)
returns table(
  transaction_id uuid,
  listing_id uuid,
  buyer_id uuid,
  seller_id uuid,
  payment_intent_id text,
  checkout_expires_at timestamptz,
  amount_cents integer,
  currency text,
  fee_model_version text,
  stripe_application_fee_cents integer,
  stripe_transfer_destination text,
  claim_token uuid,
  attempt_number integer,
  cancellation_already_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  candidate record;
  next_claim_token uuid;
  next_attempt integer;
  cancellation_confirmed boolean;
  lease_until timestamptz := now() + make_interval(secs => p_lease_seconds);
begin
  if p_run_id is null
    or p_batch_size < 1
    or p_batch_size > 25
    or p_lease_seconds < 60
    or p_lease_seconds > 900 then
    raise exception 'RETAIL_CHECKOUT_CLEANUP_INVALID_REQUEST' using errcode = '22023';
  end if;

  for candidate in
    select
      t.id as transaction_id,
      t.listing_id,
      t.buyer_id,
      t.seller_id,
      t.stripe_payment_intent_id as payment_intent_id,
      coalesce(t.checkout_expires_at, l.reserved_until) as checkout_expires_at,
      t.amount_cents,
      t.currency,
      t.fee_model_version,
      t.stripe_application_fee_cents,
      t.stripe_transfer_destination,
      t.checkout_cleanup_attempts,
      t.checkout_cleanup_cancellation_confirmed_at
    from public.transactions t
    join public.listings l
      on l.id = t.listing_id
     and l.reserved_by = t.buyer_id
     and l.reservation_transaction_id = t.id
     and l.reservation_payment_intent_id = t.stripe_payment_intent_id
    where t.status = 'pending'::public.transaction_status
      and t.stripe_payment_intent_id is not null
      and t.checkout_invalidated_at is null
      and t.checkout_reconciliation_required_at is null
      and coalesce(t.checkout_expires_at, l.reserved_until) <= now()
      and (p_listing_id is null or l.id = p_listing_id)
      and (
        t.checkout_cleanup_status is null
        or t.checkout_cleanup_status = 'cancellation_confirmed'
        or (
          t.checkout_cleanup_status = 'claimed'
          and t.checkout_cleanup_stripe_contact_started_at is null
          and t.checkout_cleanup_lease_expires_at <= now()
        )
      )
    order by coalesce(t.checkout_expires_at, l.reserved_until), t.id
    for update of t skip locked
    limit p_batch_size
  loop
    next_claim_token := gen_random_uuid();
    next_attempt := candidate.checkout_cleanup_attempts + 1;
    cancellation_confirmed := candidate.checkout_cleanup_cancellation_confirmed_at is not null;

    update public.transactions t
    set checkout_cleanup_status = 'claimed',
        checkout_cleanup_run_id = p_run_id,
        checkout_cleanup_claim_token = next_claim_token,
        checkout_cleanup_claimed_at = now(),
        checkout_cleanup_lease_expires_at = lease_until,
        checkout_cleanup_stripe_contact_started_at = null,
        checkout_cleanup_attempts = next_attempt,
        checkout_cleanup_last_attempt_at = now(),
        checkout_cleanup_last_action = case
          when cancellation_confirmed then 'resume_confirmed_cancellation'
          else 'claimed'
        end,
        checkout_cleanup_last_error = null,
        updated_at = now()
    where t.id = candidate.transaction_id;

    perform set_config('retail.checkout_reservation_context', 'true', true);
    update public.listings l
    set reserved_until = greatest(l.reserved_until, lease_until),
        updated_at = now()
    where l.id = candidate.listing_id
      and l.reserved_by = candidate.buyer_id
      and l.reservation_transaction_id = candidate.transaction_id
      and l.reservation_payment_intent_id = candidate.payment_intent_id;
    perform set_config('retail.checkout_reservation_context', 'false', true);

    transaction_id := candidate.transaction_id;
    listing_id := candidate.listing_id;
    buyer_id := candidate.buyer_id;
    seller_id := candidate.seller_id;
    payment_intent_id := candidate.payment_intent_id;
    checkout_expires_at := candidate.checkout_expires_at;
    amount_cents := candidate.amount_cents;
    currency := candidate.currency;
    fee_model_version := candidate.fee_model_version;
    stripe_application_fee_cents := candidate.stripe_application_fee_cents;
    stripe_transfer_destination := candidate.stripe_transfer_destination;
    claim_token := next_claim_token;
    attempt_number := next_attempt;
    cancellation_already_confirmed := cancellation_confirmed;
    return next;
  end loop;
exception
  when others then
    perform set_config('retail.checkout_reservation_context', 'false', true);
    raise;
end;
$function$;
create or replace function public.begin_stripe_checkout_cleanup_contact(
  p_transaction_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_listing_id uuid;
  target_buyer_id uuid;
  target_payment_intent_id text;
begin
  update public.transactions t
  set checkout_cleanup_status = 'contacting_stripe',
      checkout_cleanup_stripe_contact_started_at = now(),
      checkout_cleanup_last_action = 'retrieve_payment_intent',
      updated_at = now()
  where t.id = p_transaction_id
    and t.checkout_cleanup_claim_token = p_claim_token
    and t.checkout_cleanup_status = 'claimed'
    and t.checkout_cleanup_cancellation_confirmed_at is null
    and t.checkout_cleanup_lease_expires_at > now()
  returning t.listing_id, t.buyer_id, t.stripe_payment_intent_id
  into target_listing_id, target_buyer_id, target_payment_intent_id;

  if not found then
    return false;
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);
  update public.listings l
  set reserved_until = 'infinity'::timestamptz,
      updated_at = now()
  where l.id = target_listing_id
    and l.reserved_by = target_buyer_id
    and l.reservation_transaction_id = p_transaction_id
    and l.reservation_payment_intent_id = target_payment_intent_id;
  perform set_config('retail.checkout_reservation_context', 'false', true);

  if not found then
    raise exception 'RETAIL_CHECKOUT_RESERVATION_CHANGED' using errcode = '55P03';
  end if;

  return true;
exception
  when others then
    perform set_config('retail.checkout_reservation_context', 'false', true);
    raise;
end;
$function$;
create or replace function public.confirm_stripe_checkout_cancellation(
  p_transaction_id uuid,
  p_claim_token uuid,
  p_observed_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_observed_status <> 'canceled' then
    raise exception 'RETAIL_CHECKOUT_CANCELLATION_NOT_CONFIRMED' using errcode = '22023';
  end if;

  update public.transactions t
  set checkout_cleanup_status = 'cancellation_confirmed',
      checkout_cleanup_cancellation_confirmed_at = coalesce(t.checkout_cleanup_cancellation_confirmed_at, now()),
      checkout_cleanup_lease_expires_at = null,
      checkout_cleanup_last_stripe_status = 'canceled',
      checkout_cleanup_last_action = 'stripe_cancellation_confirmed',
      checkout_cleanup_last_error = null,
      updated_at = now()
  where t.id = p_transaction_id
    and t.checkout_cleanup_claim_token = p_claim_token
    and t.checkout_cleanup_status in ('claimed', 'contacting_stripe');

  return found;
end;
$function$;
create or replace function public.mark_stripe_checkout_cleanup_reconciliation(
  p_transaction_id uuid,
  p_claim_token uuid,
  p_observed_status text,
  p_reason text,
  p_error_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  transaction_row public.transactions%rowtype;
  safe_status text := nullif(btrim(coalesce(p_observed_status, '')), '');
  safe_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  safe_error text := nullif(btrim(coalesce(p_error_code, '')), '');
  target_listing_id uuid;
  target_buyer_id uuid;
  target_payment_intent_id text;
begin
  if safe_reason is null
    or char_length(safe_reason) > 160
    or (safe_status is not null and char_length(safe_status) > 40)
    or (safe_error is not null and char_length(safe_error) > 160) then
    raise exception 'RETAIL_CHECKOUT_CLEANUP_INVALID_REQUEST' using errcode = '22023';
  end if;

  select *
  into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if transaction_row.status = 'completed'::public.transaction_status
    and transaction_row.payment_status = 'succeeded' then
    return 'payment_completed';
  end if;

  if transaction_row.checkout_cleanup_claim_token is distinct from p_claim_token
    or transaction_row.checkout_cleanup_status not in ('claimed', 'contacting_stripe') then
    return 'claim_changed';
  end if;

  update public.transactions t
  set checkout_cleanup_status = 'reconciliation_required',
      checkout_cleanup_lease_expires_at = null,
      checkout_cleanup_last_stripe_status = safe_status,
      checkout_cleanup_last_action = 'reconciliation_required',
      checkout_cleanup_last_error = safe_error,
      checkout_reconciliation_required_at = coalesce(t.checkout_reconciliation_required_at, now()),
      checkout_reconciliation_reason = coalesce(t.checkout_reconciliation_reason, safe_reason),
      updated_at = now()
  where t.id = p_transaction_id
    and t.checkout_cleanup_claim_token = p_claim_token
    and t.checkout_cleanup_status in ('claimed', 'contacting_stripe')
  returning t.listing_id, t.buyer_id, t.stripe_payment_intent_id
  into target_listing_id, target_buyer_id, target_payment_intent_id;

  if not found then
    return 'claim_changed';
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);
  update public.listings l
  set reserved_until = 'infinity'::timestamptz,
      updated_at = now()
  where l.id = target_listing_id
    and l.reserved_by = target_buyer_id
    and l.reservation_transaction_id = p_transaction_id
    and l.reservation_payment_intent_id = target_payment_intent_id;
  perform set_config('retail.checkout_reservation_context', 'false', true);

  return 'recorded';
exception
  when others then
    perform set_config('retail.checkout_reservation_context', 'false', true);
    raise;
end;
$function$;
create or replace function public.invalidate_expired_stripe_checkout(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_payment_intent_id text,
  p_transaction_id uuid,
  p_reason text,
  p_cleanup_claim_token uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  listing_row public.listings%rowtype;
  transaction_row public.transactions%rowtype;
  safe_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_listing_id is null
    or p_buyer_id is null
    or p_payment_intent_id is null
    or p_transaction_id is null
    or p_cleanup_claim_token is null
    or safe_reason is null
    or char_length(safe_reason) > 160 then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST' using errcode = '22023';
  end if;

  select *
  into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
    and t.listing_id = p_listing_id
    and t.buyer_id = p_buyer_id
    and t.stripe_payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if transaction_row.status = 'completed'::public.transaction_status then
    return 'payment_completed';
  end if;

  if transaction_row.checkout_cleanup_claim_token is distinct from p_cleanup_claim_token then
    return 'claim_changed';
  end if;

  if transaction_row.checkout_cleanup_cancellation_confirmed_at is null then
    return 'stripe_cancellation_not_confirmed';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = p_listing_id
  for update;

  if transaction_row.checkout_invalidated_at is not null
    and (
      not found
      or listing_row.reservation_transaction_id is distinct from p_transaction_id
    ) then
    return 'already_invalidated';
  end if;

  if not found
    or listing_row.reserved_by is distinct from p_buyer_id
    or listing_row.reservation_payment_intent_id is distinct from p_payment_intent_id
    or listing_row.reservation_transaction_id is distinct from p_transaction_id then
    return 'reservation_changed';
  end if;

  if listing_row.reserved_until is null
    or (
      listing_row.reserved_until > now()
      and transaction_row.checkout_cleanup_cancellation_confirmed_at is null
    ) then
    return 'reservation_active';
  end if;

  update public.transactions t
  set status = 'cancelled'::public.transaction_status,
      payment_status = 'canceled',
      cancelled_at = coalesce(t.cancelled_at, now()),
      checkout_invalidated_at = coalesce(t.checkout_invalidated_at, now()),
      checkout_invalidation_reason = coalesce(t.checkout_invalidation_reason, safe_reason),
      checkout_cleanup_status = 'completed',
      checkout_cleanup_completed_at = coalesce(t.checkout_cleanup_completed_at, now()),
      checkout_cleanup_lease_expires_at = null,
      checkout_cleanup_last_stripe_status = 'canceled',
      checkout_cleanup_last_action = 'reservation_invalidated',
      checkout_cleanup_last_error = null,
      updated_at = now()
  where t.id = transaction_row.id;

  perform set_config('retail.checkout_invalidation_context', 'true', true);
  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings l
  set reserved_by = null,
      reserved_until = null,
      reservation_payment_intent_id = null,
      reservation_transaction_id = null,
      updated_at = now()
  where l.id = listing_row.id;

  perform set_config('retail.checkout_reservation_context', 'false', true);
  perform set_config('retail.checkout_invalidation_context', 'false', true);

  return 'invalidated';
exception
  when others then
    perform set_config('retail.checkout_reservation_context', 'false', true);
    perform set_config('retail.checkout_invalidation_context', 'false', true);
    raise;
end;
$function$;
create or replace function public.finalize_stripe_checkout_payment(
  p_transaction_id uuid,
  p_payment_intent_id text,
  p_stripe_succeeded_at timestamptz,
  p_stripe_event_id text,
  p_charge_id text default null
)
returns table(action text, listing_id uuid, buyer_id uuid, seller_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  transaction_row public.transactions%rowtype;
  listing_row public.listings%rowtype;
  invalid_reason text;
begin
  if p_transaction_id is null
    or p_payment_intent_id is null
    or p_stripe_succeeded_at is null
    or p_stripe_event_id is null then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST' using errcode = '22023';
  end if;

  select *
  into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
    and t.stripe_payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'RETAIL_CHECKOUT_TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if transaction_row.status = 'completed'::public.transaction_status
    and transaction_row.payment_status = 'succeeded' then
    return query select
      'already_completed'::text,
      transaction_row.listing_id,
      transaction_row.buyer_id,
      transaction_row.seller_id;
    return;
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = transaction_row.listing_id
  for update;

  if transaction_row.checkout_invalidated_at is not null then
    invalid_reason := 'checkout_invalidated_before_webhook';
  elsif transaction_row.checkout_expires_at is null then
    invalid_reason := 'checkout_expiry_missing';
  elsif p_stripe_succeeded_at > transaction_row.checkout_expires_at then
    invalid_reason := 'payment_succeeded_after_checkout_expiry';
  elsif not found
    or listing_row.status <> 'active'::public.listing_status
    or listing_row.deleted_at is not null
    or listing_row.reserved_by is distinct from transaction_row.buyer_id
    or listing_row.reservation_payment_intent_id is distinct from p_payment_intent_id
    or listing_row.reservation_transaction_id is distinct from transaction_row.id then
    invalid_reason := 'listing_reservation_mismatch';
  end if;

  if invalid_reason is not null then
    update public.transactions t
    set payment_status = 'succeeded',
        paid_at = coalesce(t.paid_at, p_stripe_succeeded_at),
        last_stripe_charge_id = coalesce(p_charge_id, t.last_stripe_charge_id),
        checkout_payment_succeeded_at = coalesce(t.checkout_payment_succeeded_at, p_stripe_succeeded_at),
        checkout_cleanup_status = 'reconciliation_required',
        checkout_cleanup_lease_expires_at = null,
        checkout_cleanup_last_stripe_status = 'succeeded',
        checkout_cleanup_last_action = 'payment_success_reconciliation_required',
        checkout_reconciliation_required_at = coalesce(t.checkout_reconciliation_required_at, now()),
        checkout_reconciliation_reason = coalesce(t.checkout_reconciliation_reason, invalid_reason),
        checkout_reconciliation_stripe_event_id = coalesce(t.checkout_reconciliation_stripe_event_id, p_stripe_event_id),
        updated_at = now()
    where t.id = transaction_row.id;

    return query select
      'reconciliation_required'::text,
      transaction_row.listing_id,
      transaction_row.buyer_id,
      transaction_row.seller_id;
    return;
  end if;

  perform set_config('retail.checkout_payment_finalize_context', 'true', true);
  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings l
  set status = 'sold'::public.listing_status,
      reserved_by = null,
      reserved_until = null,
      reservation_payment_intent_id = null,
      reservation_transaction_id = null,
      updated_at = now()
  where l.id = listing_row.id;

  perform set_config('retail.checkout_reservation_context', 'false', true);
  perform set_config('retail.checkout_payment_finalize_context', 'false', true);

  update public.transactions t
  set status = 'completed'::public.transaction_status,
      outcome = 'sold'::public.transaction_outcome,
      completed_at = coalesce(t.completed_at, p_stripe_succeeded_at),
      paid_at = coalesce(t.paid_at, p_stripe_succeeded_at),
      payment_status = 'succeeded',
      payment_error = null,
      last_stripe_charge_id = coalesce(p_charge_id, t.last_stripe_charge_id),
      checkout_payment_succeeded_at = coalesce(t.checkout_payment_succeeded_at, p_stripe_succeeded_at),
      checkout_cleanup_status = 'completed',
      checkout_cleanup_completed_at = coalesce(t.checkout_cleanup_completed_at, now()),
      checkout_cleanup_lease_expires_at = null,
      checkout_cleanup_last_stripe_status = 'succeeded',
      checkout_cleanup_last_action = 'payment_finalized',
      checkout_cleanup_last_error = null,
      updated_at = now()
  where t.id = transaction_row.id;

  return query select
    'completed'::text,
    transaction_row.listing_id,
    transaction_row.buyer_id,
    transaction_row.seller_id;
exception
  when others then
    perform set_config('retail.checkout_reservation_context', 'false', true);
    perform set_config('retail.checkout_payment_finalize_context', 'false', true);
    raise;
end;
$function$;
revoke all on function public.attach_stripe_checkout_reservation(uuid, uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.attach_stripe_checkout_reservation(uuid, uuid, text, uuid)
to service_role;
revoke all on function public.release_stripe_checkout_reservation(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.release_stripe_checkout_reservation(uuid, uuid, text)
to service_role;
revoke all on function public.claim_expired_stripe_checkout_cleanups(uuid, integer, integer, uuid)
from public, anon, authenticated;
grant execute on function public.claim_expired_stripe_checkout_cleanups(uuid, integer, integer, uuid)
to service_role;
revoke all on function public.begin_stripe_checkout_cleanup_contact(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.begin_stripe_checkout_cleanup_contact(uuid, uuid)
to service_role;
revoke all on function public.confirm_stripe_checkout_cancellation(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.confirm_stripe_checkout_cancellation(uuid, uuid, text)
to service_role;
revoke all on function public.mark_stripe_checkout_cleanup_reconciliation(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.mark_stripe_checkout_cleanup_reconciliation(uuid, uuid, text, text, text)
to service_role;
revoke all on function public.invalidate_expired_stripe_checkout(uuid, uuid, text, uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.invalidate_expired_stripe_checkout(uuid, uuid, text, uuid, text, uuid)
to service_role;
revoke all on function public.finalize_stripe_checkout_payment(uuid, text, timestamptz, text, text)
from public, anon, authenticated;
grant execute on function public.finalize_stripe_checkout_payment(uuid, text, timestamptz, text, text)
to service_role;
comment on column public.transactions.checkout_reconciliation_required_at is
  'Set when Stripe reports a successful payment that cannot safely finalize the listing; requires operator reconciliation.';
comment on column public.transactions.checkout_cleanup_status is
  'Server-owned lifecycle for Stripe-aware cleanup of an expired attached PaymentIntent.';
comment on column public.transactions.checkout_cleanup_cancellation_confirmed_at is
  'Set only after Stripe authoritatively returns a canceled PaymentIntent; permits idempotent local detach repair.';
