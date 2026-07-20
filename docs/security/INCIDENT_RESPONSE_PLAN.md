# Incident Response Plan

Date: 2026-07-20
Project: ReTail

## Incident Types

Examples:

- suspected credential leak
- scam or fraud report surge
- abusive messaging campaign
- storage object exposure
- unauthorized admin action
- database policy regression
- app crash affecting auth or payments
- legal or safety complaint involving prohibited listings

## First Response

1. Preserve evidence.
2. Stop the active harm.
3. Identify affected users and data.
4. Rotate credentials if a secret may be exposed.
5. Document the timeline.
6. Communicate clearly with affected users when required.

## Ownership

| Role | Status | Notes |
| --- | --- | --- |
| Incident owner | manual verification required | Rachel must assign before inviting private beta testers |
| Supabase access owner | manual verification required | Must be able to review Auth, Database, Storage, Logs, and API keys |
| GitHub access owner | manual verification required | Must be able to revoke tokens, review Actions, and ship emergency fixes |
| Tester communication owner | manual verification required | Must control the selected feedback/support channel |

Do not commit private phone numbers, private email credentials, or personal emergency contact details to the repository.

## Evidence To Preserve

- report records
- moderation events
- audit logs
- transaction records
- message metadata
- listing IDs
- notification records
- relevant Git commits and deployment IDs

Do not export raw message bodies, device tokens, auth tokens, or private addresses unless required for a specific investigation.

## Deleted Accounts

Secure account deletion removes the Supabase Auth identity and anonymizes the public profile, but safety records remain available for moderation.

Database preparation for deletion is server-only through `public.prepare_account_deletion_for_user(target_user_id uuid)`, with execution granted only to `service_role`. App clients cannot call the preparation RPC directly.

After deletion, investigators should expect:

- `profiles.display_name` to be `Deleted User`
- direct sign-in and refresh-token use to fail
- active listings from the deleted user to be archived
- conversations, messages, reports, transactions, reviews, report moderation events, and audit logs to remain available according to admin policies
- account-owned avatar and listing Storage objects to be removed
- message-image Storage objects to remain private with conversation history
- the deleted user's device session to be removed locally by the app after server confirmation

Do not attempt to restore or reactivate a deleted Auth user during an incident without a documented owner approval and backup-restore plan.

## Emergency Actions

Available actions:

- ban account
- remove listing
- mark report reviewing/resolved
- disable risky feature temporarily
- rotate Supabase keys
- revoke OAuth credentials
- remove exposed storage object
- ship app hotfix

## Escalation

Escalate immediately if:

- service-role keys are exposed
- database passwords are exposed
- minors, live animals, controlled substances, or illegal activity are involved
- payment fraud is suspected
- user location or private contact information may have leaked

## Post-Incident Review

After resolution:

- write a brief incident summary
- identify root cause
- add or update tests
- update RLS/policies/migrations if needed
- rotate credentials if there was any uncertainty
- update support and community guidance if needed
