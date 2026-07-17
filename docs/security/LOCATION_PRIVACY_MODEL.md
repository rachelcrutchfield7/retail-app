# ReTail Location Privacy Model

ReTail stores precise location data only where it is needed for owner-managed listings and distance sorting. Public discovery never returns exact coordinates or street-level location.

## Stored Private Location Data

Private tables may store:

- city and state
- ZIP code
- latitude and longitude
- PostGIS geography points
- rescue address fields
- listing ship-from ZIP code

This data is used for owner workflows, moderation, and server-side distance filtering.

## Public Location Output

Public views and RPCs may return:

- city
- state
- approximate distance band

Distance bands:

- `Under 5 miles`
- `5-10 miles`
- `10-25 miles`
- `25-50 miles`
- `50+ miles`

The app must not show exact numeric distance from public RPCs.

## Distance Search

Signed-in users can submit their current location to server-side RPCs:

- `get_nearby_listings`
- `get_nearby_rescues`

The database uses the submitted point internally to sort and filter results, then returns only the distance band. Anonymous users use non-location public feeds.

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
