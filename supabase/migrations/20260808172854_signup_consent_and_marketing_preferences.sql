-- ReTail signup policy acceptance and append-only marketing preference history.
-- Policy versions use the ISO publication date (YYYY-MM-DD).

create schema if not exists private;

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  consent_type text not null check (
    consent_type in (
      'terms_of_service',
      'community_guidelines',
      'privacy_acknowledgment',
      'marketing_email'
    )
  ),
  policy_version text,
  granted boolean not null,
  source text not null check (
    source in (
      'email_signup',
      'google_signup',
      'legacy_user_gate',
      'settings',
      'unsubscribe',
      'account_deletion'
    )
  ),
  recorded_at timestamptz not null default now(),
  check (
    (consent_type = 'marketing_email' and policy_version is null)
    or
    (consent_type <> 'marketing_email' and policy_version is not null)
  )
);

comment on table public.user_consents is
  'Append-only evidence of policy acceptance and marketing email preference changes. user_id intentionally remains as retained compliance evidence after Auth deletion.';

create index user_consents_user_type_recorded_idx
  on public.user_consents (user_id, consent_type, recorded_at desc, id desc);

alter table public.user_consents enable row level security;
alter table public.user_consents force row level security;

revoke all on table public.user_consents from public, anon, authenticated;
grant select on table public.user_consents to authenticated;

create policy "Users read their own consent history"
  on public.user_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function private.reject_user_consent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'RETAIL_CONSENT_HISTORY_IS_APPEND_ONLY'
    using errcode = '42501';
end;
$$;

revoke all on function private.reject_user_consent_mutation()
  from public, anon, authenticated;

create trigger user_consents_reject_mutation
before update or delete on public.user_consents
for each row execute function private.reject_user_consent_mutation();

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
        and consent.policy_version = '2026-07-23'
        and consent.granted = true
    )
    and exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'community_guidelines'
        and consent.policy_version = '2026-07-23'
        and consent.granted = true
    )
    and exists (
      select 1
      from public.user_consents consent
      where consent.user_id = target_user_id
        and consent.consent_type = 'privacy_acknowledgment'
        and consent.policy_version = '2026-08-08'
        and consent.granted = true
    );
$$;

revoke all on function private.has_current_policy_acceptance(uuid)
  from public, anon, authenticated;

create or replace function private.latest_marketing_email_preference(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select consent.granted
    from public.user_consents consent
    where consent.user_id = target_user_id
      and consent.consent_type = 'marketing_email'
    order by consent.recorded_at desc, consent.id desc
    limit 1
  ), false);
$$;

revoke all on function private.latest_marketing_email_preference(uuid)
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
        and consent.policy_version = '2026-07-23'
        and consent.granted = true
    ),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'community_guidelines'
        and consent.policy_version = '2026-07-23'
        and consent.granted = true
    ),
    exists (
      select 1 from public.user_consents consent
      where consent.user_id = caller_id
        and consent.consent_type = 'privacy_acknowledgment'
        and consent.policy_version = '2026-08-08'
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

  if requested_terms_version <> '2026-07-23'
    or requested_community_guidelines_version <> '2026-07-23'
    or requested_privacy_version <> '2026-08-08' then
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

create or replace function public.update_my_marketing_email_preference(requested_granted boolean)
returns boolean
language plpgsql
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

  insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
  values (caller_id, 'marketing_email', null, coalesce(requested_granted, false), 'settings');

  return coalesce(requested_granted, false);
end;
$$;

revoke all on function public.update_my_marketing_email_preference(boolean)
  from public, anon, authenticated;
grant execute on function public.update_my_marketing_email_preference(boolean)
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
    and metadata ->> 'retail_terms_version' = '2026-07-23'
    and coalesce((metadata ->> 'retail_community_guidelines_accepted')::boolean, false) = true
    and metadata ->> 'retail_community_guidelines_version' = '2026-07-23'
    and coalesce((metadata ->> 'retail_privacy_acknowledged')::boolean, false) = true
    and metadata ->> 'retail_privacy_version' = '2026-08-08'
    and metadata ->> 'retail_consent_source' = 'email_signup' then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values
      (new.id, 'terms_of_service', '2026-07-23', true, 'email_signup'),
      (new.id, 'community_guidelines', '2026-07-23', true, 'email_signup'),
      (new.id, 'privacy_acknowledgment', '2026-08-08', true, 'email_signup'),
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

drop trigger if exists record_retail_email_signup_consents on auth.users;
create trigger record_retail_email_signup_consents
after insert on auth.users
for each row execute function private.record_email_signup_consents();

create or replace function private.record_account_deletion_marketing_opt_out()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
    values (new.id, 'marketing_email', null, false, 'account_deletion');
  end if;

  return new;
end;
$$;

revoke all on function private.record_account_deletion_marketing_opt_out()
  from public, anon, authenticated;

drop trigger if exists record_account_deletion_marketing_opt_out on public.profiles;
create trigger record_account_deletion_marketing_opt_out
after update of deleted_at on public.profiles
for each row execute function private.record_account_deletion_marketing_opt_out();

create or replace function private.record_auth_user_deletion_marketing_opt_out()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_consents (user_id, consent_type, policy_version, granted, source)
  values (old.id, 'marketing_email', null, false, 'account_deletion');
  return old;
end;
$$;

revoke all on function private.record_auth_user_deletion_marketing_opt_out()
  from public, anon, authenticated;

drop trigger if exists record_auth_user_deletion_marketing_opt_out on auth.users;
create trigger record_auth_user_deletion_marketing_opt_out
before delete on auth.users
for each row execute function private.record_auth_user_deletion_marketing_opt_out();

notify pgrst, 'reload schema';
