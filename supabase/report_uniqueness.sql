-- ReTail report duplicate protection
-- Run this after supabase/schema.sql and supabase/policies.sql.

create unique index if not exists reports_unique_listing_report
on reports (reporter_id, listing_id)
where report_type = 'listing'
  and reporter_id is not null
  and listing_id is not null;

create unique index if not exists reports_unique_user_report
on reports (reporter_id, reported_user_id)
where report_type = 'user'
  and reporter_id is not null
  and reported_user_id is not null;

create unique index if not exists reports_unique_message_report
on reports (reporter_id, message_id)
where report_type = 'message'
  and reporter_id is not null
  and message_id is not null;
