# ReTail Security Remediation Phase B Results

## Scope

Phase B focused only on public data exposure and exact-location privacy.

Completed source changes:

- Added Supabase migration `20260717125609_phase_b_public_location_privacy.sql`.
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

- Supabase migration history shows `20260717125609_phase_b_public_location_privacy` applied to the target project.
- Phase B.1 supersedes the Phase B nearby RPC signatures so caller coordinates are no longer accepted as public discovery inputs.
- Supabase advisor and live verification results for Phase B.1 are documented separately in `PHASE_B1_RESULTS.md`.

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

Before treating Phase B and Phase B.1 as complete in production:

- Keep the Phase B and Phase B.1 regression tests passing.
- Review Supabase advisors after every schema change.
- Continue periodic direct API checks against profiles, listings, rescues, and nearby RPCs.

No Phase C remediation was performed in this phase.
