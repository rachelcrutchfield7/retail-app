# ReTail Security Remediation Phase A Results

Date: 2026-07-14
Branch: security-phase-a

## Scope

Phase A covered secrets, dependency hygiene, session storage, auth-state cache isolation, logging and analytics redaction, security scripts, CI, and verification tests.

No database schema, RLS, storage policy, messaging authorization, transaction, notification, or location privacy remediation was performed in this phase.

## Files Changed

Configuration:

- `.env.example`
- `.gitignore`
- `app.json`
- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/security.yml`

Security scripts and tests:

- `scripts/lint.mjs`
- `scripts/secret-scan.mjs`
- `tests/securityPhaseA.test.mjs`
- `docs/security/PHASE_A_RESULTS.md`

Runtime security hardening:

- `src/auth/AuthContext.tsx`
- `src/constants/config.ts`
- `src/lib/analytics.ts`
- `src/lib/logger.ts`
- `src/lib/queryClient.ts`
- `src/lib/supabase.ts`
- `src/services/realtimeService.ts`

## Dependency Changes

Added:

- `expo-doctor@1.20.0` as a pinned dev dependency for Expo compatibility verification.
- `expo-splash-screen@~57.0.2` to move splash screen configuration to the current Expo config plugin model.

Upgraded:

- None.

Removed:

- None.

Floating dependency versions:

- None found. No `latest` or `*` package versions are present in `package.json`.

## Environment and Secrets

`.gitignore` now excludes:

- `.env`
- `.env.*`
- credential and signing-key file types
- Google service account files
- generated build output
- logs
- coverage
- local Expo and dependency folders

`.env.example` contains variable names only and separates client-safe Expo public values from server-only secrets that must not be placed in the app bundle.

The app now uses the explicit public Supabase key variable:

- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The ambiguous legacy variable is not used:

- `EXPO_PUBLIC_SUPABASE_KEY`

Runtime config now rejects obvious server-only Supabase credentials in public Expo environment variables.

## Secret Scan

Established scanner:

- Gitleaks Action v2.3.9, pinned to `ff98106e4c7b2bc287b24eaf42907196329070c7`.
- Gitleaks binary version configured in CI: `8.24.3`.
- The workflow disables PR comments and SARIF artifact upload for Gitleaks findings.
- Local `gitleaks` command availability: not installed globally; pinned `8.24.3` binary was downloaded to `/private/tmp` for verification only.
- Local full working-tree scan: found ignored local `.env.local` and `.expo/dev/logs/*.log` copies of public Supabase Expo keys. Values were redacted. These files are not staged or tracked.
- Local clean staged-source current-tree scan: passed.
- Local Git-history scan: passed.
- CI current-tree scan: pending the verification patch workflow run.
- CI Git-history scan: pending the verification patch workflow run.

Project-specific supplemental scanner:

- `pnpm security:secrets`: passed.
- `pnpm security:secrets:history`: passed.

Suspected real credentials found:

- None in tracked source or Git history.
- Local ignored files contain public Supabase client keys, which are intentionally public/publishable but should remain uncommitted.

Credential rotation required:

- No. No service-role key, database password, private signing key, Stripe secret key, or other server-only credential was found.

Notes:

- The project intentionally contains security documentation and scanner code that mention secret-pattern names. Those references are allowlisted in the custom lint check, while `scripts/secret-scan.mjs` continues to scan for actual credential-shaped values.

## Session Storage and Auth Isolation

Native session storage:

- Uses Expo SecureStore through the Supabase auth storage adapter.
- Handles SecureStore read, write, and delete failures without logging session values.
- Falls back to in-memory storage only when secure storage is unavailable.

Web session storage:

- Continues to use browser localStorage through the Supabase client.
- Residual risk: web sessions remain subject to normal browser storage and XSS exposure risks. Further hardening belongs in later web security work.

Auth listener coverage:

- `SIGNED_IN`
- `SIGNED_OUT`
- `TOKEN_REFRESHED`
- `USER_UPDATED`
- `PASSWORD_RECOVERY`

Sign-out and account-switch isolation:

- Clears React Query caches.
- Removes realtime subscriptions.
- Resets analytics user state.
- Clears auth context state.
- Adds tests covering account-switch cache isolation.

## Logging and Analytics

Logger:

- Redacts sensitive keys recursively.
- Redacts token-like and secret-like string values.

Analytics:

- Sanitizes sensitive event properties before storing or sending.
- Redacts keys such as email, phone, exact coordinates, tokens, passwords, message bodies, report details, and device tokens.

## CI

`.github/workflows/security.yml` includes:

- frozen pnpm install
- Expo dependency compatibility check
- typecheck
- test suite
- lint
- production dependency audit gate
- custom working-tree secret scan
- custom Git-history secret scan
- Gitleaks established secret scan
- Gitleaks current-tree scan
- Gitleaks Git-history scan
- web export

Workflow triggers include:

- pushes to `main`
- pushes to `security-*` branches
- pull requests targeting `main`
- pull requests targeting `security-audit`
- manual workflow dispatch

Supply-chain pinning:

- `actions/checkout` v4.2.2 pinned to `11bd71901bbe5b1630ceea73d27597364c9af683`.
- `pnpm/action-setup` v4.1.0 pinned to `a7487c7e89a18df4991f7f222e4898a00d66ddda`.
- `actions/setup-node` v4.4.0 pinned to `49933ea5288caeca8642d1e84afbd3f7d6820020`.
- `gitleaks/gitleaks-action` v2.3.9 pinned to `ff98106e4c7b2bc287b24eaf42907196329070c7`.

No live Supabase credentials are required by the workflow.

Verification patch workflow result:

- Pending until the verification patch is pushed to `origin/security-phase-a` and GitHub Actions completes.

## Verification Results

Final verification was run with `CI=true` where needed because pnpm treats this non-interactive environment like CI and avoids local prompts.

- `pnpm install --frozen-lockfile`: initial non-CI run stopped on pnpm's non-interactive prompt; final `CI=true pnpm install --frozen-lockfile` passed.
- `pnpm exec expo install --check`: passed using Expo's local dependency map. Expo reported offline validation is less authoritative.
- `pnpm exec expo-doctor`: passed, 20/20 checks.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 117 tests total, 107 passed, 10 live Supabase tests skipped by default.
- `pnpm security:audit`: passed the High/Critical gate while reporting one Moderate transitive advisory.
- `pnpm export:web`: passed.
- `pnpm security:secrets`: passed.
- `pnpm security:secrets:history`: passed.
- `pnpm lint`: passed.

## Dependency Audit Findings

Unresolved production advisory:

- Severity: moderate
- Package: `uuid`
- Advisory: GHSA-w5hq-g745-h8pq
- Affected versions: `<11.1.1`
- Patched versions: `>=11.1.1`
- Path: transitive through Expo tooling, including `@expo/config-plugins -> xcode -> uuid`.

Decision:

- Not force-fixed in Phase A because this would require overriding or upgrading Expo-managed transitive dependencies. No direct app dependency currently pins the vulnerable package.
- The `security:audit` gate now fails for production High or Critical advisories only.
- Moderate and Low advisories remain visible in logs and in this report.
- The accepted Moderate advisory remains visible and documented.
- Critical advisory count: 0.
- High advisory count: 0.
- Moderate advisory count: 1.
- No high or critical advisories remain unresolved.

Verification patch commit:

- Pending until commit creation.

## Expo Compatibility

Expo Doctor initially failed because `app.json` used the legacy top-level `splash` field. The splash settings were moved to the supported `expo-splash-screen` config plugin while preserving the same ReTail splash assets and colors.

Final Expo Doctor result:

- 20/20 checks passed.

## Residual Risks

Approved to proceed to Phase B with these known residual risks:

- One moderate transitive `uuid` advisory remains through Expo tooling.
- Web sessions use browser localStorage.
- Live Supabase integration tests remain opt-in through `RUN_LIVE_SUPABASE_TESTS=1`.
- Location privacy, RLS restructuring, messaging security, storage policy migration, transaction security, and notification remediation remain out of Phase A scope.

## Phase A Status

Phase A remediation is complete.

Proceed to Phase B: yes, after reviewing and accepting the documented residual risks.
