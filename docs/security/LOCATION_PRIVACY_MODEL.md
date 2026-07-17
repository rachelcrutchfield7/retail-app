# ReTail Location Privacy Model

ReTail stores exact coordinates only as legacy owner-private data where it already exists. Marketplace discovery must not use live device GPS, ZIP-derived coordinates, arbitrary caller points, or profile latitude/longitude. Public discovery never returns exact coordinates or street-level location.

## Stored Private Location Data

Private legacy tables may still contain:

- city and state
- ZIP code
- latitude and longitude
- PostGIS geography points
- rescue address fields
- listing ship-from ZIP code

This data is owner-private and may be used for owner workflows or moderation. New marketplace discovery uses `marketplace_search_preferences.search_area_id` and server-controlled `marketplace_search_areas.centroid` instead.

Clients must not update `profiles.latitude` or `profiles.longitude`. Client-role profile coordinate writes are blocked by `prevent_profile_coordinate_mutation`.

## Search Areas

Marketplace search uses coarse, approved areas:

- `marketplace_search_areas` stores server-controlled area labels and centroids.
- Direct client table access to `marketplace_search_areas` is revoked so centroids are not exposed.
- `get_marketplace_search_areas()` returns only safe fields: `id`, `slug`, `label`, `city`, `state`, and `region_name`.
- `marketplace_search_preferences` stores each user's selected area and radius.
- Users can read only their own preference.
- Users can update preference only through `set_marketplace_search_area`.
- Radius values are restricted to `10`, `25`, `50`, and `100` miles.
- Search-area changes are rate-limited to three successful changes per rolling 24-hour window.

## Public Location Output

Public views and RPCs may return:

- city
- state
- approximate distance band

Distance bands:

- `Same area`
- `Nearby area`
- `Within 25 miles`
- `25 to 50 miles`
- `50 to 100 miles`
- `100+ miles`

The app must not show exact numeric distance from public RPCs.

## Distance Search

Signed-in users can request nearby results through:

- `get_nearby_listings`
- `get_nearby_rescues`

The client must not send caller latitude or longitude to these RPCs. The
database derives the caller origin from `auth.uid()`, the user's
`marketplace_search_preferences.search_area_id`, and the matching
server-controlled search-area centroid. If the preference is missing, invalid,
or inactive, the nearby RPC fails safely with `RETAIL_SEARCH_AREA_REQUIRED` and
the app may fall back to a non-location public feed or show a friendly
marketplace area setup state.

Listings and rescues must have their own `search_area_id` to appear in
distance-based discovery. Existing records without a safe city/state mapping
remain available in non-location public feeds, but are omitted from nearby
results.

The database uses coarse area-to-area distance internally to filter and rank
results, then returns only the distance band. Anonymous users use non-location
public feeds.

## Privacy Settings

Privacy settings are persisted in `privacy_settings`.

Supported settings:

- `profile_discoverable`
- `show_city_state`
- `allow_approximate_distance`
- `allow_messages_from_buyers`
- `rescue_public_contact_enabled`

The RPC layer uses these settings when shaping public results.

## Implementation Rule

Client-side code must not calculate public distance from downloaded coordinates. Coordinates should not be present in public listing or rescue responses.

Client-side code must also not pass live device coordinates into public nearby
discovery RPCs. Device geolocation may only be considered in the future as a
local suggestion mechanism for a broad marketplace area, and must not be stored
or sent to analytics/RPCs as an exact point.
