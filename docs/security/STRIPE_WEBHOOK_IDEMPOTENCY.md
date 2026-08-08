# Stripe Webhook Idempotency

Date: 2026-08-08

Task 3B adds replay protection for the existing ReTail Stripe webhook without changing checkout pricing, payout calculations, refunds, disputes, or checkout reservation behavior.

## Supported Events

The webhook now mutates ReTail state only for the currently supported event types:

- `account.updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`

Valid unknown events are acknowledged and marked `ignored` in the event ledger, with no marketplace state mutation.

## Event Ledger

The migration `20260808231000_stripe_webhook_idempotency.sql` creates `public.stripe_webhook_events` as an internal service-role ledger keyed by Stripe `event.id`.

Statuses:

- `processing`
- `processed`
- `failed`
- `ignored`

Direct client access is denied by RLS and grants. Anonymous and authenticated users receive no direct table privileges, and the helper RPCs are granted only to `service_role`.

## Replay Behavior

- First valid delivery claims the event atomically and processes side effects.
- Already processed or ignored duplicate deliveries return success without repeating side effects.
- Concurrent duplicate deliveries cannot both own processing because the claim helper uses the primary key plus row locking.
- Failed processing is marked `failed` so a later Stripe retry can claim and process the event again.

## Notification Dedupe

`payment_intent.succeeded` notifications now use deterministic dedupe keys:

- `stripe:<event_id>:buyer`
- `stripe:<event_id>:seller`

This is defense in depth on top of the event ledger and the existing `notifications(user_id, dedupe_key)` uniqueness model.

## Out of Scope

This task intentionally does not add:

- checkout reservation or double-purchase locking
- refund handling
- dispute handling
- fee changes
- mobile UI changes
- Expo build changes
