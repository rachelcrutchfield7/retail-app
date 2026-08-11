# ReTail Backend Object Registry

Last updated: 2026-08-10

Source audit: `docs/prelaunch/BACKEND_CLEANUP_AUDIT.md`

Purpose: make the current canonical backend surface obvious so future ReTail work does not accidentally revive legacy RPCs, phase wrappers, or test-only assumptions.

Rules:

- Do not delete, rename, revoke, or rewrite database objects from this registry without a separate approved cleanup migration.
- Do not use deprecated objects in new client or Edge Function code.
- Phase-named trigger functions may look old, but most are active security controls. Treat them as live until a forward-only migration replaces them.

## Listings

FEATURE: Listings

CANONICAL RPC:

- `create_listing`
- `update_my_listing`
- `delete_my_listing`
- `archive_my_listing`
- `mark_my_listing_sold`
- `mark_my_listing_donated`
- `get_public_listing_detail`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`
- `private.check_rate_limit`
- `private.ensure_public_search_bounds`
- `private.uuid_from_text`
- `private.public_storage_path_from_url`

ACTIVE TRIGGERS:

- `enforce_phase_f_listing_write`
- `protect_listing_phase_c_fields_before_write`
- `protect_checkout_reservation_listing_fields_before_write`
- `set_listing_search_area_before_write`
- `sync_listing_location_point_trigger`
- `set_listings_updated_at`
- listing count and saved-search alert triggers

ACTIVE POLICIES:

- Listing owner create/update/delete policies
- Admin read/update/delete policies
- Owner private listing read policy

EDGE FUNCTIONS: none directly

DEPRECATED OBJECTS:

- `get_public_listing_feed_phase_f_base`
- `get_nearby_listings_phase_f_base`

DO NOT USE:

- Direct table writes that bypass canonical listing RPCs for create/update/delete/status workflows.
- Phase F base feed helpers from client code.

NOTES:

- Listing image behavior is covered separately under Storage/image handling.
- Public and nearby feeds have their own sections.

## My Listings

FEATURE: My Listings

CANONICAL RPC:

- `get_my_listings`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`

ACTIVE TRIGGERS: none specific

ACTIVE POLICIES:

- Listing owner private read policy

EDGE FUNCTIONS: none

DEPRECATED OBJECTS: none

DO NOT USE:

- `get_public_user_listings` for the signed-in user's own seller dashboard.

NOTES:

- `get_my_listings` derives ownership from `auth.uid()` and is the canonical My Listings backend path.

## Public Listing Feed

FEATURE: Public listing feed

CANONICAL RPC:

- `get_public_listing_feed_sorted`

CANONICAL PRIVATE HELPERS:

- `private.ensure_public_search_bounds`

ACTIVE TRIGGERS: none specific

ACTIVE POLICIES:

- Listing public read is served primarily through RPC return contracts.
- Listing image public select policy for active listings.

EDGE FUNCTIONS: none

DEPRECATED OBJECTS:

- `get_public_listing_feed_phase_f_base`

DO NOT USE:

- `get_public_listing_feed_phase_f_base` in client or Edge Function code.

NOTES:

- `get_public_listing_feed` remains a current fallback while `src/services/listingService.ts` keeps fallback behavior. Do not delete it yet.

## Nearby Listings

FEATURE: Nearby listings

CANONICAL RPC:

- `get_nearby_listings_sorted`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`
- `private.ensure_public_search_bounds`

ACTIVE TRIGGERS: none specific

ACTIVE POLICIES:

- `marketplace_search_areas` is intentionally RPC-only.
- `marketplace_search_preferences` owner/admin policies.

EDGE FUNCTIONS: none

DEPRECATED OBJECTS:

- `get_nearby_listings_phase_f_base`

DO NOT USE:

- `get_nearby_listings_phase_f_base` in client or Edge Function code.

NOTES:

- `get_nearby_listings` remains a current fallback while `src/services/listingService.ts` keeps fallback behavior. Do not delete it yet.

## Listing Transactions

FEATURE: Listing transactions

CANONICAL RPC:

- `complete_listing_transaction`
- `create_transaction_review`
- `get_user_review_summary`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`
- `private.check_rate_limit`
- `private.create_notification_for_event`

ACTIVE TRIGGERS:

- `protect_transaction_phase_e_fields`
- `protect_review_phase_e_fields`
- `enforce_phase_f_review_insert`
- `set_transactions_updated_at`
- `set_reviews_updated_at`

ACTIVE POLICIES:

- Transaction participant read policy
- Public review read policy

EDGE FUNCTIONS:

- `stripe-create-payment-intent`
- `stripe-webhook`

DEPRECATED OBJECTS:

- `complete_listing_transaction_phase_f_base`

DO NOT USE:

- `complete_listing_transaction_phase_f_base` from client or Edge Function code.

NOTES:

- The base helper is retained only because the canonical wrapper still delegates to it.

## Transaction Support

FEATURE: Transaction support

CANONICAL RPC:

- `create_transaction_support_case`
- `get_my_transaction_support_cases`
- `get_admin_transaction_support_cases`
- `admin_update_transaction_support_case`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`
- `private.is_admin`

ACTIVE TRIGGERS:

- `set_support_cases_updated_at`

ACTIVE POLICIES:

- Support case party read policy
- Support case admin read policy

EDGE FUNCTIONS: none

DEPRECATED OBJECTS: none

DO NOT USE:

- General reports as the canonical order/payment/refund/support workflow.
- Client-side direct writes to `support_cases`.
- Support-case submission as a trigger for automatic Stripe refunds or cancellations.

NOTES:

- `support_cases` is separate from reports. Reports remain for safety/moderation. Support cases are for order, payment, refund, cancellation, return, shipping, and payout issues.
- Refund/cancellation actions must continue through secure Stripe/admin payment handling, not arbitrary client-side support-ticket fields.

## Reports

FEATURE: Reports

CANONICAL RPC:

- `submit_report`
- `has_existing_report`
- `get_admin_report_queue`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`
- `private.check_rate_limit`

ACTIVE TRIGGERS:

- `enforce_phase_f_report_insert`
- `protect_report_phase_e_fields`
- `protect_report_moderation_event_phase_e`
- `set_reports_updated_at`

ACTIVE POLICIES:

- Admin read reports policy
- Admin read report moderation events policy

EDGE FUNCTIONS: none

DEPRECATED OBJECTS:

- `admin_update_report`
- `admin_update_report_phase_f_base`

DO NOT USE:

- `admin_update_report`
- `admin_update_report_phase_f_base`

NOTES:

- Report submission and queue loading are current. Admin actions are covered by Admin moderation.

## Admin Moderation

FEATURE: Admin moderation

CANONICAL RPC:

- `admin_moderate_report`

CANONICAL PRIVATE HELPERS:

- `private.is_admin`
- `private.create_admin_report_message`
- `private.create_notification_for_event`

ACTIVE TRIGGERS:

- `protect_report_phase_e_fields`
- `protect_report_moderation_event_phase_e`
- `protect_notification_phase_e_fields`

ACTIVE POLICIES:

- Admin report read policy
- Admin report moderation event read policy
- Admin profile/listing/rescue policies where applicable

EDGE FUNCTIONS: none

DEPRECATED OBJECTS:

- `admin_update_report`
- `admin_update_report_phase_f_base`

DO NOT USE:

- `admin_update_report`
- `admin_update_report_phase_f_base`

NOTES:

- DEPRECATED: `admin_update_report` is retained for compatibility only. Do not use in new code.
- Canonical replacement: `admin_moderate_report`.
- `admin_moderate_report` is the only canonical Admin Panel report action RPC because it supports resolve/dismiss, remove listing, remove message, delete user, admin notes, and admin messages.

## Messaging

FEATURE: Messaging

CANONICAL RPC:

- `create_or_get_conversation`
- `send_message`
- `mark_conversation_read`
- `soft_delete_own_message`
- `block_user`
- `unblock_user`

CANONICAL PRIVATE HELPERS:

- `private.is_blocked_between`
- `private.is_conversation_participant`
- `private.other_conversation_participant`
- `private.is_valid_message_attachment_path`
- `private.can_access_message_attachment`

ACTIVE TRIGGERS:

- `enforce_phase_f_conversation_insert`
- `enforce_phase_f_message_insert`
- `protect_conversation_phase_d_fields`
- `protect_message_phase_d_fields`
- `message_insert_update_conversation`
- conversation/message updated-at triggers

ACTIVE POLICIES:

- Conversation participant read/insert policies
- Message participant read/insert policies
- Block owner read policy

EDGE FUNCTIONS: none

DEPRECATED OBJECTS:

- `create_or_get_conversation_phase_f_base`

DO NOT USE:

- `create_or_get_conversation_phase_f_base` from client code.

NOTES:

- Keep `create_or_get_conversation_phase_f_base` temporarily until a full SQL body diff confirms all base behavior is represented by the current canonical wrapper.

## Rescues

FEATURE: Rescues

CANONICAL RPC:

- `get_public_rescue_feed`
- `get_nearby_rescues`
- `get_public_rescue_by_owner`
- `update_my_rescue_profile`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`
- `private.ensure_public_search_bounds`

ACTIVE TRIGGERS:

- `protect_rescue_profile_phase_c_fields_before_write`
- `set_rescue_search_area_before_write`
- `sync_rescue_location_point_trigger`
- rescue updated-at triggers

ACTIVE POLICIES:

- Public active/verified rescue read policies
- Rescue owner manage policies
- Admin manage policies
- Rescue needs and wishlist owner/admin/public policies

EDGE FUNCTIONS: none

DEPRECATED OBJECTS:

- `get_public_rescue_feed_phase_f_base`
- `get_nearby_rescues_phase_f_base`

DO NOT USE:

- Phase F rescue base helpers from client code.

NOTES:

- Rescue `*_v2` RPCs are live but not current client canon. Recommendation: KEEP BOTH TEMPORARILY until product/security confirms whether public physical addresses should be exposed through those v2 contracts.
- FOLLOW-UP: Rescue RPC consolidation requires separate data-contract validation.

## Rescue Verification

FEATURE: Rescue verification

CANONICAL RPC:

- `admin_set_rescue_verification`

CANONICAL PRIVATE HELPERS:

- `private.is_admin`
- `private.require_active_account`

ACTIVE TRIGGERS:

- `protect_rescue_profile_phase_c_fields_before_write`

ACTIVE POLICIES:

- Admin manage rescue profiles
- Rescue owner private read/manage profile

EDGE FUNCTIONS: none

DEPRECATED OBJECTS: none verified

DO NOT USE:

- Direct client updates to `verification_status`, `is_verified`, EIN, or admin-note fields.

NOTES:

- Regular rescue signup must not imply verified rescue status.

## Auth/Profile

FEATURE: Auth/profile

CANONICAL RPC:

- `create_my_profile`
- `update_my_profile`
- `get_public_profile`
- `prepare_account_deletion_for_user` for server-side account deletion preparation

CANONICAL PRIVATE HELPERS:

- `private.is_account_active`
- `private.is_admin`
- `private.reject_user_consent_mutation`
- `private.record_account_deletion_marketing_opt_out`

ACTIVE TRIGGERS:

- `protect_profile_phase_c_fields_before_write`
- `prevent_profile_privilege_escalation`
- `prevent_profile_coordinate_mutation_before_write`
- `record_account_deletion_marketing_opt_out`
- profile updated-at trigger

ACTIVE POLICIES:

- Owner profile insert/update/private read policies
- Admin profile update policy

EDGE FUNCTIONS:

- `delete-account`

DEPRECATED OBJECTS:

- `prepare_current_account_deletion` was dropped by migration and must not be used.

DO NOT USE:

- Client-side direct mutation of privileged profile fields.

NOTES:

- Profile authorization must derive from `auth.uid()` and database rows, not user-editable metadata.

## Consent

FEATURE: Consent

CANONICAL RPC:

- `get_my_consent_state`
- `record_my_policy_acceptance`
- `update_my_marketing_email_preference`

CANONICAL PRIVATE HELPERS:

- `private.reject_user_consent_mutation`
- `private.record_account_deletion_marketing_opt_out`
- `private.record_auth_user_deletion_marketing_opt_out`

ACTIVE TRIGGERS:

- `user_consents_reject_mutation`
- `record_account_deletion_marketing_opt_out`
- `record_auth_user_deletion_marketing_opt_out`

ACTIVE POLICIES:

- User read own consent history

EDGE FUNCTIONS:

- `delete-account` indirectly, through deletion flow

DEPRECATED OBJECTS: none

DO NOT USE:

- Direct client writes to `user_consents`.
- Rewriting historical consent rows.

NOTES:

- Marketing consent is independent of required policy acceptance.

## Notifications

FEATURE: Notifications

CANONICAL RPC:

- `mark_notification_read`
- `mark_all_notifications_read`
- `delete_my_notification`
- `register_my_device_token`
- `remove_my_device_token`
- `get_my_notification_preferences`
- `update_my_notification_preferences`
- `create_user_notification` only where server authorization permits

CANONICAL PRIVATE HELPERS:

- `private.create_notification_for_event`
- `private.enforce_phase_f_device_token_write`

ACTIVE TRIGGERS:

- `protect_notification_phase_e_fields`
- `enforce_phase_f_device_token_write`
- notification/preference/device-token updated-at triggers

ACTIVE POLICIES:

- User read own notifications
- `device_tokens` and `notification_preferences` are intentionally RPC-only with no direct public policies

EDGE FUNCTIONS:

- `send-notification`

DEPRECATED OBJECTS: none verified

DO NOT USE:

- Direct client writes to `device_tokens` or `notification_preferences`.

NOTES:

- `send-notification` has JWT disabled intentionally only when trusted shared-secret or related authenticated-user checks remain present.

## Stripe Checkout

FEATURE: Stripe checkout

CANONICAL RPC:

- `reserve_stripe_checkout_listing`
- `attach_stripe_checkout_reservation`
- `release_stripe_checkout_reservation`
- `claim_stripe_webhook_event`
- `mark_stripe_webhook_event_processed`
- `mark_stripe_webhook_event_failed`
- `record_stripe_transaction_payment_event`
- `create_stripe_payment_notification`

CANONICAL PRIVATE HELPERS:

- `private.require_active_account`
- `private.create_notification_for_event`

ACTIVE TRIGGERS:

- `protect_checkout_reservation_listing_fields_before_write`
- `protect_transaction_phase_e_fields`

ACTIVE POLICIES:

- Transaction participant read policy
- Stripe webhook/event tables are service-role/RPC-only

EDGE FUNCTIONS:

- `stripe-create-payment-intent`
- `stripe-webhook`

DEPRECATED OBJECTS: none verified

DO NOT USE:

- Client-side direct writes to reservation, payment, or transaction protected fields.

NOTES:

- Stripe test environment remains isolated from normal beta unless payment test mode is explicitly enabled.

## Stripe Connect

FEATURE: Stripe Connect

CANONICAL RPC:

- No direct client RPC; Stripe Connect uses Edge Functions and profile fields.

CANONICAL PRIVATE HELPERS:

- Profile protected-field trigger helpers

ACTIVE TRIGGERS:

- `protect_profile_phase_c_fields_before_write`

ACTIVE POLICIES:

- Owner/admin profile policies

EDGE FUNCTIONS:

- `stripe-connect-account`
- `stripe-account-status`
- `stripe-connect-login-link`

DEPRECATED OBJECTS: none verified

DO NOT USE:

- Client-side direct mutation of Stripe account/status fields.

NOTES:

- Client should use `src/services/stripeConnectService.ts`.

## Refund/Dispute Handling

FEATURE: Refund/dispute handling

CANONICAL RPC:

- `record_stripe_transaction_payment_event`
- `mark_stripe_webhook_event_processed`
- `mark_stripe_webhook_event_failed`

CANONICAL PRIVATE HELPERS:

- Stripe webhook signature verification in Edge Function source

ACTIVE TRIGGERS:

- `protect_transaction_phase_e_fields`

ACTIVE POLICIES:

- Admin-only transaction payment event reads
- Transaction participant reads for transactions

EDGE FUNCTIONS:

- `stripe-webhook`

DEPRECATED OBJECTS: none verified

DO NOT USE:

- Direct client writes to refund/dispute/payment event fields.

NOTES:

- Refund/dispute handling is backend-only. Do not add UI coupling without a separate task.

## Storage/Image Handling

FEATURE: Storage/image handling

CANONICAL RPC:

- Listing image records are managed through listing service flows plus table policies/triggers.

CANONICAL PRIVATE HELPERS:

- `private.public_storage_path_from_url`
- `private.uuid_from_text`
- `private.is_valid_message_attachment_path`
- `private.can_access_message_attachment`

ACTIVE TRIGGERS:

- `protect_listing_image_phase_d_fields`
- `enforce_listing_image_limit`

ACTIVE POLICIES:

- Storage policy `Phase D listing owners can manage listing images`
- Storage policy `Phase D owner can manage avatar images`
- Storage policies for message image upload/read/update/delete
- Listing image owner manage and public active listing read policies

EDGE FUNCTIONS: none

DEPRECATED OBJECTS: none verified

DO NOT USE:

- Direct client upload paths that do not match bucket ownership conventions.
- `data:` URI upload bodies for native listing photo Supabase uploads.

NOTES:

- Current native listing photo transport should use local file/content URI to ArrayBuffer before Supabase Storage upload.
