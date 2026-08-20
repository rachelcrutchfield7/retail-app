create or replace function public.get_public_profiles_by_ids(target_user_ids uuid[])
returns table(
  id uuid,
  account_type public.account_type,
  display_name text,
  username text,
  bio text,
  avatar_url text,
  city text,
  state text,
  buyer_rating numeric,
  seller_rating numeric,
  review_count integer,
  listings_count integer,
  completed_sales_count integer,
  is_verified boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.account_type,
    p.display_name,
    p.username::text,
    p.bio,
    p.avatar_url,
    case when coalesce(ps.show_city_state, true) then p.city else null end as city,
    case when coalesce(ps.show_city_state, true) then p.state else null end as state,
    p.buyer_rating,
    p.seller_rating,
    p.review_count,
    p.listings_count,
    p.completed_sales_count,
    p.is_verified,
    p.created_at
  from public.profiles p
  left join public.privacy_settings ps on ps.user_id = p.id
  where p.id = any(coalesce(target_user_ids, array[]::uuid[]))
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true;
$$;

revoke all on function public.get_public_profiles_by_ids(uuid[]) from public;
grant execute on function public.get_public_profiles_by_ids(uuid[]) to anon, authenticated;

create or replace function public.get_conversation_listings_by_ids(target_listing_ids uuid[])
returns table(
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  return query
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.id = any(coalesce(target_listing_ids, array[]::uuid[]))
    and l.deleted_at is null
    and l.status in ('active', 'pending', 'sold', 'donated', 'archived')
    and p.deleted_at is null
    and p.is_banned = false
    and exists (
      select 1
      from public.conversations conv
      where conv.listing_id = l.id
        and conv.deleted_at is null
        and caller_id in (conv.buyer_id, conv.seller_id)
    );
end;
$$;

revoke all on function public.get_conversation_listings_by_ids(uuid[]) from public;
grant execute on function public.get_conversation_listings_by_ids(uuid[]) to authenticated;
