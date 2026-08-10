# ReTail Pre-Launch Backend Cleanup Audit

Date: 2026-08-10

Branch audited: `audit/backend-cleanup-inventory`

Starting commit: `54dfc4d90d2f0374bd18ce0cefc61e517d4f3032`

Production Supabase project inspected: `ycwgsdigvpmprqreoqiz` (`https://ycwgsdigvpmprqreoqiz.supabase.co`)

Payments test Supabase project referenced in environment tooling: `jqzaxzylijbwjdzoqsen` (`https://jqzaxzylijbwjdzoqsen.supabase.co`)

This audit is documentation-only. No backend objects were deleted, renamed, redeployed, or modified.

## Audit Scope and Evidence

Reviewed:

- Live Supabase metadata for functions, triggers, RLS policies, indexes, Storage buckets/policies, and deployed Edge Functions.
- Repository references in `src/`, `supabase/functions/`, `supabase/migrations/`, `tests/`, `scripts/`, and `docs/`.
- Current client-side RPC and Edge Function invocation paths.
- Environment validation scripts and EAS configuration references.

Live metadata counts scanned:

| Object group | Count |
| --- | ---: |
| Public/private functions visible in metadata, including extensions | 934 |
| Security definer functions visible in public/private schemas | 124 |
| Phase-named public/private functions | 28 |
| Public schema tables | 31 |
| Public schema RLS policies | 51 |
| Public schema triggers | 79 |
| Public schema indexes | 124 |
| Storage buckets | 3 |
| Storage policies | 7 |
| Deployed Edge Functions | 7 |
| Repository migration files | 27 |

The function count includes extension-owned functions, especially PostGIS. Cleanup recommendations below focus on ReTail-owned public/private objects and repository-backed Edge Functions.

## 1. Current Canonical Architecture

### Client RPC Entry Points

Current app services call these RPCs as canonical app entry points:

| Feature | Canonical client call | Evidence |
| --- | --- | --- |
| Admin rescue verification | `admin_set_rescue_verification` | `src/services/adminService.ts` |
| Admin report queue | `get_admin_report_queue` | `src/services/adminService.ts` |
| Admin report moderation/actions | `admin_moderate_report` | `src/services/adminService.ts`; no current client call to `admin_update_report` |
| Public profile | `get_public_profile` | `src/services/profileService.ts` |
| Public user listings | `get_public_user_listings` | `src/services/profileService.ts` |
| My Listings | `get_my_listings` | `src/services/listingService.ts` |
| Browse feed | `get_public_listing_feed_sorted`, fallback `get_public_listing_feed` | `src/services/listingService.ts` |
| Nearby feed | `get_nearby_listings_sorted`, fallback `get_nearby_listings` | `src/services/listingService.ts` |
| Listing detail | `get_public_listing_detail` | `src/services/listingService.ts` |
| Listing create/update/delete/archive/status | `create_listing`, `update_my_listing`, `delete_my_listing`, `archive_my_listing`, `mark_my_listing_sold`, `mark_my_listing_donated` | `src/services/listingService.ts` |
| Transactions | `complete_listing_transaction` | `src/services/transactionService.ts` |
| Messaging | `create_or_get_conversation`, `send_message`, `mark_conversation_read`, `soft_delete_own_message` | `src/services/conversationService.ts`, `src/services/messageService.ts` |
| Blocking | `block_user`, `unblock_user` | `src/services/blockService.ts` |
| Reports | `submit_report`, `has_existing_report` | `src/services/reportService.ts` |
| Reviews | `create_transaction_review`, `get_user_review_summary` | `src/services/reviewService.ts` |
| Rescue profile management | `update_my_rescue_profile` plus owner-scoped table access for needs/wishlist | `src/services/rescueService.ts` |
| Rescue hub | `get_nearby_rescues`, fallback `get_public_rescue_feed`; rescue detail by owner uses `get_public_rescue_by_owner` | `src/services/rescueService.ts` |
| Search areas | `get_marketplace_search_areas`, `get_my_marketplace_search_preference`, `set_marketplace_search_area` | `src/services/searchAreaService.ts` |
| Notifications | `mark_notification_read`, `mark_all_notifications_read`, `delete_my_notification`, `register_my_device_token`, `remove_my_device_token`, `get_my_notification_preferences`, `update_my_notification_preferences` | `src/services/notificationService.ts` |
| Consent | `get_my_consent_state`, `record_my_policy_acceptance`, `update_my_marketing_email_preference` | `src/services/consentService.ts` |
| Profile creation/update | `create_my_profile`, `update_my_profile` | `src/services/supabaseData.ts`, `src/services/profileService.ts` |

### Edge Functions

| Function | Live status | JWT | Repo source | Classification | Notes |
| --- | --- | --- | --- | --- | --- |
| `delete-account` | ACTIVE v5 | enabled | yes | CURRENT | Used by `src/services/accountService.ts`. |
| `send-notification` | ACTIVE v4 | disabled | yes | CURRENT | JWT disabled is intentional only if shared-secret or authenticated related-user checks remain enforced. Current repo source includes both paths. |
| `stripe-create-payment-intent` | ACTIVE v4 | enabled | yes | CURRENT | Used by `src/services/paymentService.ts`; production/beta payment mode controlled by environment. |
| `stripe-connect-account` | ACTIVE v2 | enabled | yes | CURRENT | Used by `src/services/stripeConnectService.ts`. |
| `stripe-account-status` | ACTIVE v2 | enabled | yes | CURRENT | Used by `src/services/stripeConnectService.ts`. |
| `stripe-connect-login-link` | ACTIVE v2 | enabled | yes | CURRENT | Used by `src/services/stripeConnectService.ts`. |
| `stripe-webhook` | ACTIVE v5 | disabled | yes | CURRENT | JWT disabled is normal for Stripe webhooks when Stripe signature verification is enforced in function source. |

### Storage

| Bucket | Public | File size limit | MIME types | Canonical use |
| --- | --- | ---: | --- | --- |
| `avatars` | yes | 10 MB | `image/jpeg`, `image/png`, `image/webp` | Profile avatars |
| `listings` | yes | 10 MB | `image/jpeg`, `image/png`, `image/webp` | Public listing photos |
| `message-images` | no | 10 MB | `image/jpeg`, `image/png`, `image/webp` | Private conversation attachments |

Storage object policies are Phase D policies. They are active security controls, not cleanup candidates. Listing image paths require authenticated user ownership of both path owner folder and listing owner. Message image policies require conversation participation.

### Environment Architecture

- Normal beta-friendly Preview is intended to point to the production ReTail Supabase backend `ycwgsdigvpmprqreoqiz` unless Stripe test payments are explicitly enabled.
- `ReTail Payments Test` (`jqzaxzylijbwjdzoqsen`) is isolated for Stripe test-mode work.
- `src/constants/config.ts` contains both project refs as validation allowlists. This is not by itself a runtime leak or automatic test-project targeting.
- `scripts/validate-beta-build-config.mjs` allows either the normal backend or the payments-test backend depending on `EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED`.
- `scripts/verify-stripe-test-environment.mjs` is test-payment-specific and does not affect normal app runtime.
- No evidence found that production/beta app code hardcodes the payments-test URL as the default Supabase target.

## 2. Duplicate/Superseded Functions

### Detailed Candidate Inventory

| OBJECT | TYPE | CREATED BY MIGRATION | CURRENTLY CALLED BY CLIENT | CURRENTLY CALLED BY OTHER DB FUNCTION | CURRENTLY USED BY TRIGGER | CURRENTLY USED BY POLICY | CURRENTLY USED BY EDGE FUNCTION | PRODUCTION USAGE EVIDENCE | CANONICAL REPLACEMENT | SAFE TO DEPRECATE | SAFE TO DELETE | NOTES |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin_update_report(uuid, report_status, text)` | Public RPC wrapper | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No current app client call; older tests/docs still reference it | Calls `admin_update_report_phase_f_base` | No | No | No | Executable by authenticated users but server-side admin-checked and rate-limited | `admin_moderate_report` | Yes, as legacy admin status-only API | No | High-risk legacy object because older admin flow interfered with newer moderation actions. Keep until tests/docs are updated and a staging deprecation window passes. |
| `admin_update_report_phase_f_base(uuid, report_status, text)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Called by `admin_update_report` body | No | No | No | Execute revoked from anon/authenticated; executable by Postgres/service role | Inline into or retire with `admin_update_report`; canonical UI uses `admin_moderate_report` | Yes, after `admin_update_report` retirement | No | Current direct callers are not visible through `pg_depend`; body text confirms wrapper call. |
| `admin_moderate_report(uuid, text, text, text, text)` | Public RPC | `20260802000000_fix_admin_report_moderation_actions.sql`, replaced by `20260810090000_beta_my_listings_admin_report_queue.sql` | Yes | No | No | No | No | Current Admin Panel RPC; handles report status, action, notes, notification messaging, listing/message/user action | Keep as canonical | No | No | Must keep. Recent accepted beta fix depends on trusted report/notification write context. |
| `get_public_listing_feed(integer, integer, uuid, text, numeric, numeric, listing_condition, listing_type, text, text)` | Public RPC wrapper/fallback | Original Phase B, wrapped by Phase F | Yes, fallback when sorted RPC fails | Calls `get_public_listing_feed_phase_f_base` | No | No | No | Executable by anon/authenticated; client fallback path still uses it | `get_public_listing_feed_sorted` for primary browse feed | Only after fallback is removed and sorted RPC is proven stable | No | Keep during beta because current client intentionally falls back to it. |
| `get_public_listing_feed_phase_f_base(...)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Called by `get_public_listing_feed` body | No | No | No | Execute revoked from anon/authenticated | Inline feed query into `get_public_listing_feed` or drop with wrapper replacement | Yes | No | Cleanup candidate, but still required by fallback wrapper. |
| `get_public_listing_feed_sorted(..., sort_order text)` | Public RPC | `20260723090000_rescue_donations_sorting_and_eligibility.sql`, fixed by `20260723103000_fix_rescue_donation_sorted_feed_bounds.sql` | Yes | No | No | No | No | Primary browse feed call in `listingService.ts`; executable by anon/authenticated | Keep as canonical browse feed | No | No | Must keep. |
| `get_nearby_listings(integer, integer, uuid, text, numeric, numeric, listing_condition, listing_type)` | Public RPC wrapper/fallback | Phase B/B1/B2, wrapped by Phase F | Yes, fallback when sorted nearby RPC fails | Calls `get_nearby_listings_phase_f_base` | No | No | No | Executable by authenticated users; client fallback path still uses it | `get_nearby_listings_sorted` for primary nearby feed | Only after fallback is removed and sorted nearby RPC is proven stable | No | Keep during beta because current client intentionally falls back to it. |
| `get_nearby_listings_phase_f_base(...)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Called by `get_nearby_listings` body | No | No | No | Execute revoked from anon/authenticated | Inline nearby query into `get_nearby_listings` or drop with wrapper replacement | Yes | No | Cleanup candidate, but still required by fallback wrapper. |
| `get_nearby_listings_sorted(..., sort_order text)` | Public RPC | `20260723090000_rescue_donations_sorting_and_eligibility.sql`, fixed by `20260723103000_fix_rescue_donation_sorted_feed_bounds.sql` | Yes | No | No | No | No | Primary signed-in nearby feed call in `listingService.ts` | Keep as canonical nearby feed | No | No | Must keep. |
| `get_public_user_listings(uuid, integer, integer)` | Public RPC wrapper | Phase B, wrapped by Phase F | Yes | Calls `get_public_user_listings_phase_f_base` | No | No | No | Current profile page call in `profileService.ts` | Keep unless a newer user-listing RPC is built | No | No | Not obsolete from client perspective. |
| `get_public_user_listings_phase_f_base(uuid, integer, integer)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Called by `get_public_user_listings` body | No | No | No | Execute revoked from anon/authenticated | Inline query into `get_public_user_listings` | Yes | No | Cleanup candidate, but still required by current wrapper. |
| `get_my_listings()` | Public RPC | `20260810090000_beta_my_listings_admin_report_queue.sql` | Yes | No | No | No | No | Current My Listings fix; server derives owner from `auth.uid()` | Keep as canonical owner listings | No | No | Must keep. |
| `complete_listing_transaction(uuid, transaction_outcome, uuid)` | Public RPC wrapper | Phase E, wrapped/rate-limited by Phase F | Yes | Calls `complete_listing_transaction_phase_f_base` | No | No | No | Current transaction completion client call | Keep as canonical transaction entry point | No | No | Must keep. Future cleanup can inline base function after tests. |
| `complete_listing_transaction_phase_f_base(uuid, transaction_outcome, uuid)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Called by `complete_listing_transaction` body | No | No | No | Execute revoked from anon/authenticated | Inline into `complete_listing_transaction` | Yes | No | Cleanup candidate, but required by current transaction wrapper. |
| `create_or_get_conversation(uuid)` | Public RPC wrapper/current enhanced implementation | Phase D, wrapped by Phase F, later replaced by rescue donation eligibility migration | Yes | May delegate to base only in older wrapper shape; current live body includes additional donation/rescue logic before/around conversation creation | No | No | No | Current client call | Keep as canonical conversation entry point | No | No | Must keep. |
| `create_or_get_conversation_phase_f_base(uuid)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Historical wrapper dependency; current live `create_or_get_conversation` body should be reviewed fully before cleanup | No | No | No | Execute revoked from anon/authenticated | Fold any remaining needed base behavior into `create_or_get_conversation` | Maybe | No | Needs body-level staging verification because `create_or_get_conversation` has been replaced after Phase F. |
| `get_public_rescue_feed(integer, integer, text)` | Public RPC wrapper/current fallback | Phase B, wrapped by Phase F | Yes | Calls `get_public_rescue_feed_phase_f_base` | No | No | No | Current Rescue Hub fallback/public call in `rescueService.ts` | Keep unless switching client to v2 | No | No | Must keep for current app. |
| `get_public_rescue_feed_phase_f_base(integer, integer, text)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Called by `get_public_rescue_feed` body | No | No | No | Execute revoked from anon/authenticated | Inline into `get_public_rescue_feed` | Yes | No | Cleanup candidate, but still required by wrapper. |
| `get_nearby_rescues(text)` | Public RPC wrapper/current signed-in rescue hub | Phase B/B1/B2, wrapped by Phase F | Yes | Calls `get_nearby_rescues_phase_f_base` | No | No | No | Current signed-in Rescue Hub call in `rescueService.ts` | Keep unless switching client to v2 | No | No | Must keep for current app. |
| `get_nearby_rescues_phase_f_base(text)` | Public base helper RPC | `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql` | No | Called by `get_nearby_rescues` body | No | No | No | Execute revoked from anon/authenticated | Inline into `get_nearby_rescues` | Yes | No | Cleanup candidate, but still required by wrapper. |
| `get_public_rescue_by_owner(uuid)` | Public RPC | Phase B | Yes | No | No | No | No | Current rescue profile detail call in `rescueService.ts` | Keep as canonical current app call | No | No | Must keep for current app. |
| `get_public_rescue_feed_v2(integer, integer, text)` | Public RPC | Live migration `public_rescue_physical_address_fields` | No current app client reference found | No dependency found in inspected client/Edge Function references | No | No | No | Executable by anon/authenticated; prior security docs identify public physical-address return fields | Unknown; likely intended replacement but not wired in current client | Not yet | No | Needs manual product/security review before either adopting or deprecating. |
| `get_public_rescue_by_owner_v2(uuid)` | Public RPC | Live migration `public_rescue_physical_address_fields` | No current app client reference found | No dependency found in inspected client/Edge Function references | No | No | No | Executable by anon/authenticated; prior security docs identify public physical-address return fields | Unknown; likely intended replacement but not wired in current client | Not yet | No | Needs manual product/security review before either adopting or deprecating. |
| `get_nearby_rescues_v2(text)` | Public RPC | Live migration `public_rescue_physical_address_fields` | No current app client reference found | No dependency found in inspected client/Edge Function references | No | No | No | Executable by authenticated users | Unknown; likely intended replacement but not wired in current client | Not yet | No | Needs manual product/security review before either adopting or deprecating. |

### Summary

The clear duplicate/superseded pattern is the Phase F wrapper/base split:

- Public wrapper callable by client role.
- Private-in-practice base function with execute revoked from anon/authenticated.
- Wrapper adds rate limits/search bounds/account checks and delegates to base.

These base functions are not safe to delete yet because wrappers still call them. They are safe to plan for deprecation through forward-only migrations that inline the base function body into the canonical wrapper or replace the wrapper completely.

## 3. Trigger Cleanup Candidates

No trigger is safe to delete based on this audit.

Active trigger families:

| Trigger/function family | Tables | Current role | Cleanup recommendation |
| --- | --- | --- | --- |
| `protect_*_phase_c_fields` | `profiles`, `listings`, `rescue_profiles` | Protected-field enforcement | Keep. Naming is legacy but function is active protection. |
| `protect_*_phase_d_fields` | `messages`, `conversations`, `listing_images` | Messaging/listing image integrity | Keep. Listing photo safety depends on listing image validation. |
| `protect_*_phase_e_fields` | `reports`, `report_moderation_events`, `reviews`, `transactions`, `notifications` | Moderation/transaction immutability and trusted-write checks | Keep. Recent admin fix depends on explicit trusted report/notification write context. |
| `private.enforce_phase_f_*` | `conversations`, `messages`, `reports`, `reviews`, `listings`, `favorites`, `saved_searches`, `blocks`, `device_tokens` | Abuse/rate-limit enforcement and direct-write guardrails | Keep. These are active guardrails, not stale helpers. |
| Checkout reservation trigger | `listings` | Protects reservation fields from direct writes | Keep. Stripe checkout reservation logic depends on it. |
| Account deletion/consent triggers | `profiles`, `auth.users`, `user_consents` | Marketing opt-out on deletion and append-only consent history | Keep. |
| Location/search area sync triggers | `listings`, `rescue_profiles`, `marketplace_search_areas`, `marketplace_search_preferences` | Derived search data | Keep. |
| Count/update triggers | listings/favorites/messages/etc. | Counters and timestamps | Keep. |

Cleanup candidate only:

- Rename/re-document phase-named trigger functions in a future forward migration after beta, if desired. Do not remove or weaken them.

## 4. RLS Cleanup Candidates

### Duplicate or Overlapping Policies

No RLS weakening is proposed.

Observed policy overlap:

- `listings` has separate owner, admin, private owner-read, and create/update/delete policies. This is overlapping but understandable and currently maps to owner/admin/public responsibilities.
- `listing_images` has public select for active listing images plus owner manage. This is expected for public listing photos.
- `profiles` has owner insert/update/read and admin update. This is expected.
- `rescue_needs` and `rescue_profiles` have owner/admin/public read/manage splits. This is expected.

Cleanup recommendation:

- Later, consider policy naming normalization and consolidation for readability only after authorization tests prove equivalent behavior.
- Do not consolidate policies just to reduce count before launch.

### RLS Enabled With No Direct Policies

| Table | Policy count | Current interpretation | Cleanup recommendation |
| --- | ---: | --- | --- |
| `device_tokens` | 0 | RPC/trigger-only. Client uses `register_my_device_token` and `remove_my_device_token`; direct table access is intentionally blocked. | Keep as-is unless a direct read/write UI is deliberately introduced. |
| `marketplace_search_areas` | 0 | Public search areas are read through `get_marketplace_search_areas`; direct table access blocked. | Keep as-is. |
| `notification_preferences` | 0 | RPC-only. Client uses `get_my_notification_preferences` and `update_my_notification_preferences`. | Keep as-is. |
| `rate_limit_events` | 0 | Internal/private rate-limit ledger; direct app access should remain blocked. | Keep as-is. |
| `stripe_webhook_events` | 0 | Service-role-only idempotency ledger for Stripe webhook processing. | Keep as-is. |

These are advisor-noise candidates, not cleanup/delete candidates.

## 5. Edge Function Cleanup Candidates

All deployed Edge Functions are classified as `CURRENT`.

| Function | Classification | Cleanup candidate | Notes |
| --- | --- | --- | --- |
| `delete-account` | CURRENT | No | Public app account deletion depends on it. |
| `send-notification` | CURRENT | No | Keep, but document operational dependency on `RESEND_API_KEY`, `RETAIL_EMAIL_FROM`, and `RETAIL_NOTIFICATION_WEBHOOK_SECRET`. |
| `stripe-create-payment-intent` | CURRENT | No | Keep. Payment E2E still separate from this cleanup audit. |
| `stripe-connect-account` | CURRENT | No | Keep. |
| `stripe-account-status` | CURRENT | No | Keep. |
| `stripe-connect-login-link` | CURRENT | No | Keep. |
| `stripe-webhook` | CURRENT | No | Keep. |

No deployed Edge Function was found that is clearly test-only, legacy, or unused.

## 6. Migration Legacy Notes

Do not rewrite migration history. Any cleanup must be forward-only.

Important legacy/supersession points:

- Phase B introduced public discovery RPCs and location privacy.
- Phase B1/B2 replaced caller-supplied latitude/longitude with server-derived search areas.
- Phase C introduced protected field triggers and ownership RPCs.
- Phase D introduced messaging/blocking/storage protections.
- Phase E introduced transactions, reviews, reports, notifications, and moderation helpers.
- Phase F renamed multiple canonical RPCs into `*_phase_f_base` functions, then recreated public wrappers that add rate limits/bounds/account checks.
- `20260723090000_rescue_donations_sorting_and_eligibility.sql` and `20260723103000_fix_rescue_donation_sorted_feed_bounds.sql` created/fixed sorted listing feed RPCs that are now primary client calls.
- `20260802000000_fix_admin_report_moderation_actions.sql` created `admin_moderate_report`, superseding the older status-only `admin_update_report` for current Admin Panel actions.
- `20260810090000_beta_my_listings_admin_report_queue.sql` created `get_my_listings` and `get_admin_report_queue`, and replaced `admin_moderate_report` to work with report/notification trusted-write triggers.
- Stripe migrations in August 2026 added schema readiness, webhook idempotency, checkout reservation, and refund/dispute tracking. These are current payment infrastructure, not cleanup targets.
- `public_rescue_physical_address_fields` introduced v2 rescue public RPCs that appear live but not currently wired into `src/services/rescueService.ts`.

## 7. Safe-to-Deprecate List

These are safe to mark as deprecated in documentation and future migration planning, but not safe to delete now:

1. `admin_update_report(uuid, report_status, text)` once tests/docs are moved to `admin_moderate_report`.
2. `admin_update_report_phase_f_base(uuid, report_status, text)` after `admin_update_report` is retired.
3. `get_public_listing_feed_phase_f_base(...)` after `get_public_listing_feed` is inlined or the fallback path is removed.
4. `get_nearby_listings_phase_f_base(...)` after `get_nearby_listings` is inlined or the fallback path is removed.
5. `get_public_user_listings_phase_f_base(uuid, integer, integer)` after `get_public_user_listings` is inlined.
6. `complete_listing_transaction_phase_f_base(uuid, transaction_outcome, uuid)` after `complete_listing_transaction` is inlined.
7. `get_public_rescue_feed_phase_f_base(integer, integer, text)` after `get_public_rescue_feed` is inlined.
8. `get_nearby_rescues_phase_f_base(text)` after `get_nearby_rescues` is inlined.
9. `create_or_get_conversation_phase_f_base(uuid)` only after a full body review confirms the current wrapper no longer depends on any base-only behavior.

## 8. Safe-to-Delete List

Safe to delete now: none.

Reason:

- Several candidates are still directly called by wrapper function bodies.
- Some candidates are executable public RPCs with active fallback behavior.
- Some candidates are public v2 RPCs with unclear product/security intent.
- Trigger/policy/function dependencies must be changed only through forward-only migrations after staging verification.

## 9. Must-Keep List

Must keep for current beta:

- `admin_moderate_report`
- `get_admin_report_queue`
- `get_my_listings`
- `get_public_listing_feed_sorted`
- `get_public_listing_feed` while fallback remains in client code
- `get_nearby_listings_sorted`
- `get_nearby_listings` while fallback remains in client code
- `get_public_user_listings`
- `get_public_listing_detail`
- `create_listing`
- `update_my_listing`
- `delete_my_listing`
- `archive_my_listing`
- `mark_my_listing_sold`
- `mark_my_listing_donated`
- `complete_listing_transaction`
- `create_or_get_conversation`
- `send_message`
- `mark_conversation_read`
- `soft_delete_own_message`
- `block_user`
- `unblock_user`
- `submit_report`
- `has_existing_report`
- `create_transaction_review`
- `get_user_review_summary`
- `update_my_rescue_profile`
- `get_public_rescue_feed`
- `get_nearby_rescues`
- `get_public_rescue_by_owner`
- Search-area, notification, device-token, consent, profile, Stripe reservation/webhook RPCs
- All active `protect_*` and `enforce_phase_f_*` trigger functions
- All deployed Edge Functions
- All Storage bucket policies

## 10. Unknown / Needs Manual Review

| Object | Why unknown | Recommended next check |
| --- | --- | --- |
| `get_public_rescue_feed_v2` | Live public RPC, not called by current app service, returns physical address fields for physical-location rescues. | Decide whether public physical address is intended. If yes, wire client deliberately; if no, deprecate/revoke in a separate approved security/product task. |
| `get_public_rescue_by_owner_v2` | Same as above for owner-specific rescue detail. | Same as above. |
| `get_nearby_rescues_v2` | Live authenticated RPC, not called by current app service. | Decide whether it should replace `get_nearby_rescues`. |
| `create_or_get_conversation_phase_f_base` | Execute is restricted, but the current wrapper was replaced after Phase F for donation/rescue eligibility logic. | Full SQL body diff against latest wrapper before planning deletion. |
| Older live security tests referencing `admin_update_report` | Tests prove historical security behavior but may keep old RPC mentally canonical. | Update tests/docs to prefer `admin_moderate_report` once legacy status-only RPC is deprecated. |

## High-Risk Legacy Objects

1. `admin_update_report` and `admin_update_report_phase_f_base`
   - Risk: older Admin Panel mental model conflicts with current `admin_moderate_report` action workflow.
   - Current protection: server-side admin check and rate limit; base direct execute is restricted.
   - Recommendation: first cleanup priority.

2. Public rescue `*_v2` RPCs
   - Risk: live public functions are not called by current app and have different public data contract around physical addresses.
   - Current protection: public data is conditional on physical-location organization type, but product intent needs manual confirmation.
   - Recommendation: decide adopt vs retire before public launch.

3. Phase F base functions
   - Risk: confusing legacy naming and wrapper/base split can mislead future development.
   - Current protection: execute revoked from anon/authenticated, wrappers remain active.
   - Recommendation: gradual inline/deprecate, not immediate deletion.

4. Phase-named trigger functions
   - Risk: names look obsolete even though they are active security controls.
   - Current protection: trigger metadata confirms active use.
   - Recommendation: document as must-keep; rename only after launch if worth the churn.

5. Environment validator dual-target behavior
   - Risk: future build operator confusion between normal beta backend and payments-test backend.
   - Current protection: config validation allowlists expected project refs and payment mode.
   - Recommendation: keep as-is, but add release checklist wording before the next EAS build.

## Top Cleanup Priorities

1. Deprecate `admin_update_report` in code docs/tests and keep `admin_moderate_report` as the sole Admin Panel moderation API.
2. Decide the public rescue address contract and either wire or retire the `*_v2` rescue RPCs.
3. Inline Phase F base helpers into their canonical wrappers through forward-only migrations, one feature family at a time.
4. Add a backend-object registry doc that marks every RPC as `client`, `edge-function`, `trigger-only`, `service-role-only`, or `deprecated`.
5. Add a pre-build environment check note that normal beta Preview must target `ycwgsdigvpmprqreoqiz` unless intentionally running Stripe test-mode payment preview against `jqzaxzylijbwjdzoqsen`.

## Final Audit Position

RLS weakening proposed: no.

Destructive changes made: no.

Safe to delete now: none.

The backend is not cleanly named, but most “old-looking” Phase C/D/E/F objects are still active security infrastructure. The best cleanup path is staged deprecation and wrapper inlining, not broad deletion.
