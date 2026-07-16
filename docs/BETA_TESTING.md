# ReTail Beta Testing Guide

## Purpose

Closed beta testing validates ReTail with real users before public app-store release.

## Supported Beta Targets

- iOS TestFlight
- Google Play internal testing or EAS internal Android build
- Web stakeholder preview

## Privacy Warning

Use beta test data only. Do not enter sensitive personal information, exact home addresses, private payment details, or production rescue records during beta.

## Installation

### iOS

Use the TestFlight invitation link after the iOS preview build is approved.

### Android

Use the Google Play internal testing link or install the EAS preview APK.

### Web

Use the preview URL shared by the project owner.

## Account Types To Test

- new regular user
- existing regular user
- verified rescue user
- admin user
- blocked-user pair

## Required Test Flows

1. Register and sign in.
2. Create a sale listing.
3. Create a free listing.
4. Create a donation listing.
5. Search and filter listings.
6. Favorite and unfavorite a listing.
7. Message a seller.
8. Block and unblock a user.
9. Mark a listing sold or donated.
10. Leave reviews in both directions.
11. Report a listing, user, and message.
12. Update notification preferences.
13. Delete a disposable test account.

## Feedback

Send feedback privately to the project owner with:

- device and OS version
- account type
- screen or flow
- steps to reproduce
- expected result
- actual result
- screenshot or screen recording when safe

## Known Limitations

- In-app notifications are available; OS push notifications are deferred.
- Stripe production checkout is gated.
- Some manual QA must be completed before any public release.
