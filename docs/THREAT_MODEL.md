# ReTail Threat Model

## Primary Assets

- User accounts and sessions
- Public and private profile data
- Listings and listing images
- Conversations and message images
- Rescue verification records
- Reports and moderation data
- Notifications and device tokens
- Transactions and reviews

## Main Threats

| Threat | Risk | Mitigation |
| --- | --- | --- |
| Account takeover | Unauthorized marketplace access | Supabase Auth, secure native session storage, sign-out cache clearing |
| Broken object-level authorization | Reading or changing another user's data | RLS, participant checks, owner checks, admin checks |
| Privilege escalation | User makes self admin or verified | Profile and rescue protection triggers |
| Precise-location exposure | Exact user/listing/rescue location leaks | Safe discovery RPCs omit coordinates, full ZIPs, and addresses |
| Private-message exposure | Third party reads conversations | Conversation/message RLS and participant-only RPCs |
| Malicious uploads | Unsafe or excessive image uploads | Storage bucket file type/size limits; additional server-side image scanning remains future work |
| Notification spam | Client fabricates arbitrary notifications | Notification inserts removed from regular clients; secure notification function validates source event |
| Report abuse | User reads admin notes or sets status | Reports created through RPC; admin fields remain admin-only |
| Rescue impersonation | User self-verifies rescue | Rescue verification trigger and admin approval flow |
| Scraping | Bulk extraction of public marketplace data | Safe public RPCs, pagination, distance bucketing; production rate limits still required |
| Rate-limit bypass | Client bypasses local checks | Server-side function checks added for critical actions; edge/API-level rate limiting still required |
| Deleted-account data exposure | Removed account still appears with private info | Account deletion clears public profile fields and archives listings |
| Supply-chain compromise | Unsafe dependencies or secrets in repo | Pinned dependencies, lockfile, secret scan, CI checks |

## Trust Boundaries

- Mobile app code is not trusted for authorization.
- Supabase RLS, triggers, and security-definer RPCs enforce critical rules.
- Admin actions are trusted only when backed by protected database state.
- `user_metadata` is treated as display/onboarding input only, never authority.

## Residual Risks

- Listing images are still public-read for beta.
- Full mobile binary scanning has not been run.
- Supabase advisors must be run against the live project after applying SQL.
- Independent BOLA and abuse testing is still required before public launch.
