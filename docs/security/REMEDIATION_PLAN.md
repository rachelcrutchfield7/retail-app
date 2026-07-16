# ReTail Security Remediation Plan

Date: 2026-07-14
Status: Planning only; no remediation applied

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

## Phase E: Transactions, Reviews, Reports, and Notifications

Exact goal:

Ensure trust records are server-controlled, cannot be forged by direct API calls, and cannot target unrelated users.

Files likely to change:

- `src/services/transactionService.ts`
- `src/services/reviewService.ts`
- `src/services/reportService.ts`
- `src/services/notificationService.ts`
- `src/services/offerService.ts`
- Admin moderation service and screens
- Tests for trust and notification flows

SQL objects likely to change:

- `transactions`
- `reviews`
- `reports`
- `notifications`
- `audit_logs`
- `complete_listing_transaction`
- `submit_report`
- `has_existing_report`
- `create_user_notification`
- Transaction policies
- Review policies
- Report policies
- Notification policies

Tests required:

- Seller cannot complete transaction with a user who was not a valid conversation participant or accepted buyer.
- Buyer confirmation or accepted offer is required before review eligibility, if that product rule is adopted.
- Nonparticipant cannot report a message by UUID.
- User cannot create report with trusted fields such as status, assigned admin, resolved timestamp, or admin notes.
- User cannot fabricate notifications for another user.
- User cannot retarget review `reviewee_id`, `transaction_id`, `listing_id`, or `rating` after creation.
- Admin can resolve reports and create system notifications.
- Audit log records key moderation actions.

Rollback considerations:

- Tightening transaction and review rules may block existing test data. Prepare data repair scripts for staging.
- Notification RPC changes can temporarily reduce notification delivery; monitor failures during rollout.

Dependencies on earlier phases:

- Phase C should be complete for protected system fields.
- Phase D should be complete if transaction completion depends on conversations/offers.

## Phase F: Rate Limiting, Security Tests, and Automated Scanners

Exact goal:

Add enforceable abuse limits, direct API regression tests, and automated security checks so future changes do not reopen the same classes of issues.

Files likely to change:

- `src/services/messageService.ts`
- `src/services/reportService.ts`
- `src/services/listingService.ts`
- `src/services/authService.ts`
- `tests/`
- `scripts/`
- CI workflow files, if present or added later
- Supabase local test configuration, if added later

SQL objects likely to change:

- `rate_limit_events`
- New rate-limit helper functions
- Message send RPC
- Report submit RPC
- Listing create RPC or triggers
- Notification create RPC
- Audit log functions

Tests required:

- Direct API tests for each RLS policy and RPC.
- Anonymous public API snapshot tests proving only safe fields are returned.
- Authenticated malicious-user tests with arbitrary UUIDs.
- Rate-limit tests for messages, reports, listings, and notifications.
- Storage policy tests for public and private buckets.
- Dependency audit in CI.
- Secret scan in CI.
- App permission/privacy manifest review checklist.
- Basic accessibility and session cache tests.

Rollback considerations:

- Rate limits can block legitimate testers if thresholds are too strict. Start with staged limits and logging, then enforce.
- Automated scanners may produce false positives; define documented exceptions.
- Keep test data isolated from production.

Dependencies on earlier phases:

- Phases B through E should define the desired security rules.
- Phase F turns those rules into repeatable guardrails and should run continuously after completion.

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
