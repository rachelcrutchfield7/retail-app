-- ReTail Private Beta Gate Closure
-- Allow the trusted account-deletion RPC to anonymize protected profile fields.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_deletion_context boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.account_deletion_context', true), ''),
    'off'
  ) = 'on';
begin
  if account_deletion_context
    and tg_op = 'UPDATE'
    and new.is_admin is not distinct from old.is_admin
    and new.is_verified is not distinct from old.is_verified
    and new.is_banned is true
    and new.deleted_at is not null then
    return new;
  end if;

  if not private.is_admin() then
    if new.is_admin is distinct from old.is_admin
      or new.is_banned is distinct from old.is_banned
      or new.is_verified is distinct from old.is_verified then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_privilege_escalation()
  from public, anon, authenticated;

create or replace function public.protect_profile_phase_c_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account_deletion_context boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.account_deletion_context', true), ''),
    'off'
  ) = 'on';
begin
  if tg_op = 'UPDATE' and account_deletion_context then
    if new.id is distinct from old.id
      or new.account_type is distinct from old.account_type
      or new.buyer_rating is distinct from old.buyer_rating
      or new.seller_rating is distinct from old.seller_rating
      or new.review_count is distinct from old.review_count
      or new.listings_count is distinct from old.listings_count
      or new.completed_sales_count is distinct from old.completed_sales_count
      or new.is_verified is distinct from old.is_verified
      or new.is_admin is distinct from old.is_admin
      or new.created_at is distinct from old.created_at then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;

    if new.display_name <> 'Deleted User'
      or new.bio is not null
      or new.avatar_url is not null
      or new.city is not null
      or new.state is not null
      or new.zip_code is not null
      or new.latitude is not null
      or new.longitude is not null
      or new.is_banned is distinct from true
      or new.deleted_at is null then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is distinct from auth.uid()
      or coalesce(new.buyer_rating, 0) <> 0
      or coalesce(new.seller_rating, 0) <> 0
      or coalesce(new.review_count, 0) <> 0
      or coalesce(new.listings_count, 0) <> 0
      or coalesce(new.completed_sales_count, 0) <> 0
      or coalesce(new.is_verified, false) <> false
      or coalesce(new.is_admin, false) <> false
      or coalesce(new.is_banned, false) <> false
      or new.deleted_at is not null
      or new.latitude is not null
      or new.longitude is not null then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.account_type is distinct from old.account_type
      or new.buyer_rating is distinct from old.buyer_rating
      or new.seller_rating is distinct from old.seller_rating
      or new.review_count is distinct from old.review_count
      or new.listings_count is distinct from old.listings_count
      or new.completed_sales_count is distinct from old.completed_sales_count
      or new.is_verified is distinct from old.is_verified
      or new.is_admin is distinct from old.is_admin
      or new.is_banned is distinct from old.is_banned
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.deleted_at is distinct from old.deleted_at
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude then
      raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_phase_c_fields()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
