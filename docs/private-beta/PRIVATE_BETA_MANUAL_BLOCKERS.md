# Private Beta Manual Blockers

Date: 2026-07-22
Branch: `android-startup-crash-fix`

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
| GitHub final workflow verification | Complete | Codex | Final branch commit `05430288d93a80d6dc6b33244ec3f3cb58e350e0` passed `ReTail CI` run `29886032662` and `ReTail Security Baseline` run `29886032736`. |
| EAS preview public environment variables | Complete | Codex/Rachel | EAS preview contains `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Do not commit real values. |
| Android build status | Blocked | Codex/Rachel | EAS Android preview APK build `a6fcb7b1-3b57-432a-b348-64e5541923dc` finished and installed, but failed initial startup with the global error boundary. Replacement build is required from `android-startup-crash-fix`. |
| First-device smoke test | Manual verification required | Rachel | Complete `docs/private-beta/FIRST_DEVICE_SMOKE_TEST.md` on Rachel's Android device before inviting outside testers. |
| Supabase Auth dashboard review | Manual verification required | Rachel | Verify site URL, redirect URLs, email confirmation, password settings, rate limits, reset redirects, leaked-password protection, and CAPTCHA decision. |
| Storage bucket review | Manual verification required | Rachel/Codex | Verify bucket privacy, file limits, MIME types, and ownership/read/update/delete policies for `avatars`, `listings`, and `message-images`. |
| Multi-account Realtime isolation test | Manual verification required | Rachel/Codex | Confirm messages and notifications do not leak across disposable accounts, including after sign-out/account switch. |
| Backup availability and accepted risk | Manual verification required | Rachel | Confirm current Supabase plan backup availability, retention, PITR status, and Storage backup limitations. |
| Incident-response owner and contact method | Manual verification required | Rachel | Choose who receives urgent beta reports and how testers should reach that person. |
| Tester feedback destination | Manual verification required | Rachel | Choose a controlled support email, private form, or private tester group. If a URL is chosen later, add it as `EXPO_PUBLIC_BETA_FEEDBACK_URL` rather than hardcoding it. |
| Open PostGIS support ticket `SU-426513` | Manual verification required | Supabase/Rachel | Supabase Security Advisor continues to report RLS disabled on the Supabase-managed `public.spatial_ref_sys` PostGIS table. The project role cannot safely remediate the ownership-controlled extension table. Ticket `SU-426513` is open. No destructive PostGIS migration has been applied. This is not documented as an active breach. |
