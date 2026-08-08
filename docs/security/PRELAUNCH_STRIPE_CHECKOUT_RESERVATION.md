# ReTail Stripe Checkout Reservation Hardening

Date: 2026-08-08

Branch: `fix/stripe-checkout-reservation`

Golden layout reference: `94d61284`

## Purpose

This hardening closes the double-purchase race identified in `STRIPE_SECURITY_MATRIX.md`.

Before this change, two buyers could start protected checkout for the same active one-off sale listing before either Stripe webhook marked the listing sold. The database only prevented two completed ReTail transaction rows; it did not prevent two Stripe PaymentIntents from being issued.

## Reservation Model

Protected checkout now records a short listing reservation before creating a Stripe PaymentIntent.

The reservation lives on `public.listings`:

- `reserved_by`
- `reserved_until`
- `reservation_payment_intent_id`
- `reservation_transaction_id`

The reservation duration is 15 minutes.

Expired reservations are treated as inactive during the next checkout claim. If an expired reservation has a stale PaymentIntent, the Edge Function attempts to cancel that stale PaymentIntent before issuing a new one.

## Authorization

Reservation fields are server-controlled.

Direct client writes to reservation fields are blocked by `protect_checkout_reservation_listing_fields()`.

Reservation RPCs are granted only to `service_role`:

- `reserve_stripe_checkout_listing`
- `attach_stripe_checkout_reservation`
- `release_stripe_checkout_reservation`

The buyer ID is derived by `stripe-create-payment-intent` from the authenticated Supabase session and passed to the service-role RPC. It is not accepted from the client request body.

## Checkout Behavior

Buyer A starts checkout:

1. Edge Function authenticates the user.
2. Postgres locks the listing row with `for update`.
3. Postgres validates listing eligibility, buyer/seller activity, seller Stripe readiness, sale type, active status, positive price, amount match, and self-purchase.
4. Postgres records the reservation.
5. Stripe PaymentIntent is created.
6. ReTail transaction is saved.
7. Reservation is attached to the PaymentIntent and transaction.

Buyer B starts checkout while Buyer A has an active reservation:

- Postgres rejects the claim.
- Edge Function returns HTTP 409 with:

`This item is currently being purchased by another buyer. Please try again shortly.`

Buyer A taps checkout repeatedly:

- The existing active PaymentIntent is retrieved and reused when it is still safe.
- ReTail does not blindly create a new PaymentIntent for every tap.

## Webhook Behavior

`payment_intent.succeeded` now requires the Stripe PaymentIntent to match:

- transaction PaymentIntent ID
- listing ID
- buyer ID
- seller ID
- amount
- currency
- current listing reservation PaymentIntent ID
- current listing reservation transaction ID

Only then does the webhook:

- mark the transaction completed
- mark the listing sold
- clear the reservation
- send deterministic buyer/seller notifications

`payment_intent.payment_failed` and `payment_intent.canceled` update the transaction and release the reservation only when it still matches that listing, buyer, and PaymentIntent.

Webhook idempotency from Task 3B remains in place.

## Seller Mutation Protection

During an active checkout reservation, non-service-role writes cannot change:

- price
- listing type
- status
- deleted state

This blocks seller price changes, archive/delete actions, and manual sold/donated status changes from bypassing the active checkout lock.

## Not Changed

This task does not change:

- mobile UI
- bottom navigation
- marketplace fees
- Stripe Connect onboarding
- refund or dispute handling
- listing cards
- dark mode
- photo upload
