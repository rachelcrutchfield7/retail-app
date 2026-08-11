-- ReTail product policy and transaction support readiness.
-- Forward-only: adds support cases, rescue public address opt-in, and current
-- consent policy versions. Does not change Stripe payment/refund behavior.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'support_case_status') then
    create type public.support_case_status as enum (
      'open',
      'reviewing',
      'waiting_on_buyer',
      'waiting_on_seller',
      'resolved',
      'closed'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'support_case_requester_role') then
    create type public.support_case_requester_role as enum (
      'buyer',
      'seller'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'support_case_issue_category') then
    create type public.support_case_issue_category as enum (
      'cancel_order',
      'seller_not_shipped',
      'package_not_arrived',
      'item_arrived_damaged',
      'item_not_as_described',
      'wrong_item_received',
      'return_refund_request',
      'payment_problem',
      'payout_problem',
      'shipping_problem',
      'buyer_transaction_issue',
      'other_order_issue',
      'other_sale_issue'
    );
  end if;
end $$;

create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  requester_role public.support_case_requester_role not null,
  issue_category public.support_case_issue_category not null,
  description text not null,
  status public.support_case_status not null default 'open',
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  internal_admin_notes text,
  customer_visible_message text,
  current_payment_status text,
  current_shipment_status text,
  current_delivery_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at timestamptz,
  constraint support_cases_description_length
    check (char_length(btrim(description)) between 10 and 4000),
  constraint support_cases_admin_notes_length
    check (internal_admin_notes is null or char_length(internal_admin_notes) <= 6000),
  constraint support_cases_customer_message_length
    check (customer_visible_message is null or char_length(customer_visible_message) <= 3000),
  constraint support_cases_requester_is_party
    check (
      (requester_role = 'buyer' and requester_id = buyer_id)
      or (requester_role = 'seller' and requester_id = seller_id)
    ),
  constraint support_cases_distinct_parties
    check (buyer_id is distinct from seller_id)
);

drop trigger if exists set_support_cases_updated_at on public.support_cases;
create trigger set_support_cases_updated_at
  before update on public.support_cases
  for each row execute function public.set_updated_at();

alter table public.support_cases enable row level security;

revoke all on table public.support_cases from public, anon, authenticated;
grant select on table public.support_cases to authenticated;

create index if not exists idx_support_cases_transaction
  on public.support_cases(transaction_id, created_at desc);

create index if not exists idx_support_cases_requester
  on public.support_cases(requester_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_support_cases_parties
  on public.support_cases(buyer_id, seller_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_support_cases_admin_queue
  on public.support_cases(status, created_at desc)
  where deleted_at is null;

drop policy if exists "Support case parties can read their cases" on public.support_cases;
create policy "Support case parties can read their cases"
on public.support_cases
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and deleted_at is null
  and (
    requester_id = auth.uid()
    or buyer_id = auth.uid()
    or seller_id = auth.uid()
  )
);

drop policy if exists "Admins can read support cases" on public.support_cases;
create policy "Admins can read support cases"
on public.support_cases
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and private.is_admin(auth.uid())
);

create or replace function public.create_transaction_support_case(
  target_transaction_id uuid,
  requested_requester_role text,
  requested_issue_category text,
  requested_description text
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  transaction_row public.transactions;
  inserted_case public.support_cases;
  safe_role public.support_case_requester_role;
  safe_category public.support_case_issue_category;
  safe_description text := btrim(coalesce(requested_description, ''));
begin
  if target_transaction_id is null then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into transaction_row
  from public.transactions
  where id = target_transaction_id
    and deleted_at is null
  for share;

  if not found then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if transaction_row.buyer_id is null or transaction_row.seller_id is null then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_PARTIES_REQUIRED'
      using errcode = '22023';
  end if;

  if caller_id not in (transaction_row.buyer_id, transaction_row.seller_id) then
    raise exception 'RETAIL_SUPPORT_TRANSACTION_FORBIDDEN'
      using errcode = '42501';
  end if;

  if safe_description = '' or char_length(safe_description) < 10 then
    raise exception 'RETAIL_SUPPORT_DESCRIPTION_REQUIRED'
      using errcode = '22023';
  end if;

  if char_length(safe_description) > 4000 then
    raise exception 'RETAIL_SUPPORT_DESCRIPTION_TOO_LONG'
      using errcode = '22023';
  end if;

  if requested_requester_role not in ('buyer', 'seller') then
    raise exception 'RETAIL_SUPPORT_REQUESTER_ROLE_INVALID'
      using errcode = '22023';
  end if;

  safe_role := requested_requester_role::public.support_case_requester_role;

  if safe_role = 'buyer' and caller_id is distinct from transaction_row.buyer_id then
    raise exception 'RETAIL_SUPPORT_BUYER_REQUIRED'
      using errcode = '42501';
  end if;

  if safe_role = 'seller' and caller_id is distinct from transaction_row.seller_id then
    raise exception 'RETAIL_SUPPORT_SELLER_REQUIRED'
      using errcode = '42501';
  end if;

  if requested_issue_category not in (
    'cancel_order',
    'seller_not_shipped',
    'package_not_arrived',
    'item_arrived_damaged',
    'item_not_as_described',
    'wrong_item_received',
    'return_refund_request',
    'payment_problem',
    'payout_problem',
    'shipping_problem',
    'buyer_transaction_issue',
    'other_order_issue',
    'other_sale_issue'
  ) then
    raise exception 'RETAIL_SUPPORT_ISSUE_CATEGORY_INVALID'
      using errcode = '22023';
  end if;

  safe_category := requested_issue_category::public.support_case_issue_category;

  insert into public.support_cases (
    transaction_id,
    listing_id,
    buyer_id,
    seller_id,
    requester_id,
    requester_role,
    issue_category,
    description,
    current_payment_status
  )
  values (
    transaction_row.id,
    transaction_row.listing_id,
    transaction_row.buyer_id,
    transaction_row.seller_id,
    caller_id,
    safe_role,
    safe_category,
    safe_description,
    transaction_row.payment_status
  )
  returning * into inserted_case;

  return inserted_case;
end;
$$;

revoke all on function public.create_transaction_support_case(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_transaction_support_case(uuid, text, text, text)
  to authenticated;

create or replace function public.get_my_transaction_support_cases()
returns setof public.support_cases
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  return query
  select sc.*
  from public.support_cases sc
  where sc.deleted_at is null
    and (
      sc.requester_id = caller_id
      or sc.buyer_id = caller_id
      or sc.seller_id = caller_id
    )
  order by sc.created_at desc;
end;
$$;

revoke all on function public.get_my_transaction_support_cases()
  from public, anon, authenticated;
grant execute on function public.get_my_transaction_support_cases()
  to authenticated;

create or replace function public.get_admin_transaction_support_cases(requested_view text default 'active')
returns setof public.support_cases
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_view text := coalesce(nullif(btrim(requested_view), ''), 'active');
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  if safe_view not in ('active', 'archived') then
    raise exception 'RETAIL_SUPPORT_VIEW_INVALID'
      using errcode = '22023';
  end if;

  return query
  select sc.*
  from public.support_cases sc
  where sc.deleted_at is null
    and (
      (safe_view = 'active' and sc.status in ('open', 'reviewing', 'waiting_on_buyer', 'waiting_on_seller'))
      or (safe_view = 'archived' and sc.status in ('resolved', 'closed'))
    )
  order by sc.created_at desc;
end;
$$;

revoke all on function public.get_admin_transaction_support_cases(text)
  from public, anon, authenticated;
grant execute on function public.get_admin_transaction_support_cases(text)
  to authenticated;

create or replace function public.admin_update_transaction_support_case(
  target_case_id uuid,
  requested_status text,
  requested_internal_note text default null,
  requested_customer_message text default null
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_status public.support_case_status;
  safe_internal_note text := nullif(btrim(coalesce(requested_internal_note, '')), '');
  safe_customer_message text := nullif(btrim(coalesce(requested_customer_message, '')), '');
  updated_case public.support_cases;
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  if requested_status not in ('open', 'reviewing', 'waiting_on_buyer', 'waiting_on_seller', 'resolved', 'closed') then
    raise exception 'RETAIL_SUPPORT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  safe_status := requested_status::public.support_case_status;

  update public.support_cases
  set
    status = safe_status,
    assigned_admin_id = caller_id,
    internal_admin_notes = safe_internal_note,
    customer_visible_message = safe_customer_message,
    resolved_at = case
      when safe_status in ('resolved', 'closed') then coalesce(resolved_at, now())
      else null
    end
  where id = target_case_id
    and deleted_at is null
  returning * into updated_case;

  if not found then
    raise exception 'RETAIL_SUPPORT_CASE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if safe_customer_message is not null then
    perform set_config('retail.phase_e_trusted_notification_write', 'true', true);

    insert into public.notifications (user_id, type, title, body, data)
    values (
      updated_case.requester_id,
      'system'::public.notification_type,
      'Support case updated',
      safe_customer_message,
      jsonb_build_object(
        'supportCaseId', updated_case.id,
        'transactionId', updated_case.transaction_id,
        'listingId', updated_case.listing_id,
        'supportStatus', updated_case.status
      )
    );

    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
  end if;

  return updated_case;
exception
  when others then
    perform set_config('retail.phase_e_trusted_notification_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.admin_update_transaction_support_case(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_transaction_support_case(uuid, text, text, text)
  to authenticated;

alter table public.privacy_settings
  add column if not exists rescue_public_address_enabled boolean not null default false;

create or replace function public.get_public_rescue_feed_v2(
  page_number integer default 1,
  page_size integer default 20,
  search_query text default null
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  slug text,
  summary text,
  animals_rescued text[],
  city text,
  state text,
  zip_code text,
  address_line1 text,
  address_line2 text,
  website_url text,
  contact_hint text,
  organization_type text,
  has_501c3 boolean,
  is_verified boolean,
  needs jsonb,
  wishlist_items jsonb,
  distance_band text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rp.id,
    rp.owner_id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.zip_code else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line1 else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line2 else null end,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end,
    rp.organization_type,
    rp.has_501c3,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ),
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ),
    null::text
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null
    and (search_query is null or search_query = '' or (
      rp.name ilike '%' || search_query || '%'
      or rp.summary ilike '%' || search_query || '%'
      or coalesce(rp.website_url, '') ilike '%' || search_query || '%'
      or array_to_string(rp.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1 from public.rescue_needs rn
        where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1 from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by rp.name asc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create or replace function public.get_public_rescue_by_owner_v2(target_owner_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  slug text,
  summary text,
  animals_rescued text[],
  city text,
  state text,
  zip_code text,
  address_line1 text,
  address_line2 text,
  website_url text,
  contact_hint text,
  organization_type text,
  has_501c3 boolean,
  is_verified boolean,
  needs jsonb,
  wishlist_items jsonb,
  distance_band text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rp.id,
    rp.owner_id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.zip_code else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line1 else null end,
    case when coalesce(ps.rescue_public_address_enabled, false) then rp.address_line2 else null end,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end,
    rp.organization_type,
    rp.has_501c3,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ),
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ),
    null::text
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.owner_id = target_owner_id
    and rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null;
$$;

revoke all on function public.get_public_rescue_feed_v2(integer, integer, text) from public, anon, authenticated;
grant execute on function public.get_public_rescue_feed_v2(integer, integer, text) to anon, authenticated;

revoke all on function public.get_public_rescue_by_owner_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_public_rescue_by_owner_v2(uuid) to anon, authenticated;

create or replace function private.has_current_policy_acceptance(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'terms_of_service'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    )
    and exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'community_guidelines'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    )
    and exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'privacy_acknowledgment'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    );
$$;

revoke all on function private.has_current_policy_acceptance(uuid)
  from public, anon, authenticated;

create or replace function public.get_my_consent_state()
returns table (
  has_current_policy_acceptance boolean,
  terms_accepted boolean,
  community_guidelines_accepted boolean,
  privacy_acknowledged boolean,
  marketing_email_opt_in boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  return query
  select
    private.has_current_policy_acceptance(caller_id),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'terms_of_service'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    ),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'community_guidelines'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    ),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'privacy_acknowledgment'
        and consent.policy_version = '2026-08-10'
        and consent.granted = true
    ),
    private.latest_marketing_email_preference(caller_id);
end;
$$;

revoke all on function public.get_my_consent_state()
  from public, anon, authenticated;
grant execute on function public.get_my_consent_state()
  to authenticated;

create or replace function public.record_my_policy_acceptance(
  requested_terms_version text,
  requested_community_guidelines_version text,
  requested_privacy_version text,
  requested_marketing_email_opt_in boolean,
  requested_source text
)
returns table (
  has_current_policy_acceptance boolean,
  terms_accepted boolean,
  community_guidelines_accepted boolean,
  privacy_acknowledged boolean,
  marketing_email_opt_in boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  acceptance_was_current boolean;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  if requested_terms_version <> '2026-08-10'
    or requested_community_guidelines_version <> '2026-08-10'
    or requested_privacy_version <> '2026-08-10' then
    raise exception 'RETAIL_POLICY_VERSION_MISMATCH'
      using errcode = '22023';
  end if;

  if requested_source not in ('email_signup', 'google_signup', 'legacy_user_gate') then
    raise exception 'RETAIL_CONSENT_SOURCE_INVALID'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('retail-policy-consent:' || caller_id::text, 0)
  );

  acceptance_was_current := private.has_current_policy_acceptance(caller_id);

  if not exists (
    select 1 from public.user_consents consent
    where consent.user_id = caller_id
      and consent.consent_type = 'terms_of_service'
      and consent.policy_version = requested_terms_version
      and consent.granted = true
  ) then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'terms_of_service', requested_terms_version, true, requested_source);
  end if;

  if not exists (
    select 1 from public.user_consents consent
    where consent.user_id = caller_id
      and consent.consent_type = 'community_guidelines'
      and consent.policy_version = requested_community_guidelines_version
      and consent.granted = true
  ) then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'community_guidelines', requested_community_guidelines_version, true, requested_source);
  end if;

  if not exists (
    select 1 from public.user_consents consent
    where consent.user_id = caller_id
      and consent.consent_type = 'privacy_acknowledgment'
      and consent.policy_version = requested_privacy_version
      and consent.granted = true
  ) then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'privacy_acknowledgment', requested_privacy_version, true, requested_source);
  end if;

  if not acceptance_was_current then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (caller_id, 'marketing_email', null, coalesce(requested_marketing_email_opt_in, false), requested_source);
  end if;

  return query select * from public.get_my_consent_state();
end;
$$;

revoke all on function public.record_my_policy_acceptance(text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_my_policy_acceptance(text, text, text, boolean, text)
  to authenticated;

create or replace function private.record_email_signup_consents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce((metadata ->> 'retail_policy_consent_pending')::boolean, false) = true
    and coalesce((metadata ->> 'retail_terms_accepted')::boolean, false) = true
    and metadata ->> 'retail_terms_version' = '2026-08-10'
    and coalesce((metadata ->> 'retail_community_guidelines_accepted')::boolean, false) = true
    and metadata ->> 'retail_community_guidelines_version' = '2026-08-10'
    and coalesce((metadata ->> 'retail_privacy_acknowledged')::boolean, false) = true
    and metadata ->> 'retail_privacy_version' = '2026-08-10'
    and metadata ->> 'retail_consent_source' = 'email_signup' then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values
      (new.id, 'terms_of_service', '2026-08-10', true, 'email_signup'),
      (new.id, 'community_guidelines', '2026-08-10', true, 'email_signup'),
      (new.id, 'privacy_acknowledgment', '2026-08-10', true, 'email_signup'),
      (
        new.id,
        'marketing_email',
        null,
        coalesce((metadata ->> 'retail_marketing_email_opt_in')::boolean, false),
        'email_signup'
      );
  end if;

  return new;
exception
  when invalid_text_representation then
    raise exception 'RETAIL_SIGNUP_CONSENT_METADATA_INVALID'
      using errcode = '22023';
end;
$$;

revoke all on function private.record_email_signup_consents()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
