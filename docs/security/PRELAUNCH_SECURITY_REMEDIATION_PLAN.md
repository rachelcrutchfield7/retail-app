# ReTail Pre-Launch Security Remediation Plan

Date: 2026-08-08

This plan is intentionally split into small, isolated follow-up tasks. Do not combine these into one broad cleanup migration.

## Blocker Before Small-Group Beta

None confirmed.

No critical or high authorization bypass was found in this audit.

## Blocker Before Public Launch

### Fix 1: Audit and commit live Edge Function source

Reason: Live Supabase has deployed Stripe and notification Edge Functions whose source is not represented in this repository.

Scope:

- Pull or recreate exact source for `send-notification`.
- Pull or recreate exact source for `stripe-create-payment-intent`.
- Pull or recreate exact source for `stripe-connect-account`.
- Pull or recreate exact source for `stripe-account-status`.
- Pull or recreate exact source for `stripe-connect-login-link`.
- Pull or recreate exact source for `stripe-webhook`.
- Confirm no service-role or Stripe secret is bundled client-side.
- Confirm `stripe-webhook` validates Stripe signatures before any write.
- Confirm `send-notification` requires a trusted service authorization model if JWT remains disabled.

Do not change mobile UI.

### Fix 2: Enable leaked-password protection in Supabase Auth

Reason: Supabase advisor reports leaked-password protection disabled.

Scope:

- Supabase Dashboard -> Authentication -> Password security.
- Enable leaked-password protection.
- Test new account creation.
- Test password reset/password update.
- Confirm user-facing error copy is acceptable.

No migration is expected.

## Should Fix Before Launch

### Fix 3: Decide public physical rescue address policy

Reason: `get_public_rescue_by_owner_v2` and `get_public_rescue_feed_v2` return street-address fields for verified rescues with `organization_type = 'physical_location'`.

Options:

- Accept and document: public street address is allowed only for verified physical-location rescues.
- Restrict: remove `address_line1`, `address_line2`, and possibly `zip_code` from public RPCs; keep city/state only.

Do not change this until Rachel approves the product/privacy rule.

### Fix 4: Harden `create_user_notification` search path

Reason: Function is `SECURITY DEFINER` and uses `SET search_path TO 'public', 'private'`.

Scope:

- Change to `SET search_path TO ''`.
- Schema-qualify all referenced tables, types, and helper functions.
- Add regression tests that event-specific authorization still works.

### Fix 5: Add staging two-user authorization tests

Reason: Static audit found strong checks, but production/staging negative tests should prove the most important cross-user denials.

Minimum tests:

- User A cannot update/delete User B listing.
- User A cannot insert/delete User B listing image row.
- User A cannot upload into User B listing Storage path.
- User A cannot read User B/User C conversation.
- User A cannot send to another conversation.
- Regular user cannot moderate reports.
- User A cannot read/write User B consent.
- User A cannot read/write User B notification preferences or device tokens.
- Suspended user cannot create listing/send message/submit report/create review/upload image.

Run only against isolated staging fixtures.

### Fix 6: Add rescue content rate limits

Reason: Listing/message/report/review/favorite/search/block/device-token flows have server-side rate limits. Rescue needs and wishlist mutation limits were not confirmed.

Scope:

- Add server-side rate limits to rescue urgent needs and wishlist item create/update/delete paths.
- Keep ownership policies unchanged.
- Add spam/abuse regression tests.

## Safe To Defer

### Deferred 1: RLS initplan performance optimization

Reason: Supabase recommends changing `auth.uid()` to `(select auth.uid())` in some policies for performance. This is not a security bug.

Defer until after beta, or handle in a performance-only migration after security semantics are locked.

### Deferred 2: Missing foreign-key indexes

Reason: Performance advisor reports missing indexes for report/review foreign keys.

Defer to database performance task:

- `reports.assigned_admin_id`
- `reports.listing_id`
- `reports.message_id`
- `reports.reported_user_id`
- `reviews.transaction_id`

### Deferred 3: Multiple permissive policy consolidation

Reason: Policy overlap is currently understandable and may reflect owner/admin/public access layers.

Defer until representative usage and after security regression tests exist.

### Deferred 4: Unused indexes

Reason: ReTail does not yet have representative production traffic.

Do not remove based only on current advisor output.

## Manual Supabase Setting

### Manual 1: Leaked Password Protection

Action: Enable in Supabase Dashboard.

Code change required: no.

App behavior to verify: signup/password-reset copy.

## Intentional / No Change

### No Change 1: RLS enabled/no direct policy on RPC-only tables

Tables:

- `device_tokens`
- `marketplace_search_areas`
- `notification_preferences`
- `rate_limit_events`

Reason: Live grants show only service-role direct table access. App uses controlled RPCs or internal triggers.

### No Change 2: PostGIS/citext/spatial_ref_sys for beta

Reason: Extension-managed objects. No ReTail private data exploit identified.

Review later in database hygiene, not during beta security remediation.

### No Change 3: Public marketplace discovery RPCs

Reason: Marketplace and rescue discovery are product features. The reviewed RPCs return public fields and filter deleted/banned/private rows where applicable.

Exception: physical rescue address exposure needs Rachel's explicit policy confirmation.

## Recommended Next Security Fix Task

Start with:

1. Commit or retrieve the live Edge Function source.
2. Run a focused Edge Function authorization audit, especially Stripe webhook signature validation and `send-notification` authorization.
3. Enable leaked-password protection manually in Supabase Dashboard.

This gives the highest launch-risk reduction without touching the frozen mobile layout.
