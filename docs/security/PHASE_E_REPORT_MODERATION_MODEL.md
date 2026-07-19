# Phase E Report and Moderation Model

Date: 2026-07-19

## Report Submission

Reports are created only through `submit_report(report_target_type, report_target_id, report_reason_value, report_details default null)`.

The caller may not submit reporter identity, status, assigned admin, admin notes, resolved timestamp, or evidence.

## Target Rules

| Target | Validation |
| --- | --- |
| Listing | Listing must exist, be reportable, and not belong to the reporter |
| User | Reported user must exist and cannot be the reporter |
| Message | Reporter must be a participant in the message conversation and cannot report their own message |

Message evidence is server-generated and stored on the private report record. Ordinary users do not receive message evidence, admin notes, or assigned admin identity.

## Duplicate Policy

One open or reviewing report is allowed per reporter and target. Resolved or dismissed reports do not block a future report for new conduct.

Partial unique indexes enforce this separately for listing, user, and message targets.

## Reporter-Safe Reads

Reporters use `get_my_reports()`, which returns safe fields only:

- `id`
- `report_type`
- target identifier
- `reason`
- `details`
- `status`
- `created_at`
- `updated_at`
- `resolved_at`

It excludes `evidence`, `admin_notes`, `assigned_admin_id`, and internal moderation metadata.

## Admin Moderation

Admins update reports only through `admin_update_report(target_report_id, requested_status, requested_admin_notes default null)`.

Allowed transitions:

- `open -> reviewing`
- `open -> resolved`
- `open -> dismissed`
- `reviewing -> resolved`
- `reviewing -> dismissed`

`resolved` and `dismissed` are terminal in Phase E.

## Audit Trail

`report_moderation_events` records immutable moderation events with report ID, admin ID, previous status, new status, note presence, and timestamp. It does not duplicate private admin notes.
