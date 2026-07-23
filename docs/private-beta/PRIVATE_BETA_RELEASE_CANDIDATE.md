# Private Beta Release Candidate

Date: 2026-07-22
Branch: `android-startup-crash-fix`
Clean base branch: `private-beta-build-prep`
Clean base commit: `4d0fa790e24a3f6133f23b541ae9232d2c70666e`
Known secure account-deletion commit: `105bdb4f827a33b31e079e773ba02619521a6562`

Allowed statuses:

```text
complete
blocked
manual verification required
not applicable
```

## Code And Database

| Item | Status | Evidence |
| --- | --- | --- |
| Phase A through Phase F complete | complete | Phase F branch closed at `4e1ad48a5f5d6a5d58a78d65759f0c8eb3f012e5` |
| Private beta gate closure | complete | Secure account deletion, saved-search notification context, profile deletion context, and server-only account-deletion preparation migrations applied |
| Migrations aligned | complete | Supabase migration list includes remote/local `20260720120248` from full-history verification workspace |
| Static tests passing | complete | `CI=true pnpm test`: 195 tests, 181 passed, 14 skipped |
| Workflows green | complete | Base commit `105bdb4f827a33b31e079e773ba02619521a6562` passed `ReTail CI` run `29742649173` and `ReTail Security Baseline` run `29742649344` |
| No high or critical advisory | complete | Dependency audit gate passes with one moderate transitive advisory |
| Secret scans passing | complete | Working-tree and history secret scans |
| No disposable fixtures | complete | Private beta gate live account-deletion test cleanup passed |
| PostGIS advisor item | manual verification required | Supabase ticket `SU-426513` remains open for `public.spatial_ref_sys`; no migration changes PostGIS |

## Product

| Item | Status | Evidence |
| --- | --- | --- |
| Core listing flow works | complete | Static and service tests pass |
| Messaging works | complete | Static messaging tests pass; live full messaging beta test remains manual |
| Blocking works | complete | Static and Phase F live tests cover block limits |
| Reporting works | complete | Static and Phase F live tests cover report limits |
| Reviews work | complete | Phase E/F tests cover review eligibility and limits |
| Notifications work | complete | Persistent notification model and tests exist |
| Account deletion works | complete | `delete-account` Edge Function deletes Auth identity after service-role-only `prepare_account_deletion_for_user`; live disposable test passed |
| Unfinished high-risk features disabled | complete | Stripe checkout remains disabled unless backend readiness is complete |

## Operations

| Item | Status | Evidence |
| --- | --- | --- |
| Auth settings verified | manual verification required | Supabase dashboard review required |
| Storage settings verified | manual verification required | Bucket dashboard and live object tests required |
| Realtime verified | manual verification required | Multi-account hosted realtime test required |
| Backup configuration reviewed | manual verification required | Supabase plan/dashboard review required |
| Incident response owner assigned | manual verification required | Rachel must confirm owner/contact route |
| Support contact confirmed | complete | `contact@retailpetapp.com` and `support@retailpetapp.com` are live through the domain; support is reserved for payment issues, user issues, account access, reports, safety concerns, and moderation questions |
| Tester group defined | manual verification required | Rachel must choose testers |
| Tester expectations prepared | complete | `docs/private-beta/PRIVATE_BETA_TEST_PLAN.md` and feedback docs |
| PostGIS support ticket tracked | complete | `docs/private-beta/PRIVATE_BETA_MANUAL_BLOCKERS.md` records `SU-426513` as an external platform issue |

## Build

| Item | Status | Evidence |
| --- | --- | --- |
| Package identifiers confirmed | complete | `com.raecrutchfield.retail` in `app.json` |
| Version confirmed | complete | `1.0.0` in `app.json` |
| Preview profile configured | complete | EAS `preview` profile uses `EXPO_PUBLIC_APP_ENV=beta` |
| Build generated | complete pending first-device smoke test | Expo inlining-corrected Android preview APK build `5622183a-fff9-4c01-888b-abff277088c5` finished successfully from commit `9d5b9eba4cf62c8653cb53b623bca4eb4872cc9a` |
| EAS preview Supabase variables | complete | Preview environment has `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; do not commit real values |
| Build charge confirmation | complete | No payment, plan upgrade, or charge approval prompt appeared before or during build start |
| Physical-device install tested | manual verification required | Required before inviting testers |

## First Android Private Beta Build

| Field | Result |
| --- | --- |
| Build ID | `a6fcb7b1-3b57-432a-b348-64e5541923dc` |
| Platform | Android |
| Build profile | `preview` |
| Distribution | Internal |
| Build type | APK |
| Git commit SHA | `05430288d93a80d6dc6b33244ec3f3cb58e350e0` |
| App version | `1.0.0` |
| Android version code | `1` |
| Final status | `FINISHED` |
| Completed at | `2026-07-22T02:40:42.123Z` |
| Build page | https://expo.dev/accounts/raecrutchfield/projects/retail/builds/a6fcb7b1-3b57-432a-b348-64e5541923dc |
| Installation availability | APK artifact is available from EAS; the direct artifact URL is not stored in repository documentation |
| Android credentials | Existing remote Android signing credentials were used |

## Android Startup Crash Repair

| Field | Result |
| --- | --- |
| Repair branch | `android-startup-crash-fix` |
| Failed build ID | `a6fcb7b1-3b57-432a-b348-64e5541923dc` |
| Failed build result | Installed successfully, failed initial startup with the global error boundary |
| Most likely root cause | Startup auth listener setup could synchronously fail through the lazy Supabase proxy without a safe startup state or diagnostic details |
| Fix | Auth startup now validates the Supabase client before subscribing, catches setup failures, surfaces an explicit startup state, and adds beta-only redacted diagnostics to the global error boundary |
| Replacement build ID | `7a9364af-eadb-4580-ba66-2df791e3ce92` |
| Replacement build source commit | `73574ad9e3c87a73f57cafa4d4af1b9e8daec902` |
| Replacement build status | `FINISHED`; installed and opened successfully on Rachel's Android device |
| Replacement build result | Startup was blocked by "Startup needs attention" because compiled Supabase public configuration was missing. |
| Replacement build page | https://expo.dev/accounts/raecrutchfield/projects/retail/builds/7a9364af-eadb-4580-ba66-2df791e3ce92 |
| Corrected build-time gate | Added `scripts/validate-beta-build-config.mjs` through the `eas-build-pre-install` hook. |
| Corrected build ID | `1bacbcf6-bfb9-4a36-9e69-39e3b7e7b59b` |
| Corrected build source commit | `99998e9d8b3e55c289ad96894d0ed7f00335fb74` |
| Corrected build status | `FINISHED`; installed and opened, but still displayed the missing Supabase configuration warning because the Expo client bundle used indirect `process.env` access and did not inline the public variables. |
| Corrected build page | https://expo.dev/accounts/raecrutchfield/projects/retail/builds/1bacbcf6-bfb9-4a36-9e69-39e3b7e7b59b |
| Expo public environment inlining fix | Real app config now passes a statically referenced `bundledRuntimeEnv` object into `readConfigFromEnv`, and `readConfigFromEnv` no longer defaults to `process.env`. |
| Android bundle inlining verification | `Bundled Supabase URL present: yes`; `Bundled Supabase public key present: yes`; `Bundled app environment beta: yes`. |
| Inlining-corrected build ID | `5622183a-fff9-4c01-888b-abff277088c5` |
| Inlining-corrected build source commit | `9d5b9eba4cf62c8653cb53b623bca4eb4872cc9a` |
| Inlining-corrected build status | `FINISHED`; physical-device smoke test pending. |
| Inlining-corrected build page | https://expo.dev/accounts/raecrutchfield/projects/retail/builds/5622183a-fff9-4c01-888b-abff277088c5 |

## Decision

Private beta release candidate is ready for Rachel's Expo inlining-corrected Android first-device smoke test. External private beta testers are not approved until build `5622183a-fff9-4c01-888b-abff277088c5` opens successfully on Rachel's device without the Supabase startup warning and the remaining manual operational items above are either verified or explicitly accepted by Rachel as controlled private beta risks.
