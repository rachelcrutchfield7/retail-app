# First Device Smoke Test

Date: 2026-07-22
Build profile: `preview`
Platform: Android

Tester:
Device:
Android version:
Build ID:
Build version:
Test date:

Use disposable accounts only. Do not use real payment information, private home addresses, or private rescue verification documents during this smoke test.

## Smoke Test Attempts

| Build ID | Source commit | Result |
| --- | --- | --- |
| `a6fcb7b1-3b57-432a-b348-64e5541923dc` | `05430288d93a80d6dc6b33244ec3f3cb58e350e0` | Installed successfully, failed initial startup with the global error boundary. |
| `7a9364af-eadb-4580-ba66-2df791e3ce92` | `73574ad9e3c87a73f57cafa4d4af1b9e8daec902` | Installed and opened successfully, but startup was blocked because the compiled Supabase public configuration was missing. |
| `1bacbcf6-bfb9-4a36-9e69-39e3b7e7b59b` | `99998e9d8b3e55c289ad96894d0ed7f00335fb74` | Installed and opened, but still displayed the missing Supabase configuration warning because the Expo client bundle used indirect `process.env` access and did not inline the public variables. |
| `5622183a-fff9-4c01-888b-abff277088c5` | `9d5b9eba4cf62c8653cb53b623bca4eb4872cc9a` | Expo inlining-corrected Android preview APK build finished successfully; physical-device smoke test pending. |

The first-device smoke test remains incomplete until APK `5622183a-fff9-4c01-888b-abff277088c5` opens successfully on Rachel's Android device without the Supabase startup warning.

For every check, record:

```text
Status: Pass / Fail / Not tested
Notes:
Screenshot or recording:
```

## Installation And Startup

### Install from the EAS internal-distribution page

Status: Fail on first build; second and third builds opened but configuration warning appeared; Expo inlining-corrected build retest pending.
Notes: First APK installed successfully, but launch failed immediately with the global error boundary. Second APK installed and opened, but showed "Startup needs attention" because the compiled Supabase public configuration was missing. Third APK still showed the warning because Expo did not inline indirectly accessed public variables. APK `5622183a-fff9-4c01-888b-abff277088c5` is available for retest.
Screenshot or recording:

### Launch the app

Status: Fail on first build; second and third builds blocked at startup configuration warning; Expo inlining-corrected build retest pending.
Notes: First APK displayed "Something went wrong" and "ReTail ran into a problem. Your account and listings are still safe." Second APK opened and showed "Startup needs attention" with missing Supabase configuration. Third APK still showed the warning because Expo did not inline indirectly accessed public variables. APK `5622183a-fff9-4c01-888b-abff277088c5` is available for retest.
Screenshot or recording:

### Verify the `Private Beta` indicator

Status:
Notes:
Screenshot or recording:

### Verify no development warning appears

Status:
Notes:
Screenshot or recording:

### Verify no placeholder backend warning appears

Status:
Notes:
Screenshot or recording:

### Close and reopen the app

Status:
Notes:
Screenshot or recording:

## Authentication

### Create a disposable account

Status:
Notes:
Screenshot or recording:

### Complete email confirmation when enabled

Status:
Notes:
Screenshot or recording:

### Sign in

Status:
Notes:
Screenshot or recording:

### Sign out

Status:
Notes:
Screenshot or recording:

### Sign back in

Status:
Notes:
Screenshot or recording:

### Reset the password

Status:
Notes:
Screenshot or recording:

### Verify invalid credentials fail safely

Status:
Notes:
Screenshot or recording:

## Profile

### Create or complete a profile

Status:
Notes:
Screenshot or recording:

### Update display name

Status:
Notes:
Screenshot or recording:

### Update city and state

Status:
Notes:
Screenshot or recording:

### Upload an avatar

Status:
Notes:
Screenshot or recording:

### Verify another account sees only intended public information

Status:
Notes:
Screenshot or recording:

## Marketplace

### Create a listing

Status:
Notes:
Screenshot or recording:

### Upload a listing image

Status:
Notes:
Screenshot or recording:

### Edit the listing

Status:
Notes:
Screenshot or recording:

### Search for the listing

Status:
Notes:
Screenshot or recording:

### Filter listings

Status:
Notes:
Screenshot or recording:

### Favorite and unfavorite the listing

Status:
Notes:
Screenshot or recording:

### Archive or delete the listing as supported

Status:
Notes:
Screenshot or recording:

### Verify another account cannot edit the listing

Status:
Notes:
Screenshot or recording:

## Location

### Select or update marketplace search area

Status:
Notes:
Screenshot or recording:

### Verify nearby listings load

Status:
Notes:
Screenshot or recording:

### Verify distance values appear reasonable

Status:
Notes:
Screenshot or recording:

### Verify no location query error appears

Status:
Notes:
Screenshot or recording:

## Messaging

### Start a conversation from a second disposable account

Status:
Notes:
Screenshot or recording:

### Send a text message

Status:
Notes:
Screenshot or recording:

### Send an image message

Status:
Notes:
Screenshot or recording:

### Mark messages read

Status:
Notes:
Screenshot or recording:

### Verify account isolation

Status:
Notes:
Screenshot or recording:

### Block and unblock the other user

Status:
Notes:
Screenshot or recording:

## Notifications

### Verify in-app notification creation

Status:
Notes:
Screenshot or recording:

### Mark one notification read

Status:
Notes:
Screenshot or recording:

### Mark all notifications read

Status:
Notes:
Screenshot or recording:

### Update notification preferences

Status:
Notes:
Screenshot or recording:

### Verify notification data does not appear in the wrong account

Status:
Notes:
Screenshot or recording:

## Trust And Safety

### Report a listing

Status:
Notes:
Screenshot or recording:

### Report a message

Status:
Notes:
Screenshot or recording:

### Verify duplicate-report prevention

Status:
Notes:
Screenshot or recording:

### Verify blocked-user behavior

Status:
Notes:
Screenshot or recording:

### Verify live-animal listings remain prohibited

Status:
Notes:
Screenshot or recording:

## Account Deletion

Use only a disposable test account.

### Initiate account deletion

Status:
Notes:
Screenshot or recording:

### Complete confirmation

Status:
Notes:
Screenshot or recording:

### Verify the app returns to signed-out state

Status:
Notes:
Screenshot or recording:

### Verify the deleted account cannot sign in

Status:
Notes:
Screenshot or recording:

### Verify its refresh token cannot restore a session

Status:
Notes:
Screenshot or recording:

### Verify the second account remains unchanged

Status:
Notes:
Screenshot or recording:

### Verify avatar and listing images are removed as expected

Status:
Notes:
Screenshot or recording:

### Verify retained message history shows anonymized account information

Status:
Notes:
Screenshot or recording:

## Stability

### Background and reopen the app

Status:
Notes:
Screenshot or recording:

### Change network connectivity

Status:
Notes:
Screenshot or recording:

### Retry a failed request

Status:
Notes:
Screenshot or recording:

### Verify loading and error states are understandable

Status:
Notes:
Screenshot or recording:

### Verify no developer stack trace is shown to the user

Status:
Notes:
Screenshot or recording:
