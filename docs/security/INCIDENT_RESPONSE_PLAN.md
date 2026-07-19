# Incident Response Plan

Date: 2026-07-19
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
