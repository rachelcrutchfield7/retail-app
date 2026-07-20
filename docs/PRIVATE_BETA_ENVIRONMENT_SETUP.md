# Private Beta Environment Setup

Date: 2026-07-19
Branch: `private-beta-readiness`

## Purpose

This document defines the client-safe environment variables required for ReTail private beta builds.

Do not commit real values to the repository.

## Supported Environments

| Environment | `EXPO_PUBLIC_APP_ENV` | Use |
| --- | --- | --- |
| Development | `development` | Local development and simulator work |
| Private beta | `beta` | Internal TestFlight / Android preview testing |
| Production | `production` | Future public app store release |
| Test | `test` | Automated test environments |

Unsupported environment names must fail safely instead of silently falling back.

## Required Public Variables

```text
EXPO_PUBLIC_APP_ENV
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

## Optional Public Variables

```text
EXPO_PUBLIC_POSTHOG_KEY
EXPO_PUBLIC_SENTRY_DSN
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED
```

## Server-Only Values

Never place these in Expo public variables:

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_PASSWORD
SUPABASE_JWT_SECRET
STRIPE_SECRET_KEY
EAS_TOKEN
APPLE_PRIVATE_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
SENTRY_AUTH_TOKEN
```

## Private Beta Rules

- Use the EAS `preview` profile.
- `EXPO_PUBLIC_APP_ENV` must be `beta`.
- Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the EAS preview environment before starting a cloud build.
- Supabase URL must not point to `localhost`, `127.0.0.1`, `0.0.0.0`, or `example.supabase.co`.
- CI placeholder credentials must not be used in release-like builds.
- Stripe payments must remain disabled unless the complete backend payment lifecycle is reviewed and tested.

## Manual Verification Required

- Confirm private beta Supabase project URL.
- Confirm beta Auth redirect URLs in Supabase dashboard.
- Confirm push credentials only if OS push delivery is included in the beta.
- Confirm EAS credentials before starting a cloud build.
