# Private Beta Readiness Results

Date: 2026-07-20
Branch: `private-beta-gate-closure`
Base commit: `1111e4119a7264b4d32b854a3d10e53649929e49`

## Phase F Closure

Phase F is closed at `4e1ad48a5f5d6a5d58a78d65759f0c8eb3f012e5`.

Verified final Phase F workflow evidence:

| Workflow | Run ID | Commit SHA | Conclusion |
| --- | --- | --- | --- |
| `ReTail CI` | `29707640749` | `4e1ad48a5f5d6a5d58a78d65759f0c8eb3f012e5` | `success` |
| `ReTail Security Baseline` | `29707640751` | `4e1ad48a5f5d6a5d58a78d65759f0c8eb3f012e5` | `success` |

## Private Beta Gate Closure

Secure account deletion is implemented through the JWT-protected Supabase Edge Function `delete-account`.

The mobile app calls only the Edge Function. It does not call Supabase Admin Auth and does not contain a service-role key.

Server-side flow:

1. Verify the caller from the request JWT.
2. Ignore any target user ID in the request body.
3. Run `public.prepare_current_account_deletion()` as the authenticated caller.
4. Archive active/draft/pending listings and remove account-owned convenience records.
5. Anonymize the profile and retain safety/audit records.
6. Remove disposable account-owned `avatars/` and `listings/` Storage objects.
7. Call `auth.admin.deleteUser(user.id, true)` from the Edge Function only.

Applied migrations:

| Migration | Purpose |
| --- | --- |
| `20260720010133_private_beta_secure_account_deletion.sql` | Adds trusted account-deletion preparation RPC and removes the old direct client RPC |
| `20260720014405_private_beta_saved_search_notification_context.sql` | Allows trusted saved-search alert timestamp updates during listing creation |
| `20260720015113_private_beta_profile_deletion_context.sql` | Allows trusted account-deletion profile anonymization |
| `20260720015350_private_beta_profile_deletion_stats_context.sql` | Allows trusted account-deletion counter refreshes during cleanup |

Live disposable verification passed: 1 test, 1 passed.

Covered live assertions:

- malicious request body target is ignored
- deleted user cannot sign in afterward
- deleted user refresh token cannot renew the session
- stale access token cannot mutate protected data
- profile is anonymized
- active listing is archived
- favorites, saved searches, device tokens, notification preferences, privacy settings, and notifications are removed
- conversations and messages are retained as safety records
- account deletion audit event is written
- listing and avatar Storage cleanup path is exercised
- message-image retention is explicit
- disposable fixtures are removed after the test

## Readiness Inventory

| Item | Current Status | Private Beta Impact | Blocks Beta | Automated Fix Available | Manual Verification Required | Owner | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Environment selection | Release-like envs are validated | Prevents local/CI config in beta builds | No | Complete | Confirm real beta env values | Rachel | `src/constants/config.ts` |
| Supabase credentials | Public anon key only in app config; EAS preview env currently lacks Supabase URL/key | Prevents service-role exposure and build-time misconfiguration | Yes until EAS values are added | Complete | Add public Supabase URL/key to EAS preview environment | Rachel | `.env.example`, EAS config output |
| Payment processing | Stripe backend not enabled; button disabled when not ready | Prevents partial payment flow | No | Complete | Legal/payment review before enabling | Rachel | `src/services/paymentService.ts`, `PaymentChoiceCard.tsx` |
| Shipping labels | Not implemented | Testers can only discuss shipping in chat | No | Not needed | Confirm known limitation with testers | Rachel | `docs/private-beta/KNOWN_BETA_LIMITATIONS.md` |
| Account deletion | Edge Function deletes Auth identity after trusted database preparation | Required trust/safety workflow | No | Complete | Re-test before public launch | Codex | `delete-account`, `prepare_current_account_deletion`, live disposable test |
| Auth dashboard | Dashboard settings not fully verifiable from repo | Email/reset/session risk | Yes until reviewed or accepted | No | Supabase dashboard checklist | Rachel | `docs/security/SUPABASE_AUTH_PRODUCTION_CHECKLIST.md` |
| Storage buckets | SQL policies exist; live dashboard limits need review | Upload privacy and abuse risk | Yes until reviewed/tested | Partial | Live bucket tests | Rachel/Codex |
| Realtime isolation | Code removes subscriptions on sign-out; hosted multi-account test pending | Cross-account privacy risk | Yes until tested or accepted | Partial | Manual/live multi-account test | Rachel/Codex |
| Backup and recovery | Plan documented; plan status not verified | Operational recovery risk | Yes until reviewed or accepted | No | Supabase plan/dashboard review | Rachel | `docs/security/BACKUP_AND_RECOVERY_PLAN.md` |
| Incident response | Plan exists; owner/contact route pending | Safety response clarity | Yes until owner confirmed | No | Owner assignment | Rachel |
| Legal/safety access | Settings includes legal/safety content and live-animal prohibition | Tester trust and policy clarity | No | Complete | Legal review before public launch | Rachel | `src/sprint4/Sprint4App.tsx`, docs/legal |
| Private beta feedback | Process documented; destination pending | Tester support route | Yes until destination chosen | No | Choose feedback channel | Rachel | `docs/private-beta/TESTER_FEEDBACK_PROCESS.md` |

## Build Configuration

| Field | Status | Evidence |
| --- | --- | --- |
| App display name | complete | `ReTail` in `app.json` |
| Expo slug | complete | `retail` in `app.json` |
| Expo project ID | complete | `288a25e1-5824-4f77-a3f4-0607df5f7d89` in `app.json` |
| Android package | complete | `com.raecrutchfield.retail` |
| iOS bundle identifier | complete | `com.raecrutchfield.retail` |
| Version | complete | `1.0.0` |
| Android version code | manual verification required | EAS remote versioning is enabled |
| iOS build number | manual verification required | EAS remote versioning is enabled |
| Preview profile | complete | EAS `preview` profile uses `EXPO_PUBLIC_APP_ENV=beta` |
| Production profile | complete | EAS `production` profile uses `EXPO_PUBLIC_APP_ENV=production` |
| EAS preview environment values | manual verification required | EAS config shows no plain text/sensitive preview variables beyond profile `EXPO_PUBLIC_APP_ENV`; add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` before building |

## Baseline Verification

| Check | Result |
| --- | --- |
| Supabase migration list | passed; local and remote include `20260720015350` |
| Install | passed |
| Lint | passed |
| TypeScript | passed |
| Static tests | passed: 181 tests, 167 passed, 14 skipped |
| Expo Doctor | passed: 20/20 |
| Web export | passed |
| Expo public config | passed |
| EAS Android preview config | passed; build not started |
| EAS iOS preview config | passed; build not started |
| Dependency audit | passed gate; one moderate transitive `uuid` advisory, no high or critical |
| Working-tree secret scan | passed |
| Git-history secret scan | passed |
| Private beta account deletion live Supabase test | passed: 1 test, 1 passed |

## Release Decision

The branch may become a private beta release candidate after final branch checks and GitHub Actions pass.

ReTail is not approved for a small controlled private beta until these items are completed or explicitly accepted by Rachel as controlled private beta risks:

- Auth dashboard checklist
- Storage live/dashboard verification
- Realtime multi-account isolation test
- backup status review
- incident response owner/contact route
- tester feedback destination
- EAS preview Supabase public environment values
- installable preview build or documented build handoff
