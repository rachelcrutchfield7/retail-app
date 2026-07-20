# Backup And Recovery Plan

Date: 2026-07-20
Project: ReTail

## Goals

ReTail must be recoverable after accidental data loss, failed migrations, or operational mistakes.

## Source Of Truth

- Database schema changes live in `supabase/migrations/`.
- Current full schema reference lives in `supabase/schema.sql`.
- RLS policy reference lives in `supabase/policies.sql`.
- Application source and migration files are backed up in GitHub.

## Supabase Backups

Before beta:

- [ ] Confirm automated Supabase backups are enabled for the production project.
- [ ] Confirm backup retention window.
- [ ] Confirm point-in-time recovery availability for the selected Supabase plan.
- [ ] Run or document a restore drill in a non-production project.

## Private Beta Status

| Item | Status | Evidence Required |
| --- | --- | --- |
| Automated database backups | not verified | Supabase project backup settings |
| Backup retention | not verified | Supabase plan/dashboard value |
| Point-in-time recovery | not verified | Supabase plan/dashboard value |
| Storage recovery expectations | manual verification required | Bucket backup/export plan |
| Restore drill | not verified | Non-production restore test notes |

If backup status cannot be verified before a small controlled private beta, Rachel must explicitly accept the risk and limit beta data to disposable/non-critical records.

## Migration Safety

Rules:

- Apply migrations through the Supabase migration workflow.
- Never edit live production tables manually as the primary change path.
- Do not use `supabase db reset` on a linked production project.
- Use rollback-based live tests for disposable verification data.
- Keep migration filenames aligned with live migration history.

## Recovery Priorities

1. Auth and profiles.
2. Listings and listing images.
3. Conversations and messages.
4. Transactions, reviews, reports, and notifications.
5. Analytics and non-critical operational records.

## Storage Recovery

Storage buckets to verify:

- `avatars`
- `listings`
- `message-images`

Message images are private and should not be made public during recovery.

## Account Deletion Recovery

Secure account deletion intentionally removes the Supabase Auth identity after database preparation succeeds.

Deletion behavior:

- public profile data is anonymized
- active/draft/pending listings are archived
- favorites, saved searches, notifications, device tokens, notification preferences, privacy settings, and owned blocks are removed
- conversations, messages, transactions, reviews, reports, report moderation events, and audit logs are retained for safety and abuse investigation
- account-owned `avatars/` and `listings/` Storage objects are removed by the Edge Function
- private `message-images/` objects are retained with conversation history

Deleted accounts should not be reactivated through normal support. Any recovery would require a deliberate backup restore decision in a non-production project and owner approval.

## Restore Checklist

- [ ] Restore database backup into non-production project.
- [ ] Verify RLS is enabled on exposed schemas.
- [ ] Verify controlled RPCs exist.
- [ ] Verify storage buckets and policies.
- [ ] Run security tests against restored project.
- [ ] Promote recovery only after owner approval.
