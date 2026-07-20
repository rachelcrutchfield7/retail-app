# Private Beta Readiness Results

Date: 2026-07-20
Branch: `private-beta-build-prep`
Base commit: `105bdb4f827a33b31e079e773ba02619521a6562`

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
3. Run `public.prepare_account_deletion_for_user(target_user_id uuid)` from the Edge Function's admin client.
4. Archive active/draft/pending listings and remove account-owned convenience records.
5. Anonymize the profile and retain safety/audit records.
6. Remove disposable account-owned `avatars/` and `listings/` Storage objects.
7. Call `auth.admin.deleteUser(user.id, true)` from the Edge Function only.

The obsolete `public.prepare_current_account_deletion()` RPC has been dropped. The replacement `public.prepare_account_deletion_for_user(uuid)` has `EXECUTE` denied to `public`, `anon`, and `authenticated`, and granted only to `service_role`.

Applied migrations:

| Migration | Purpose |
| --- | --- |
| `20260720010133_private_beta_secure_account_deletion.sql` | Adds trusted account-deletion preparation RPC and removes the old direct client RPC |
| `20260720014405_private_beta_saved_search_notification_context.sql` | Allows trusted saved-search alert timestamp updates during listing creation |
| `20260720015113_private_beta_profile_deletion_context.sql` | Allows trusted account-deletion profile anonymization |
| `20260720015350_private_beta_profile_deletion_stats_context.sql` | Allows trusted account-deletion counter refreshes during cleanup |
| `20260720120248_private_beta_account_deletion_server_only_preparation.sql` | Drops the authenticated preparation RPC and adds the service-role-only preparation RPC |

Live disposable verification passed: 1 test, 1 passed.

Covered live assertions:

- malicious request body target is ignored
- authenticated callers cannot execute the server-only preparation RPC
- the obsolete authenticated preparation RPC no longer exists
- deleted user cannot sign in afterward
- deleted user refresh token cannot renew the session
- stale access token cannot mutate protected data
- profile is anonymized
- active listing is archived
- favorites, saved searches, device tokens, notification preferences, privacy settings, and notifications are removed
- conversations and messages are retained as safety records
- account deletion audit event is written
- a real avatar object is created and removed
- a real listing-image object is created and removed
- a real message-image object is created and retained with conversation history
- local session cleanup succeeds after server deletion, including local-scope sign-out fallback
- Realtime subscriptions are removed during local account cleanup
- stale fixture preflight cleanup runs before the live test
- current-run disposable fixtures are removed after the test
- independent zero-fixture verification returns zero marked Auth users, profiles, listings, and Storage objects

Old disposable fixture cleanup:

| UUID | Result |
| --- | --- |
| `156821a7-d4d9-4833-bb62-bc6e1d77e98f` | verified disposable, removed from Auth, app tables, and Storage |
| `80590c22-c0b3-4163-bda1-d238c9c6b54e` | verified disposable, removed from Auth, app tables, and Storage |
| `428f9067-2fcb-4d89-b5b2-626967763509` | verified disposable, removed from Auth, app tables, and Storage |
| `30888cfb-a499-46cc-a528-f9f4f0e6d676` | verified disposable, removed from Auth, app tables, and Storage |

## Readiness Inventory

| Item | Current Status | Private Beta Impact | Blocks Beta | Automated Fix Available | Manual Verification Required | Owner | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Environment selection | Release-like envs are validated | Prevents local/CI config in beta builds | No | Complete | Confirm real beta env values | Rachel | `src/constants/config.ts` |
| Supabase credentials | Public anon key only in app config; EAS preview env currently lacks Supabase URL/key | Prevents service-role exposure and build-time misconfiguration | Yes until EAS values are added | Complete | Add public Supabase URL/key to EAS preview environment | Rachel | `.env.example`, EAS config output |
| Payment processing | Stripe backend not enabled; button disabled when not ready | Prevents partial payment flow | No | Complete | Legal/payment review before enabling | Rachel | `src/services/paymentService.ts`, `PaymentChoiceCard.tsx` |
| Shipping labels | Not implemented | Testers can only discuss shipping in chat | No | Not needed | Confirm known limitation with testers | Rachel | `docs/private-beta/KNOWN_BETA_LIMITATIONS.md` |
| Account deletion | Edge Function deletes Auth identity after service-role-only database preparation | Required trust/safety workflow | No | Complete | Re-test before public launch | Codex | `delete-account`, `prepare_account_deletion_for_user`, live disposable test |
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
| Supabase migration list | passed from full-history workspace; local and remote include `20260720120248` |
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

## Final Workflow Evidence

Final GitHub Actions evidence for the base account-deletion branch has been verified.

| Workflow | Run ID | Commit SHA | Conclusion |
| --- | --- | --- | --- |
| `ReTail CI` | `29742649173` | `105bdb4f827a33b31e079e773ba02619521a6562` | `success` |
| `ReTail Security Baseline` | `29742649344` | `105bdb4f827a33b31e079e773ba02619521a6562` | `success` |

## First Beta Build Preparation

| Item | Status | Evidence |
| --- | --- | --- |
| EAS account authentication | complete | `npx eas-cli whoami` returned the `raecrutchfield` account |
| EAS project link | complete | Project `@raecrutchfield/retail`, ID `288a25e1-5824-4f77-a3f4-0607df5f7d89` |
| EAS preview variables | complete | Preview environment contains `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Feedback destination | manual verification required | No approved support email, feedback form, or private tester channel is configured in the repository |
| Android build | blocked pending owner approval | EAS CLI does not expose charge/quota confirmation before starting a build |
| Real-device smoke test checklist | complete | `docs/private-beta/FIRST_DEVICE_SMOKE_TEST.md` |
| Supabase dashboard checklist | complete | `docs/private-beta/SUPABASE_BETA_DASHBOARD_REVIEW.md` |

## Release Decision

The branch may become a private beta release candidate after final branch checks and GitHub Actions pass.

ReTail is not approved for a small controlled private beta until these items are completed or explicitly accepted by Rachel as controlled private beta risks:

- Auth dashboard checklist
- Storage live/dashboard verification
- Realtime multi-account isolation test
- backup status review
- incident response owner/contact route
- tester feedback destination
- installable preview build or documented owner approval to start build
