# ReTail Security Remediation Phase B Results

## Scope

Phase B focused only on public data exposure and exact-location privacy.

Completed source changes:

- Added Supabase migration `20260716173451_phase_b_public_location_privacy.sql`.
- Removed broad public read policies for `profiles`, `listings`, and `rescue_profiles`.
- Added persisted `privacy_settings`.
- Added safe public RPCs for profiles, listings, and rescue discovery.
- Restricted nearby listing and rescue RPC execution to authenticated users.
- Removed public-service fallbacks that queried raw `profiles`, `listings`, or `rescue_profiles` rows.
- Changed listing and rescue public mappers to use distance bands instead of exact distance or coordinates.
- Added Phase B regression tests for public data contracts and unsafe fallback prevention.

## Verification Status

Source-level verification:

- Phase B regression tests were added in `tests/securityPhaseB.test.mjs`.
- Full local verification results should be read from the latest command output before merging.

Database verification:

- The migration has not been claimed as applied to production from this document.
- Supabase advisor results have not been claimed from this document.
- Live direct-API verification must be performed after applying the migration to the target Supabase project.

## Public Data Contract

The public contract is documented in `docs/security/PUBLIC_DATA_CONTRACT.md`.

Public responses must not include:

- exact coordinates
- ZIP codes
- street addresses
- exact numeric distances
- rescue contact-person data
- rescue EIN or 501(c)(3) status
- raw profile/listing/rescue rows

## Location Privacy Model

The model is documented in `docs/security/LOCATION_PRIVACY_MODEL.md`.

Precise location may be stored for server-side filtering, but public output must use city/state and distance bands only.

## Remaining Required Work

Before treating Phase B as complete in production:

- Apply the migration to a test Supabase project.
- Run Supabase database advisors.
- Verify anonymous REST requests cannot read private base-table rows.
- Verify authenticated users can only read their own private base-table rows.
- Verify public RPCs return only allowlisted fields.
- Verify nearby RPCs return distance bands and are not callable by anonymous users.

No Phase C remediation was performed in this phase.
