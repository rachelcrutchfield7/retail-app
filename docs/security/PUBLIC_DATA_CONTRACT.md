# ReTail Public Data Contract

Phase B defines a strict split between public discovery data and owner-private data.

## Public Profile Data

Public profile reads must use `get_public_profile`.

Allowed fields:

- `id`
- `account_type`
- `display_name`
- `username`
- `bio`
- `avatar_url`
- `city` and `state` only when the user allows city/state display
- rating and review/listing counts
- `is_verified`
- `created_at`

Never expose publicly:

- email address
- phone number
- ZIP code
- exact coordinates
- admin, ban, moderation, or deleted state fields
- auth identifiers beyond the profile id

## Public Listing Data

Public listing discovery must use:

- `get_public_listing_feed`
- `get_nearby_listings` for signed-in users with a saved marketplace search-area preference
- `get_public_listing_detail`
- `get_public_user_listings`

Allowed fields:

- marketplace display fields such as title, description, price, category, condition, status, brand, images, seller summary, and city/state
- pickup, meetup, and shipping display flags
- counts such as views, favorites, and messages
- approximate `distance_band` only

Never expose publicly:

- listing ZIP code
- ship-from ZIP code
- exact latitude or longitude
- search-area centroid or geography point
- exact numeric distance
- deleted/moderation fields
- raw seller profile rows

## Public Rescue Hub Data

Public rescue discovery must use:

- `get_public_rescue_feed`
- `get_nearby_rescues` for signed-in users with a saved marketplace search-area preference
- `get_public_rescue`
- `get_public_rescue_by_owner`

Allowed fields:

- rescue name, slug, summary, animals rescued, city/state, website, verified badge, urgent needs, wishlist items, and approximate `distance_band`
- `contact_hint` only when the rescue has explicitly enabled public contact instructions

Never expose publicly:

- street address
- ZIP code
- exact coordinates
- search-area centroid or geography point
- contact person
- contact email
- contact phone
- EIN
- 501(c)(3) status
- verification workflow status

## Service Rules

- Public screens must not call Supabase base tables directly for profiles, listings, or rescue discovery.
- Public nearby discovery service functions must not send live caller latitude or longitude to Supabase RPCs.
- Public nearby discovery must use `marketplace_search_preferences` and approved `marketplace_search_areas`.
- Clients may read safe area labels through `get_marketplace_search_areas`, but must never read area centroids directly.
- Clients may update search preferences only through `set_marketplace_search_area`.
- Direct client writes to `profiles.latitude` and `profiles.longitude` are forbidden.
- Public service functions must fail closed. If a public RPC is unavailable, show a friendly error instead of falling back to raw table reads.
- Owner management screens may use owner-authenticated table reads where RLS enforces ownership.
- Owner mutations for `profiles`, `listings`, and `rescue_profiles` must use Phase C controlled RPCs, not direct table writes.
- New public fields require this document, the SQL RPC return contract, and security tests to be updated together.

## Private Messaging Data

Messaging data is not public discovery data.

Allowed only to conversation participants or admins:

- conversation rows
- message rows
- unread state
- private message attachment metadata
- signed message-image URLs

Never expose publicly:

- `messages.attachment_path`
- `messages.attachment_bucket`
- signed message-image URLs
- raw `messages.image_url` legacy external values
- block rows
- conversation participant ids outside participant/admin contexts

Message images must use the private `message-images` bucket and short-lived signed URLs. Signed URLs must not be persisted.
