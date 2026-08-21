drop function if exists public.update_my_notification_preferences(
  boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean
);

create or replace function public.update_my_notification_preferences(
  requested_in_app_messages boolean,
  requested_in_app_favorites boolean,
  requested_in_app_reviews boolean,
  requested_in_app_marketplace_updates boolean,
  requested_in_app_system boolean,
  requested_push_messages boolean,
  requested_push_favorites boolean,
  requested_push_reviews boolean,
  requested_push_marketplace_updates boolean
)
returns table(
  in_app_messages boolean,
  in_app_favorites boolean,
  in_app_reviews boolean,
  in_app_marketplace_updates boolean,
  in_app_system boolean,
  push_messages boolean,
  push_favorites boolean,
  push_reviews boolean,
  push_marketplace_updates boolean,
  email_messages boolean,
  email_favorites boolean,
  email_reviews boolean,
  email_marketplace_updates boolean,
  email_system boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  insert into public.notification_preferences (
    user_id,
    in_app_messages,
    in_app_favorites,
    in_app_reviews,
    in_app_marketplace_updates,
    in_app_system,
    push_messages,
    push_favorites,
    push_reviews,
    push_marketplace_updates,
    created_at,
    updated_at
  )
  values (
    caller_id,
    coalesce(requested_in_app_messages, true),
    coalesce(requested_in_app_favorites, true),
    coalesce(requested_in_app_reviews, true),
    coalesce(requested_in_app_marketplace_updates, true),
    coalesce(requested_in_app_system, true),
    coalesce(requested_push_messages, false),
    coalesce(requested_push_favorites, false),
    coalesce(requested_push_reviews, false),
    coalesce(requested_push_marketplace_updates, false),
    now(),
    now()
  )
  on conflict (user_id)
  do update set
    in_app_messages = excluded.in_app_messages,
    in_app_favorites = excluded.in_app_favorites,
    in_app_reviews = excluded.in_app_reviews,
    in_app_marketplace_updates = excluded.in_app_marketplace_updates,
    in_app_system = excluded.in_app_system,
    push_messages = excluded.push_messages,
    push_favorites = excluded.push_favorites,
    push_reviews = excluded.push_reviews,
    push_marketplace_updates = excluded.push_marketplace_updates,
    updated_at = now();

  return query
  select *
  from public.get_my_notification_preferences();
end;
$$;

create or replace function public.update_my_email_notification_preferences(
  requested_email_messages boolean,
  requested_email_favorites boolean,
  requested_email_reviews boolean,
  requested_email_marketplace_updates boolean,
  requested_email_system boolean
)
returns table(
  in_app_messages boolean,
  in_app_favorites boolean,
  in_app_reviews boolean,
  in_app_marketplace_updates boolean,
  in_app_system boolean,
  push_messages boolean,
  push_favorites boolean,
  push_reviews boolean,
  push_marketplace_updates boolean,
  email_messages boolean,
  email_favorites boolean,
  email_reviews boolean,
  email_marketplace_updates boolean,
  email_system boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not private.is_account_active(caller_id) then
    raise exception 'RETAIL_NOTIFICATION_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  insert into public.notification_preferences (
    user_id,
    email_messages,
    email_favorites,
    email_reviews,
    email_marketplace_updates,
    email_system,
    created_at,
    updated_at
  )
  values (
    caller_id,
    coalesce(requested_email_messages, true),
    coalesce(requested_email_favorites, false),
    coalesce(requested_email_reviews, true),
    coalesce(requested_email_marketplace_updates, true),
    coalesce(requested_email_system, true),
    now(),
    now()
  )
  on conflict (user_id)
  do update set
    email_messages = excluded.email_messages,
    email_favorites = excluded.email_favorites,
    email_reviews = excluded.email_reviews,
    email_marketplace_updates = excluded.email_marketplace_updates,
    email_system = excluded.email_system,
    updated_at = now();

  return query
  select *
  from public.get_my_notification_preferences();
end;
$$;

revoke all on function public.update_my_notification_preferences(
  boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean
) from public, anon;

grant execute on function public.update_my_notification_preferences(
  boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean
) to authenticated, service_role;

revoke all on function public.update_my_email_notification_preferences(
  boolean, boolean, boolean, boolean, boolean
) from public, anon;

grant execute on function public.update_my_email_notification_preferences(
  boolean, boolean, boolean, boolean, boolean
) to authenticated, service_role;

notify pgrst, 'reload schema';
