# ReTail Stripe Environments

ReTail uses separate payment environments so founder/beta testing cannot touch real money.

## Production / Live

- EAS environment: `production`
- Mobile app environment: `EXPO_PUBLIC_APP_ENV=production`
- Supabase target: production ReTail Supabase project, `https://ycwgsdigvpmprqreoqiz.supabase.co`
- Stripe mode: live
- Mobile Stripe key: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` must start with `pk_live_`
- Server-only Stripe key: `STRIPE_SECRET_KEY` must use the live secret-key prefix
- Webhook mode: live
- Webhook secret: `STRIPE_WEBHOOK_SECRET` must belong to the live webhook endpoint
- Production EAS values and production Supabase secrets must not be overwritten during beta testing.

## Preview / Test

- EAS environment: `preview`
- Mobile app environment: `EXPO_PUBLIC_APP_ENV=beta`
- Supabase target: a separate Stripe-test Supabase branch or separate Supabase project
- Stripe mode: test
- Mobile Stripe key: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` must start with `pk_test_`
- Server-only Stripe key: `STRIPE_SECRET_KEY` must use the test secret-key prefix
- Webhook mode: test
- Webhook secret: `STRIPE_WEBHOOK_SECRET` must belong to the test webhook endpoint for the test Supabase backend
- Test accounts must be synthetic Buyer A, Buyer B, and Seller A accounts.
- Test listings should be clearly labeled, such as `TEST - Stripe Checkout Item`.

The preview app must not point to the production Supabase backend when Stripe checkout is being tested. A preview app with `pk_test_` connected to a live Supabase backend can still trigger live backend logic, so it is not safe for marketplace E2E validation.

## Server-Only Secrets

These values belong only in Supabase Edge Function secrets for the matching backend environment:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CHECKOUT_WEBHOOK_EXPECTED_LIVEMODE`
- `STRIPE_CONNECT_WEBHOOK_EXPECTED_LIVEMODE`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`, only if the test flow intentionally sends email
- Any webhook or notification signing secret

Never place server secrets in Expo public variables. Expo public variables are bundled into the mobile app.

## Client-Side Values

These values may be used by the mobile preview app:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED`
- `EXPO_PUBLIC_ENABLE_STRIPE_CHECKOUT`

The publishable Stripe key still needs the right mode:

- preview/test uses `pk_test_`
- production/live uses `pk_live_`

## Webhooks

The test Stripe webhook must target the test deployment of the ReTail `stripe-webhook` Edge Function. Use only the event types supported by the current webhook implementation:

- `account.updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`

Do not subscribe the test webhook to broad unrelated event sets.

Before deploying `stripe-webhook`, configure the expected Stripe event mode server-side.

- Checkout/payment/refund/dispute events read `STRIPE_CHECKOUT_WEBHOOK_EXPECTED_LIVEMODE`.
- Stripe Connect account events read `STRIPE_CONNECT_WEBHOOK_EXPECTED_LIVEMODE`.
- Values may be `test`/`false` or `live`/`true`.
- `STRIPE_WEBHOOK_EXPECTED_LIVEMODE` may be used only as a same-mode fallback when every supported event family is expected from the same Stripe environment.

If checkout events and Connect events intentionally use different Stripe environments, configure each family explicitly and verify the configured `STRIPE_WEBHOOK_SECRET` belongs to the endpoint mode that is expected to call this function. Do not rely on mobile publishable-key mode as the security authority.

## Connect Redirect URLs

Stripe Connect test-mode redirect URLs should point only to ReTail-owned app links or ReTail-owned web URLs. Use the test backend secrets:

- `STRIPE_CONNECT_RETURN_URL`
- `STRIPE_CONNECT_REFRESH_URL`

Do not use arbitrary third-party redirect domains.

## Safe Verification

Run the local verifier before a Stripe E2E preview build:

```bash
pnpm verify:stripe-test-environment
```

For the preview Stripe test environment to pass, the command must report:

- Stripe publishable mode: `test`
- Supabase target: `test`
- Stripe backend mode: `test`
- Stripe webhook mode: `test`

The verifier does not print secret values. Set these local verification variables only after checking the secure test backend configuration:

```bash
RETAIL_STRIPE_BACKEND_MODE=test
RETAIL_STRIPE_WEBHOOK_MODE=test
```

If the verifier cannot prove backend or webhook mode, do not run Task 4 E2E payment validation.

## What Must Never Be Copied Between Environments

- Do not copy live Stripe secret keys into the test Supabase backend.
- Do not copy test Stripe secret keys into the production Supabase backend.
- Do not copy live webhook secrets into the test backend.
- Do not copy test webhook secrets into production.
- Do not reuse live connected account IDs in test seller profiles.
- Do not create test listings in the production marketplace.
- Do not copy real customer data into the test backend for payment testing.

## Required Test Backend Schema

The Stripe test Supabase backend must include the current payment hardening migrations:

- Stripe schema readiness
- Stripe webhook idempotency
- Checkout reservation and double-purchase protection
- Refund and dispute tracking

It must also include the normal ReTail auth, profile, listing, transaction, notification, and storage schema needed to run the synthetic buyer/seller flow.
