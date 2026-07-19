# Phase E Transaction and Review Model

Date: 2026-07-19

## Transaction Completion

Transactions are completed only through `complete_listing_transaction(target_listing_id, target_outcome, target_buyer_id default null)`.

The database:

- derives the seller from the locked listing
- requires the caller to be that seller
- requires the listing to be active and non-deleted
- rejects duplicate completed transactions for the listing
- rejects self-buyer completion
- validates buyer eligibility through an existing non-deleted conversation for the listing
- rejects blocked buyer/seller pairs
- generates timestamps server-side
- updates listing status and transaction state atomically

## Outcome Matrix

| Listing Type | `sold` | `donated` |
| --- | --- | --- |
| `sale` | Allowed | Allowed |
| `free` | Rejected | Allowed |
| `donation` | Rejected | Allowed |

## Linked Buyer Behavior

When a buyer is linked, that buyer must be the buyer in an existing conversation for the listing. Knowing a UUID is not enough. The transaction is review-eligible and creates one server-generated buyer notification.

## Unlinked Completion

When no buyer is linked, the listing is marked sold or donated without creating a fake transaction. No review eligibility or transaction notification is created.

## Immutability

Completed transaction identity and completion fields are protected by trigger. Ordinary users cannot change `listing_id`, `buyer_id`, `seller_id`, `status`, `outcome`, `completed_at`, `created_at`, `deleted_at`, or `cancelled_at`.

## Reviews

Reviews are created only through `create_transaction_review(target_transaction_id, requested_rating, requested_comment default null)`.

The database:

- derives reviewer from `auth.uid()`
- derives reviewee as the other transaction participant
- derives listing from the transaction
- requires a completed transaction
- allows only buyer or seller participants
- enforces one review per reviewer per transaction
- validates rating and comment length
- creates one idempotent server-generated review notification

Review editing is not an active ReTail product feature. Ordinary direct review updates are revoked and no public edit RPC is introduced in Phase E.

## Rating Summary

`get_user_review_summary(target_user_id)` calculates totals over all non-deleted reviews. The client no longer calculates aggregate ratings from only the first paginated review page.
