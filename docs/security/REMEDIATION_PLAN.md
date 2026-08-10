# ReTail Security Remediation Plan

Date: 2026-07-19
Status: Phases A through E complete; Phase F repository implementation in progress

## Overview

This plan groups remediation into small, reviewable phases. Each phase should land as its own pull request or controlled change set. Database changes should be applied first to a staging Supabase project, then verified with direct API tests before touching production.

Recommended release gate:

ReTail should remain **blocked from beta** until Phase A, Phase B, and the release-blocking parts of Phase C are completed and verified against the live Supabase project.

## Phase A: Secrets, Dependencies, and Secure Session Storage

Exact goal:

Confirm no secrets are committed or bundled, strengthen local/CI scanning, verify dependency advisories, and confirm session storage behavior for native and web targets.

Files likely to change:

- `.gitignore`
- `.env.example`
- `scripts/lint.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `src/constants/config.ts`
- `src/lib/supabase.ts`
- `src/lib/queryClient.ts`
- `src/auth/AuthContext.tsx`
- CI/GitHub workflow files, if present or added later

SQL objects likely to change:

- None expected.

Tests required:

- Secret scanner test with fake positive samples.
- Dependency audit in CI.
- Auth sign-out cache-clearing test.
- Account switch test proving previous user data is not visible after logout/login.
- Native secure storage smoke test.
- Web preview warning or test documenting localStorage risk.

Rollback considerations:

- Scanner changes are low risk and can be reverted independently.
- Dependency updates should be tested on Expo web, iOS, and Android before merging.
- If a dependency upgrade breaks Expo compatibility, pin current versions and document the accepted advisory.

Dependencies on earlier phases:

- None. This phase should be performed first because it reduces the risk of leaking credentials during the rest of the remediation work.

## Phase B: Public Profile and Exact-Location Privacy

Exact goal:

Ensure public APIs never expose exact home address, rescue private address, ZIP code, precise latitude/longitude, admin flags, moderation flags, phone/email details, EIN, or private verification fields.

Files likely to change:

- `src/services/listingService.ts`
- `src/services/profileService.ts`
- `src/services/rescueService.ts`
- `src/services/supabaseData.ts`
- `src/services/types.ts`
- Listing, profile, and rescue UI components if they currently expect private fields from public responses
- Tests for listing, profile, and rescue services

SQL objects likely to change:

- `profiles`
- `listings`
- `rescue_profiles`
- `get_nearby_listings`
- `get_public_listing_detail`
- `get_public_profile`
- `get_nearby_rescues`
- Public select policies on `profiles`, `listings`, and `rescue_profiles`
- Grants for `anon` and `authenticated`
- Possible security-invoker views or public/private table split

Tests required:

- Direct anonymous query against `profiles` cannot return `zip_code`, `latitude`, `longitude`, `is_admin`, `is_banned`, or private flags.
- Direct anonymous query against `listings` cannot return `zip_code`, `latitude`, `longitude`, or `ship_from_zip_code`.
- Direct anonymous query against `rescue_profiles` cannot return `address_line1`, `address_line2`, `zip_code`, `latitude`, `longitude`, `contact_email`, `contact_phone`, `ein`, `verified_by`, or private verification fields.
- Public listing RPC returns only safe fields.
- Public rescue RPC returns only safe fields and uses coarse distance.
- Repeated distance queries cannot infer exact coordinates beyond the accepted product threshold.

Rollback considerations:

- Changing public response shapes can break UI quickly. Make app service updates and SQL changes in a coordinated branch.
- Keep a staged copy of existing RPCs under new names only in staging if needed for comparison.
- Avoid rolling back to broad table access once public privacy is fixed.

Dependencies on earlier phases:

- Phase A should be complete so tests and audits run reliably.

## Phase C: RLS, Grants, and Protected Profile Fields

Status: Completed on 2026-07-17 in `20260717174159_phase_c_protected_fields_least_privilege.sql` and `20260717180029_phase_c_function_search_path_hardening.sql`.

Exact goal:

Ensure direct Supabase API calls cannot update system fields, role fields, trust counters, rescue verification state, moderation state, or admin-only data.

Files likely to change:

- `src/services/profileService.ts`
- `src/services/rescueService.ts`
- `src/services/listingService.ts`
- `src/services/adminService.ts`
- Any admin verification screens or hooks
- Database policy verification tests

SQL objects likely to change:

- `profiles`
- `listings`
- `rescue_profiles`
- `reports`
- `notifications`
- `audit_logs`
- `protect_profile_system_fields`
- New `protect_listing_system_fields`
- `protect_rescue_verification_fields`
- `is_admin`
- `is_account_active`
- `is_blocked_between`
- Grants/revokes on helper functions
- Column privileges or public views

Tests required:

- Non-admin cannot update `is_admin`, `is_banned`, `is_verified`, `account_type`, rating fields, counters, or `deleted_at`.
- Listing owner cannot update `favorite_count`, `message_count`, `view_count`, `seller_id`, `published_at`, or admin moderation status.
- Rescue owner cannot update `is_verified`, `verification_status`, `verified_at`, or `verified_by`.
- Non-admin cannot execute internal helper functions directly unless specifically intended.
- Admin can perform approved admin actions through intended APIs.

Rollback considerations:

- Trigger changes can block legitimate app updates if the editable field list is incomplete. Test profile edit, rescue edit, listing edit, admin approval, account deletion, and moderation flows in staging before production.
- Keep old policies available only in migration history, not as active fallback.

Dependencies on earlier phases:

- Phase B should define which fields are public versus private.
- Phase A should provide test and audit scaffolding.

## Phase D: Conversations, Messages, Blocking, and Storage

Status: Completed on 2026-07-18 in `20260719003237 phase_d_messaging_blocking_storage_security`; amended on 2026-07-19 by `20260719011141 phase_d1_attachment_and_system_message_fixes`.

Exact goal:

Ensure conversations and messages are participant-only, blocked users cannot interact, image messages cannot bypass private storage, and removed/abandoned images are controlled.

Files likely to change:

- `src/services/conversationService.ts`
- `src/services/messageService.ts`
- `src/services/storageService.ts`
- `src/services/blockService.ts`
- Messaging hooks and components that consume message image URLs
- Tests for messaging and storage services

SQL objects likely to change:

- `conversations`
- `messages`
- `blocks`
- `storage.objects` policies
- `mark_conversation_read`
- `soft_delete_own_message`
- message send RPC, if added
- Storage bucket policies for `message-images`, `listings`, and possibly `avatars`
- New cleanup job or function for orphaned listing images

Tests required:

- Nonparticipant cannot read conversations or messages.
- Participant cannot change conversation buyer, seller, listing, or created time.
- Message sender cannot rewrite sent content.
- Blocked users cannot create conversations, send messages, upload message images, or complete transactions together.
- Image message with external `http` URL is rejected.
- Message image path not in private bucket is rejected.
- Removed listing media is no longer publicly available through normal app APIs.
- Orphaned uploaded files are cleaned up or quarantined.

Rollback considerations:

- Storage policy changes can break image display if signed URL generation is not updated at the same time.
- Use staging buckets to test migration from stored public URLs to storage paths.
- Preserve moderation evidence before deleting or hiding message images.

Dependencies on earlier phases:

- Phase C should be complete so direct updates are constrained.
- Phase B should decide public media and location privacy rules.

Completion notes:

- Direct app writes to `conversations`, `messages`, and `blocks` were replaced with controlled RPCs.
- Message images now use private attachment metadata and short-lived signed URLs.
- Blocks are enforced on conversation creation, message sending, and message-image uploads.
- Avatar/listing public URL serving remains, but broad object enumeration policies were removed.
- Removed listing image cleanup is queued in `storage_cleanup_jobs` for a future worker.
- See `PHASE_D_RESULTS.md`, `PHASE_D_MESSAGING_AUTHORIZATION_MATRIX.md`, and `PHASE_D_STORAGE_MODEL.md`.

## Phase D.1: Message Attachment Validation and System Message Lockdown

Status: Applied to Supabase on 2026-07-19; real Storage API upload/send proof pending explicit approval for disposable live test data.

Exact goal:

Correct Phase D attachment path validation, validate Storage object metadata before image-message creation, forbid ordinary callers from creating `system` messages, and align blocking behavior so historical message images remain readable to existing conversation participants.

Files changed:

- `src/services/conversationService.ts`
- `src/services/messageService.ts`
- `src/services/notificationService.ts`
- `src/services/offerService.ts`
- `src/services/types.ts`
- `tests/securityPhaseD1.test.mjs`
- `tests/securityPhaseD1Live.test.mjs`
- `tests/security_phase_d1_live_rollback.sql`
- `docs/security/PHASE_D1_RESULTS.md`

SQL objects changed:

- `private.is_valid_message_attachment_path`
- `private.message_attachment_path_is_valid`
- `private.can_access_message_attachment`
- `public.protect_message_phase_d_fields`
- `public.send_message`
- `storage.objects` message-image policies

Verification:

- Live migration recorded in Supabase.
- Rollback-only live SQL checks passed.
- Local lint, typecheck, tests, Expo Doctor, web export, secret scans, and dependency audit passed.
- Full real Storage upload/send/signed-read test remains pending until temporary live test accounts are explicitly approved or live test credentials are supplied.

## Phase E: Transactions, Reviews, Reports, and Notifications

Status: Completed on 2026-07-19 in `20260719120708_phase_e_transactions_reviews_reports_notifications_security.sql`.

Exact goal:

Ensure trust records are server-controlled, cannot be forged by direct API calls, and cannot target unrelated users.

Files changed:

- `src/services/transactionService.ts`
- `src/services/reviewService.ts`
- `src/services/reportService.ts`
- `src/services/notificationService.ts`
- `src/services/adminService.ts`
- `src/services/favoriteService.ts`
- `src/services/listingService.ts`
- `supabase/schema.sql`
- `supabase/policies.sql`
- `tests/securityPhaseE.test.mjs`
- Related legacy static tests

SQL objects changed:

- `transactions`
- `reviews`
- `reports`
- `notifications`
- `notification_preferences`
- `device_tokens`
- `report_moderation_events`
- `complete_listing_transaction`
- `create_transaction_review`
- `get_user_review_summary`
- `submit_report`
- `has_existing_report`
- `get_my_reports`
- `admin_update_report` (legacy Phase E RPC; deprecated for new Admin Panel work)
- `mark_notification_read`
- `mark_all_notifications_read`
- `delete_my_notification`
- `get_my_notification_preferences`
- `update_my_notification_preferences`
- `register_my_device_token`
- `remove_my_device_token`
- `private.create_notification_for_event`
- Transaction policies
- Review policies
- Report policies
- Notification policies

Tests required:

- Seller cannot complete transaction with a user who was not a valid conversation participant.
- Nonparticipant cannot report a message by UUID.
- User cannot create report with trusted fields such as status, assigned admin, resolved timestamp, or admin notes.
- User cannot fabricate notifications for another user.
- User cannot retarget review `reviewee_id`, `transaction_id`, `listing_id`, or `rating` after creation.
- Admin can resolve reports through canonical `admin_moderate_report`.
- Report moderation event records status transitions.
- Preferences and device tokens can be changed only through caller-derived RPCs.

Rollback considerations:

- Tightening transaction and review rules may block existing test data. Prepare data repair scripts for staging.
- Notification RPC changes can temporarily reduce notification delivery; monitor failures during rollout.

Dependencies on earlier phases:

- Phase C should be complete for protected system fields.
- Phase D should be complete if transaction completion depends on conversations/offers.

Completion notes:

- Direct client notification creation was removed from application services.
- Generic `create_user_notification` is dropped by the Phase E migration.
- Completed transactions, reviews, reports, moderation, notification preferences, and device tokens now use controlled RPCs.
- Notification creation is centralized in `private.create_notification_for_event` and server-side triggers/RPCs.
- See `PHASE_E_RESULTS.md`, `PHASE_E_AUTHORIZATION_MATRIX.md`, `PHASE_E_TRANSACTION_REVIEW_MODEL.md`, `PHASE_E_REPORT_MODERATION_MODEL.md`, and `PHASE_E_NOTIFICATION_MODEL.md`.
- Phase E was applied to Supabase with the exact recorded version and live multi-user tests passed.

## Phase F: Rate Limiting, Security Tests, and Automated Scanners

Status: Repository implementation in progress on 2026-07-19 in `20260719175607_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql`.

Exact goal:

Add enforceable abuse limits, direct API regression tests, final authorization documentation, and beta-readiness operations checklists so future changes do not reopen the same classes of issues.

Files changed:

- `src/services/messageService.ts`
- `src/services/supabaseData.ts`
- `supabase/schema.sql`
- `supabase/policies.sql`
- `tests/securityPhaseF.test.mjs`
- `tests/securityPhaseFLive.test.mjs`
- `tests/security_phase_f_live.sql`
- Phase F security documentation

SQL objects changed:

- `rate_limit_events`
- `private.require_active_account`
- `private.check_rate_limit`
- `private.normalized_message_fingerprint`
- `private.ensure_public_search_bounds`
- `private.cleanup_rate_limit_events`
- High-risk write triggers for conversations, messages, reports, reviews, listings, favorites, saved searches, blocks, and device tokens
- Wrappers for `create_or_get_conversation`, `complete_listing_transaction`, legacy `admin_update_report`, and public discovery RPCs

Tests required:

- Static Phase F regression tests for private helpers, grants, rate-limit coverage, abuse controls, search bounds, and app error handling.
- Rollback-based live Supabase tests for message spam, limits, saved-search cap, report/admin/review/transaction/device/block limits, direct rate-event write denial, and cleanup.
- Final local lint, typecheck, tests, Expo Doctor, web export, dependency audit, and secret scans.
- Supabase migration alignment, advisors, Auth dashboard, Realtime, Storage, and backup checklist review.

Rollback considerations:

- Rate limits can block legitimate testers if thresholds are too strict. Start with staged limits and logging, then enforce.
- Automated scanners may produce false positives; define documented exceptions.
- Keep test data isolated from production.

Dependencies on earlier phases:

- Phases B through E should define the desired security rules.
- Phase F turns those rules into repeatable guardrails and should run continuously after completion.

Completion notes:

- See `PHASE_F_RESULTS.md`, `PHASE_F_RATE_LIMIT_MODEL.md`, `PHASE_F_ABUSE_PREVENTION_MODEL.md`, `PHASE_F_FINAL_AUTHORIZATION_REVIEW.md`, `BETA_SECURITY_READINESS_CHECKLIST.md`, `SUPABASE_AUTH_PRODUCTION_CHECKLIST.md`, `INCIDENT_RESPONSE_PLAN.md`, and `BACKUP_AND_RECOVERY_PLAN.md`.
- Phase F is not complete until the migration is applied to Supabase, live tests pass, the branch is pushed, and both required GitHub Actions workflows complete successfully.

## Suggested Execution Order

1. Phase A: establish secrets/dependency/session safety checks.
2. Phase B: close exact-location and public profile privacy gaps.
3. Phase C: lock down direct updates, grants, and system fields.
4. Phase D: secure messaging and storage.
5. Phase E: secure trust, reports, reviews, transactions, and notifications.
6. Phase F: add enforcement, scanners, and regression tests.

## Minimum Beta Gate

Before beta, confirm all of the following in the live Supabase project:

- Public profile/listing/rescue APIs do not return exact coordinates, ZIP codes, private addresses, admin flags, EINs, phone numbers, private emails, or verification evidence.
- Non-admin direct updates to profile/listing/rescue system fields fail.
- Nonparticipant conversation/message access fails.
- Blocked users cannot message or upload message images.
- External image URLs are rejected for private image-message flows.
- Sellers cannot fabricate completed transactions with unrelated users.
- Reports and notifications are created only through trusted server-controlled paths.
- Sign-out clears cached user data.
- Dependency audit is clean or has documented accepted risk.
- Security tests run before every release.
