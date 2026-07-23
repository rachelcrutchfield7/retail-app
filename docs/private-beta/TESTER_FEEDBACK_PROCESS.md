# Tester Feedback Process

Date: 2026-07-19

## Purpose

Private beta testers need a safe way to report bugs, safety issues, and confusing workflows without sending secrets or sensitive personal information.

## Feedback Destination

Tester feedback destinations:

- General beta access and ordinary questions: `contact@retailpetapp.com`
- Payment issues, account problems, user issues, reports, and urgent safety concerns: `support@retailpetapp.com`

If a private feedback form is added later, configure the URL through `EXPO_PUBLIC_BETA_FEEDBACK_URL` and keep `support@retailpetapp.com` available for urgent safety reports.

Do not expose the private GitHub repository to testers unless Rachel explicitly chooses that workflow.

## What Testers Should Include

- device type
- iOS or Android version
- app version
- beta environment
- screen name
- what they tried to do
- what happened
- what they expected
- screenshots only when they do not contain private messages, exact addresses, passwords, or payment information

## Urgent Safety Reports

Urgent reports include:

- suspected scam
- harassment
- live animal listing
- inappropriate content
- private message or image exposure
- account access problem
- payment request that appears unsafe

Rachel should review urgent safety reports before ordinary bug feedback.

## What Not To Send

Testers should not send:

- passwords
- full payment card details
- full home addresses
- access tokens
- verification links
- reset-password links
- private messages unrelated to the bug
- private rescue verification documents unless Rachel requests them through an approved channel
