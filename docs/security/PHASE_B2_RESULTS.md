# ReTail Security Remediation Phase B.2 Results

## Scope

Phase B.2 focused only on coarse marketplace search areas and coordinate mutation lockdown.

No Phase C work was performed.

## Completed Source Changes

- Added Supabase migration `20260717161849_phase_b2_coarse_search_areas.sql`.
- Added advisor follow-up migration `20260717171018_phase_b2_advisor_indexes.sql`.
- Added `marketplace_search_areas`.
- Added `marketplace_search_preferences`.
- Added server-managed `marketplace_search_area_change_events`.
- Added `search_area_id` to `listings`.
- Added `search_area_id` to `rescue_profiles`.
- Added safe RPC `get_marketplace_search_areas`.
- Added safe RPC `get_my_marketplace_search_preference`.
- Added controlled mutation RPC `set_marketplace_search_area`.
- Replaced nearby listing and rescue RPCs so they derive origin from the authenticated user's search-area preference.
- Locked direct client mutation of `profiles.latitude` and `profiles.longitude`.
- Removed exact-coordinate profile and listing update payloads from app services.
- Removed live browser/device geolocation from the marketplace distance UI.
- Added `searchAreaService.ts`.
- Added `useMarketplaceSearchArea.ts`.
- Updated `DistanceFilter` to select approved marketplace areas.
- Updated Rescue Hub to use the search-area preference.
- Added Phase B.2 regression tests in `tests/securityPhaseB2.test.mjs`.

## Search-Area Model

Search areas are coarse, server-controlled marketplace regions.

The app may read:

- search-area id
- slug
- label
- city
- state
- region name

The app may not read:

- centroid
- geography point
- exact area coordinates

The client cannot directly insert, update, or delete search preferences. Users can update their own preference only through `set_marketplace_search_area`.

Allowed radii:

- `10`
- `25`
- `50`
- `100`

Successful search-area changes are limited to three per rolling 24-hour window.

## Backfill

Live migration backfilled:

- `3` active marketplace search areas
- `3` user search preferences
- `3` listings mapped to a search area
- `1` rescue profile mapped to a search area

The initial launch-market areas were based on current ReTail city/state data and existing product examples, not on user-level exact coordinates.

## Live Supabase Verification

Target project:

- `ycwgsdigvpmprqreoqiz`

Applied migration:

- `20260717161849_phase_b2_coarse_search_areas`
- `20260717171018_phase_b2_advisor_indexes`

Verified outcomes:

- `get_marketplace_search_areas()` returns safe area labels to anonymous users.
- Anonymous users cannot execute `get_nearby_listings`.
- Authenticated users can read their own search preference.
- Authenticated users cannot read another user's search preference.
- Authenticated users cannot read `marketplace_search_areas.centroid` directly.
- Authenticated users cannot directly update `marketplace_search_preferences`.
- Authenticated users cannot update `profiles.latitude` or `profiles.longitude`.
- Authenticated users can still update normal non-coordinate profile fields.
- `set_marketplace_search_area` rejects invalid radius value `5` with `RETAIL_INVALID_SEARCH_RADIUS`.
- The fourth successful search-area change in a rollback-only test was rejected with `RETAIL_SEARCH_AREA_RATE_LIMITED`.
- Nearby listings returned coarse distance band `Same area`, not exact distance.
- Nearby rescues returned coarse distance band `Same area`, not exact distance.
- The Phase B.2 performance advisor finding for the search-area change-event foreign key was resolved with a covering index.

## Distance Bands

Phase B.2 uses area-to-area bands:

- `Same area`
- `Nearby area`
- `Within 25 miles`
- `25 to 50 miles`
- `50 to 100 miles`
- `100+ miles`

Results are ordered by distance-band rank and recency/name, not exact numeric distance.

## Remaining Required Work

- Keep Phase B, B.1, and B.2 regression tests in the release gate.
- Add future marketplace areas through reviewed migrations only.
- If device location is ever reintroduced, use it only to suggest a broad marketplace area locally. Do not persist or transmit exact GPS coordinates for discovery.
- Continue Supabase advisor reviews after each schema change.
