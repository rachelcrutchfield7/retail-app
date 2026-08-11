# Known Private Beta Limitations

Date: 2026-07-19

These are known limitations for a small controlled private beta only. They are not approval for public launch.

## Payments

Stripe protected checkout is disabled. The app may explain future protected checkout, but it must not charge cards or create real payment obligations.

## Shipping

EasyPost shipping rates, labels, and tracking are pending external account verification before live postage is enabled. Shipping insurance and automated return-label workflows are not launch-ready. Buyers and sellers should use transaction support for missing packages, shipping exceptions, damaged items, cancellations, refunds, and return questions.

## Push Delivery

In-app notifications exist. OS-level push delivery depends on final EAS credentials, device-token registration, and notification-provider verification.

## Geography

Location and distance features use approximate marketplace search areas and city/state display. Beta testing should use limited geographic areas and disposable data.

## Moderation Staffing

Admin moderation tooling exists, but response time depends on Rachel or assigned moderators manually reviewing reports.

## Analytics And Crash Reporting

Repository wrappers redact sensitive fields. Production vendor keys and dashboard privacy settings require manual verification before broader testing.

## App Store Availability

The app is not approved for public App Store or Google Play release. Private beta uses internal preview distribution only.

## Data Restoration

Backup and restore capability must be verified in Supabase before expanding beyond a small controlled beta.
