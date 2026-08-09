# Stripe End-to-End Test-Mode Marketplace Validation

Date: 2026-08-08

Branch: `test/stripe-e2e-validation`

Golden Expo layout: `94d61284`

## Summary

Result: `BLOCKED`

The end-to-end Stripe marketplace validation was stopped before creating test actors, onboarding a seller, creating PaymentIntents, charging a card, issuing refunds, or replaying webhooks.

Reason: the task requires verifying that the currently configured Stripe backend is in `TEST MODE` before any payment flow is run. The available tools did not expose the Supabase Edge Function `STRIPE_SECRET_KEY` value or a safe derived mode flag. Local app configuration also does not contain a Stripe publishable key to verify.

No payment code was changed.

No mobile UI was changed.

No Stripe charges, refunds, disputes, accounts, or PaymentIntents were created.

## Evidence Checked

| Check | Result | Evidence | Launch impact |
| --- | --- | --- | --- |
| Current Git branch | PASS | Started from `fix/stripe-refunds-disputes` at `b3acd54d38ef4d1e048f00678afb7d0ba2b41bfe`; created `test/stripe-e2e-validation`. | None |
| Local Stripe publishable key | BLOCKED | `.env.local` and repository config do not expose `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`; `.env.example` has only placeholders. | Cannot verify publishable mode locally |
| Supabase Stripe secret key | BLOCKED | Supabase Edge Functions correctly read `STRIPE_SECRET_KEY` from Supabase secrets, but secret values are not readable through the available tools. | Cannot prove backend secret is test-mode |
| Stripe connector account | PARTIAL | Connector authenticated to ReTail account `acct_1TretWDd0Sac4xsX`; account identity alone does not prove whether Supabase backend uses `sk_test` or `sk_live`. | Insufficient to run payments |
| Existing PaymentIntents | BLOCKED | Stripe connector returned no PaymentIntents to inspect for a `livemode` flag. | No mode proof |
| Existing webhook endpoints | BLOCKED | Stripe connector returned no webhook endpoints to inspect. | No mode proof |

## Result Table

| Test | Result | Evidence | Launch impact |
| --- | --- | --- | --- |
| Stripe mode verification | BLOCKED | Could not prove Supabase backend secret mode or mobile publishable mode without secret access. | BLOCKER before any E2E payment validation |
| Seller onboarding | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Account status | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Fee calculation | NOT RUN | Deployed code still defaults to 10%, $0 minimum, $5 threshold, but no live test checkout was run. | Needs E2E confirmation |
| Payment success | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Transaction completion | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Listing sold | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Reservation | NOT RUN | Task 3C live checks previously passed, but no live checkout reservation was created in Task 4. | Needs E2E confirmation |
| Buyer B blocked | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Webhook replay | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Full refund | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Refund replay | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Partial refund | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Payment failure | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Cancellation | NOT RUN | Stopped at mode gate. | Required before paid launch if supported by current flow |
| Expiry | NOT RUN | Stopped at mode gate. | Required before paid launch |
| Self purchase | NOT RUN | Static/server logic blocks this, but Task 4 live validation did not run. | Needs E2E confirmation |
| Free listing | NOT RUN | Static/server logic blocks this, but Task 4 live validation did not run. | Needs E2E confirmation |
| Rescue Donation | NOT RUN | Static/server logic blocks this, but Task 4 live validation did not run. | Needs E2E confirmation |
| Tampered price | NOT RUN | Static/server logic blocks this, but Task 4 live validation did not run. | Needs E2E confirmation |
| Tampered seller | NOT RUN | Request format does not accept seller/destination fields, but Task 4 live validation did not run. | Needs E2E confirmation |

## Blocker

### BLOCKER: Stripe Test Mode Cannot Be Proven From Available Configuration

Task 4 requires both backend and publishable Stripe configuration to be verified as test-mode before running checkout.

Current available evidence is insufficient:

- Supabase secret values are hidden, as they should be.
- Local repository config does not contain the active Stripe publishable key.
- The Stripe connector account identity does not prove which key Supabase Edge Functions are using.
- No existing Stripe test objects were available to inspect through the connector.

## Safe Next Step

Before resuming Task 4, Rachel or Codex needs one safe way to verify mode without exposing secret values:

1. In Supabase Dashboard, confirm `STRIPE_SECRET_KEY` begins with `sk_test_`, not `sk_live_`.
2. In EAS/Expo environment, confirm `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` begins with `pk_test_`, not `pk_live_`.
3. Confirm Stripe webhook endpoint used for Supabase points to the deployed `stripe-webhook` function in test mode.

Do not paste full secret keys into chat. Only confirm:

- backend secret: `sk_test`
- app publishable key: `pk_test`
- webhook secret configured for test-mode endpoint

After that, rerun Task 4 from the top and perform the live test-mode checkout/refund/dispute checklist.
