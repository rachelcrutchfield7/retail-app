# Phase F Final Authorization Review

Date: 2026-07-19

## Reviewed Boundaries

Phase F reviewed the final beta authorization surface across:

- listings
- favorites
- conversations
- messages
- reports
- reviews
- transactions
- notifications
- device tokens
- saved searches
- blocks
- public discovery RPCs
- admin report moderation

## Confirmed Patterns

- Sensitive writes are routed through controlled RPCs or database triggers.
- Caller identity is derived from `auth.uid()`, not request body user IDs.
- Private helper functions use fixed search paths and are not granted to app roles.
- Public discovery responses remain explicit-column RPC contracts.
- Exact coordinates, ZIP-level precision, admin flags, ban flags, private report details, and device-token values are not part of public contracts.
- Message-image storage remains participant-scoped.
- Report moderation remains admin-only and audited.

## Phase F Hardening Added

- Internal-only rate-limit events.
- Stable `RETAIL_ACCOUNT_NOT_ACTIVE` account-state rejection.
- Stable `RETAIL_RATE_LIMITED` rate-limit rejection.
- Database-level message spam guards.
- Saved-search cap and change throttles.
- Favorite self-denial and deterministic favorite notification dedupe.
- Bounded public search inputs.
- Admin moderation rate limit.

## Remaining Manual Verifications

These items require Supabase dashboard or production-operation access and must be checked before public beta:

- Auth leaked-password protection.
- Email confirmation enabled.
- OTP expiry and token lifetime settings.
- Redirect URL allowlist.
- MFA policy decision.
- Realtime publication exposure.
- Storage bucket policies in the live dashboard.
- Supabase security and performance advisors.
- Backup retention and restore drill.

## Result

Phase F completes the planned repository-side security remediation. Beta approval still depends on live migration verification, GitHub Actions, and the manual dashboard checklist.
