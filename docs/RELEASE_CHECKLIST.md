# ReTail Release Checklist

Use this checklist before every beta build.

## Code Quality

- [ ] `pnpm install --frozen-lockfile` succeeds.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm format` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm export:web` succeeds.
- [ ] CI passes on the target branch.

## Supabase

- [ ] Correct environment selected: local, beta, or production.
- [ ] Required migrations and SQL patches applied.
- [ ] `supabase/sprint55_security_remediation.sql` applied after Sprint 5 SQL.
- [ ] RLS reviewed for every table.
- [ ] Storage bucket policies reviewed.
- [ ] No service-role keys exposed in the app.
- [ ] Supabase security and performance advisors reviewed.
- [ ] Account deletion tested with a disposable account.

## App Configuration

- [ ] `app.json` version updated.
- [ ] iOS build number updated in EAS/App Store Connect when needed.
- [ ] Android version code updated in EAS/Google Play when needed.
- [ ] Bundle identifiers confirmed.
- [ ] Icons and splash screens present.
- [ ] Permissions match implemented features.
- [ ] Legal pages are available.
- [ ] Support/security contact route works.

## Manual QA

- [ ] Authentication flow tested.
- [ ] Listings flow tested.
- [ ] Search and favorites tested.
- [ ] Messaging tested.
- [ ] Blocking tested.
- [ ] Transactions and reviews tested.
- [ ] Notifications tested.
- [ ] Reports tested.
- [ ] Settings tested.
- [ ] Rescue Hub tested.
- [ ] Web narrow viewport tested.
- [ ] iOS preview build tested.
- [ ] Android preview build tested.

## Build Commands

```sh
pnpm build:preview:ios
pnpm build:preview:android
pnpm export:web
```

## Release Decision

- [ ] No release-blocking issues remain.
- [ ] Accepted beta limitations are documented.
- [ ] Tester instructions are updated.
