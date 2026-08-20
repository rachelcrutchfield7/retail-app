# ReTail Backend & Security Day - Remaining Gate Results

Date: 2026-08-20
Supabase project: `ycwgsdigvpmprqreoqiz`

## Completed Security Items

- ShipStation tracking webhook hardening is complete and deployed as `shipping-tracking-webhook` version 4.
- Stripe webhook livemode hardening is complete and deployed as `stripe-webhook` version 19.
- Account deletion recent-auth hardening is complete and deployed as `delete-account` version 17.

## Git-History Secret Scan

Coverage:

- Reachable commits scanned: 136
- Refs covered: 86
- Method 1: existing working-tree secret scan, updated to ignore local Supabase `.temp` material and avoid source-code token-variable false positives.
- Method 2: local Git pickaxe history scan over all reachable commits for Supabase, Stripe, ShipStation, Firebase, email, Cloudflare, GitHub, private-key, bearer-token, and database credential patterns.

Result:

- Confirmed committed secret leak: no
- Active secret rotation required: no
- History rewrite required: no
- Ignored local secret material: `supabase/.temp/**`, gitignored and untracked

Manual review notes:

- Documentation lines containing `service-role-only` and `SHIPSTATION_*` environment variable names were false positives. No credential values were present.
- Firebase Android `google-services.json` is client app configuration, not a service-account private key.

## Stale Security Test Cleanup

Updated tests to validate the current migration-baseline architecture:

- Tests now read current active migrations or archived pre-baseline migration files through `tests/migrationTestUtils.mjs`.
- Archived migration filenames are no longer required to be active files under `supabase/migrations`.
- Stripe schema/readiness and checkout-reservation security tests now validate the recovered archived migration source.
- Payment-gate tests now match current server-gated protected checkout behavior.
- Location/privacy tests now allow current foreground-location reverse geocoding while continuing to block exact-coordinate submission to marketplace discovery/profile update paths.
- Messaging security tests now reflect the current canonical contract: listing conversations use the RPC path, while rescue conversations use a narrow RLS-validated direct insert for verified rescue owners.

## Regression Gate

Passed:

- Backend/security regression subset: 263/263
- TypeScript
- Lint
- Deprecated backend usage check
- Working-tree secret scan
- Expo config read
- Expo install check
- Expo Doctor

Known non-backend full-suite noise:

- `pnpm test` still includes protected UI polish/golden assertions that fail against the current approved UI implementation. No UI source was changed in this task.

Dependency audit:

- Dependency advisory triage is documented in `docs/security/DEPENDENCY_ADVISORY_TRIAGE_20260820.md`.
- `pnpm audit --prod` before safe overrides: low 3, moderate 6, high 12, critical 0.
- Safe transitive patch overrides were applied for `brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, and `postcss`.
- `pnpm audit --prod` after safe overrides: low 3, moderate 5, high 5, critical 0.
- Remaining High advisories are Expo/Metro `image-size` build-tooling advisories and Astro/sharp static marketing-site toolchain advisories. No remaining High advisory is classified as mobile installed-app runtime, Supabase Edge Function runtime, or active payment/shipping backend runtime.
- Expo SDK, React Native, and Astro major versions were not changed.

## Supabase Advisors

Focused advisor triage is documented in `docs/security/SUPABASE_ADVISOR_TRIAGE_20260820.md`.

Security Advisor:

- Total findings: 96
- INFO: 8
- WARN: 87
- ERROR: 1
- Notable categories: RLS-enabled/no-policy on server/RPC-owned tables, `spatial_ref_sys` RLS disabled, `citext`/`postgis` in public schema, SECURITY DEFINER RPC execute advisories, leaked-password protection disabled.

Classification:

- No public-launch security blocker was proven by advisor triage.
- Security Definer warnings are mostly intentional ReTail RPC architecture; admin functions are not anon-callable, use fixed `search_path`, and call `private.is_admin`.
- RLS-enabled/no-policy server tables have no anon/authenticated table privileges and remain intentionally server/RPC-owned.
- `spatial_ref_sys` / PostGIS / citext: deferred/accepted unless a focused extension migration is separately rehearsed.
- RLS-enabled/no-policy server tables: intentional/accepted where access is RPC or service-role controlled; review table-by-table before changing.
- SECURITY DEFINER execute advisories: mixed intentional and review-required; public discovery/profile RPCs are intentionally exposed, admin/server functions require focused review before public launch.
- Leaked Password Protection: deferred until Supabase plan upgrade before public launch.

Performance Advisor:

- Total findings: 170
- INFO: 53
- WARN: 117
- Notable categories: unindexed foreign keys, auth/RLS initplan optimization, unused indexes, multiple permissive policies.

Classification:

- Highest-value performance follow-up is targeted RLS initplan optimization for messaging, conversations, notifications, listings, profiles, favorites, and seller shipping origins.
- Hot-path RLS initplan optimization was applied in `20260820224215_hot_path_rls_initplan_optimization.sql`; auth initplan findings dropped from 33 to 19 and cleared the targeted findings for messages, conversations, notifications, profiles, listings, favorites, and blocks.
- Additive FK indexes were applied in `20260820225547_shipping_notification_fk_indexes.sql` for ShipStation shipping quote/detail, notification delivery, and listing reservation hot paths; unindexed foreign-key findings dropped from 20 to 10.
- The newly added indexes are flagged as unused on the low-traffic beta dataset, which is expected and should not trigger removal before real traffic.
- Performance optimization, not a private-beta blocker unless tied to measured beta latency or launch-scale risk.
- Handle via focused forward-only migration tasks, not broad advisor cleanup.

## Remaining Checklist Items

- Review/triage dependency audit High advisories before public launch; decide whether Expo/Metro and marketing-site dependency alignment can be safely upgraded.
- Keep ShipStation live webhook smoke test deferred until normal device/setup access is available.
- Revisit Supabase advisor findings in focused tickets, especially `spatial_ref_sys`, extension placement, SECURITY DEFINER exposure classification, and lower-priority report/support/review/Founding Seller FK indexes where query patterns justify them.
- Enable leaked-password protection after Supabase plan upgrade if required.
