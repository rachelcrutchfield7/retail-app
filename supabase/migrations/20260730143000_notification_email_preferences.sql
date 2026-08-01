-- ReTail notification email preferences and delivery tracking.

alter table notification_preferences
  add column if not exists email_messages boolean not null default true,
  add column if not exists email_favorites boolean not null default false,
  add column if not exists email_reviews boolean not null default true,
  add column if not exists email_marketplace_updates boolean not null default true,
  add column if not exists email_system boolean not null default true;

create table if not exists notification_email_deliveries (
  notification_id uuid primary key references notifications(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  notification_type notification_type not null,
  recipient_email text not null check (position('@' in recipient_email) > 1),
  resend_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_notification_email_deliveries_updated_at on notification_email_deliveries;
create trigger set_notification_email_deliveries_updated_at
  before update on notification_email_deliveries
  for each row execute function set_updated_at();

alter table notification_email_deliveries enable row level security;

drop policy if exists "Users read own notification email deliveries" on notification_email_deliveries;
create policy "Users read own notification email deliveries"
  on notification_email_deliveries for select
  using (auth.uid() = user_id and is_account_active());

create index if not exists idx_notification_email_deliveries_user
  on notification_email_deliveries(user_id, created_at desc);

create index if not exists idx_notification_email_deliveries_status
  on notification_email_deliveries(status, created_at desc);
