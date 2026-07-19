# Beta Security Readiness Checklist

Date: 2026-07-19
Status: Must be completed before public beta

## Code And CI

- [x] `CI=true pnpm install --frozen-lockfile`
- [x] `CI=true pnpm lint`
- [x] `CI=true pnpm exec tsc --noEmit`
- [x] `CI=true pnpm test`
- [x] `RUN_LIVE_SUPABASE_TESTS=1 node --import ./tests/register-ts-loader.mjs --test tests/securityPhaseFLive.test.mjs`
- [x] `CI=true pnpm exec expo-doctor`
- [x] `CI=true pnpm exec expo export --platform web`
- [x] `CI=true pnpm security:audit`
- [x] `CI=true pnpm security:secrets`
- [x] `CI=true pnpm security:secrets:history`
- [x] `node scripts/dependency-audit.mjs`

## Supabase

- [x] Phase F migration applied through Supabase migration workflow.
- [x] `supabase migration list` shows Phase F local and remote alignment.
- [x] Supabase security advisors reviewed.
- [x] Supabase performance advisors reviewed.
- [ ] Public schema exposure reviewed.
- [ ] RLS enabled on exposed tables.
- [x] Extension-managed `spatial_ref_sys` advisor risk documented.
- [ ] Realtime publication contains only required tables.
- [ ] Storage buckets checked for intended public/private access.

## Auth

- [ ] Email confirmation required.
- [ ] Password recovery enabled and branded.
- [ ] Leaked password protection enabled or exception documented.
- [ ] OTP/token expiry reviewed.
- [ ] Redirect URLs limited to approved app URLs.
- [ ] Admin accounts reviewed.
- [ ] Suspended/banned account behavior tested.

## Privacy

- [ ] Public listing feed hides exact coordinates and ZIP codes.
- [ ] Public rescue hub hides private rescue contact and verification data.
- [ ] Public profile hides admin/ban flags and private account fields.
- [ ] Message-image URLs are short-lived signed URLs.
- [ ] Logs and analytics do not include secrets, tokens, raw message bodies, or exact locations.

## Operations

- [ ] Incident response plan reviewed.
- [ ] Backup and recovery plan reviewed.
- [ ] Support contact route confirmed.
- [ ] Terms, privacy policy, community guidelines, and live-animal prohibition visible in app.
- [ ] Beta tester feedback path confirmed.

## Release Decision

ReTail is not beta-ready until every unchecked item is completed or explicitly accepted as documented risk by the project owner.
