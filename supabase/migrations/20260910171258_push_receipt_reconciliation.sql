-- Track when an Expo push ticket has been reconciled with its provider receipt.
-- Ticket acceptance alone does not prove that FCM or APNs accepted the push.

alter table public.notification_push_deliveries
  add column if not exists receipt_checked_at timestamptz;

create index if not exists notification_push_deliveries_receipt_pending_idx
  on public.notification_push_deliveries (sent_at)
  where provider_ticket_id is not null
    and receipt_checked_at is null
    and status in ('pending', 'sent');

comment on column public.notification_push_deliveries.receipt_checked_at is
  'Timestamp when the Expo ticket receipt was reconciled with FCM or APNs.';
