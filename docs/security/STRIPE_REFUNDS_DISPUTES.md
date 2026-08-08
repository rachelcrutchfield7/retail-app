# ReTail Stripe Refund and Dispute Handling

Date: 2026-08-08

Scope: Task 3D backend payment hardening.

## Supported Stripe Webhook Events

ReTail intentionally processes only this explicit allowlist:

- `account.updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`

Signed but unsupported Stripe events are acknowledged and marked `ignored` in `stripe_webhook_events`.

## Refund Tracking

`charge.refunded` reconciles Stripe's authoritative charge state into the matching ReTail transaction.

Recorded fields:

- `payment_status`: `partially_refunded` or `refunded`
- `refunded_amount_cents`
- `refunded_at`
- `last_stripe_charge_id`

ReTail records the cumulative refunded amount reported by Stripe, not a locally accumulated delta. This keeps duplicate webhook replay from double-counting refunds.

## Dispute Tracking

`charge.dispute.created`, `charge.dispute.updated`, and `charge.dispute.closed` update the matching ReTail transaction with:

- `payment_status`: `disputed`
- `stripe_dispute_id`
- `dispute_status`
- `dispute_amount_cents`
- `dispute_reason`
- `dispute_created_at`
- `dispute_resolved_at` when Stripe reports a final state

Stripe dispute statuses accepted by the database are:

- `warning_needs_response`
- `warning_under_review`
- `warning_closed`
- `needs_response`
- `under_review`
- `won`
- `lost`
- `prevented`

## Payment Event History

`transaction_payment_events` stores a minimal operational event trail keyed by Stripe event ID. It stores safe identifiers and amounts only, not full Stripe webhook payloads or card data.

Only service-role code may insert payment events. Authenticated admins may read them through RLS for future admin/payment review tooling.

## Notifications

Refund and dispute notifications use deterministic `dedupe_key` values derived from the Stripe event ID, so webhook replay does not create duplicate notifications.

Notification bodies intentionally avoid card numbers, bank details, evidence, addresses, or private Stripe payloads.

## Listing Inventory Rule

A refund or dispute does not automatically relist a sold item.

Reason: a refund or chargeback does not prove the physical item has been returned to the seller. ReTail keeps the listing unavailable unless a later intentional relisting flow is created.

## Refund Initiation

Current launch workflow:

1. Authorized ReTail admin initiates a refund in Stripe Dashboard.
2. Stripe sends `charge.refunded`.
3. ReTail reconciles the transaction automatically.

ReTail does not currently expose a seller, buyer, or mobile-client refund endpoint.

Future refund initiation must be server-side only, strongly admin-authorized, and must not accept arbitrary client-submitted PaymentIntent, charge, or amount values without server validation.

## Admin Payment Review UI

Follow-up needed: `ADMIN PAYMENT REVIEW UI`.

Task 3D creates backend records and transaction status fields for payment problems. A later UI task can surface those records in the admin panel.
