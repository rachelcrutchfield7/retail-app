-- Align the ISO database expiry guard with update_my_iso_post().
-- ISO requests may be extended up to 90 days from their latest update.

alter table public.iso_posts
  drop constraint if exists iso_posts_expiry_window;

alter table public.iso_posts
  add constraint iso_posts_expiry_window
  check (expires_at <= updated_at + interval '90 days');
