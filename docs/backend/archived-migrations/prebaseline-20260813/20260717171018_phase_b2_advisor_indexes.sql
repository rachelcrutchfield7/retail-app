-- ReTail Phase B.2 advisor follow-up indexes
-- Adds a covering index for the marketplace search area change-event foreign key.

create index if not exists idx_marketplace_search_area_change_events_search_area
  on public.marketplace_search_area_change_events(search_area_id);
