-- Add explicit seller-controlled availability transitions. Existing listing
-- triggers continue to block lifecycle changes while checkout is reserved and
-- re-check payout readiness when a paid listing returns to active.

create or replace function public.mark_my_listing_pending(target_listing_id uuid)
returns public.listings
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
    and l.seller_id = caller_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if listing_row.status <> 'active'::public.listing_status then
    raise exception 'RETAIL_LISTING_STATE_STALE' using errcode = '55000';
  end if;

  update public.listings l
  set status = 'pending'::public.listing_status
  where l.id = listing_row.id
  returning * into listing_row;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'listing_updated',
    'listings',
    listing_row.id,
    jsonb_build_object('status', 'pending', 'source', 'mark_my_listing_pending')
  );

  return listing_row;
end;
$function$;

create or replace function public.activate_my_listing(target_listing_id uuid)
returns public.listings
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
    and l.seller_id = caller_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if listing_row.status <> 'pending'::public.listing_status then
    raise exception 'RETAIL_LISTING_STATE_STALE' using errcode = '55000';
  end if;

  update public.listings l
  set status = 'active'::public.listing_status,
      published_at = coalesce(l.published_at, now())
  where l.id = listing_row.id
  returning * into listing_row;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (
    caller_id,
    'listing_updated',
    'listings',
    listing_row.id,
    jsonb_build_object('status', 'active', 'source', 'activate_my_listing')
  );

  return listing_row;
end;
$function$;

revoke all on function public.mark_my_listing_pending(uuid) from public;
revoke all on function public.mark_my_listing_pending(uuid) from anon;
grant execute on function public.mark_my_listing_pending(uuid) to authenticated;
grant execute on function public.mark_my_listing_pending(uuid) to service_role;

revoke all on function public.activate_my_listing(uuid) from public;
revoke all on function public.activate_my_listing(uuid) from anon;
grant execute on function public.activate_my_listing(uuid) to authenticated;
grant execute on function public.activate_my_listing(uuid) to service_role;
