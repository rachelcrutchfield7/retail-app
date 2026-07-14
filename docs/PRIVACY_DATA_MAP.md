# ReTail Privacy Data Map

## Profiles

Collected:

- Display name, username, bio, avatar
- City/state
- Private location preference such as ZIP or coordinates when supplied
- Ratings, review counts, listing counts
- Admin, ban, and verification flags

Public:

- Display name, username, bio, avatar, city/state, safe rating/count fields, verified badge

Private:

- ZIP code, coordinates, admin flags, ban flags, deletion fields

## Listings

Collected:

- Title, description, category, condition, price, photos
- City/state
- ZIP and coordinates for distance sorting
- Shipping and pickup options

Public:

- Listing details, city/state, approximate distance, safe seller summary, listing images

Private:

- Exact coordinates, full ZIP when not needed, ship-from ZIP

## Rescue Profiles

Collected:

- Organization name, animals rescued, summary, city/state
- Contact person, email/phone, website
- Organization type, nonprofit status, EIN when supplied
- Address and coordinates when supplied
- Verification status and admin approval data

Public:

- Name, summary, city/state, website, public contact hint, verification badge, active needs and wishlist items

Private:

- Exact coordinates, street address unless explicitly opted in, contact email/phone, EIN, verification admin fields

## Messages

Collected:

- Conversation participant IDs
- Text/image/system messages
- Read receipts

Access:

- Conversation participants only
- Preserved after deletion where needed for moderation

## Reports

Collected:

- Reporter ID
- Target listing/user/message
- Reason and details
- Moderation status and admin notes

Access:

- Admins can view moderation data
- Reporters receive only safe confirmation behavior from the app

## Notifications

Collected:

- Recipient ID, type, body, routing metadata, read state

Access:

- Owning user only
- Created through server-controlled logic

## Retention And Deletion

- User-facing deletions are generally soft deletes.
- Deleted account public profile fields are anonymized.
- Historical transaction, report, and moderation records may be retained for safety and abuse investigations.
