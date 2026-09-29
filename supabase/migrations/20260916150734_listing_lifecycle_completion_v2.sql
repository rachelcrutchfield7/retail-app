-- ReTail listing lifecycle completion v2.
--
-- A final listing status has two distinct meanings:
--   * ReTail completion links a real recipient through a completed transaction.
--   * Outside-ReTail disposition makes the listing unavailable without inventing
--     a recipient, transaction, review eligibility, or completion notification.
--
-- Existing RPC signatures are preserved for installed clients. A null buyer on
-- complete_listing_transaction remains the backward-compatible outside-ReTail
-- path, while mark_my_listing_sold/donated are explicitly outside-ReTail paths.

-- Stage C's broad listing/image edit lock remains deferred. This narrower
-- lifecycle guard keeps old clients from changing availability while Stripe
-- still owns an attached PaymentIntent, even after the reservation times out.
create or replace function private.guard_listing_lifecycle_checkout()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
begin
  if tg_op = 'UPDATE'
    and jwt_role <> 'service_role'
    and old.reservation_payment_intent_id is not null
    and (
      new.status is distinct from old.status
      or new.deleted_at is distinct from old.deleted_at
    ) then
    raise exception 'RETAIL_LISTING_RESERVED'
      using errcode = '55P03';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_listing_lifecycle_checkout()
from public, anon, authenticated;

drop trigger if exists guard_listing_lifecycle_checkout on public.listings;
create trigger guard_listing_lifecycle_checkout
before update of status, deleted_at on public.listings
for each row
execute function private.guard_listing_lifecycle_checkout();

create or replace function public.complete_listing_transaction_phase_f_base(
  target_listing_id uuid,
  target_outcome public.transaction_outcome,
  target_buyer_id uuid default null
)
returns table(
  transaction_id uuid,
  listing_id uuid,
  buyer_id uuid,
  seller_id uuid,
  outcome public.transaction_outcome,
  listing_status public.listing_status,
  completed_at timestamptz,
  linked_transaction boolean,
  notification_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  listing_row public.listings%rowtype;
  existing_transaction public.transactions%rowtype;
  inserted_transaction public.transactions%rowtype;
  accepted_offer public.offers%rowtype;
  linked_offer_id uuid;
  inserted_notification_id uuid;
  final_listing_status public.listing_status;
  completion_time timestamptz := now();
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_TRANSACTION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if target_outcome not in (
    'sold'::public.transaction_outcome,
    'donated'::public.transaction_outcome
  ) then
    raise exception 'RETAIL_TRANSACTION_OUTCOME_INVALID'
      using errcode = '22023';
  end if;

  final_listing_status := case
    when target_outcome = 'donated'::public.transaction_outcome
      then 'donated'::public.listing_status
    else 'sold'::public.listing_status
  end;

  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_TRANSACTION_LISTING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if listing_row.seller_id <> caller_id then
    raise exception 'RETAIL_TRANSACTION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  select *
  into existing_transaction
  from public.transactions t
  where t.listing_id = listing_row.id
    and t.status = 'completed'::public.transaction_status
    and t.deleted_at is null
  for update;

  if found then
    if target_buyer_id is not null
      and existing_transaction.buyer_id = target_buyer_id
      and existing_transaction.seller_id = caller_id
      and existing_transaction.outcome = target_outcome
      and listing_row.status = final_listing_status then
      inserted_notification_id := private.create_notification_for_event(
        target_buyer_id,
        'transaction_completed'::public.notification_type,
        case
          when target_outcome = 'donated'::public.transaction_outcome then 'Donation completed'
          else 'Purchase completed'
        end,
        '"' || listing_row.title || '" was marked ' || target_outcome::text || '. You can now leave a review.',
        '/listing/' || listing_row.id::text,
        jsonb_build_object(
          'listingId', listing_row.id,
          'transactionId', existing_transaction.id
        ),
        'transaction:' || existing_transaction.id::text || ':completed:' || target_buyer_id::text
      );

      perform private.create_notification_for_event(
        caller_id,
        case
          when target_outcome = 'donated'::public.transaction_outcome
            then 'listing_donated'::public.notification_type
          else 'listing_sold'::public.notification_type
        end,
        case
          when target_outcome = 'donated'::public.transaction_outcome then 'Donation completed'
          else 'Listing sold'
        end,
        '"' || listing_row.title || '" was completed through ReTail.',
        '/listing/' || listing_row.id::text,
        jsonb_build_object(
          'listingId', listing_row.id,
          'transactionId', existing_transaction.id
        ),
        'transaction:' || existing_transaction.id::text || ':completed:' || caller_id::text
      );

      return query
      select
        existing_transaction.id,
        existing_transaction.listing_id,
        existing_transaction.buyer_id,
        existing_transaction.seller_id,
        existing_transaction.outcome,
        listing_row.status,
        existing_transaction.completed_at,
        true,
        inserted_notification_id;
      return;
    end if;

    raise exception 'RETAIL_TRANSACTION_ALREADY_COMPLETED'
      using errcode = '23505';
  end if;

  if target_buyer_id is null
    and listing_row.status = final_listing_status then
    return query
    select
      null::uuid,
      listing_row.id,
      null::uuid,
      caller_id,
      target_outcome,
      listing_row.status,
      listing_row.updated_at,
      false,
      null::uuid;
    return;
  end if;

  if listing_row.status not in (
    'active'::public.listing_status,
    'pending'::public.listing_status
  ) then
    raise exception 'RETAIL_TRANSACTION_ALREADY_COMPLETED'
      using errcode = '55000';
  end if;

  if listing_row.listing_type in (
    'free'::public.listing_type,
    'donation'::public.listing_type
  ) and target_outcome <> 'donated'::public.transaction_outcome then
    raise exception 'RETAIL_TRANSACTION_OUTCOME_INVALID'
      using errcode = '22023';
  end if;

  -- Never make a listing mutable while an attached PaymentIntent may still pay.
  if listing_row.reservation_payment_intent_id is not null
    or (
      listing_row.reserved_by is not null
      and listing_row.reserved_until is not null
      and listing_row.reserved_until > now()
    ) then
    raise exception 'RETAIL_LISTING_RESERVED'
      using errcode = '55P03';
  end if;

  -- An expired reservation that never acquired a PaymentIntent is safe to
  -- release through the existing Batch 2A reservation path.
  if listing_row.reserved_by is not null then
    perform public.release_stripe_checkout_reservation(
      listing_row.id,
      listing_row.reserved_by,
      null
    );

    select *
    into listing_row
    from public.listings l
    where l.id = target_listing_id
      and l.deleted_at is null
    for update;

    if listing_row.reserved_by is not null
      or listing_row.reservation_payment_intent_id is not null
      or listing_row.reservation_transaction_id is not null then
      raise exception 'RETAIL_LISTING_RESERVED'
        using errcode = '55P03';
    end if;
  end if;

  -- Installed clients used a null buyer for a manual outside-ReTail finish.
  -- Preserve that contract without creating review or transaction provenance.
  if target_buyer_id is null then
    update public.offers o
    set status = 'canceled',
        canceled_at = coalesce(o.canceled_at, completion_time),
        updated_at = completion_time
    where o.listing_id = listing_row.id
      and o.status in ('pending', 'accepted');

    perform set_config('retail.phase_e_trusted_transaction_write', 'true', true);

    update public.listings l
    set status = final_listing_status,
        updated_at = completion_time
    where l.id = listing_row.id
    returning * into listing_row;

    insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
    values (
      caller_id,
      'listing_updated'::public.audit_event_type,
      'listings',
      listing_row.id,
      jsonb_build_object(
        'source', 'complete_listing_transaction',
        'disposition', 'outside_retail',
        'linked_transaction', false,
        'outcome', target_outcome
      )
    );

    perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);

    return query
    select
      null::uuid,
      listing_row.id,
      null::uuid,
      caller_id,
      target_outcome,
      listing_row.status,
      completion_time,
      false,
      null::uuid;
    return;
  end if;

  if target_buyer_id = caller_id
    or not private.is_account_active(target_buyer_id)
    or private.is_blocked_between(caller_id, target_buyer_id) then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.listing_id = listing_row.id
      and c.buyer_id = target_buyer_id
      and c.seller_id = listing_row.seller_id
      and c.deleted_at is null
  ) then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE'
      using errcode = '42501';
  end if;

  if listing_row.listing_type = 'donation'::public.listing_type
    and not private.is_verified_rescue_recipient(target_buyer_id) then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE'
      using errcode = '42501';
  end if;

  update public.offers o
  set status = 'expired',
      updated_at = completion_time
  where o.listing_id = listing_row.id
    and o.status = 'accepted'
    and o.accepted_expires_at is not null
    and o.accepted_expires_at <= completion_time;

  select *
  into accepted_offer
  from public.offers o
  where o.listing_id = listing_row.id
    and o.status = 'accepted'
  for update;

  if found and target_outcome = 'sold'::public.transaction_outcome then
    if accepted_offer.buyer_id <> target_buyer_id then
      raise exception 'RETAIL_TRANSACTION_ACCEPTED_OFFER_BUYER_MISMATCH'
        using errcode = '42501';
    end if;

    linked_offer_id := accepted_offer.id;
  end if;

  perform set_config('retail.phase_e_trusted_transaction_write', 'true', true);

  insert into public.transactions (
    listing_id,
    buyer_id,
    seller_id,
    status,
    outcome,
    accepted_offer_id,
    completed_at,
    created_at,
    updated_at
  )
  values (
    listing_row.id,
    target_buyer_id,
    listing_row.seller_id,
    'completed'::public.transaction_status,
    target_outcome,
    linked_offer_id,
    completion_time,
    completion_time,
    completion_time
  )
  returning * into inserted_transaction;

  if linked_offer_id is not null then
    update public.offers o
    set status = 'consumed',
        consumed_at = coalesce(o.consumed_at, completion_time),
        updated_at = completion_time
    where o.id = linked_offer_id;
  end if;

  update public.offers o
  set status = 'canceled',
      canceled_at = coalesce(o.canceled_at, completion_time),
      updated_at = completion_time
  where o.listing_id = listing_row.id
    and o.status in ('pending', 'accepted');

  update public.listings l
  set status = final_listing_status,
      updated_at = completion_time
  where l.id = listing_row.id;

  update public.profiles p
  set completed_sales_count = completed_sales_count + 1
  where p.id = caller_id;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'moderator_action'::public.audit_event_type,
    'transactions',
    inserted_transaction.id,
    jsonb_build_object(
      'source', 'complete_listing_transaction',
      'disposition', 'retail_completion',
      'listing_id', listing_row.id,
      'buyer_id', target_buyer_id,
      'accepted_offer_id', linked_offer_id,
      'outcome', target_outcome
    )
  );

  inserted_notification_id := private.create_notification_for_event(
    target_buyer_id,
    'transaction_completed'::public.notification_type,
    case
      when target_outcome = 'donated'::public.transaction_outcome then 'Donation completed'
      else 'Purchase completed'
    end,
    '"' || listing_row.title || '" was marked ' || target_outcome::text || '. You can now leave a review.',
    '/listing/' || listing_row.id::text,
    jsonb_build_object(
      'listingId', listing_row.id,
      'transactionId', inserted_transaction.id
    ),
    'transaction:' || inserted_transaction.id::text || ':completed:' || target_buyer_id::text
  );

  perform private.create_notification_for_event(
    caller_id,
    case
      when target_outcome = 'donated'::public.transaction_outcome
        then 'listing_donated'::public.notification_type
      else 'listing_sold'::public.notification_type
    end,
    case
      when target_outcome = 'donated'::public.transaction_outcome then 'Donation completed'
      else 'Listing sold'
    end,
    '"' || listing_row.title || '" was completed through ReTail.',
    '/listing/' || listing_row.id::text,
    jsonb_build_object(
      'listingId', listing_row.id,
      'transactionId', inserted_transaction.id
    ),
    'transaction:' || inserted_transaction.id::text || ':completed:' || caller_id::text
  );

  perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);

  return query
  select
    inserted_transaction.id,
    inserted_transaction.listing_id,
    inserted_transaction.buyer_id,
    inserted_transaction.seller_id,
    inserted_transaction.outcome,
    final_listing_status,
    inserted_transaction.completed_at,
    true,
    inserted_notification_id;
exception
  when unique_violation then
    perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);
    raise exception 'RETAIL_TRANSACTION_ALREADY_COMPLETED'
      using errcode = '23505';
  when others then
    perform set_config('retail.phase_e_trusted_transaction_write', 'false', true);
    raise;
end;
$function$;

revoke all on function public.complete_listing_transaction_phase_f_base(
  uuid,
  public.transaction_outcome,
  uuid
) from public, anon, authenticated;
grant execute on function public.complete_listing_transaction_phase_f_base(
  uuid,
  public.transaction_outcome,
  uuid
) to service_role;

create or replace function public.mark_my_listing_sold(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  listing_row public.listings%rowtype;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.seller_id = caller_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if listing_row.status = 'sold'::public.listing_status then
    return listing_row;
  end if;

  if listing_row.listing_type <> 'sale'::public.listing_type then
    raise exception 'RETAIL_TRANSACTION_OUTCOME_INVALID' using errcode = '22023';
  end if;

  if listing_row.status not in ('active'::public.listing_status, 'pending'::public.listing_status) then
    raise exception 'RETAIL_LISTING_NOT_AVAILABLE' using errcode = '55000';
  end if;

  if listing_row.reservation_payment_intent_id is not null
    or (
      listing_row.reserved_by is not null
      and listing_row.reserved_until is not null
      and listing_row.reserved_until > now()
    ) then
    raise exception 'RETAIL_LISTING_RESERVED' using errcode = '55P03';
  end if;

  if listing_row.reserved_by is not null then
    perform public.release_stripe_checkout_reservation(listing_row.id, listing_row.reserved_by, null);
  end if;

  update public.offers o
  set status = 'canceled',
      canceled_at = coalesce(o.canceled_at, now()),
      updated_at = now()
  where o.listing_id = listing_row.id
    and o.status in ('pending', 'accepted');

  update public.listings l
  set status = 'sold'::public.listing_status,
      updated_at = now()
  where l.id = listing_row.id
  returning * into listing_row;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'listing_updated'::public.audit_event_type,
    'listings',
    listing_row.id,
    jsonb_build_object(
      'source', 'mark_my_listing_sold',
      'disposition', 'outside_retail',
      'status', 'sold'
    )
  );

  return listing_row;
end;
$function$;

revoke all on function public.mark_my_listing_sold(uuid) from public, anon;
grant execute on function public.mark_my_listing_sold(uuid) to authenticated, service_role;

comment on function public.mark_my_listing_sold(uuid) is
  'Backward-compatible outside-ReTail sold disposition. Does not create a transaction, recipient, review eligibility, or completion notification.';

create or replace function public.mark_my_listing_donated(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  listing_row public.listings%rowtype;
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.seller_id = caller_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if listing_row.status = 'donated'::public.listing_status then
    return listing_row;
  end if;

  if listing_row.status not in ('active'::public.listing_status, 'pending'::public.listing_status) then
    raise exception 'RETAIL_LISTING_NOT_AVAILABLE' using errcode = '55000';
  end if;

  if listing_row.reservation_payment_intent_id is not null
    or (
      listing_row.reserved_by is not null
      and listing_row.reserved_until is not null
      and listing_row.reserved_until > now()
    ) then
    raise exception 'RETAIL_LISTING_RESERVED' using errcode = '55P03';
  end if;

  if listing_row.reserved_by is not null then
    perform public.release_stripe_checkout_reservation(listing_row.id, listing_row.reserved_by, null);
  end if;

  update public.offers o
  set status = 'canceled',
      canceled_at = coalesce(o.canceled_at, now()),
      updated_at = now()
  where o.listing_id = listing_row.id
    and o.status in ('pending', 'accepted');

  update public.listings l
  set status = 'donated'::public.listing_status,
      updated_at = now()
  where l.id = listing_row.id
  returning * into listing_row;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'listing_updated'::public.audit_event_type,
    'listings',
    listing_row.id,
    jsonb_build_object(
      'source', 'mark_my_listing_donated',
      'disposition', 'outside_retail',
      'status', 'donated'
    )
  );

  return listing_row;
end;
$function$;

revoke all on function public.mark_my_listing_donated(uuid) from public, anon;
grant execute on function public.mark_my_listing_donated(uuid) to authenticated, service_role;

comment on function public.mark_my_listing_donated(uuid) is
  'Backward-compatible outside-ReTail donated disposition. Does not create a transaction, recipient, review eligibility, or completion notification.';
;
