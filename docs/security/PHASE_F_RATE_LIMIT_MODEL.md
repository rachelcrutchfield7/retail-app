# Phase F Rate Limit Model

Date: 2026-07-19
Migration: `supabase/migrations/20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql`

## Purpose

Phase F makes abuse limits database-enforced so a modified client cannot bypass them. App-side duplicate-submit prevention may still improve the user experience, but Supabase is the source of truth for protected write limits.

## Internal Event Store

Rate-limit events live in `public.rate_limit_events`, but the table is internal-only:

- RLS remains enabled.
- Direct `anon` and `authenticated` access is revoked.
- User-write and admin-read policies from earlier phases are removed.
- Events store action names, subject keys, caller IDs, timestamps, hashed fingerprints, and small non-private metadata only.

The table must not store:

- secrets
- tokens
- raw email addresses
- raw message bodies
- device-token values
- exact locations
- signed URLs
- private report details

## Helper API

`private.require_active_account()` derives the caller from `auth.uid()` and rejects inactive, suspended, deleted, or banned accounts with `RETAIL_ACCOUNT_NOT_ACTIVE`.

`private.check_rate_limit(...)` derives the caller from `auth.uid()`, locks the caller/action/subject tuple for the transaction, counts recent events, and raises `RETAIL_RATE_LIMITED` when the limit is exceeded.

Both helpers use fixed `search_path = ''` and are not executable by `anon` or `authenticated`.

## Enforced Limits

| Action | Limit |
| --- | --- |
| New conversation attempts | 20/hour/user |
| Messages | 60/minute/user and 300/hour/user |
| Same-conversation messages | 30/10 minutes/user/conversation |
| Image messages | 20/hour/user |
| Reports | 10/hour/user and 30/day/user |
| Reviews | 10/hour/user |
| Transaction completion attempts | 20/hour/seller |
| Listings created | 10/hour/user and 30/day/user |
| Listings edited/status changed | 60/hour/user |
| Favorite state changes | 100/hour/user |
| Saved-search changes | 30/hour/user |
| Active saved searches | 50/user |
| Block state changes | 30/hour/user |
| Device-token changes | 20/hour/user |
| Admin report updates | 300/hour/admin |

## Retention

Events default to a 60-day expiry. `private.cleanup_rate_limit_events(...)` deletes expired events in bounded batches and accepts only 30-to-90-day retention windows.

## Client Behavior

Services map `RETAIL_RATE_LIMITED` to friendly user messages. Screens should avoid retry loops and should keep buttons disabled while a write is in flight.
