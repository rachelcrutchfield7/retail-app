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

Signed-in users can request nearby results through:

- `get_nearby_listings`
- `get_nearby_rescues`

The client must not send caller latitude or longitude to these RPCs. The
database derives the caller origin from the authenticated user's private saved
profile location (`profiles.latitude` and `profiles.longitude`) using
`auth.uid()`. If that saved location is missing or invalid, the nearby RPC fails
safely and the app may fall back to a non-location public feed or show a
friendly location setup state.

The database uses the private point internally to sort and filter results, then
returns only the distance band. Anonymous users use non-location public feeds.

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
discovery RPCs. Updating the owner's saved private profile location is separate
from public discovery and remains owner-authenticated.
