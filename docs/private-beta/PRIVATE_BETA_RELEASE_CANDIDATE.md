# Private Beta Release Candidate

Date: 2026-07-19
Branch: `private-beta-readiness`
Base commit: `4e1ad48a5f5d6a5d58a78d65759f0c8eb3f012e5`

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
| Migrations aligned | complete | Supabase migration list includes remote/local `20260719175607` |
| Static tests passing | complete | `CI=true pnpm test` |
| Workflows green | manual verification required | Required for final private beta branch commit |
| No high or critical advisory | complete | Dependency audit gate passes with one moderate transitive advisory |
| Secret scans passing | complete | Working-tree and history secret scans |
| No disposable fixtures | manual verification required | Live disposable tests must be run before inviting testers |

## Product

| Item | Status | Evidence |
| --- | --- | --- |
| Core listing flow works | complete | Static and service tests pass |
| Messaging works | complete | Static messaging tests pass; live full messaging beta test remains manual |
| Blocking works | complete | Static and Phase F live tests cover block limits |
| Reporting works | complete | Static and Phase F live tests cover report limits |
| Reviews work | complete | Phase E/F tests cover review eligibility and limits |
| Notifications work | complete | Persistent notification model and tests exist |
| Account deletion works | manual verification required | Server RPC exists; disposable Auth-user deletion test required |
| Unfinished high-risk features disabled | complete | Stripe checkout remains disabled unless backend readiness is complete |

## Operations

| Item | Status | Evidence |
| --- | --- | --- |
| Auth settings verified | manual verification required | Supabase dashboard review required |
| Storage settings verified | manual verification required | Bucket dashboard and live object tests required |
| Realtime verified | manual verification required | Multi-account hosted realtime test required |
| Backup configuration reviewed | manual verification required | Supabase plan/dashboard review required |
| Incident response owner assigned | manual verification required | Rachel must confirm owner/contact route |
| Support contact confirmed | manual verification required | Feedback destination not yet chosen |
| Tester group defined | manual verification required | Rachel must choose testers |
| Tester expectations prepared | complete | `docs/private-beta/PRIVATE_BETA_TEST_PLAN.md` and feedback docs |

## Build

| Item | Status | Evidence |
| --- | --- | --- |
| Package identifiers confirmed | complete | `com.raecrutchfield.retail` in `app.json` |
| Version confirmed | complete | `1.0.0` in `app.json` |
| Preview profile configured | complete | EAS `preview` profile uses `EXPO_PUBLIC_APP_ENV=beta` |
| Build generated | manual verification required | Do not run paid/cloud EAS build without explicit authorization |
| EAS preview Supabase variables | blocked | Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to EAS preview before building |
| Physical-device install tested | manual verification required | Required before inviting testers |

## Decision

Private beta release candidate is not approved until final branch workflows are green and the manual operational items above are either verified or explicitly accepted by Rachel as controlled private beta risks.
