# ReTail Security Remediation Phase D Results

Date: 2026-07-18
Status: Applied to Supabase project `ycwgsdigvpmprqreoqiz`

## Scope

Phase D hardened messaging, blocking, message-image storage, conversation read state, and removed-listing image cleanup tracking.

This phase did not redesign payments, reviews, reports, public discovery RPCs, rescue verification, or broader advisor cleanup. Those remain in Phase E and later hardening work.

## Database Migration

Recorded Supabase migration:

- `20260719003237 phase_d_messaging_blocking_storage_security`

Repository migration file:

- `supabase/migrations/20260719003237_phase_d_messaging_blocking_storage_security.sql`

The first live apply attempt failed before recording a migration because Supabase does not allow project SQL to alter owner-managed `storage.objects` table settings. The migration was adjusted to leave Supabase-managed Storage RLS ownership alone while still replacing ReTail bucket policies. The successful recorded migration applied afterward.

## RPCs Added

Authenticated, controlled RPCs:

- `create_or_get_conversation(target_listing_id uuid)`
- `send_message(target_conversation_id uuid, requested_message_type message_type, requested_body text, requested_attachment_bucket text, requested_attachment_path text, requested_attachment_mime_type text, requested_attachment_size_bytes integer, requested_attachment_width integer, requested_attachment_height integer)`
- `mark_conversation_read(target_conversation_id uuid)`
- `soft_delete_own_message(target_message_id uuid)`
- `block_user(target_user_id uuid)`
- `unblock_user(target_user_id uuid)`

All public Phase D RPCs are granted only to `authenticated`. Execution was revoked from `PUBLIC` and `anon`.

## Direct Table Access

Direct write grants were removed for:

- `public.conversations`
- `public.messages`
- `public.blocks`

The only direct grants left for app roles are:

- `authenticated` can `select` rows allowed by participant/owner RLS.
- `authenticated` can `select` and `update` `storage_cleanup_jobs`, but RLS restricts those rows to admins.

Conversation creation, message sending, read marking, soft deletion, blocking, and unblocking now go through controlled RPCs.

## RLS Policies

New Phase D table policies:

- `Phase D participants can view conversations`
- `Phase D participants can view messages`
- `Phase D users can view own blocks`
- `Phase D admins can view storage cleanup jobs`
- `Phase D admins can update storage cleanup jobs`

Pre-Phase-D broad conversation/message/block policies were dropped. Phase D policies target explicit roles such as `authenticated`, not the broad public role.

## Storage Model

Bucket state verified live:

- `message-images`: private, 10 MB limit, `image/jpeg`, `image/png`, `image/webp`
- `avatars`: public serving retained, 10 MB limit, `image/jpeg`, `image/png`, `image/webp`
- `listings`: public serving retained, 10 MB limit, `image/jpeg`, `image/png`, `image/webp`

Removed broad object-listing policies:

- `Public reads avatar images`
- `Public reads listing images`

New object policies:

- `Phase D owner can manage avatar images`
- `Phase D listing owners can manage listing images`
- `Phase D participants can read message images`
- `Phase D participants can upload message images`
- `Phase D uploader can update message images`
- `Phase D uploader can delete message images`

Message-image paths must follow:

```text
<conversation_id>/<auth.uid()>/<random_uuid>.<jpg|jpeg|png|webp>
```

The app stores `attachment_bucket`, `attachment_path`, MIME type, size, and optional dimensions. It does not persist signed URLs. Signed URLs are generated on read and treated as short-lived display values.

Legacy `messages.image_url` values are not used for new image messages. The app no longer renders arbitrary external legacy message image URLs.

## Blocking Behavior

Blocking is enforced in both directions:

- A cannot start a conversation with B if either user blocked the other.
- A cannot send messages to B if either user blocked the other.
- A cannot upload new message images for a conversation with B if either user blocked the other.

Historical conversation/message reads remain available to participants for continuity and moderation context, but new interaction is blocked.

## Removed Listing Image Strategy

`delete_my_listing` now queues public listing image paths into `storage_cleanup_jobs` before marking the listing removed.

The cleanup queue is intentionally not treated as an atomic Storage delete. It records:

- bucket
- object path
- source table
- source id
- reason
- status
- attempts
- last error
- processed timestamp

Actual Storage deletion should be processed by an admin-controlled worker or Edge Function in a later operational phase.

## Live Verification

Verified live in Supabase:

- Phase D migration is recorded.
- Phase D RPCs exist.
- `anon` has no Phase D RPC execute grants.
- `authenticated` can execute only the intended public Phase D RPCs.
- Trigger-only helper functions are not executable by `anon` or `authenticated`.
- Sensitive direct table writes were revoked.
- Participant/owner RLS policies are live.
- `message-images` is private.
- Avatar/listing broad object enumeration policies were removed.
- Realtime publication includes `conversations`, `messages`, and `notifications`.

Rollback-only live behavior checks passed:

- Active fixture found.
- Conversation creation derives buyer/seller server-side.
- Duplicate conversation is reused.
- Text message send derives sender server-side.
- External image attachment path is rejected.
- Recipient-only read marking updates unread messages.
- Own-listing conversation is denied.
- Blocking prevents messages.

## Local Verification

Passed:

- `CI=true pnpm install --frozen-lockfile`
- `CI=true pnpm lint`
- `CI=true pnpm exec tsc --noEmit`
- `CI=true pnpm test`
- `CI=true pnpm exec expo-doctor`
- `CI=true pnpm exec expo export --platform web`
- `node scripts/dependency-audit.mjs`
- `CI=true pnpm security:audit`
- `CI=true pnpm security:secrets`
- `CI=true pnpm security:secrets:history`

Static test suite result:

- 147 total tests
- 137 passed
- 10 skipped existing live Supabase tests
- 0 failed

Skipped tests were not counted as live pass results. Phase D live verification used rollback-only Supabase SQL checks documented above. The reusable live verification script is stored at `tests/security_phase_d_live_rollback.sql`.

The requested command `node scripts/scan-secrets.mjs` was also run and failed because this repository does not contain that filename. The project-owned secret scanner is `scripts/secret-scan.mjs`; both the working-tree and Git-history scans passed through the package scripts above.

Dependency auditing found one moderate transitive `uuid` advisory and no high or critical production advisories. The custom security gate passed because it blocks high and critical findings.

## Advisor Results

Supabase security advisors still report project-wide items outside Phase D:

- `public.spatial_ref_sys` has RLS disabled.
- `citext` and `postgis` are installed in the public schema.
- Several intentionally public discovery RPCs are `SECURITY DEFINER` and callable by `anon`.
- Several authenticated owner-action RPCs, including Phase D RPCs, are flagged as callable `SECURITY DEFINER` functions.
- Leaked password protection is disabled.
- `public.marketplace_search_areas` has RLS enabled with no policies.

The Phase D authenticated RPC warnings are expected because these functions are the approved write path after direct table writes were removed. They remain documented rather than suppressed.

Supabase performance advisors still report broader project items:

- Missing indexes on several non-Phase-D foreign keys.
- `auth.uid()` init-plan optimizations in older policies and new Phase D policies.
- Multiple permissive policies on rescue-related tables.

These are not Phase D release blockers but should be addressed in Phase E/F hardening.

## Remaining Work

Phase D is complete for messaging/blocking/storage hardening.

Deferred:

- Edge Function or worker to process `storage_cleanup_jobs`.
- Broader advisor remediation.
- Transaction/review/report/notification trust model work in Phase E.
- Full browser/app end-to-end testing after Phase E.
