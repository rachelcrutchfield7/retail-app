-- ReTail Security Phase D.1 rollback-only database verification.
--
-- This verifies the database-only portions of D.1. Storage API upload/send
-- verification lives in securityPhaseD1Live.test.mjs because Storage writes
-- cannot be rolled back with a PostgreSQL transaction.

begin;

create temp table phase_d1_results (
  check_name text primary key,
  passed boolean not null,
  details text
) on commit drop;

do $$
declare
  conversation_id uuid := '8d274cec-99b0-4ef3-97d5-b732b9bb2919';
  uploader_id uuid := '31a35682-e53c-47df-8535-03779ca9be63';
  file_id uuid := 'a94ed0ca-c27c-4bd4-a52c-cf8da18439fa';
  fixture_listing public.listings%rowtype;
  buyer public.profiles%rowtype;
  conversation_row public.conversations%rowtype;
  system_error text;
begin
  insert into phase_d1_results values (
    'valid jpg path',
    private.is_valid_message_attachment_path(conversation_id || '/' || uploader_id || '/' || file_id || '.jpg', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'valid jpeg path',
    private.is_valid_message_attachment_path(conversation_id || '/' || uploader_id || '/' || file_id || '.jpeg', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'valid png path',
    private.is_valid_message_attachment_path(conversation_id || '/' || uploader_id || '/' || file_id || '.png', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'valid webp path',
    private.is_valid_message_attachment_path(conversation_id || '/' || uploader_id || '/' || file_id || '.webp', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'uppercase extension rejected',
    not private.is_valid_message_attachment_path(conversation_id || '/' || uploader_id || '/' || file_id || '.JPG', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'wrong conversation rejected',
    not private.is_valid_message_attachment_path('00000000-0000-0000-0000-000000000000/' || uploader_id || '/' || file_id || '.jpg', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'wrong uploader rejected',
    not private.is_valid_message_attachment_path(conversation_id || '/00000000-0000-0000-0000-000000000000/' || file_id || '.jpg', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'external url rejected',
    not private.is_valid_message_attachment_path('https://example.com/image.jpg', conversation_id, uploader_id),
    null
  );

  insert into phase_d1_results values (
    'unsupported extension rejected',
    not private.is_valid_message_attachment_path(conversation_id || '/' || uploader_id || '/' || file_id || '.svg', conversation_id, uploader_id),
    null
  );

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

  select p.*
  into buyer
  from public.profiles p
  where p.id <> fixture_listing.seller_id
    and p.deleted_at is null
    and p.is_banned = false
  order by p.created_at desc
  limit 1;

  perform set_config('request.jwt.claim.sub', buyer.id::text, true);
  conversation_row := public.create_or_get_conversation(fixture_listing.id);

  begin
    perform public.send_message(
      conversation_row.id,
      'system'::public.message_type,
      'Forged ReTail notice',
      null,
      null,
      null,
      null,
      null,
      null
    );
  exception
    when others then
      system_error := sqlerrm;
  end;

  insert into phase_d1_results values (
    'system message rejected',
    system_error like '%RETAIL_SYSTEM_MESSAGE_FORBIDDEN%',
    system_error
  );
end $$;

select *
from phase_d1_results
order by check_name;

rollback;
