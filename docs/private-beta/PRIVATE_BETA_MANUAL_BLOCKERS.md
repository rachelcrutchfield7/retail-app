# Private Beta Manual Blockers

Date: 2026-07-20
Branch: `private-beta-build-prep-final`

Allowed statuses:

```text
Complete
Manual verification required
Accepted beta risk
Blocked
Not applicable
```

| Item | Status | Owner | Notes |
| --- | --- | --- | --- |
| GitHub final workflow verification | Manual verification required | Codex | Verify `ReTail CI` and `ReTail Security Baseline` after the final branch push. |
| EAS preview public environment variables | Complete | Codex/Rachel | EAS preview contains `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Do not commit real values. |
| Android build status | Manual verification required | Codex/Rachel | Start an Android `preview` internal-distribution build only when credentials and cost/plan checks permit. |
| First-device smoke test | Manual verification required | Rachel | Complete `docs/private-beta/FIRST_DEVICE_SMOKE_TEST.md` on Rachel's Android device before inviting outside testers. |
| Supabase Auth dashboard review | Manual verification required | Rachel | Verify site URL, redirect URLs, email confirmation, password settings, rate limits, reset redirects, leaked-password protection, and CAPTCHA decision. |
| Storage bucket review | Manual verification required | Rachel/Codex | Verify bucket privacy, file limits, MIME types, and ownership/read/update/delete policies for `avatars`, `listings`, and `message-images`. |
| Multi-account Realtime isolation test | Manual verification required | Rachel/Codex | Confirm messages and notifications do not leak across disposable accounts, including after sign-out/account switch. |
| Backup availability and accepted risk | Manual verification required | Rachel | Confirm current Supabase plan backup availability, retention, PITR status, and Storage backup limitations. |
| Incident-response owner and contact method | Manual verification required | Rachel | Choose who receives urgent beta reports and how testers should reach that person. |
| Tester feedback destination | Manual verification required | Rachel | Choose a controlled support email, private form, or private tester group. If a URL is chosen later, add it as `EXPO_PUBLIC_BETA_FEEDBACK_URL` rather than hardcoding it. |
| Open PostGIS support ticket `SU-426513` | Manual verification required | Supabase/Rachel | Supabase Security Advisor continues to report RLS disabled on the Supabase-managed `public.spatial_ref_sys` PostGIS table. The project role cannot safely remediate the ownership-controlled extension table. Ticket `SU-426513` is open. No destructive PostGIS migration has been applied. This is not documented as an active breach. |
