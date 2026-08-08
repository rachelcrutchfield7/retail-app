# ReTail Stripe Security Matrix

Date: 2026-08-08

This matrix audits the deployed Stripe Edge Function source retrieved from Supabase. It does not change payment behavior.

Legend: PASS, FAIL, NEEDS VERIFICATION, NOT IMPLEMENTED.

| Attack | Expected Result | Current Result | Status |
| --- | --- | --- | --- |
| Modify price from `$50` to `$0.50` | Server rejects mismatch with listing row | `stripe-create-payment-intent` compares requested amount to `listings.price * 100` | PASS |
| Modify price from `$50` to `$5` | Server rejects mismatch | Same amount comparison | PASS |
| Send zero amount | Server rejects | `requestedAmountCents <= 0` returns 400 | PASS |
| Send negative amount | Server rejects | `requestedAmountCents <= 0` returns 400 | PASS |
| Change currency | Client cannot choose currency | Function hardcodes `currency: 'usd'` | PASS |
| Modify seller | Server derives seller from listing | Function loads listing then seller profile by `listing.seller_id` | PASS |
| Modify buyer | Server derives buyer from Supabase token | Function uses authenticated `user.id` | PASS |
| Modify application fee | Server recalculates fee | Function calls `calculatePlatformFeeCents(listingAmountCents)` | PASS |
| Remove marketplace fee | Server recalculates fee | Client cannot submit fee | PASS |
| Raise seller payout | Server calculates destination and seller amount | Client cannot submit seller amount or destination | PASS |
| Buyer substitutes own Stripe account | Server ignores client destination | Destination comes from seller profile row | PASS |
| Buyer supplies arbitrary `acct_` value | Server ignores client destination | No destination field is read from request body | PASS |
| Buy own listing | Server rejects | `listing.seller_id === user.id` returns 400 | PASS |
| Buy sold listing | Server rejects | Requires `listing.status === 'active'` | PASS |
| Buy free listing | Server rejects | Requires `listing.listing_type === 'sale'` and positive amount | PASS |
| Buy Rescue Donation | Server rejects | Donation listings are not `listing_type='sale'` | PASS |
| Use expired/rejected offer amount | Server does not support offer checkout | Only listing price is accepted; offer amount mismatch is rejected | PASS |
| Reuse old offer | Server does not support offer checkout | No offer ID accepted | NOT IMPLEMENTED |
| Reuse payment intent for another listing | Metadata and transaction lookup bind by PaymentIntent ID | Webhook updates by `stripe_payment_intent_id`; no client completion endpoint found | PASS, with schema drift caveat |
| Fake PaymentSheet success | Client cannot mark paid directly | Webhook is authoritative for transaction completion | PASS |
| Forge Stripe webhook | Signature required | `constructEventAsync` runs before service-role writes | PASS |
| Replay Stripe webhook | Should be idempotent | No processed event ledger; duplicate success can repeat notifications and timestamp updates | FAIL |
| Access another seller's Stripe dashboard | Server should derive caller account | Login link uses caller profile `stripe_connect_account_id` | PASS |
| Create Stripe onboarding for another user | Server should create only for caller | Function selects/updates `profiles.id = user.id` | PASS |
| Inspect another seller Stripe status | Server should return caller only | Function selects `profiles.id = user.id` | PASS |
| Double purchase race | Only one buyer should be able to pay for one-off listing | Multiple buyers can create PaymentIntents while listing remains active until webhook success | FAIL |
| Duplicate refund | Refund logic absent | No refund endpoint/source found | NOT IMPLEMENTED |
| Dispute handling | Dispute events should be recorded/process-defined | `stripe-webhook` does not handle `charge.dispute.*` | NOT IMPLEMENTED |

## Current Marketplace Fee Behavior

- Server default percent: `10`
- Server default minimum fee: `0` cents
- Server default threshold: `500` cents
- Server source: `supabase/functions/_shared/stripe.ts`
- Mobile has matching display/planning defaults in `src/constants/config.ts`, but the deployed payment function recalculates the authoritative fee server-side.

## Important Schema Drift

The deployed Stripe functions reference `profiles.stripe_connect_*` columns and `transactions.payment_*` / Stripe columns. Live catalog checks during this audit showed those columns are absent from `public.profiles` and `public.transactions`.

Practical effect:

- Stripe Connect onboarding/status/login functions cannot persist or read Stripe account state in the current live database schema.
- PaymentIntent creation cannot currently reach a fully functional transaction write path.
- This is not a client-side price/seller tampering vulnerability, but it is a public-launch blocker for protected checkout.
