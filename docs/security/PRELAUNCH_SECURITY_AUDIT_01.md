# ReTail Pre-Launch Security Audit 01

Date: 2026-08-08

Audit branch: `audit/prelaunch-security-authorization`

Starting branch: `feature/signup-consent-account-deletion`

Starting commit: `ff600df4608290ec2da1001c4607b4e4d0ec2447`

Golden Expo layout reference: `94d61284`

Golden Git reference: `golden-layout-94d61284`

## Scope

This is an audit-only pass over Supabase Auth, Postgres RLS, RPC authorization, Storage policies, Edge Function boundaries, secrets, account status, and cross-user access controls. No production behavior was changed.

Allowed audit artifacts only:

- `docs/security/*`
- `tests/security/*`
- `scripts/security/*`

## Evidence Sources

- Live Supabase advisors for project `ycwgsdigvpmprqreoqiz`
- Live Supabase catalog metadata for functions, policies, grants, schema privileges, and Storage buckets
- Repository SQL in `supabase/schema.sql`, `supabase/policies.sql`, `supabase/storage.sql`, and `supabase/migrations/*`
- Repository Edge Function source in `supabase/functions/delete-account/index.ts`
- Client service usage in `src/services/*`
- Existing security documentation in `docs/security/*`

## Important Limitations

- This task did not run destructive two-user tests against production data.
- Live Edge Functions exist for Stripe and notifications, but their implementation source is not present in this repository. Only their live deployment metadata and client callers were audited here. Their source must be reviewed before public launch.
- The Supabase dashboard-only Auth setting for leaked-password protection was verified through advisor output, not changed.

## Advisor Findings Investigated

| Advisor finding | Audit conclusion | Severity |
| --- | --- | --- |
| Leaked Password Protection Disabled | Confirmed dashboard Auth hardening gap. Requires manual Supabase Dashboard change. No app code change required. | MEDIUM |
| RLS enabled/no policy on `device_tokens` | Intentional RPC-only/service-role table. Direct anon/auth grants are absent. | INTENTIONAL / ACCEPTED |
| RLS enabled/no policy on `marketplace_search_areas` | Intentional service-role table exposed through `get_marketplace_search_areas()`. Direct anon/auth grants are absent. | INTENTIONAL / ACCEPTED |
| RLS enabled/no policy on `notification_preferences` | Intentional RPC-only/service-role table. Direct anon/auth grants are absent. | INTENTIONAL / ACCEPTED |
| RLS enabled/no policy on `rate_limit_events` | Intentional internal rate-limit ledger. Direct anon/auth grants are absent. | INTENTIONAL / ACCEPTED |
| `spatial_ref_sys` public without RLS | PostGIS-managed extension table. No ReTail user data found in it. Review separately during extension hygiene. | INFORMATIONAL |
| `citext` and `postgis` installed in public schema | Extension-management issue. No concrete ReTail exploit identified in this pass. | INFORMATIONAL |
| Public executable `SECURITY DEFINER` discovery RPCs | Mostly intentional public marketplace/rescue/profile reads. Returned columns reviewed; one rescue-address item needs product/privacy confirmation. | MIXED |

## Live Inventory Summary

- Application-owned `SECURITY DEFINER` functions in `public`/`private`: 114
- Extension-owned `SECURITY DEFINER` functions in `public`: 3 (`st_estimatedextent` overloads)
- Public/anonymous executable application-owned `SECURITY DEFINER` RPCs: 12
- Public/anonymous executable extension-owned `SECURITY DEFINER` RPCs: 3
- Authenticated executable public `SECURITY DEFINER` RPCs: 55
- Live Storage buckets: `avatars`, `listings`, `message-images`
- Live Edge Functions: `delete-account`, `send-notification`, `stripe-create-payment-intent`, `stripe-connect-account`, `stripe-account-status`, `stripe-connect-login-link`, `stripe-webhook`

## Confirmed Findings

### F-01: Supabase leaked-password protection is disabled

Severity: MEDIUM

Affected component: Supabase Auth dashboard configuration

Attack scenario: A user can choose a password that is already known from public breaches, increasing account-takeover risk if that password is reused elsewhere.

Evidence: Live Supabase security advisor reports `auth_leaked_password_protection` as disabled.

Existing protection: Email/password auth still uses Supabase Auth and normal password authentication. This finding is about breached-password screening.

Whether exploit appears possible: Yes, as a credential-stuffing risk if a user picks a compromised password.

Recommended remediation: In Supabase Dashboard, enable Auth password leaked-password protection. Test new signup and password-reset flows afterward. Existing users should not be forced to reset immediately unless Supabase policy requires it on password change.

Files / migrations / functions involved: Dashboard setting only; no repository file controls this.

Regression risk of fixing it: Low to medium. It can reject weak/compromised passwords during signup or password updates, so user-facing error messaging should be tested.

### F-02: Live Stripe and notification Edge Function source is not fully represented in this repository

Severity: MEDIUM

Affected component: Supabase Edge Functions

Attack scenario: Authorization, webhook signature, service-role, or input-validation behavior in deployed Edge Functions cannot be fully reviewed from source control if the function code is absent.

Evidence: Live project lists `send-notification`, `stripe-create-payment-intent`, `stripe-connect-account`, `stripe-account-status`, `stripe-connect-login-link`, and `stripe-webhook`. Repository contains source only for `supabase/functions/delete-account/index.ts`; `send-notification` is a placeholder README and Stripe function source is absent from `supabase/functions/`.

Existing protection: Live metadata shows JWT verification is enabled for the Stripe user-facing functions and disabled for `stripe-webhook`, which can be correct if the function validates the Stripe webhook signature internally. Client code calls these functions through Supabase function invocation rather than shipping server secrets.

Whether exploit appears possible: Needs verification. The deployment metadata alone does not prove an exploit, but missing source prevents a trustworthy code-level audit.

Recommended remediation: Before public launch, pull or commit the exact deployed Edge Function source for all live functions, then run a dedicated Edge Function and Stripe authorization audit. Confirm `stripe-webhook` verifies Stripe signatures and `send-notification` has an explicit trusted trigger/signature/secret model if JWT is disabled.

Files / migrations / functions involved: Live Edge Functions listed above; repository `supabase/functions/delete-account/index.ts`; placeholder `supabase/functions/send-notification/README.md`.

Regression risk of fixing it: Low if source sync is documentation-only; medium if authorization changes are made later.

### F-03: Public rescue v2 RPCs expose physical-location address fields

Severity: LOW

Affected component: Public Rescue Hub RPCs

Attack scenario: Anonymous callers can retrieve `zip_code`, `address_line1`, and `address_line2` for verified rescues whose `organization_type` is `physical_location`.

Evidence: Live `get_public_rescue_by_owner_v2` and `get_public_rescue_feed_v2` return `zip_code`, `address_line1`, and `address_line2` with `case when rp.organization_type = 'physical_location' then ... else null end`.

Existing protection: Only active, verified, non-deleted rescue profiles are returned. Non-physical-location rescues return null for address fields. Contact hint is gated by privacy setting.

Whether exploit appears possible: The data is intentionally public if a verified rescue has chosen physical-location type, but this is privacy-sensitive and needs explicit product confirmation.

Recommended remediation: Confirm Rachel's desired policy in writing: public street address only for verified rescues with a physical public facility, never for foster-based/private rescues. If confirmed, document it in the public data contract and rescue signup copy. If not confirmed, create a separate migration to remove street-address fields from public RPCs.

Files / migrations / functions involved: Public RPCs `get_public_rescue_by_owner_v2`, `get_public_rescue_feed_v2`; prior rescue profile changes.

Regression risk of fixing it: Medium. Removing public addresses could break the user-requested Rescue Hub physical-address display.

### F-04: `create_user_notification` uses a non-empty `search_path`

Severity: LOW

Affected component: Notification RPC

Attack scenario: In a weaker schema-privilege configuration, a mutable search path in a privileged function could allow object-shadowing attacks.

Evidence: Live `public.create_user_notification(...)` is `SECURITY DEFINER` with `SET search_path TO 'public', 'private'`.

Existing protection: Live schema privileges show `anon` and `authenticated` do not have `CREATE` privilege on `public`, `private`, or `storage`. The function also validates event-specific authorization for message, favorite, review, transaction, listing-status, and system notification cases.

Whether exploit appears possible: No practical exploit identified in the current schema privilege state. This is defense-in-depth.

Recommended remediation: In a separate hardening task, change the function to `SET search_path TO ''` and schema-qualify all referenced functions/tables.

Files / migrations / functions involved: `public.create_user_notification`.

Regression risk of fixing it: Low if schema qualification is complete; medium if any function/table reference is missed.

## Potential / Needs Verification

### P-01: `send-notification` is deployed with JWT verification disabled

Severity: NEEDS MANUAL VERIFICATION

Affected component: Live Edge Function `send-notification`

Attack scenario: If the function is callable without JWT and lacks its own shared-secret/signature check, an attacker may trigger notification delivery or probe notification behavior.

Evidence: Live Edge Function metadata reports `verify_jwt: false`. Repository only has `supabase/functions/send-notification/README.md`, not implementation source.

Existing protection: Unknown from repository.

Whether exploit appears possible: Cannot determine without deployed source.

Recommended remediation: Retrieve the deployed source or replace it with committed source, then verify it requires a trusted scheduler secret, service-to-service secret, or other non-user-callable authorization.

Regression risk of fixing it: Medium because notification delivery could stop if existing callers are not updated.

### P-02: `stripe-webhook` is deployed with JWT verification disabled

Severity: NEEDS MANUAL VERIFICATION

Affected component: Live Edge Function `stripe-webhook`

Attack scenario: If the webhook does not verify the Stripe signature, an attacker could forge payment events.

Evidence: Live Edge Function metadata reports `verify_jwt: false`, which is normal for Stripe webhooks only when the Stripe webhook signature is validated. Source is not present in repository.

Existing protection: Unknown from repository.

Whether exploit appears possible: Cannot determine without source.

Recommended remediation: Confirm `STRIPE_WEBHOOK_SECRET` is used and Stripe signature validation happens before any database write.

Regression risk of fixing it: Medium; webhook events are payment-critical.

### P-03: Suspended-account enforcement is broad but should be regression-tested live

Severity: NEEDS MANUAL VERIFICATION

Affected component: Mutation RPCs and RLS policies

Attack scenario: A banned/deleted user directly calls mutation RPCs while the UI hides actions.

Evidence: Many RPCs and policies call `private.is_account_active()` or `private.require_active_account()`, including listing writes, messages, conversations, reports, reviews, notifications, search preferences, device tokens, and rescue ownership writes.

Existing protection: Server-side checks are present across inspected mutation paths.

Whether exploit appears possible: No confirmed gap in inspected code. Needs staging/live negative tests with a suspended fixture account.

Recommended remediation: Add isolated staging tests for a banned user trying to create listings, send messages, create reports, upload images, and edit rescue data.

Regression risk of fixing it: Low if tests only.

## Intentional / Accepted Findings

### I-01: RPC-only tables with RLS and no direct policies

Severity: INTENTIONAL / ACCEPTED

Affected component: `device_tokens`, `marketplace_search_areas`, `notification_preferences`, `rate_limit_events`

Evidence: Live table grants for these four tables show only `service_role` privileges for direct table access. App access happens through controlled RPCs or internal triggers.

Security rationale:

- `device_tokens`: managed through `register_my_device_token` and `remove_my_device_token`; direct user table access would expose private device tokens.
- `notification_preferences`: managed through `get_my_notification_preferences` and `update_my_notification_preferences`; direct access is unnecessary.
- `marketplace_search_areas`: public read through `get_marketplace_search_areas`; direct grants are not needed.
- `rate_limit_events`: internal abuse ledger used by private rate-limit helpers; direct user access would aid bypass attempts.

Recommended action: Keep as-is unless a future feature requires direct table access.

### I-02: Public marketplace and rescue discovery RPCs

Severity: INTENTIONAL / ACCEPTED

Affected component: Public `SECURITY DEFINER` read RPCs

Evidence: Anonymous executable public RPCs return marketplace/rescue/profile/review discovery fields and filter to active, verified, non-deleted, non-banned rows where applicable.

Reviewed as safe public RPCs:

- `get_marketplace_search_areas`
- `get_public_listing_detail`
- `get_public_listing_feed`
- `get_public_listing_feed_sorted`
- `get_public_profile`
- `get_public_rescue`
- `get_public_rescue_by_owner`
- `get_public_rescue_feed`
- `get_public_user_listings`
- `get_user_review_summary`

Reviewed with manual privacy confirmation needed:

- `get_public_rescue_by_owner_v2`
- `get_public_rescue_feed_v2`

No unintended exposure of email, Stripe account IDs, payment IDs, consent state, device tokens, reports, private messages, or admin notes was found in the inspected return signatures.

### I-03: PostGIS/citext/spatial_ref_sys advisor items

Severity: INFORMATIONAL

Affected component: Supabase/PostGIS extension management

Evidence: Live advisors flag `postgis`, `citext`, and `spatial_ref_sys`.

Security rationale: These are extension-managed objects. No ReTail private user data is stored in `spatial_ref_sys`, and no direct ReTail exploit was identified.

Recommended action: Leave as-is for beta. Review extension schema hygiene in a separate database-maintenance task.

## RPC Authorization Audit

### Admin RPCs

Status: pass

- `admin_moderate_report` checks `auth.uid()` and `private.is_admin(caller_id)` before updating reports, deleting users, removing listings, removing messages, or sending admin report messages.
- `admin_set_rescue_verification` checks `auth.uid()` and `private.is_admin(caller_id)` before changing rescue verification.
- Legacy/deprecated `admin_update_report` calls `private.require_active_account()` and `private.is_admin(caller_id)` before delegating to its base function.
- Base admin function `admin_update_report_phase_f_base` is legacy/deprecated and is not executable by anon/authenticated users.

No client-provided admin ID is trusted for admin authorization in inspected admin RPCs.

### Listings and Listing Images

Status: pass

- Listing creation derives `seller_id` from `auth.uid()`.
- Listing update/archive/delete/sold/donated functions require the target listing to belong to the caller.
- RLS policies include owner checks and account-active checks.
- Storage policy for listing images requires bucket `listings`, first path segment equal to `auth.uid()`, a valid listing id in the second path segment, and that the listing belongs to `auth.uid()`.
- Storage bucket allows only `image/jpeg`, `image/png`, and `image/webp` up to 10 MB.

No confirmed cross-user listing or listing-image mutation path was found.

### Profiles and Account Type

Status: pass

- `update_my_profile` updates only `where id = caller_id`.
- RLS and triggers protect `is_admin`, `is_banned`, `is_verified`, `account_type`, counters, ratings, coordinates, and deletion fields from ordinary update paths.
- `create_my_profile` accepts `account_type`, including `rescue`, but does not make the user admin or verified rescue.
- `update_my_rescue_profile` requires the caller profile to be `account_type = 'rescue'`, banned false, and not deleted. It preserves `verification_status` through upsert.

No normal-user admin or verification escalation was found.

### Messaging and Blocking

Status: pass

- Conversation creation validates active caller, listing/rescue availability, non-self conversations, and block state.
- Message sends require conversation participation, active account, block-state check, body/attachment validation, and rate limits.
- Message reads are participant/admin-only.
- Message soft-delete requires sender ownership.
- Blocking writes are caller-owned and rate-limited.

No confirmed private conversation read/write bypass was found.

### Reports and Reviews

Status: pass

- `submit_report` validates active caller, target existence, not reporting self, message participation for message reports, and duplicate reports.
- Report direct reads are admin-only by RLS.
- `create_transaction_review` validates transaction participation and prevents invalid review targets through server-side transaction data.
- Reviews are publicly readable after creation, but mutation is RPC-controlled and protected by triggers.

No confirmed cross-user report moderation or arbitrary review creation path was found.

### Rescue Hub

Status: pass with privacy note

- Rescue profile mutation requires rescue-account ownership.
- Rescue verification mutation requires admin RPC.
- Rescue needs and wishlist policies require rescue ownership or admin for mutation.
- Verified rescue public RPCs filter to active, verified, non-deleted rescues.
- Physical-location address exposure needs explicit business/privacy confirmation as noted in F-03.

### Consent and Marketing Preference

Status: pass

- `user_consents` has RLS enabled and forced.
- Direct anon access is absent; authenticated direct access is SELECT-only for own rows.
- Authenticated users cannot directly insert/update/delete consent rows.
- `record_my_policy_acceptance` and `update_my_marketing_email_preference` derive `user_id` from `auth.uid()`.
- Append-only triggers prevent rewriting/deleting historical consent records.
- Marketing preference is stored as independent `marketing_email` consent events.

No confirmed cross-user consent access or modification path was found.

### Notifications and Device Tokens

Status: pass with defense-in-depth note

- Notifications are readable by owning user only and deleted through owner RPC.
- Notification preferences are RPC-only and keyed from `auth.uid()`.
- Device token table has no direct anon/auth grants and is managed through owner RPCs.
- `create_user_notification` validates event-specific relationships before allowing user-triggered notifications and requires admin status for system notifications.
- `create_user_notification` should use an empty search path in a future hardening task.

No confirmed arbitrary notification creation or device-token read/write path was found.

## Rate Limiting

Status: partial

Server-side rate limits identified:

- Listing create/edit/status changes
- Message send by minute/hour/conversation
- Message image sends
- Conversation creation
- Reports
- Reviews
- Transaction completion
- Admin report update
- Favorites
- Saved searches
- Blocks
- Device token changes
- Public search bounds

Potential gap:

- Rescue needs and rescue wishlist mutations appear protected by ownership RLS but no dedicated server-side rate limit was confirmed in this pass. This is a spam/abuse hardening item, not a direct authorization bypass.

## Storage Security Audit

| Bucket | Public | Size limit | MIME types | Write model | Read model | Audit result |
| --- | --- | ---: | --- | --- | --- | --- |
| `avatars` | yes | 10 MB | jpeg/png/webp | first path segment must be `auth.uid()`; active account | public bucket | Pass |
| `listings` | yes | 10 MB | jpeg/png/webp | path owner and listing owner validated server-side | public bucket | Pass |
| `message-images` | no | 10 MB | jpeg/png/webp | participant/uploader path validation and block checks | participant-only signed/private reads | Pass |

Executable upload types were not allowed in bucket metadata or Storage policies.

## Public RPC Data Exposure

Safe public fields found:

- Listings: IDs, title, description, price, listing metadata, city/state, shipping/pickup flags, counts, category, public seller object, public image URLs.
- Profiles: public display fields, username, avatar, city/state based on privacy setting, ratings/counts, verified status.
- Reviews: aggregate review summary and public non-deleted reviews.
- Rescue: verified public rescue profile fields, active needs, active wishlist items, website/contact hint as gated.

No public RPC return signature was found exposing:

- account email
- phone numbers except gated rescue public contact hint
- Stripe account IDs
- payment IDs
- device tokens
- consent history
- private messages
- reports/admin notes
- EIN

Privacy note: physical-location rescue street address is exposed by v2 public rescue RPCs and should be explicitly accepted or removed.

## Edge Function Authorization Inventory

| Function | Live JWT setting | Repository source present | Audit conclusion |
| --- | --- | --- | --- |
| `delete-account` | JWT required | yes | Pass. Function validates Bearer token with user client, then uses service role for only that authenticated user's deletion workflow. |
| `send-notification` | JWT disabled | no, README placeholder only | Needs source verification. Must require trusted server authorization. |
| `stripe-create-payment-intent` | JWT required | no | Needs source verification in Stripe audit. |
| `stripe-connect-account` | JWT required | no | Needs source verification in Stripe audit. |
| `stripe-account-status` | JWT required | no | Needs source verification in Stripe audit. |
| `stripe-connect-login-link` | JWT required | no | Needs source verification in Stripe audit. |
| `stripe-webhook` | JWT disabled | no | Needs source verification. JWT disabled can be correct only if Stripe signature verification is enforced before writes. |

## Secret and Client Bundle Boundary

Repository scan and existing tests indicate:

- `SUPABASE_SERVICE_ROLE_KEY` appears in server-side Edge Function code, docs/placeholders, and tests that assert it is not in client code.
- No actual service-role key was identified in client source during this audit.
- No `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, OAuth client secret, Google client secret, database password, or private key was identified in client source.
- Publishable Stripe keys and Supabase anon/publishable keys are not treated as secrets.

Result:

- Service role key in client: no
- Stripe secret in client: no
- Other real secret found in client: no

## SQL Injection / Dynamic SQL

Dynamic SQL exists in migration/setup contexts and extension functions. No credible user-controlled SQL-structure injection was identified in application-owned runtime RPCs reviewed in this pass.

## Raw Table Access vs RPC Access

Sensitive tables that are intentionally RPC-only or highly restricted:

- `device_tokens`
- `notification_preferences`
- `rate_limit_events`
- `user_consents` for writes
- reports/moderation state
- notifications writes

Direct table grants are sometimes broad on older/public tables, but RLS and triggers enforce row-level and field-level protections. The four current no-policy advisor tables have no anon/auth direct grants.

## Security Definer Search Path

Most modern application-owned functions use `SET search_path TO ''`. Exceptions identified:

- `public.create_user_notification(...)`: `search_path=public, private`
- Older trigger/stat helper functions use `search_path=public`
- PostGIS extension functions have extension-controlled settings

No object-shadowing exploit was identified because anon/authenticated users do not have schema `CREATE`, but hardening remaining app-owned functions to empty search paths is recommended later.

## Account Status Enforcement

`private.is_account_active()` and/or `private.require_active_account()` are used in inspected mutation paths. Account status enforcement appears server-side for listings, messaging, reports, reviews, conversations, notification preferences, device tokens, Storage policies, saved searches, favorites, and rescue ownership writes.

Status: pass, with staging test coverage recommended for banned/deleted fixture accounts.

## Performance Advisor Items Deferred

These are not security fixes and should not be changed in this task:

- Missing indexes on `reports.assigned_admin_id`, `reports.listing_id`, `reports.message_id`, `reports.reported_user_id`, and `reviews.transaction_id`
- RLS initplan optimizations such as changing `auth.uid()` to `(select auth.uid())`
- Multiple permissive policy consolidation
- Unused indexes

## Counts

Confirmed critical findings: 0

Confirmed high findings: 0

Confirmed medium findings: 2

Confirmed low findings: 2

Potential findings needing manual verification: 3

## Go / No-Go Summary

For small-group beta:

- No confirmed critical or high authorization bypass was found.
- The app has strong server-side ownership, participant, admin, and account-active checks in the inspected Supabase layer.
- Beta should not broaden to public launch until missing live Edge Function source is audited and leaked-password protection is enabled.

For public launch:

- Audit and commit live Stripe/notification Edge Function source.
- Verify Stripe webhook signature enforcement.
- Enable leaked-password protection.
- Decide and document public physical rescue address policy.
- Add staging two-user negative tests for suspended users and rescue content spam/rate limits.
