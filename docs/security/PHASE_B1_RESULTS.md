# ReTail Security Remediation Phase B.1 Results

## Scope

Phase B.1 focused only on nearby search privacy and migration reconciliation.

Completed source changes:

- Reconciled the local Phase B migration filename with Supabase migration history.
- Added Supabase migration `20260717134801_phase_b1_server_derived_nearby_origin.sql`.
- Dropped coordinate-based nearby RPC overloads.
- Recreated `get_nearby_listings` without caller latitude/longitude arguments.
- Recreated `get_nearby_rescues` without caller latitude/longitude arguments.
- Changed nearby RPCs to derive the caller origin from `auth.uid()` and the authenticated user's private saved profile location.
- Kept nearby RPC execution restricted to authenticated users.
- Updated listing and rescue services so they no longer send `user_latitude` or `user_longitude`.
- Updated regression tests for the new privacy model.

## Private Location Source

Phase B.1 uses the existing owner-private `profiles.latitude` and `profiles.longitude` fields as the saved search origin.

This avoids creating a duplicate sensitive location table. Direct client access remains protected by RLS and existing profile ownership rules. Public nearby responses continue to expose only city/state and approximate `distance_band`.

Phase B.2 supersedes this model. Nearby discovery now uses `marketplace_search_preferences.search_area_id` and server-controlled `marketplace_search_areas.centroid`, not profile latitude/longitude.

## Fallback Behavior

If a signed-in user does not have a valid saved profile location, the nearby RPC raises the safe marker `RETAIL_LOCATION_REQUIRED`.

The app catches that marker and falls back to the regular public feed rather than sending live device coordinates or querying private base tables directly.

## Verification Status

Source-level verification:

- Phase B.1 regression tests were added in `tests/securityPhaseB1.test.mjs`.
- `node --test tests/securityPhaseB.test.mjs tests/securityPhaseB1.test.mjs` passed.
- `pnpm test -- tests/securityPhaseB.test.mjs tests/securityPhaseB1.test.mjs` could not run because pnpm attempted a registry fetch and module purge in a non-interactive environment.

Database verification:

- Supabase migration history shows `20260717134801_phase_b1_server_derived_nearby_origin` applied to the target project.
- Live function signatures do not include `user_latitude` or `user_longitude`.
- The old coordinate-based nearby overloads are removed.
- Anonymous users do not have execute permission on nearby RPCs.
- Authenticated users have execute permission on the new nearby RPC signatures.
- The missing saved-location path returns the safe marker `RETAIL_LOCATION_REQUIRED`.
- A rollback-only live test confirmed both nearby RPCs execute when an authenticated profile has a valid saved private location.

Supabase advisors:

- Security advisors were run after applying the migration.
- Performance advisors were run after applying the migration.
- Remaining advisor findings are pre-existing and outside this narrow Phase B.1 scope, including `public.spatial_ref_sys` RLS, mutable search paths on older helper functions, public bucket listing policies, security-definer advisor warnings, missing foreign-key indexes, and RLS policy optimization warnings.

## Public Data Contract

Public nearby discovery must not accept or return exact caller coordinates.

Allowed nearby inputs:

- radius
- pagination
- category/search/price/condition/listing type filters

Disallowed nearby inputs:

- caller latitude
- caller longitude
- arbitrary caller point

## Remaining Required Work

- Address remaining advisor findings in the appropriate future security/performance phase.
- Keep Phase B, Phase B.1, and Phase B.2 tests in the release gate.

Phase B.2 results are documented in `PHASE_B2_RESULTS.md`.

No Phase C remediation was performed in this phase.
