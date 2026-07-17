# ReTail Security Remediation Phase C Results

Date: 2026-07-17
Status: Applied to Supabase project `ycwgsdigvpmprqreoqiz`

## Scope

Phase C hardened protected fields, direct table grants, owner write paths, and database helper function exposure for:

- `profiles`
- `listings`
- `rescue_profiles`

This phase did not implement messaging/storage remediation, transaction workflow redesign, or review/report/notification workflow redesign.

## Database Changes

Migration:

- `supabase/migrations/20260717174159_phase_c_protected_fields_least_privilege.sql`
- `supabase/migrations/20260717180029_phase_c_function_search_path_hardening.sql`

Added controlled write RPCs:

- `create_my_profile`
- `update_my_profile`
- `create_listing`
- `update_my_listing`
- `archive_my_listing`
- `delete_my_listing`
- `mark_my_listing_sold`
- `mark_my_listing_donated`
- `update_my_rescue_profile`
- `admin_set_rescue_verification`

Added protective triggers:

- `protect_profile_phase_c_fields_before_write`
- `protect_listing_phase_c_fields_before_write`
- `protect_rescue_profile_phase_c_fields_before_write`

Added private policy helpers:

- `private.is_admin`
- `private.is_account_active`

Updated RLS policies to call private helpers instead of public helper RPCs.

Revoked direct client write grants on:

- `public.profiles`
- `public.listings`
- `public.rescue_profiles`

Revoked client execution on internal helper and trigger functions, including public admin/account-active helpers, count triggers, location sync triggers, search-area helpers, and RLS automation helpers.

Hardened internal helper function `search_path` settings for:

- `set_updated_at`
- `enforce_listing_image_limit`
- `safe_uuid`
- `sync_listing_location_point`
- `sync_rescue_location_point`

## App Changes

Updated profile flows:

- Profile creation now calls `create_my_profile`.
- Profile editing now calls `update_my_profile`.

Updated listing flows:

- Listing creation now calls `create_listing`.
- Listing editing now calls `update_my_listing`.
- Listing archive/delete/sold/donated actions now call dedicated lifecycle RPCs.
- General listing edit input no longer exposes `status`.

Updated rescue flows:

- Rescue profile save now calls `update_my_rescue_profile`.
- Rescue approval/rejection now calls `admin_set_rescue_verification`.

Updated transaction flow:

- Completing a listing without a linked buyer now uses the protected listing lifecycle functions instead of directly updating `listings.status`.

Updated account deletion:

- Removed direct table-update fallback. Account deletion now requires the server-side `delete_current_account` function.

## Live Verification

Verified in Supabase:

- `anon` has no insert access to `profiles`.
- `authenticated` has no insert/update access to `profiles`, `listings`, or `rescue_profiles`.
- `authenticated` can execute the approved owner-write RPCs.
- `authenticated` cannot execute public `is_admin(uuid)`.
- `authenticated` cannot execute public `is_account_active(uuid)`.
- Target-table policies now reference `private.is_admin()` and `private.is_account_active()`.
- Public listing feed remains callable by `anon`.
- Phase C internal functions flagged for mutable search paths were recreated with explicit `set search_path = ''`.

## Known Boundaries

Phase C intentionally did not redesign:

- Message send/read authorization
- Storage bucket policy design
- Transaction/review/report/notification write workflows
- Listing image delete/upload storage path ownership

Those remain for later security phases.
