-- Keep active listings discoverable when a supported Metro East locality is used.
create or replace function public.marketplace_search_area_for_city_state(
  input_city text,
  input_state text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select msa.id
  from public.marketplace_search_areas msa
  where msa.is_active = true
    and msa.slug = case
      when lower(trim(coalesce(input_state, ''))) = 'il'
        and lower(trim(coalesce(input_city, ''))) in (
          'alton',
          'belleville',
          'bethalto',
          'collinsville',
          'edwardsville',
          'fosterburg',
          'glen carbon',
          'granite city',
          'highland',
          'maryville',
          'ofallon',
          'o fallon',
          'st jacob',
          'st. jacob',
          'troy',
          'wood river'
        )
        then 'metro-east-area'
      when lower(trim(coalesce(input_state, ''))) = 'mo'
        and lower(trim(coalesce(input_city, ''))) in ('st louis', 'st. louis', 'saint louis')
        then 'greater-st-louis-area'
      when lower(trim(coalesce(input_state, ''))) = 'il'
        and lower(trim(coalesce(input_city, ''))) = 'springfield'
        then 'springfield-il-area'
      else null
    end
  limit 1;
$$;

update public.listings l
set search_area_id = public.marketplace_search_area_for_city_state(l.city, l.state)
where l.status = 'active'
  and l.deleted_at is null
  and l.search_area_id is null
  and public.marketplace_search_area_for_city_state(l.city, l.state) is not null;
