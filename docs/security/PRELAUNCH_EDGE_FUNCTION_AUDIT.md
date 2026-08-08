# ReTail Pre-Launch Edge Function and Stripe Backend Security Audit

Date: 2026-08-08

Audit branch: `audit/prelaunch-edge-stripe-security`

Starting branch: `audit/prelaunch-security-authorization`

Starting commit: `abfc8755bce37fadf52f4ed570b21c5b3c52eedc`

Golden Expo layout reference: `94d61284`

Golden Git reference: `golden-layout-94d61284`

## Scope

This audit reviewed live Supabase Edge Function metadata, retrieved deployed Edge Function source, local payment callers, local secrets exposure, and live database schema compatibility for the Stripe and notification backend boundary.

No production behavior was changed.

No Edge Functions were deployed.

No Stripe live payment actions were performed.

No mobile UI was changed.

## Evidence Sources

- Live Supabase Edge Function metadata for project `ycwgsdigvpmprqreoqiz`
- Deployed Edge Function source retrieved through the Supabase connector
- Local app callers in `src/services/paymentService.ts` and `src/services/stripeConnectService.ts`
- Local runtime config in `src/constants/config.ts`
- Live catalog checks for `profiles`, `transactions`, `notifications`, and `notification_email_deliveries`
- Working-tree secret scan and static repository secret-pattern search
- Prior audit: `docs/security/PRELAUNCH_SECURITY_AUDIT_01.md`

## Confirmed Findings

### EF-01: Live Stripe functions are deployed against a database schema missing required Stripe columns

Severity: MEDIUM

Function: `stripe-create-payment-intent`, `stripe-connect-account`, `stripe-account-status`, `stripe-connect-login-link`, `stripe-webhook`

Attack scenario: Protected checkout and Stripe Connect are expected to work, but the live functions reference columns that are absent in the live database. A user attempting seller onboarding or checkout receives failures. This is not a direct privilege escalation, but it can create a false sense that payment infrastructure is live.

Evidence:

- `stripe-connect-*` functions read/write `profiles.stripe_connect_account_id`, `stripe_connect_charges_enabled`, `stripe_connect_payouts_enabled`, `stripe_connect_details_submitted`, and related timestamps.
- Live `public.profiles` has no `stripe_*` columns.
- `stripe-create-payment-intent` writes `transactions.payment_method`, `payment_status`, `amount_cents`, `platform_fee_cents`, `seller_amount_cents`, `currency`, `stripe_payment_intent_id`, and `stripe_transfer_destination`.
- Live `public.transactions` has no payment/Stripe columns.
- Local repository migrations do not currently contain these Stripe schema additions.

Existing protection: The deployed functions require JWT for user-facing Stripe calls and derive buyer/seller/fee server-side. Because schema reads fail early, client tampering does not become an underpriced charge path.

Exploitability: Low as a direct security exploit; high as a payment-readiness and launch-integrity issue.

Recommended fix: Add an isolated Stripe schema migration that creates the exact server-owned Stripe profile and transaction fields, indexes, and constraints needed by the deployed functions. Then run a dedicated test-mode checkout and onboarding verification. Do not change fees during that migration.

Regression risk: Medium. Stripe state touches profiles, transaction history, webhook processing, and seller payout readiness.

Beta blocker: No, if protected checkout remains clearly gated and not part of small-group beta acceptance.

Public-launch blocker: Yes.

### EF-02: Stripe webhook success handling is not idempotent

Severity: MEDIUM

Function: `stripe-webhook`

Attack scenario: Stripe retries the same valid `payment_intent.succeeded` event. The function updates timestamps again and inserts buyer/seller notifications again.

Evidence:

- No processed Stripe event table is present.
- `stripe-webhook` does not persist or check `event.id`.
- On every `payment_intent.succeeded`, it updates the transaction/listing and inserts two notification rows.
- `notifications` has a dedupe-key unique index, but webhook-inserted notifications do not set `dedupe_key`.

Existing protection: Transaction update is keyed by `stripe_payment_intent_id`. Listing status update is idempotent in effect. Duplicate notifications are noisy but not a duplicate payout.

Exploitability: Low to medium. A valid Stripe signature is still required, so arbitrary internet replay is not possible without a genuine Stripe event/signature. Stripe retries can happen normally.

Recommended fix: Add a `stripe_webhook_events` or equivalent idempotency table keyed by Stripe event ID, record before side effects inside a transaction/RPC, and give webhook notifications deterministic dedupe keys.

Regression risk: Medium. Webhook idempotency must not drop legitimate first-time events.

Beta blocker: No, if Stripe payments are not part of beta.

Public-launch blocker: Yes.

### EF-03: Double-purchase race can create multiple PaymentIntents for the same active one-off listing

Severity: HIGH

Function: `stripe-create-payment-intent`, `stripe-webhook`

Attack scenario: Buyer A and Buyer B start checkout for the same active sale listing before either payment succeeds. Both receive valid PaymentIntents. If both pay, Stripe can collect both payments before the listing is marked sold by webhook.

Evidence:

- PaymentIntent creation only checks `listing.status === 'active'` at request time.
- Listing status is changed to `sold` only after `payment_intent.succeeded` webhook.
- The database has `transactions_one_completed_per_listing`, but that only prevents two completed transaction rows; it does not prevent a second Stripe payment from succeeding.
- The webhook does not check/update errors, so a uniqueness failure on the second transaction completion path may not trigger an automatic refund or buyer-facing remediation.

Existing protection: A unique completed transaction per listing exists, and the listing is eventually marked sold.

Exploitability: Medium. It requires concurrent checkout timing, but it is a real marketplace integrity risk.

Recommended fix: Introduce a server-side listing reservation/checkout lock before creating the PaymentIntent, or create the transaction in a state that atomically prevents another buyer from opening checkout for the same one-off listing. Add expiry/cancellation handling and test the two-buyer race.

Regression risk: High. Checkout locking affects marketplace purchase flow and abandoned checkouts.

Beta blocker: No, if Stripe payments are not beta scope.

Public-launch blocker: Yes.

### EF-04: Stripe webhook event allowlist is broad

Severity: LOW

Function: `stripe-webhook`

Attack scenario: A future or unexpected `payment_intent.*` event updates `payment_status` on a transaction even if ReTail did not explicitly decide how to handle it.

Evidence:

- The function uses `if (event.type.startsWith('payment_intent.'))`.
- Only `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled` have explicit status/outcome branches.
- Other `payment_intent.*` events still write `payment_status` and `updated_at`.

Existing protection: Signature verification is required, and the update is scoped to known `stripe_payment_intent_id`.

Exploitability: Low.

Recommended fix: Replace prefix matching with an explicit allowlist and no-op unrecognized event types.

Regression risk: Low.

Beta blocker: No.

Public-launch blocker: Should fix before public launch.

### EF-05: Stripe webhook does not implement disputes or refunds

Severity: LOW

Function: `stripe-webhook`

Attack scenario: A charge dispute/refund occurs and ReTail does not record it in app state, creating operational confusion and manual support risk.

Evidence: The function handles `account.updated` and `payment_intent.*`; it does not handle `charge.dispute.created`, `charge.dispute.closed`, `charge.refunded`, or refund events.

Existing protection: Stripe itself remains the source of truth in the Stripe dashboard.

Exploitability: Low as a security exploit; high as a process gap once real payments launch.

Recommended fix: Define an operational policy and add event handling or admin workflows for disputes/refunds before public launch.

Regression risk: Medium.

Beta blocker: No.

Public-launch blocker: Yes for public paid marketplace launch.

### EF-06: Notification email content may include sensitive notification body text

Severity: LOW

Function: `send-notification`

Attack scenario: Email notifications can surface `notifications.body` outside the app. If upstream notification bodies contain private message previews or sensitive transaction details, that content may appear in email inbox previews.

Evidence: `send-notification` builds email HTML/text directly from `notification.title` and `notification.body` after HTML escaping.

Existing protection: HTML is escaped. Email delivery is gated by notification preferences and one-delivery-per-notification reservation.

Exploitability: Low. This is a privacy/content policy issue more than an auth bypass.

Recommended fix: Decide which notification types may include detailed body text in email. Prefer generic copy for private messages, payment, safety, or moderation notifications.

Regression risk: Low.

Beta blocker: No.

Public-launch blocker: Should fix before broad email notification launch.

## Needs Manual Verification

### MV-01: Stripe Connect redirect URLs are environment-controlled

Severity: NEEDS MANUAL VERIFICATION

Function: `stripe-connect-account`

Evidence: The function uses `STRIPE_CONNECT_REFRESH_URL` and `STRIPE_CONNECT_RETURN_URL` if set, otherwise `retail://` deep links.

Recommended verification: Confirm Supabase secrets for these URLs are ReTail-owned domains/schemes only. This audit did not print or mutate secret values.

## Intentional / Accepted

### I-01: `stripe-webhook` has JWT disabled

JWT is disabled, which is correct for Stripe webhooks when signature verification is enforced. The retrieved source requires `Stripe-Signature`, requires `STRIPE_WEBHOOK_SECRET`, reads the raw body, and calls `constructEventAsync` before database writes.

### I-02: `send-notification` has JWT disabled

JWT is disabled, but the function requires either `x-retail-notification-secret` matching `RETAIL_NOTIFICATION_WEBHOOK_SECRET` or a valid authenticated Supabase request related to the notification. This is acceptable if the secret is high entropy and stored only as a Supabase secret.

### I-03: Broad CORS is not an auth bypass

The shared CORS helper allows `*`. For native app calls this is not a primary security boundary. Sensitive functions still rely on JWT, Stripe signature, or notification secret authorization.

## Function-by-Function Summary

| Function | Authorization | Service role use | Input validation | Sensitive logging | Result |
| --- | --- | --- | --- | --- | --- |
| `delete-account` | JWT + `auth.getUser()` | constrained to caller id | method and bearer token checked | no secret/body logging found | pass |
| `send-notification` | shared secret or authenticated related user | loads notification/recipient/preferences | notification ID required | no secret/body logging found | pass with privacy caveat |
| `stripe-create-payment-intent` | JWT + `auth.getUser()` | derives listing/seller from DB | listing ID and positive integer amount checked | no secret logging found | needs remediation |
| `stripe-connect-account` | JWT + `auth.getUser()` | reads/updates caller profile | no body accepted | no secret logging found | needs remediation due schema drift |
| `stripe-account-status` | JWT + `auth.getUser()` | reads/updates caller profile | no body accepted | no secret logging found | needs remediation due schema drift |
| `stripe-connect-login-link` | JWT + `auth.getUser()` | reads caller profile | no body accepted | no secret logging found | needs remediation due schema drift |
| `stripe-webhook` | Stripe signature | updates payment/profile rows after signature verification | signature required; broad event prefix | no secret logging found | needs remediation |

## Current Fee Boundary

Current deployed server defaults:

- `RETAIL_PLATFORM_FEE_PERCENT`: `10`
- `RETAIL_PLATFORM_MIN_FEE_CENTS`: `0`
- `RETAIL_PLATFORM_FEE_THRESHOLD_CENTS`: `500`

The client cannot override these in the deployed payment function. The mobile app has matching local defaults for display/planning, but the server recalculates the actual Stripe application fee.

## Secret Boundary

No Stripe secret key, Stripe webhook secret, Supabase service-role key, or other real secret was found in client source during this audit.

Server-side Edge Function source references:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEYS`
- `RESEND_API_KEY`
- `RETAIL_NOTIFICATION_WEBHOOK_SECRET`

These are expected server-side Supabase secrets and must not be exposed in Expo public variables.

## Recommended Next Fix Task

Fix Stripe backend readiness in this order:

1. Add the missing Stripe profile/transaction schema fields and constraints in a focused migration.
2. Add webhook idempotency and deterministic notification dedupe keys.
3. Add checkout reservation/locking to prevent double-purchase races.
4. Add explicit webhook event allowlist and dispute/refund process handling.

Do not change mobile layout or marketplace fee percentages during these fixes.
