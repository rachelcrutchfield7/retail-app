# ReTail Supabase Advisor Triage - 2026-08-20

Supabase project: `ycwgsdigvpmprqreoqiz`

Starting commit: `c13c40ebead9bb367d36da3e2e1d4d4f727e3955`

## Scope

This triage reduces the current Supabase Security Advisor and Performance Advisor output into launch-relevant findings.

No live database changes, RLS changes, migrations, Edge Function deployments, Stripe changes, ShipStation changes, or EAS builds were performed.

## Advisor Counts

Security Advisor, `--level info`:

- Total: 96
- INFO: 8
- WARN: 87
- ERROR: 1

Security categories:

- `authenticated_security_definer_function_executable`: 67
- `anon_security_definer_function_executable`: 17
- `rls_enabled_no_policy`: 8
- `extension_in_public`: 2
- `rls_disabled_in_public`: 1
- `auth_leaked_password_protection`: 1

Performance Advisor, `--level info`:

- Total: 170
- INFO: 53
- WARN: 117

Performance categories:

- `multiple_permissive_policies`: 84
- `auth_rls_initplan`: 33
- `unused_index`: 33
- `unindexed_foreign_keys`: 20

## Security Triage

### Public-Launch Blockers

None found in this triage.

No advisor finding currently proves anon access to private ReTail data such as messages, conversations, transactions, private shipping addresses, device tokens, payment events, support-case private contents, or Founding Seller admin records.

### Security Definer Functions

Reviewed live `SECURITY DEFINER` catalog state:

- Total `public` Security Definer functions: 110
- Advisor-flagged callable by `authenticated`: 67
- Advisor-flagged callable by `anon`: 17
- Missing fixed `search_path` marker: 3 PostGIS extension functions only: `st_estimatedextent(...)`

Admin RPCs reviewed:

- `admin_moderate_report`
- `admin_set_founding_seller_status`
- `admin_set_rescue_verification`
- `admin_update_report`
- `admin_update_transaction_support_case`
- `get_admin_founding_seller_status`
- `get_admin_report_queue`
- `get_admin_transaction_support_cases`
- `list_admin_founding_sellers`
- `search_admin_founding_seller_profiles`

Live catalog markers:

- Admin RPCs are not anon-executable.
- Admin RPCs reference `private.is_admin`.
- Admin RPCs have a fixed `search_path` configuration.

Security Definer warnings are mostly intentional ReTail architecture:

- Public-safe read RPCs return public listing/profile/rescue fields.
- Authenticated user RPCs bind work to `auth.uid()` or account state.
- Admin RPCs enforce `private.is_admin`.
- Server/internal behavior uses RLS, private helpers, Edge Function service role, or idempotency tables as appropriate.

Pre-launch hardening candidate:

- Revoke direct anon/authenticated execute access to extension Security Definer functions such as `st_estimatedextent(...)` if confirmed unused by client code.
- Do not remove Security Definer from ReTail RPCs merely to silence the advisor.

### Public / Anon Exposure

Live table privilege check found no direct table privileges on the server-owned no-policy tables:

- `device_tokens`
- `marketplace_search_areas`
- `notification_preferences`
- `notification_push_deliveries`
- `rate_limit_events`
- `shipping_provider_events`
- `shipping_rate_quotes`
- `stripe_webhook_events`

These are intentionally server/RPC-owned. Adding permissive client policies would weaken the model.

Some sensitive-looking tables have broad grants but are still RLS protected:

- `founding_seller_benefits`
- `founding_seller_benefit_uses`
- `notification_email_deliveries`

Current RLS predicates require authenticated identity and/or admin status. No anon exposure was proven.

Pre-launch hardening candidate:

- Narrow older `roles={public}` policies and broad grants to explicit `anon`/`authenticated` roles where appropriate, preserving intentional public reads for categories, active listing images, active rescue needs, public reviews, and public wishlist items.

### Extension Findings

Advisor findings:

- `public.spatial_ref_sys` has RLS disabled.
- `citext` is installed in `public`.
- `postgis` is installed in `public`.

Classification:

- Deferred / accepted for launch unless a focused extension migration is separately planned and rehearsed.
- `spatial_ref_sys` and PostGIS extension placement are common extension architecture concerns; moving extensions immediately before launch is higher-risk than the current exposure profile.

### Leaked Password Protection

Classification:

- Deferred until Supabase plan upgrade / project capability confirmation.

Do not upgrade the plan automatically.

## Performance Triage

### Auth RLS Initplan

Advisor flagged 33 policies where `auth.uid()` or related helpers may be evaluated per row.

Hot-path tables:

- `messages`: 2 policies
- `conversations`: 2 policies
- `notifications`: 1 policy
- `listings`: 3 policies
- `profiles`: 2 policies
- `favorites`: 3 policies
- `seller_shipping_origins`: 1 policy
- `transaction_shipping_details`: 1 policy
- `transactions`: 1 policy
- `support_cases`: 2 policies

Messaging has the strongest real-device performance signal. A forward-only RLS optimization migration should prioritize:

1. `messages`
2. `conversations`
3. `notifications`
4. `listings`
5. `profiles`
6. `favorites`
7. `seller_shipping_origins`

The likely safe change is to preserve every predicate exactly while replacing `auth.uid()` with `(select auth.uid())` and applying the same pattern only where helper signatures support it. Do not blanket-edit every policy without reviewing function semantics.

### Messaging Performance

Messaging tables already have useful indexes:

- `messages(conversation_id, created_at)`
- `messages(conversation_id, is_read, created_at) where deleted_at is null`
- `messages(sender_id)`
- `conversations(buyer_id)`
- `conversations(seller_id)`
- `conversations(listing_id)`
- `conversations(buyer_id, seller_id, listing_id) where deleted_at is null`

Remaining advisor value is primarily RLS initplan optimization, not a missing core message index.

### Notifications Performance

Notifications already have:

- `notifications(user_id, is_read, created_at desc)`
- `notifications(user_id, is_read, created_at desc) where deleted_at is null`
- unique dedupe index on `(user_id, dedupe_key)`

`notification_push_deliveries` is currently server-owned and has delivery-tracking indexes. Its unused-index warnings are not meaningful with tiny beta data.

### Listing Performance

Listing indexes cover the main public and owner paths:

- category
- seller
- status
- created_at
- price
- listing type
- city/state
- search area
- checkout reservation

Home/listing performance should prioritize RLS initplan cleanup before removing or adding speculative listing indexes.

### Missing Foreign-Key Indexes

High-value candidates:

- `shipping_rate_quotes.listing_id`
- `shipping_rate_quotes.seller_id`
- `shipping_rate_quotes.seller_origin_id`
- `shipping_rate_quotes.transaction_id`
- `transaction_shipping_details.buyer_id`
- `transaction_shipping_details.seller_id`
- `transaction_shipping_details.seller_origin_id`
- `notification_push_deliveries.device_token_id`
- `listings.reserved_by`
- `listings.reservation_transaction_id`

Lower-value / admin-only candidates:

- `reports.assigned_admin_id`
- `reports.listing_id`
- `reports.message_id`
- `reports.reported_user_id`
- `support_cases.assigned_admin_id`
- `support_cases.listing_id`
- `support_cases.seller_id`
- `founding_seller_benefits.granted_by`
- `reviews.transaction_id`
- `transactions.founding_seller_benefit_use_id`

Do not add all 20 indexes reflexively. Prioritize shipping quote/detail and device-token lookup indexes if beta traffic exercises those paths.

### Unused Indexes

Recommendation:

- Do not remove unused indexes before public launch.

The database has tiny beta data and low traffic. Many unused indexes were added for launch-scale search, moderation, Stripe, ShipStation, Founding Seller, and cleanup paths that have not had enough live usage to be statistically meaningful.

### Multiple Permissive Policies

Classification:

- Mostly intentional / accepted.

Examples include public + owner + admin read policies and owner + admin write policies on listings, rescue profiles/needs, support cases, and categories.

Future hardening:

- Consolidate only hot-path policies if it preserves authorization semantics and measurably improves query planning.
- Do not merge admin/owner/public logic purely to reduce advisor count.

## Top 5 Pre-Launch Database Fixes

1. **Messaging RLS initplan optimization**
   - Impact: real-device messaging load.
   - Risk: low-to-medium if predicates are rewritten exactly.
   - Scope: `messages`, `conversations`, `blocks`.

2. **User hot-path RLS initplan optimization**
   - Impact: listing/profile/favorite/notification reads.
   - Risk: medium due policy breadth.
   - Scope: `notifications`, `listings`, `profiles`, `favorites`, `seller_shipping_origins`.

3. **ShipStation/shipping FK index migration**
   - Impact: shipping-rate and checkout flows as data grows.
   - Risk: low if additive indexes only.
   - Scope: `shipping_rate_quotes`, `transaction_shipping_details`, `notification_push_deliveries.device_token_id`.

4. **Narrow broad `public` policy roles/grants**
   - Impact: defense-in-depth and advisor clarity.
   - Risk: medium; must preserve intentional anon reads and authenticated owner/admin paths.
   - Scope: older policies on `profiles`, `listings`, `favorites`, rescue tables, notification email deliveries, Founding Seller benefit reads.

5. **Extension/public-schema cleanup plan**
   - Impact: advisor cleanup / hardening.
   - Risk: medium-to-high if moving extensions; low if only revoking unused extension function execute grants after proof.
   - Scope: `spatial_ref_sys`, `postgis`, `citext`, extension Security Definer functions.

## Launch Decision

Public-launch security status:

- No actual Supabase security blocker was proven by this advisor triage.
- Launch should not proceed with broad blind advisor cleanup.
- The highest-confidence pre-launch hardening is targeted RLS initplan optimization and a small additive index migration for shipping/notification hot paths.

Public-launch performance status:

- Real performance work should focus on messaging and listing/notification hot paths.
- Unused-index and multiple-policy warnings should remain deferred until real traffic or measured query plans justify changes.

## Follow-Up Applied: Hot-Path RLS Initplan Optimization

Migration:

- `supabase/migrations/20260820224215_hot_path_rls_initplan_optimization.sql`

Applied to `ycwgsdigvpmprqreoqiz` on 2026-08-20.

Scope:

- `public.blocks`
- `public.conversations`
- `public.favorites`
- `public.listings`
- `public.messages`
- `public.notifications`
- `public.profiles`

The migration preserves policy names, commands, and roles by using `ALTER POLICY`. It only rewrites stable auth/session calls such as `auth.uid()` and helper default arguments into initplan-safe `(select auth.uid())` equivalents.

Performance Advisor result:

- Auth RLS initplan findings before: 33
- Auth RLS initplan findings after: 19

Cleared target findings:

- `messages`
- `conversations`
- `notifications`
- `profiles`
- `listings`
- `favorites`
- `blocks`

Remaining auth initplan findings are outside the scoped hot-path migration and should be handled only through separate focused migrations.
