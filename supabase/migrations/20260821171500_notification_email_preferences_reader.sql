drop function if exists public.get_my_notification_preferences();

create or replace function public.get_my_notification_preferences()
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

  return query
  select
    coalesce(np.in_app_messages, true),
    coalesce(np.in_app_favorites, true),
    coalesce(np.in_app_reviews, true),
    coalesce(np.in_app_marketplace_updates, true),
    coalesce(np.in_app_system, true),
    coalesce(np.push_messages, false),
    coalesce(np.push_favorites, false),
    coalesce(np.push_reviews, false),
    coalesce(np.push_marketplace_updates, false),
    coalesce(np.email_messages, true),
    coalesce(np.email_favorites, false),
    coalesce(np.email_reviews, true),
    coalesce(np.email_marketplace_updates, true),
    coalesce(np.email_system, true)
  from (select caller_id as user_id) current_user_row
  left join public.notification_preferences np
    on np.user_id = current_user_row.user_id;
end;
$$;

revoke all on function public.get_my_notification_preferences()
  from public, anon;

grant execute on function public.get_my_notification_preferences()
  to authenticated, service_role;
