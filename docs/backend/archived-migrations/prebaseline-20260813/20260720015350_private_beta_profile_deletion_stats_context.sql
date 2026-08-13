-- ReTail Private Beta Gate Closure
-- Permit trusted account-deletion cleanup to refresh profile counters.

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
  deletion_anonymization boolean;
  counter_refresh boolean;
begin
  if tg_op = 'UPDATE' and account_deletion_context then
    counter_refresh :=
      new.id is not distinct from old.id
      and new.account_type is not distinct from old.account_type
      and new.display_name is not distinct from old.display_name
      and new.username is not distinct from old.username
      and new.bio is not distinct from old.bio
      and new.avatar_url is not distinct from old.avatar_url
      and new.city is not distinct from old.city
      and new.state is not distinct from old.state
      and new.zip_code is not distinct from old.zip_code
      and new.latitude is not distinct from old.latitude
      and new.longitude is not distinct from old.longitude
      and new.is_verified is not distinct from old.is_verified
      and new.is_admin is not distinct from old.is_admin
      and new.is_banned is not distinct from old.is_banned
      and new.created_at is not distinct from old.created_at
      and new.deleted_at is not distinct from old.deleted_at;

    if counter_refresh then
      return new;
    end if;

    deletion_anonymization :=
      new.id is not distinct from old.id
      and new.account_type is not distinct from old.account_type
      and new.buyer_rating is not distinct from old.buyer_rating
      and new.seller_rating is not distinct from old.seller_rating
      and new.review_count is not distinct from old.review_count
      and new.listings_count is not distinct from old.listings_count
      and new.completed_sales_count is not distinct from old.completed_sales_count
      and new.is_verified is not distinct from old.is_verified
      and new.is_admin is not distinct from old.is_admin
      and new.created_at is not distinct from old.created_at
      and new.display_name = 'Deleted User'
      and new.bio is null
      and new.avatar_url is null
      and new.city is null
      and new.state is null
      and new.zip_code is null
      and new.latitude is null
      and new.longitude is null
      and new.is_banned is true
      and new.deleted_at is not null;

    if deletion_anonymization then
      return new;
    end if;

    raise exception 'RETAIL_PROTECTED_PROFILE_FIELD'
      using errcode = '42501';
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
