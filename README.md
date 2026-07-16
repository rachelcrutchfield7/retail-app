# ReTail Mobile App

ReTail is a secondhand pet marketplace for buying, selling, donating, messaging, and supporting local rescues.

## Current Feature Status

Implemented for closed beta:

- Supabase authentication and persistent profiles
- Persistent listings, listing images, categories, search, and favorites
- Rescue Hub with verified rescues, wishlists, and urgent needs
- Realtime messaging, unread counts, blocking, and reports
- Transactions, reviews, in-app notifications, settings, and account deletion
- Web export and EAS build configuration for preview builds

Deferred from beta:

- Public app-store launch
- Real Stripe production payments
- Shipping labels and tracking
- AI features, subscriptions, trades, and community groups

## Technical Stack

- Expo, React Native, TypeScript
- Supabase Auth, PostgreSQL, Storage, Realtime, and RLS
- TanStack React Query
- PNPM
- EAS Build

## Local Setup

Install dependencies:

```sh
pnpm install
```

Copy the environment template:

```sh
cp .env.example .env.local
```

Fill in:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_APP_ENV
```

Never commit `.env.local`, service-role keys, database passwords, Apple keys, Google service-account files, or signing credentials.

## Running The App

Development server:

```sh
pnpm start
```

Web preview:

```sh
pnpm web
```

Production-style web export:

```sh
pnpm export:web
pnpm preview
```

## Quality Checks

```sh
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm export:web
```

Live Supabase checks are opt-in:

```sh
pnpm test:live
```

## Supabase Setup

Apply SQL files through the Supabase SQL Editor in order:

1. `supabase/schema.sql`
2. `supabase/policies.sql`
3. `supabase/storage.sql`
4. feature patches such as `distance.sql`, `rescue_accounts.sql`, `listing_getting_options.sql`, `listing_detail_fields.sql`, `realtime_messaging.sql`, `report_uniqueness.sql`
5. `supabase/sprint5_step1_enum_values.txt`
6. `supabase/sprint5_step2_trust_settings.txt`
7. `supabase/sprint55_security_remediation.sql`

Use a staging or beta Supabase project for beta testers. Do not point closed beta builds at production user data.

## EAS Beta Builds

Preview builds:

```sh
pnpm build:preview:ios
pnpm build:preview:android
```

Production builds, only when ready:

```sh
pnpm build:production:ios
pnpm build:production:android
```

## Documentation

- [Beta Testing](docs/BETA_TESTING.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [QA Matrix](docs/QA_MATRIX.md)
- [Security Policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Known Beta Limitations

- Operating-system push notifications are not fully enabled; in-app notifications are available.
- Stripe protected checkout is gated until production Stripe Connect is configured.
- Some older prototype screens remain in the repository for reference, but Sprint 4/Sprint 5 shell is the active app experience.
- Manual QA is still required before TestFlight or Google Play internal testing.

## Security Reporting

Report security concerns privately. Do not open public GitHub issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
