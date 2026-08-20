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

- `pnpm security:audit` completed with network access and failed the High/Critical gate.
- Current advisory counts: low 3, moderate 6, high 12, critical 0.
- High advisories are transitive through Expo/Metro tooling and the marketing-site Astro dependency chain.
- No dependency upgrade was performed in this task.

## Supabase Advisors

Security Advisor:

- Total findings: 96
- INFO: 8
- WARN: 87
- ERROR: 1
- Notable categories: RLS-enabled/no-policy on server/RPC-owned tables, `spatial_ref_sys` RLS disabled, `citext`/`postgis` in public schema, SECURITY DEFINER RPC execute advisories, leaked-password protection disabled.

Classification:

- `spatial_ref_sys` / PostGIS / citext: pre-launch hardening review; do not blindly alter extension-owned objects.
- RLS-enabled/no-policy server tables: intentional/accepted where access is RPC or service-role controlled; review table-by-table before changing.
- SECURITY DEFINER execute advisories: mixed intentional and review-required; public discovery/profile RPCs are intentionally exposed, admin/server functions require focused review before public launch.
- Leaked Password Protection: deferred until Supabase plan upgrade before public launch.

Performance Advisor:

- Total findings: 170
- INFO: 53
- WARN: 117
- Notable categories: unindexed foreign keys, auth/RLS initplan optimization, unused indexes, multiple permissive policies.

Classification:

- Performance optimization, not a private-beta blocker unless tied to measured beta latency or launch-scale risk.
- Handle via focused forward-only migration tasks, not broad advisor cleanup.

## Remaining Checklist Items

- Review/triage dependency audit High advisories before public launch; decide whether Expo/Metro and marketing-site dependency alignment can be safely upgraded.
- Keep ShipStation live webhook smoke test deferred until normal device/setup access is available.
- Revisit Supabase advisor findings in focused tickets, especially `spatial_ref_sys`, extension placement, SECURITY DEFINER exposure classification, and high-impact missing indexes.
- Enable leaked-password protection after Supabase plan upgrade if required.
