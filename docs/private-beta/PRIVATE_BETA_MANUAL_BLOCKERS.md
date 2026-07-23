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
| Android build status | Manual verification required | Codex/Rachel | Expo inlining-corrected EAS Android preview APK build `5622183a-fff9-4c01-888b-abff277088c5` finished successfully from commit `9d5b9eba4cf62c8653cb53b623bca4eb4872cc9a`. Rachel must install and open it on device before outside testers are invited. |
| First-device smoke test | Manual verification required | Rachel | Complete `docs/private-beta/FIRST_DEVICE_SMOKE_TEST.md` on Rachel's Android device before inviting outside testers. |
| Supabase Auth dashboard review | Manual verification required | Rachel | Verify site URL, redirect URLs, email confirmation, password settings, rate limits, reset redirects, leaked-password protection, and CAPTCHA decision. |
| Storage bucket review | Manual verification required | Rachel/Codex | Verify bucket privacy, file limits, MIME types, and ownership/read/update/delete policies for `avatars`, `listings`, and `message-images`. |
| Multi-account Realtime isolation test | Manual verification required | Rachel/Codex | Confirm messages and notifications do not leak across disposable accounts, including after sign-out/account switch. |
| Backup availability and accepted risk | Manual verification required | Rachel | Confirm current Supabase plan backup availability, retention, PITR status, and Storage backup limitations. |
| Incident-response owner and contact method | Manual verification required | Rachel | `support@retailpetapp.com` is the public support route for safety/user/payment/report issues. Rachel still needs to confirm who monitors urgent beta reports and expected response windows. |
| Tester feedback destination | Complete | Rachel | `contact@retailpetapp.com` is live for general questions and beta access. `support@retailpetapp.com` is live for payment issues, user issues, account access, reports, and safety concerns. If a URL is chosen later, add it as `EXPO_PUBLIC_BETA_FEEDBACK_URL` rather than hardcoding it. |
| Open PostGIS support ticket `SU-426513` | Manual verification required | Supabase/Rachel | Supabase Security Advisor continues to report RLS disabled on the Supabase-managed `public.spatial_ref_sys` PostGIS table. The project role cannot safely remediate the ownership-controlled extension table. Ticket `SU-426513` is open. No destructive PostGIS migration has been applied. This is not documented as an active breach. |
