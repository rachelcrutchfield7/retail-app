# ReTail Security Model

## Scope

This document describes the security boundaries for the ReTail mobile app, Supabase database, storage buckets, and client services as of Security Phase E.

## Core Boundaries

- Public users may browse safe marketplace and rescue discovery data.
- Signed-in users may manage only their own profile, listings, favorites, conversations, reports, settings, and device tokens.
- Rescue verification and administrative moderation are admin-controlled.
- Reports, audit logs, device tokens, exact coordinates, and moderation fields are private.
- Message and transaction records are participant-scoped and cannot be reassigned by clients.

## Client Credential Rules

The mobile bundle may contain only client-safe Supabase credentials:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The app rejects public environment values that look like service credentials, database URLs, JWT signing secrets, or database passwords.

## Session Storage

- iOS and Android Supabase sessions use Expo SecureStore.
- Web sessions use browser storage and inherit browser/XSS risk.
- Sign-out clears private React Query data.
- Supabase auth-state changes trigger cache isolation between accounts.

## Public Data Access

Public discovery should use safe RPCs:

- `get_nearby_listings`
- `get_public_listing_detail`
- `get_nearby_rescues`
- `get_public_profile`

These RPCs avoid exact coordinates, full ZIP codes, ship-from ZIP codes, full profile JSON, admin flags, ban flags, and rescue street addresses.

## Protected Writes

High-risk actions use database-controlled functions:

- `submit_report`
- `has_existing_report`
- `mark_conversation_read`
- `soft_delete_own_message`
- `complete_listing_transaction`
- `create_transaction_review`
- `get_user_review_summary`
- `admin_update_report`
- `mark_notification_read`
- `delete_my_notification`
- `update_my_notification_preferences`
- `register_my_device_token`

The database sets server-controlled fields such as reporter ID, review participants, notification recipient/content, transaction status, timestamps, and audit records. Generic client-created notifications are not part of the active model.

## Storage

- Avatars are public-read and owner-managed.
- Listing images remain public-read for the current MVP; this is an accepted beta risk.
- Message images are private to conversation participants.
- Message image upload checks conversation participation and blocking state.

## Admin Controls

Admin status and verification status are database-protected fields. Users cannot promote themselves, verify themselves, update ratings, update counts, ban accounts, or directly change deletion state.

## Known Limits

This security model does not replace an independent penetration test. Native preview builds still need mobile binary scanning, and the live Supabase project still needs Supabase advisor review after the SQL is applied.
