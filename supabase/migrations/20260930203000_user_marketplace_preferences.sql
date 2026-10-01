-- ReTail 1.2.0
-- Persist user-level marketplace preferences that do not already have
-- an authoritative persistence source.
--
-- Marketplace search radius is intentionally NOT stored here.
-- Radius remains owned by Location Architecture V2.

create table if not exists public.user_marketplace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pet_interests text[] not null default array['Dogs', 'Cats']::text[],
  show_rescue_donation_matches boolean not null default true,
  saved_search_alerts_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_marketplace_preferences enable row level security;

drop policy if exists "Users can read own marketplace preferences"
  on public.user_marketplace_preferences;

create policy "Users can read own marketplace preferences"
  on public.user_marketplace_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own marketplace preferences"
  on public.user_marketplace_preferences;

create policy "Users can insert own marketplace preferences"
  on public.user_marketplace_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own marketplace preferences"
  on public.user_marketplace_preferences;

create policy "Users can update own marketplace preferences"
  on public.user_marketplace_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_marketplace_preferences from anon;
grant select, insert, update on table public.user_marketplace_preferences to authenticated;
