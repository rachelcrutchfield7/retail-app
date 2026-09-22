-- ReTail marketplace listing search-area assignment v1
--
-- Extend the existing city/state resolver so listings in Cottage Hills and
-- Worden are assigned to Metro East instead of remaining invisible to
-- location-aware marketplace feeds.
--
-- The existing set_listing_search_area_before_write trigger remains the
-- authoritative automatic assignment path for future listing creates/edits.

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
          'cottage hills',
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
          'wood river',
          'worden'
        )
        then 'metro-east-area'
      when lower(trim(coalesce(input_state, ''))) = 'mo'
        and lower(trim(coalesce(input_city, ''))) in (
          'st louis',
          'st. louis',
          'saint louis'
        )
        then 'greater-st-louis-area'
      when lower(trim(coalesce(input_state, ''))) = 'il'
        and lower(trim(coalesce(input_city, ''))) = 'springfield'
        then 'springfield-il-area'
      else null
    end
  limit 1;
$$;

-- This is a controlled maintenance update. Normal app writes remain protected
-- by enforce_phase_f_listing_write before and after this statement.
alter table public.listings
  disable trigger enforce_phase_f_listing_write;

update public.listings l
set search_area_id =
  public.marketplace_search_area_for_city_state(l.city, l.state)
where l.search_area_id is null
  and l.deleted_at is null
  and public.marketplace_search_area_for_city_state(l.city, l.state)
      is not null;

alter table public.listings
  enable trigger enforce_phase_f_listing_write;
