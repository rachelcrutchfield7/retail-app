-- ReTail Sprint 5 trust, reviews, notifications, and account settings support.
-- Run this in Supabase SQL Editor after the base schema and policies.

do $$ begin
  alter type report_reason add value if not exists 'hate_speech';
  alter type report_reason add value if not exists 'stolen_goods';
exception when undefined_object then null;
end $$;

do $$ begin
  alter type notification_type add value if not exists 'transaction_completed';
  alter type notification_type add value if not exists 'listing_donated';
exception when undefined_object then null;
end $$;

alter table transactions
  add column if not exists cancelled_at timestamptz;

create unique index if not exists transactions_one_completed_per_listing
  on transactions(listing_id)
  where status = 'completed' and deleted_at is null;

create table if not exists notification_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  in_app_messages boolean not null default true,
  in_app_favorites boolean not null default true,
  in_app_reviews boolean not null default true,
  in_app_marketplace_updates boolean not null default true,
  in_app_system boolean not null default true,
  email_messages boolean not null default true,
  email_favorites boolean not null default false,
  email_reviews boolean not null default true,
  email_marketplace_updates boolean not null default true,
  email_system boolean not null default true,
  push_messages boolean not null default false,
  push_favorites boolean not null default false,
  push_reviews boolean not null default false,
  push_marketplace_updates boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_notification_preferences_updated_at on notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();

alter table notification_preferences enable row level security;

drop policy if exists "Users read own notification preferences" on notification_preferences;
create policy "Users read own notification preferences"
  on notification_preferences for select
  using (auth.uid() = user_id and is_account_active());

drop policy if exists "Users insert own notification preferences" on notification_preferences;
create policy "Users insert own notification preferences"
  on notification_preferences for insert
  with check (auth.uid() = user_id and is_account_active());

drop policy if exists "Users update own notification preferences" on notification_preferences;
create policy "Users update own notification preferences"
  on notification_preferences for update
  using (auth.uid() = user_id and is_account_active())
  with check (auth.uid() = user_id and is_account_active());

drop policy if exists "Users delete their own notifications" on notifications;
create policy "Users delete their own notifications"
  on notifications for delete
  using (auth.uid() = user_id and is_account_active());

drop policy if exists "Participants create transaction notifications" on notifications;
create policy "Participants create transaction notifications"
  on notifications for insert
  with check (
    type = 'transaction_completed'
    and is_account_active()
    and exists (
      select 1 from transactions
      where transactions.id = uuid_or_null(notifications.data ->> 'transactionId')
        and transactions.status = 'completed'
        and notifications.user_id in (transactions.buyer_id, transactions.seller_id)
        and auth.uid() in (transactions.buyer_id, transactions.seller_id)
        and notifications.user_id <> auth.uid()
    )
  );

drop policy if exists "Users create review notifications" on notifications;
create policy "Users create review notifications"
  on notifications for insert
  with check (
    type = 'review'
    and is_account_active()
    and exists (
      select 1 from reviews
      where reviews.id = uuid_or_null(notifications.data ->> 'reviewId')
        and reviews.reviewer_id = auth.uid()
        and reviews.reviewee_id = notifications.user_id
        and reviews.deleted_at is null
    )
  );

create or replace function delete_current_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
begin
  if active_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update listings
    set status = 'archived',
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where seller_id = active_user_id
      and deleted_at is null
      and status in ('draft', 'active', 'pending');

  update profiles
    set display_name = 'Deleted User',
        username = 'deleted_' || replace(active_user_id::text, '-', ''),
        bio = null,
        avatar_url = null,
        city = null,
        state = null,
        zip_code = null,
        latitude = null,
        longitude = null,
        is_banned = true,
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where id = active_user_id;

  delete from favorites where user_id = active_user_id;
  delete from device_tokens where user_id = active_user_id;
  delete from notification_preferences where user_id = active_user_id;

  insert into audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (active_user_id, 'account_deleted', 'profiles', active_user_id, '{}'::jsonb);
end;
$$;

revoke all on function delete_current_account() from public;
revoke all on function delete_current_account() from anon;
grant execute on function delete_current_account() to authenticated;

notify pgrst, 'reload schema';
