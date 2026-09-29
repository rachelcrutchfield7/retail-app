-- Enforce donation-recipient and blocked-user rules at the conversations table
-- boundary so direct Data API inserts cannot bypass create_or_get_conversation.

create or replace function private.is_verified_rescue_recipient(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select target_user_id is not null
    and private.is_account_active(target_user_id)
    and exists (
      select 1
      from public.profiles p
      join public.rescue_profiles rp
        on rp.owner_id = p.id
      where p.id = target_user_id
        and p.account_type = 'rescue'::public.account_type
        and p.deleted_at is null
        and p.is_banned = false
        and rp.deleted_at is null
        and rp.is_active = true
        and rp.is_verified = true
        and rp.verification_status = 'verified'
    );
$function$;
revoke all on function private.is_verified_rescue_recipient(uuid)
from public, anon, authenticated;
create or replace function private.enforce_phase_f_conversation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := private.require_active_account();
  listing_row public.listings%rowtype;
  admin_report_message_context boolean :=
    coalesce(current_setting('retail.trusted_admin_report_message', true), 'false') = 'true';
begin
  if admin_report_message_context then
    return new;
  end if;

  if new.buyer_id is distinct from caller_id then
    raise exception 'RETAIL_CONVERSATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  if private.is_blocked_between(new.buyer_id, new.seller_id) then
    raise exception 'RETAIL_MESSAGE_BLOCKED'
      using errcode = '42501';
  end if;

  if new.listing_id is not null then
    select *
    into listing_row
    from public.listings l
    where l.id = new.listing_id
      and l.seller_id = new.seller_id
      and l.status = 'active'::public.listing_status
      and l.deleted_at is null;

    if not found or not private.is_account_active(new.seller_id) then
      raise exception 'RETAIL_CONVERSATION_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    if listing_row.listing_type = 'donation'::public.listing_type
      and not private.is_verified_rescue_recipient(new.buyer_id) then
      raise exception 'RETAIL_VERIFIED_RESCUE_REQUIRED'
        using errcode = '42501';
    end if;
  end if;

  if coalesce(current_setting('retail.phase_f_conversation_rate_checked', true), 'false') <> 'true' then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
  end if;

  return new;
end;
$function$;
revoke all on function private.enforce_phase_f_conversation_insert()
from public, anon, authenticated;
create or replace function private.enforce_donation_transaction_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_listing_type public.listing_type;
begin
  select l.listing_type
  into target_listing_type
  from public.listings l
  where l.id = new.listing_id;

  if target_listing_type = 'donation'::public.listing_type
    and not private.is_verified_rescue_recipient(new.buyer_id) then
    raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
revoke all on function private.enforce_donation_transaction_recipient()
from public, anon, authenticated;
drop trigger if exists enforce_donation_transaction_recipient
on public.transactions;
create trigger enforce_donation_transaction_recipient
before insert or update of listing_id, buyer_id, outcome
on public.transactions
for each row
execute function private.enforce_donation_transaction_recipient();
create or replace function public.create_or_get_conversation(target_listing_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := private.require_active_account();
  listing_row public.listings%rowtype;
begin
  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
    and l.status = 'active'::public.listing_status
    and l.deleted_at is null;

  if not found then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
    raise exception 'Listing is not available';
  end if;

  if caller_id = listing_row.seller_id then
    raise exception 'Users cannot message themselves' using errcode = '42501';
  end if;

  if listing_row.listing_type = 'donation'::public.listing_type
    and not private.is_verified_rescue_recipient(caller_id) then
    raise exception 'RETAIL_VERIFIED_RESCUE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.listing_id = target_listing_id
      and c.buyer_id = caller_id
      and c.seller_id = listing_row.seller_id
      and c.deleted_at is null
  ) then
    perform private.check_rate_limit('conversation_create_attempt', 'global', 20, interval '1 hour');
  end if;

  perform set_config('retail.phase_f_conversation_rate_checked', 'true', true);
  return public.create_or_get_conversation_phase_f_base(target_listing_id);
exception
  when others then
    perform set_config('retail.phase_f_conversation_rate_checked', 'false', true);
    raise;
end;
$function$;
revoke all on function public.create_or_get_conversation(uuid)
from public, anon;
grant execute on function public.create_or_get_conversation(uuid)
to authenticated, service_role;
