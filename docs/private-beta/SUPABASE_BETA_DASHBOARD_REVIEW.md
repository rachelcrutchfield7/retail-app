# Supabase Beta Dashboard Review

Date: 2026-07-20
Project: `ycwgsdigvpmprqreoqiz`

Do not mark an item verified unless it is confirmed directly in the Supabase dashboard or by a live administrative check. Allowed statuses: `Verified`, `Needs change`, `Accepted beta risk`, `Not applicable`.

## Authentication

| Check | Status | Notes |
| --- | --- | --- |
| Site URL points to the approved beta app URL. |  |  |
| Allowed redirect URLs include only approved beta/local development URLs. |  |  |
| Email confirmation is enabled or accepted as beta risk. |  |  |
| Password minimum and strength settings are appropriate. |  |  |
| Secure password-change and reset-password flows are configured. |  |  |
| Anonymous sign-in is disabled. |  |  |
| Email rate limits are reviewed. |  |  |
| Reset-password redirect is approved. |  |  |
| Leaked-password protection is reviewed. |  |  |
| CAPTCHA decision is documented. |  |  |

## Storage

### `avatars`

| Check | Status | Notes |
| --- | --- | --- |
| Public/private setting matches design. |  |  |
| File-size limit is reviewed. |  |  |
| Allowed MIME types are reviewed. |  |  |
| Ownership policies are active. |  |  |
| Read policies are active. |  |  |
| Update policies are active. |  |  |
| Delete policies are active. |  |  |

### `listings`

| Check | Status | Notes |
| --- | --- | --- |
| Public/private setting matches design. |  |  |
| File-size limit is reviewed. |  |  |
| Allowed MIME types are reviewed. |  |  |
| Ownership policies are active. |  |  |
| Read policies are active. |  |  |
| Update policies are active. |  |  |
| Delete policies are active. |  |  |

### `message-images`

| Check | Status | Notes |
| --- | --- | --- |
| Private bucket setting is confirmed. |  |  |
| File-size limit is reviewed. |  |  |
| Allowed MIME types are reviewed. |  |  |
| Participant ownership policies are active. |  |  |
| Participant read policies are active. |  |  |
| Sender update policies are active, if applicable. |  |  |
| Sender delete policies are active, if applicable. |  |  |

## Realtime

| Check | Status | Notes |
| --- | --- | --- |
| Publication tables are reviewed. |  |  |
| Private message isolation is verified. |  |  |
| Notification isolation is verified. |  |  |
| Sign-out subscription cleanup is verified on device. |  |  |

## Backups

| Check | Status | Notes |
| --- | --- | --- |
| Current Supabase plan is recorded. |  |  |
| Backup availability is confirmed. |  |  |
| Backup retention is recorded. |  |  |
| Point-in-time recovery availability is recorded. |  |  |
| Storage backup limitations are reviewed. |  |  |
| Accepted private-beta risk is documented, if applicable. |  |  |
