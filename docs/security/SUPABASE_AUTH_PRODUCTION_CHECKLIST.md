# Supabase Auth Production Checklist

Date: 2026-07-19

## Required Before Beta

- [ ] Email confirmations are enabled.
- [ ] Password reset emails use ReTail branding.
- [ ] Site URL and redirect URLs are restricted to approved domains and app links.
- [ ] JWT expiry is reviewed for the marketplace risk level.
- [ ] Refresh token/session behavior is reviewed.
- [ ] Leaked password protection is enabled where available.
- [ ] Password strength requirements match the ReTail auth specification.
- [ ] Google Sign-In settings use approved OAuth clients.
- [ ] Apple Sign-In settings use approved Apple identifiers.
- [ ] Admin accounts are limited to Rachel and explicitly approved helpers.
- [ ] Test accounts are labeled or removed before launch.

## Private Beta Verification Status

| Setting | Status | Manual Step |
| --- | --- | --- |
| Email confirmation | not verified | Supabase Dashboard -> Authentication -> Providers / Email |
| Password reset branding | not verified | Supabase Dashboard -> Authentication -> Email Templates |
| Site URL and redirect URLs | not verified | Supabase Dashboard -> Authentication -> URL Configuration |
| JWT/session settings | not verified | Supabase Dashboard -> Authentication -> Sessions |
| Leaked password protection | not verified | Supabase Dashboard -> Authentication -> Security |
| Anonymous sign-in | not verified | Supabase Dashboard -> Authentication -> Providers |
| OAuth providers | not verified | Supabase Dashboard -> Authentication -> Providers |
| CAPTCHA/bot protection | future enhancement | Decide before public beta or broader launch |
| MFA | future enhancement | Roadmap item, not required for small controlled private beta |

## Email Templates

ReTail auth emails should be branded and should not expose internal implementation details.

Templates to review:

- Confirm signup
- Reset password
- Magic link, if enabled later
- Email change confirmation

## Account Controls

- [ ] Banned users cannot perform state-changing RPCs.
- [ ] Soft-deleted users cannot perform state-changing RPCs.
- [ ] Deleted profile display names are sanitized.
- [ ] Active listings are archived when an account is deleted.

## Notes

Supabase dashboard settings are not fully represented in SQL migrations. This checklist must be verified manually in the live project before beta approval.
