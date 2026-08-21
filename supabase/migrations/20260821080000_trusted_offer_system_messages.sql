-- Allow only the server-authoritative marketplace offer RPCs to create
-- their presentation-only system messages. Direct user-created system
-- messages remain blocked by protect_message_phase_d_fields().

create or replace function public.create_marketplace_offer(
  target_conversation_id uuid,
  requested_amount_cents integer
)
returns public.offers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  conversation_row public.conversations%rowtype;
  listing_row public.listings%rowtype;
  created_offer public.offers%rowtype;
  created_message public.messages%rowtype;
  canonical_listing_cents integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  select *
  into conversation_row
  from public.conversations c
  where c.id = target_conversation_id
    and c.deleted_at is null
    and c.listing_id is not null;

  if not found then
    raise exception 'OFFER_CONVERSATION_NOT_AVAILABLE';
  end if;

  -- Initial marketplace offers are buyer -> seller.
  if caller_id <> conversation_row.buyer_id then
    raise exception 'OFFER_BUYER_REQUIRED';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = conversation_row.listing_id
    and l.deleted_at is null
  for update;

  if not found
     or listing_row.status <> 'active'
     or listing_row.listing_type <> 'sale'
     or listing_row.price is null then
    raise exception 'OFFER_LISTING_NOT_AVAILABLE';
  end if;

  if listing_row.seller_id <> conversation_row.seller_id then
    raise exception 'OFFER_LISTING_SELLER_MISMATCH';
  end if;

  if caller_id = listing_row.seller_id then
    raise exception 'OFFER_SELF_OFFER_FORBIDDEN';
  end if;

  if not private.is_account_active(conversation_row.seller_id) then
    raise exception 'OFFER_SELLER_NOT_AVAILABLE';
  end if;

  if private.is_blocked_between(caller_id, conversation_row.seller_id) then
    raise exception 'OFFER_BLOCKED';
  end if;

  canonical_listing_cents := round(listing_row.price * 100)::integer;

  if requested_amount_cents is null
     or requested_amount_cents <= 0
     or requested_amount_cents > canonical_listing_cents then
    raise exception 'OFFER_AMOUNT_INVALID';
  end if;

  -- Lazily expire stale pending offers before enforcing the one-pending rule.
  update public.offers
  set
    status = 'expired',
    updated_at = now()
  where conversation_id = target_conversation_id
    and status = 'pending'
    and expires_at <= now();

  if exists (
    select 1
    from public.offers o
    where o.conversation_id = target_conversation_id
      and o.proposer_id = caller_id
      and o.status = 'pending'
  ) then
    raise exception 'OFFER_ALREADY_PENDING';
  end if;

  insert into public.offers (
    conversation_id,
    listing_id,
    buyer_id,
    seller_id,
    proposer_id,
    amount_cents
  )
  values (
    conversation_row.id,
    listing_row.id,
    conversation_row.buyer_id,
    conversation_row.seller_id,
    caller_id,
    requested_amount_cents
  )
  returning * into created_offer;

  -- System-authored presentation message. It references the authoritative
  -- offer ID; the JSON text is not itself payment authority.
  perform set_config('retail.trusted_system_message', 'true', true);

  insert into public.messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    is_read
  )
  values (
    conversation_row.id,
    caller_id,
    'system'::public.message_type,
    'RETAIL_OFFER::' ||
      jsonb_build_object(
        'offerId', created_offer.id,
        'kind', 'offer',
        'amount', to_char(requested_amount_cents / 100.0, 'FM999999990.00'),
        'status', 'pending'
      )::text,
    false
  )
  returning * into created_message;

  perform set_config('retail.trusted_system_message', 'false', true);

  update public.offers
  set
    message_id = created_message.id,
    updated_at = now()
  where id = created_offer.id
  returning * into created_offer;

  perform private.create_notification_for_event(
    conversation_row.seller_id,
    'message'::public.notification_type,
    'New offer',
    'You received a new offer on ReTail.',
    '/messages/' || conversation_row.id::text,
    jsonb_build_object(
      'conversationId', conversation_row.id,
      'listingId', listing_row.id,
      'offerId', created_offer.id,
      'messageId', created_message.id
    ),
    'offer:new:' || created_offer.id::text
  );

  return created_offer;
end;
$function$;

create or replace function public.respond_to_marketplace_offer(
  target_offer_id uuid,
  requested_action text,
  requested_counter_amount_cents integer default null
)
returns public.offers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  offer_row public.offers%rowtype;
  listing_row public.listings%rowtype;
  resulting_offer public.offers%rowtype;
  created_message public.messages%rowtype;
  recipient_id uuid;
  canonical_listing_cents integer;
  normalized_action text := lower(trim(coalesce(requested_action, '')));
begin
  if caller_id is null then
    raise exception 'Authentication is required';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'Account is not active';
  end if;

  select *
  into offer_row
  from public.offers o
  where o.id = target_offer_id
  for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if offer_row.status = 'pending' and offer_row.expires_at <= now() then
    update public.offers
    set
      status = 'expired',
      updated_at = now()
    where id = offer_row.id;

    raise exception 'OFFER_EXPIRED';
  end if;

  if offer_row.status <> 'pending' then
    raise exception 'OFFER_NOT_ACTIONABLE';
  end if;

  recipient_id := case
    when offer_row.proposer_id = offer_row.buyer_id
      then offer_row.seller_id
    else offer_row.buyer_id
  end;

  if caller_id <> recipient_id then
    raise exception 'OFFER_RESPONSE_NOT_AUTHORIZED';
  end if;

  if not private.is_account_active(offer_row.buyer_id)
     or not private.is_account_active(offer_row.seller_id) then
    raise exception 'OFFER_PARTICIPANT_NOT_AVAILABLE';
  end if;

  if private.is_blocked_between(offer_row.buyer_id, offer_row.seller_id) then
    raise exception 'OFFER_BLOCKED';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = offer_row.listing_id
    and l.deleted_at is null
  for update;

  if normalized_action in ('accept', 'counter') then
    if not found
       or listing_row.status <> 'active'
       or listing_row.listing_type <> 'sale'
       or listing_row.price is null then
      raise exception 'OFFER_LISTING_NOT_AVAILABLE';
    end if;
  end if;

  if normalized_action = 'accept' then
    -- Clear previously accepted offers whose checkout window has elapsed.
    update public.offers
    set
      status = 'expired',
      updated_at = now()
    where listing_id = offer_row.listing_id
      and status = 'accepted'
      and accepted_expires_at is not null
      and accepted_expires_at <= now();

    begin
      update public.offers
      set
        status = 'accepted',
        accepted_at = now(),
        accepted_expires_at = now() + interval '24 hours',
        updated_at = now()
      where id = offer_row.id
      returning * into resulting_offer;
    exception
      when unique_violation then
        raise exception 'OFFER_LISTING_ALREADY_HAS_ACCEPTED_OFFER';
    end;

    perform set_config('retail.trusted_system_message', 'true', true);

  insert into public.messages (
      conversation_id,
      sender_id,
      message_type,
      body,
      is_read
    )
    values (
      offer_row.conversation_id,
      caller_id,
      'system'::public.message_type,
      'RETAIL_OFFER::' ||
        jsonb_build_object(
          'offerId', resulting_offer.id,
          'kind', 'offer_response',
          'amount', to_char(resulting_offer.amount_cents / 100.0, 'FM999999990.00'),
          'status', 'accepted'
        )::text,
      false
    )
    returning * into created_message;

  perform set_config('retail.trusted_system_message', 'false', true);

    perform private.create_notification_for_event(
      offer_row.proposer_id,
      'message'::public.notification_type,
      'Offer accepted',
      'Your ReTail offer was accepted.',
      '/messages/' || offer_row.conversation_id::text,
      jsonb_build_object(
        'conversationId', offer_row.conversation_id,
        'listingId', offer_row.listing_id,
        'offerId', resulting_offer.id,
        'messageId', created_message.id
      ),
      'offer:accepted:' || resulting_offer.id::text
    );

    return resulting_offer;

  elsif normalized_action = 'decline' then
    update public.offers
    set
      status = 'declined',
      declined_at = now(),
      updated_at = now()
    where id = offer_row.id
    returning * into resulting_offer;

    perform set_config('retail.trusted_system_message', 'true', true);

  insert into public.messages (
      conversation_id,
      sender_id,
      message_type,
      body,
      is_read
    )
    values (
      offer_row.conversation_id,
      caller_id,
      'system'::public.message_type,
      'RETAIL_OFFER::' ||
        jsonb_build_object(
          'offerId', resulting_offer.id,
          'kind', 'offer_response',
          'amount', to_char(resulting_offer.amount_cents / 100.0, 'FM999999990.00'),
          'status', 'declined'
        )::text,
      false
    )
    returning * into created_message;

  perform set_config('retail.trusted_system_message', 'false', true);

    perform private.create_notification_for_event(
      offer_row.proposer_id,
      'message'::public.notification_type,
      'Offer declined',
      'Your ReTail offer was declined.',
      '/messages/' || offer_row.conversation_id::text,
      jsonb_build_object(
        'conversationId', offer_row.conversation_id,
        'listingId', offer_row.listing_id,
        'offerId', resulting_offer.id,
        'messageId', created_message.id
      ),
      'offer:declined:' || resulting_offer.id::text
    );

    return resulting_offer;

  elsif normalized_action = 'counter' then
    canonical_listing_cents := round(listing_row.price * 100)::integer;

    if requested_counter_amount_cents is null
       or requested_counter_amount_cents <= 0
       or requested_counter_amount_cents > canonical_listing_cents then
      raise exception 'OFFER_COUNTER_AMOUNT_INVALID';
    end if;

    update public.offers
    set
      status = 'superseded',
      superseded_at = now(),
      updated_at = now()
    where id = offer_row.id;

    insert into public.offers (
      conversation_id,
      listing_id,
      buyer_id,
      seller_id,
      proposer_id,
      parent_offer_id,
      amount_cents
    )
    values (
      offer_row.conversation_id,
      offer_row.listing_id,
      offer_row.buyer_id,
      offer_row.seller_id,
      caller_id,
      offer_row.id,
      requested_counter_amount_cents
    )
    returning * into resulting_offer;

    perform set_config('retail.trusted_system_message', 'true', true);

  insert into public.messages (
      conversation_id,
      sender_id,
      message_type,
      body,
      is_read
    )
    values (
      offer_row.conversation_id,
      caller_id,
      'system'::public.message_type,
      'RETAIL_OFFER::' ||
        jsonb_build_object(
          'offerId', resulting_offer.id,
          'parentOfferId', offer_row.id,
          'kind', 'counter_offer',
          'amount', to_char(resulting_offer.amount_cents / 100.0, 'FM999999990.00'),
          'status', 'pending'
        )::text,
      false
    )
    returning * into created_message;

  perform set_config('retail.trusted_system_message', 'false', true);

    update public.offers
    set
      message_id = created_message.id,
      updated_at = now()
    where id = resulting_offer.id
    returning * into resulting_offer;

    perform private.create_notification_for_event(
      offer_row.proposer_id,
      'message'::public.notification_type,
      'Counteroffer',
      'You received a ReTail counteroffer.',
      '/messages/' || offer_row.conversation_id::text,
      jsonb_build_object(
        'conversationId', offer_row.conversation_id,
        'listingId', offer_row.listing_id,
        'offerId', resulting_offer.id,
        'messageId', created_message.id
      ),
      'offer:counter:' || resulting_offer.id::text
    );

    return resulting_offer;
  end if;

  raise exception 'OFFER_ACTION_INVALID';
end;
$function$;
