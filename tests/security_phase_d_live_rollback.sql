-- ReTail Security Phase D live authorization verification.
--
-- Run this in the Supabase SQL editor or through an authenticated database
-- connection after Phase D has been applied. The script intentionally wraps
-- all behavior checks in a transaction and rolls back at the end.
--
-- Requirements:
-- - at least one active listing
-- - the listing seller has an active profile
-- - at least one other active profile exists to act as the buyer

begin;

create temp table phase_d_results (
  check_name text primary key,
  passed boolean not null,
  details text
) on commit drop;

do $$
declare
  fixture_listing public.listings%rowtype;
  buyer public.profiles%rowtype;
  conversation_one public.conversations%rowtype;
  conversation_two public.conversations%rowtype;
  sent_message public.messages%rowtype;
  read_count integer;
  blocked_error text;
  own_listing_error text;
  attachment_error text;
begin
  select l.*
  into fixture_listing
  from public.listings l
  join public.profiles seller on seller.id = l.seller_id
  where l.status = 'active'
    and l.deleted_at is null
    and seller.deleted_at is null
    and seller.is_banned = false
  order by l.created_at desc
  limit 1;

  if fixture_listing.id is null then
    raise exception 'No active listing fixture is available';
  end if;

  select p.*
  into buyer
  from public.profiles p
  where p.id <> fixture_listing.seller_id
    and p.deleted_at is null
    and p.is_banned = false
  order by p.created_at desc
  limit 1;

  if buyer.id is null then
    raise exception 'No buyer profile fixture is available';
  end if;

  insert into phase_d_results values ('fixture available', true, fixture_listing.id::text);

  perform set_config('request.jwt.claim.sub', buyer.id::text, true);

  conversation_one := public.create_or_get_conversation(fixture_listing.id);
  insert into phase_d_results values (
    'create conversation derives participants',
    conversation_one.buyer_id = buyer.id
      and conversation_one.seller_id = fixture_listing.seller_id
      and conversation_one.listing_id = fixture_listing.id,
    conversation_one.id::text
  );

  conversation_two := public.create_or_get_conversation(fixture_listing.id);
  insert into phase_d_results values (
    'duplicate conversation reused',
    conversation_two.id = conversation_one.id,
    conversation_two.id::text
  );

  sent_message := public.send_message(conversation_one.id, 'text'::public.message_type, 'Phase D rollback test message', null, null, null, null, null, null);
  insert into phase_d_results values (
    'send text message derives sender',
    sent_message.sender_id = buyer.id
      and sent_message.conversation_id = conversation_one.id
      and sent_message.message_type = 'text',
    sent_message.id::text
  );

  begin
    perform public.send_message(
      conversation_one.id,
      'image'::public.message_type,
      null,
      'message-images',
      'https://example.com/not-owned.jpg',
      'image/jpeg',
      128,
      null,
      null
    );
  exception
    when others then
      attachment_error := sqlerrm;
  end;

  insert into phase_d_results values (
    'external attachment rejected',
    attachment_error is not null,
    attachment_error
  );

  perform set_config('request.jwt.claim.sub', fixture_listing.seller_id::text, true);

  perform public.send_message(conversation_one.id, 'text'::public.message_type, 'Seller reply for read-state test', null, null, null, null, null, null);

  perform set_config('request.jwt.claim.sub', buyer.id::text, true);

  read_count := public.mark_conversation_read(conversation_one.id);
  insert into phase_d_results values (
    'mark read only recipient messages',
    read_count >= 1,
    read_count::text
  );

  perform set_config('request.jwt.claim.sub', fixture_listing.seller_id::text, true);

  begin
    perform public.create_or_get_conversation(fixture_listing.id);
  exception
    when others then
      own_listing_error := sqlerrm;
  end;

  insert into phase_d_results values (
    'own listing conversation denied',
    own_listing_error is not null,
    own_listing_error
  );

  perform set_config('request.jwt.claim.sub', buyer.id::text, true);
  perform public.block_user(fixture_listing.seller_id);

  begin
    perform public.send_message(conversation_one.id, 'text'::public.message_type, 'This should be blocked', null, null, null, null, null, null);
  exception
    when others then
      blocked_error := sqlerrm;
  end;

  insert into phase_d_results values (
    'block prevents messages',
    blocked_error is not null,
    blocked_error
  );
end $$;

select *
from phase_d_results
order by check_name;

rollback;
