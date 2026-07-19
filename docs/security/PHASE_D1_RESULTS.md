# ReTail Security Remediation Phase D.1 Results

Date: 2026-07-19
Status: Applied to Supabase project `ycwgsdigvpmprqreoqiz`; final real Storage upload/send proof is pending explicit approval for temporary live test accounts.

## Scope

Phase D.1 corrects Phase D message attachment validation and locks down user-created system messages.

No Phase E work is included.

## Database Migration

Recorded Supabase migration:

- `20260719011141 phase_d1_attachment_and_system_message_fixes`

Repository migration file:

- `supabase/migrations/20260719011141_phase_d1_attachment_and_system_message_fixes.sql`

## Regular-Expression Defect

The Phase D database stored over-escaped attachment path expressions in live functions and storage policies. Those expressions could fail to match normal paths such as:

```text
<conversation_uuid>/<uploader_uuid>/<file_uuid>.jpg
```

Phase D.1 introduces `private.is_valid_message_attachment_path(...)` as the canonical helper. It uses `[.]` for the literal file-extension separator and rejects external URLs, malformed UUIDs, unsupported extensions, double extensions, uppercase extensions, and extra path segments.

## Attachment Validation

`private.message_attachment_path_is_valid(...)` now verifies:

- bucket is `message-images`
- path matches the expected conversation and sender
- storage object exists
- storage object owner is the sender
- submitted MIME type is allowed
- storage object MIME type matches submitted MIME type
- submitted file size is positive
- storage object size matches submitted file size
- file size is within the bucket limit
- sender is a participant

## System-Message Restrictions

The public authenticated `send_message` RPC now allows only:

- `text`
- `image`

It rejects ordinary user-created `system` messages with:

```text
RETAIL_SYSTEM_MESSAGE_FORBIDDEN
```

The protective message trigger also rejects untrusted direct `system` inserts as defense in depth.

There is no public `send_system_message` RPC. True system rows remain reserved for a future trusted server-only path.

Offer events are user-generated structured text messages. Historical offer rows stored as `system` still render for continuity.

Conversation list previews and message notification previews translate structured offer payloads into friendly user-facing text rather than displaying raw `RETAIL_OFFER::...` data.

## Blocking And Historical Attachments

Final behavior:

- blocking prevents new conversations
- blocking prevents new text messages
- blocking prevents new image uploads
- blocking prevents image replacement/update
- historical text messages remain readable
- historical image attachments remain readable to existing participants
- unrelated users cannot read historical attachments
- uploaders may still delete their own uploaded attachment

## Orphan Upload Cleanup

The app uploads a private image first, then calls `send_message`. If `send_message` fails, the app attempts to remove the newly uploaded private object and then rethrows the original send error.

A future worker may still clean up older unreferenced private objects.

## Verification

Verified live in Supabase:

- Phase D.1 migration is recorded.
- `private.is_valid_message_attachment_path(...)` is deployed with the canonical path matcher.
- `private.message_attachment_path_is_valid(...)` verifies the Storage object owner, MIME type, size, bucket, and participant status.
- `private.can_access_message_attachment(...)` no longer rejects historical image reads solely because participants later blocked each other.
- Message-image read/upload/update/delete storage policies are deployed.
- Public `send_message(...)` rejects `system` with `RETAIL_SYSTEM_MESSAGE_FORBIDDEN`.

Rollback-only live checks passed:

- valid `.jpg`, `.jpeg`, `.png`, and `.webp` attachment paths are accepted
- uppercase extensions are rejected
- wrong conversation segment is rejected
- wrong uploader segment is rejected
- external URLs are rejected
- unsupported extensions are rejected
- forged system messages are rejected

Storage metadata shape check:

- Existing Supabase Storage objects use the metadata keys `mimetype` and `size`, which are the keys validated by the D.1 helper.

Local verification passed:

- `CI=true pnpm install --frozen-lockfile`
- `CI=true pnpm lint`
- `CI=true pnpm exec tsc --noEmit`
- `CI=true pnpm test`
- `CI=true pnpm exec expo-doctor`
- `CI=true pnpm exec expo export --platform web`
- `CI=true pnpm security:secrets`
- `CI=true pnpm security:secrets:history`
- `CI=true pnpm security:audit`
- `node scripts/dependency-audit.mjs`

Static test suite result:

- 155 total tests
- 144 passed
- 11 skipped existing live Supabase tests
- 0 failed

Dependency auditing found one moderate transitive `uuid` advisory through Expo tooling and no high or critical production advisories. The custom gate passed because it blocks high and critical findings.

Pending:

- The real Storage API upload/send/signed-read test in `tests/securityPhaseD1Live.test.mjs` is ready, but it requires either supplied live test credentials or explicit approval to create temporary disposable live test accounts and a temporary listing, then delete them immediately after the test.
- GitHub Actions verification is pending until the final D.1 commit is pushed.

## Advisor Results

Supabase security advisors still report broader project items outside Phase D.1, including:

- `public.spatial_ref_sys` has RLS disabled.
- `citext` and `postgis` are installed in the public schema.
- Several intentionally public discovery RPCs are `SECURITY DEFINER` and callable by `anon`.
- Several authenticated owner-action RPCs, including controlled messaging RPCs, are callable by `authenticated`.
- Leaked password protection is disabled.
- `public.marketplace_search_areas` has RLS enabled with no policies.

Supabase performance advisors still report broader project items outside Phase D.1, including:

- missing indexes on several non-D.1 foreign keys
- RLS init-plan optimizations for existing policies
- multiple permissive policies on rescue-related tables

These advisor items were pre-existing broader-project remediation work and were not introduced by Phase D.1.
