# Sprint 5.5 Security Remediation Report

## Recommendation

Blocked from public beta until the Sprint 5.5 SQL is applied to the Supabase project and live authorization tests pass. After that, ReTail can move toward a controlled beta only if no Critical or High findings remain.

## Critical Findings

- Public discovery SQL returned exact listing coordinates, ZIP codes, ship-from ZIPs, full seller profile JSON, rescue coordinates, and rescue street addresses.
- Client-side notification creation could fall back to direct inserts.
- Broad update policies allowed direct API attempts against conversations, messages, transactions, and reviews.

## High Findings

- Native Supabase sessions were not using Expo SecureStore.
- The app still accepted the ambiguous `EXPO_PUBLIC_SUPABASE_KEY` variable.
- Reports could be inserted directly with client-controlled fields.
- Rescue owners could rely on broad profile management policy until database triggers enforced verification immutability.

## Medium Findings

- Listing images remain public-read for MVP.
- Message rate limiting is still partly application/database-function based and should move to Edge/API enforcement before public launch.
- Live Supabase advisors and external mobile binary scanning have not been run.

## Low Findings

- Security documentation was incomplete for beta review.
- Static tests existed for beta readiness but not for security gate-specific SQL.

## Remediated

- Added native SecureStore auth storage.
- Removed support for ambiguous Supabase public key variable.
- Added public-key safety checks.
- Added auth-state listener cache clearing.
- Added safe public RPCs for listings, rescue discovery, listing detail, and public profiles.
- Added SQL triggers protecting profile, rescue verification, conversation, message, transaction, and review fields.
- Added secure RPCs for reports, message read state, message soft delete, transaction completion, and notification creation.
- Removed risky client notification insert fallback.
- Moved report creation and duplicate checks to RPCs.
- Strengthened message image upload policy against blocked-user interaction.
- Added Sprint 5.5 security tests and security documentation.

## Files Changed

- `src/constants/config.ts`
- `src/lib/supabase.ts`
- `src/auth/AuthContext.tsx`
- `src/services/notificationService.ts`
- `src/services/reportService.ts`
- `src/services/messageService.ts`
- `src/services/transactionService.ts`
- `src/services/listingService.ts`
- `src/services/profileService.ts`
- `src/services/rescueService.ts`
- `src/types.ts`
- `supabase/sprint55_security_remediation.sql`
- `tests/sprint55SecurityGate.test.mjs`
- `docs/SECURITY_MODEL.md`
- `docs/THREAT_MODEL.md`
- `docs/SECURITY_TEST_MATRIX.md`
- `docs/PRIVACY_DATA_MAP.md`

## Verification Performed

- `CI=true pnpm typecheck`: passed.
- `CI=true pnpm lint`: passed with the local secret-pattern scanner.
- `CI=true pnpm format`: passed.
- `CI=true pnpm test`: passed. 98 tests passed; 10 live Supabase tests were skipped because `RUN_LIVE_SUPABASE_TESTS=1` was not enabled.
- `CI=true pnpm export:web`: passed.
- `CI=true npx expo install --check`: passed.
- `CI=true pnpm audit --audit-level high`: passed for High/Critical threshold; one Moderate advisory remains for transitive `uuid@7.0.3` through Expo config tooling.
- Quiet Git-history checks for committed env files and obvious key markers returned no matches.
- Gitleaks, Semgrep, Supabase CLI advisors, native binary scans, and live direct API authorization tests were not run locally because the required tools or live test setup were unavailable.

## Requires External Verification

- Independent penetration test focused on BOLA/IDOR.
- Supabase database advisors against the live project.
- Gitleaks or equivalent full Git history scan.
- Semgrep or equivalent SAST.
- Native iOS and Android build scans with MobSF or equivalent.
- Manual OWASP MASVS review on real devices.
