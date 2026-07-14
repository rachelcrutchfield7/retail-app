# ReTail Threat Model Draft

Date: 2026-07-14
Scope: Draft threat model based on repository and Supabase SQL review

## Protected Assets

User identity and account assets:

- Supabase auth user IDs.
- Email addresses and auth session tokens.
- Profile display names, usernames, avatars, bios, city/state, ZIP code, latitude, and longitude.
- Admin, verified, banned, account type, rating, review count, listing count, and completed sales fields.

Marketplace assets:

- Listings, listing photos, listing status, prices, pickup/meetup/shipping options, location details, counters, and seller IDs.
- Listing images and thumbnails.
- Favorites and saved searches.
- Search alert location preferences.

Rescue assets:

- Rescue organization names and public summaries.
- Animals rescued, urgent needs, wishlists, donation instructions, website, and public location.
- Private rescue verification data: contact person, contact email, contact phone, EIN, 501(c)(3) status, address lines, exact coordinates, verification state, verified-by admin, and verification timestamps.

Messaging and transaction assets:

- Conversations, participants, messages, image messages, read receipts, offers, payment-option selections, transactions, and completed-transaction records.
- Private message images stored in Supabase Storage.

Trust and safety assets:

- Reviews and ratings.
- Reports, evidence, admin notes, assigned admin, and resolution status.
- Blocks.
- Notifications and device tokens.
- Audit logs and rate-limit events.

Operational assets:

- Supabase project URL and public client key.
- Supabase service-role key and database credentials, which must never be in the app bundle.
- EAS, app-store, push notification, analytics, Sentry, Stripe, GitHub, and Supabase dashboard credentials.

## Trust Boundaries

Client app boundary:

- The mobile app and web preview are untrusted from a security perspective.
- Any TypeScript validation, button visibility, route guard, or service function can be bypassed by a direct Supabase request.
- The public Supabase client key is assumed to be available to attackers.

Supabase API boundary:

- Supabase Auth authenticates users.
- RLS policies, grants, triggers, and RPC functions are the main enforcement layer.
- `SECURITY DEFINER` functions cross an important trust boundary because they can bypass ordinary RLS.

Storage boundary:

- Public buckets expose objects by URL.
- Private buckets require correct storage policies and signed URL handling.
- Database rows and storage objects can get out of sync.

Admin boundary:

- Admin-only actions include banning users, verifying rescues, reading reports, resolving reports, reading audit logs, and creating system notifications.
- Admin UI must not be the only control; database policies must enforce admin privileges.

External service boundary:

- Expo/EAS, app stores, Supabase, Stripe, push notification providers, analytics, and crash reporting are external trust zones.
- Only publishable public keys belong in app configuration.

## Entry Points

Authentication:

- Email/password registration.
- Login.
- Password reset.
- Session refresh.
- Account deletion.

Public marketplace:

- Home feed.
- Search.
- Listing detail.
- Public profile views.
- Rescue Hub.

Authenticated marketplace:

- Create listing.
- Edit listing.
- Favorite listing.
- Manage my listings.
- Report listing.
- Saved searches and alerts.

Messaging:

- Start conversation.
- Send text message.
- Send image message.
- Mark messages read.
- Delete own message.
- Make offer, accept, decline, or counter.
- Payment option selection.

Trust and moderation:

- Create review.
- Create report.
- Block/unblock user.
- Admin panel actions.
- Rescue verification approval.

Storage:

- Upload avatar.
- Upload listing images.
- Upload message images.
- Delete uploaded images.

Supabase direct API:

- REST table queries.
- RPC calls.
- Storage object upload/read/delete.
- Realtime subscriptions.

## Threat Actors

Anonymous visitor:

- Has public app bundle and public Supabase key.
- Can query public REST endpoints and RPCs allowed to `anon`.
- Can scrape public listings, profiles, and rescue data.

Malicious authenticated user:

- Has their own valid Supabase session.
- Can bypass the app UI and call Supabase directly.
- Can choose arbitrary UUIDs, request hidden columns, alter request payloads, replay requests, and upload directly.

Malicious seller:

- Can create and manage listings.
- May try to inflate counters, misrepresent listing status, fabricate transactions, or manipulate reviews.

Malicious buyer:

- Can start conversations, send messages, create reports, create favorites, and potentially spam or harass.

Fake rescue applicant:

- May try to self-verify, publish fraudulent urgent needs, or collect donations under false identity.

Blocked user:

- May try to continue messaging, upload message images, create notifications, or interact through indirect features.

Compromised admin:

- Can access high-value moderation and trust data.
- Requires audit logging and least-privilege operational controls.

External attacker:

- May exploit package vulnerabilities, web XSS, exposed credentials, app-bundle secrets, or misconfigured Supabase grants.

## Authentication Boundaries

Expected controls:

- Supabase Auth is the source of authentication.
- Native sessions are stored with `expo-secure-store`.
- Web preview sessions use localStorage and should be treated as lower-trust.
- On sign-out, auth state and React Query cache should be cleared.
- Account status checks must happen in database policies and RPCs.

Primary risks:

- Client-side checks do not prevent direct API access.
- User-editable auth metadata should not grant role, admin, or rescue verification authority.
- If account deletion relies on client fallback, deletion may be incomplete.
- Web localStorage sessions are exposed if web XSS occurs.

## Private-Data Flows

Profile flow:

1. User signs up.
2. App writes or hydrates `profiles`.
3. Public screens show profile summaries.
4. Admin and owner views may need private profile details.

Primary risks:

- Public profile RLS policies can expose all profile columns, not only public summary fields.
- Admin and trust flags may be queryable if base table access remains public.
- ZIP code and precise coordinates should not be public.

Rescue flow:

1. Rescue account signs up.
2. Rescue profile captures organization details and verification information.
3. Admin approves or rejects rescue verification.
4. Rescue Hub displays public rescue details, urgent needs, and wishlist items.

Primary risks:

- EIN, contact email, contact phone, private address, and verification state can leak through public table access.
- Rescue owners must not be able to self-verify.
- Public address display should be an explicit, enforced setting.

Moderation flow:

1. User reports listing, user, or message.
2. Report creates moderation record.
3. Admin reads report evidence and notes.
4. Admin resolves or dismisses.

Primary risks:

- Report evidence and admin notes must never be public.
- User-created reports should not be able to set trusted fields such as status, assigned admin, or resolved timestamp.

## Location-Data Flows

Listing location:

1. Seller enters city/state/ZIP or current location.
2. Listing stores city, state, ZIP, latitude, longitude, and location point.
3. Feed/search sorts by distance.
4. UI displays city/state and approximate distance.

Rescue location:

1. Rescue enters city/state and possibly physical address.
2. Rescue stores address, ZIP, latitude, longitude, and location point.
3. Rescue Hub sorts by distance and displays public details.

Primary risks:

- Exact latitude/longitude, ZIP code, street address, and shipping ZIP can be exposed through direct table reads.
- Distance RPCs can become location oracles if repeated with different origins.
- Public address display must be opt-in and enforced server-side.

Recommended public behavior:

- Return city/state and coarse distance only.
- Never return raw `latitude`, `longitude`, `zip_code`, `address_line1`, `address_line2`, or `ship_from_zip_code` from public APIs.
- For rescues, return public address only when explicitly enabled and approved.

## File-Upload Flows

Avatar upload:

1. User selects image.
2. App uploads to `avatars` bucket.
3. Profile stores avatar URL.

Listing image upload:

1. Seller selects images.
2. App uploads to `listings` bucket.
3. `listing_images` stores image URL and thumbnail URL.
4. Public listing views show active listing images.

Message image upload:

1. Participant selects image.
2. App uploads to private `message-images` bucket.
3. Message stores image URL.
4. Conversation participants view signed image.

Primary risks:

- External `http` image URLs can bypass storage controls.
- Public listing bucket objects remain readable by URL after listing removal.
- Storage objects can become orphaned if database and storage cleanup drift.
- Image EXIF metadata may leak private information.
- Message signed URLs should be short-lived and generated only for participants.

## Messaging Flows

Conversation creation:

1. Buyer opens a listing.
2. Buyer starts or reuses a conversation with seller.
3. Database must ensure buyer is not seller, listing is active, and users are not blocked.

Message sending:

1. Participant sends text or image.
2. Database must ensure sender is a participant and users are not blocked.
3. Notification may be created for the other participant.
4. Realtime should deliver only to participants.

Read receipts:

1. Conversation opens.
2. Unread incoming messages are marked read.
3. Only participants can update read state.

Primary risks:

- Blocked users continuing to message if older policies are live.
- Message images bypassing private storage.
- Client-side rate limiting bypass.
- Realtime subscriptions leaking data if not covered by RLS.
- Conversation participants being changed if older update policies are live.

## Moderation Flows

Reports:

- Users can report listing, user, or message.
- Admins can review reports.
- Admin notes and evidence are private.

Blocks:

- Users can block another user.
- Blocked users should not be able to start conversations, send messages, upload message images, or complete transactions together.

Admin:

- Admin users can verify rescues, moderate reports, ban users, and manage content.
- Admin actions should be logged in audit logs.

Primary risks:

- Admin flags exposed through public profile reads.
- `is_admin` helper callable directly for arbitrary UUIDs.
- Admin panel UI relying on client checks instead of RLS.
- Lack of verified live database policy state.

## Abuse Scenarios

1. Exact location scraping:
   - Attacker queries public profile/listing/rescue tables and extracts location fields.

2. Rescue fraud:
   - Fake rescue attempts to self-verify or expose urgent needs as verified.

3. Counter inflation:
   - Seller updates listing counters directly to appear more popular.

4. Transaction fabrication:
   - Seller marks an unrelated user as buyer/recipient, creating review eligibility.

5. Message image tracking:
   - User sends external image URL that tracks recipient IP/browser.

6. Spam:
   - User bypasses client rate limit and inserts messages directly.

7. Notification spoofing:
   - User creates misleading notification rows if older policies remain live.

8. Report pollution:
   - User creates reports with untrusted status/evidence/admin fields if older policies remain live.

9. Removed media access:
   - Archived listing images remain accessible through public storage URLs.

10. Cached data after account switch:
   - Query cache should clear on sign-out; account-switch edge cases need tests.

## Account Deletion and Retention Risks

Expected behavior:

- Account deletion should soft-delete or anonymize profile data.
- Active listings should be archived.
- Device tokens and sensitive account preferences should be removed.
- Historical transaction and moderation evidence may be retained for trust and safety.

Risks:

- Client-side fallback deletion can be incomplete if the server RPC is missing.
- Retained report, transaction, and message data must be documented in the privacy policy.
- Deleted users should not keep active sessions.
- Public profile/listing APIs must exclude deleted users and deleted content.

Recommended controls:

- Require server-side account deletion RPC in production.
- Add deletion verification tests.
- Document retained data clearly in legal policies.
- Consider scheduled cleanup/anonymization for stale media and private profile data where legally appropriate.
