# ReTail Product Policy Decisions

Status: FINAL

Date: 2026-08-10

This document is the canonical internal source for ReTail product-policy decisions. Future implementation work should follow these decisions unless Rachel explicitly approves a policy change.

## Legal Business Identity

FINAL: The consumer-facing product name is ReTail.

FINAL: ReTail is owned and operated by Crutchfield Interactive LLC.

Use the legal operator name in About, legal, privacy, terms, contact, support, footer, and help contexts. Do not replace the normal ReTail brand name in everyday marketplace screens.

## Support Contact Information

FINAL:

ReTail Customer Support
Crutchfield Interactive LLC
support@retailpetapp.com
(877) 514-3697

The support email remains an official support channel. Phone support must not be the only support channel.

## Age Requirement

FINAL: Users must be at least 18 years old to create or maintain a ReTail account.

Do not build minor-account or parental-supervision infrastructure for launch.

## Seller Contact Privacy

FINAL: Seller email addresses and phone numbers must never be publicly displayed by ReTail.

FINAL: Public profiles, public listings, and public marketplace RPCs must not expose email, phone number, or private street address.

Users may voluntarily share their own contact information through private messaging. ReTail should encourage users to keep communication in-app for safety and dispute evidence.

## Location Privacy

FINAL: Public location for regular marketplace users is city/state only.

Do not publicly expose street address, exact coordinates, ZIP code, or precise meetup location for regular marketplace users.

Private location data may continue to support distance and search logic where implemented securely.

## Rescue Donation Policy

FINAL: Verified rescues may receive physical-goods donations through ReTail immediately.

Examples include food, crates, carriers, bedding, litter, pet supplies, enrichment items, and other permitted physical supplies.

FINAL: ReTail will not facilitate monetary donations to rescues at launch. Do not add cash donation buttons, fundraising, tip jars, or charitable payment flows.

## Rescue Address Privacy

FINAL: A rescue may store a physical address privately.

FINAL: Public display of that physical address must be optional and off by default.

When the setting equivalent to "Show our physical address publicly" is false, public users see city/state only. Address data must not be exposed merely because it exists in the database.

## Rescue Verification

FINAL: Only verified rescue accounts may appear as verified rescues or solicit physical-goods donations through rescue-specific donation/needs features.

Regular users must not be able to self-label as verified rescues.

## Beta Listing Policy

FINAL: Wave 1 beta testers may create real listings.

Do not label all beta listings as fake or test content. Testers must still comply with ReTail prohibited-item and safety rules.

## Seller Payout Readiness

FINAL: Users must complete Stripe Connect payout setup before publishing their first paid marketplace listing. Local-pickup paid listings are included. Verified rescue physical-goods donation needs do not require payout setup.

FINAL: Payout-ready means ReTail has a Stripe Connect account for the seller and Stripe reports details submitted, charges enabled, and payouts enabled.

FINAL: A seller may browse, message, save favorites, use Rescue Hub features, and otherwise use ReTail without completing Stripe Connect payout setup.

FINAL: Paid marketplace listings cannot go live until payout readiness is verified server-side. A client-side notice may help the seller, but it must not be the only enforcement.

FINAL: If Stripe later reports that a seller is no longer payout-ready, new paid listing publication and new protected checkout must be blocked until the seller resolves the payout issue. Existing active paid listings should not be automatically deleted solely because payout eligibility changed.

Seller help content:

- Why required: ReTail uses Stripe Connect to securely send seller earnings and maintain a protected checkout record.
- When required: before a paid marketplace listing can go live, including local-pickup paid listings and listings where the seller offers free shipping.
- How setup works: Stripe handles secure payout onboarding. ReTail stores only non-sensitive readiness status such as account id presence, details submitted, charges enabled, and payouts enabled.
- Incomplete setup: sellers can continue payout setup from the create-listing prompt or Settings → Payments & Payouts.
- Management: sellers can refresh payout status or open their Stripe Express dashboard from Settings → Payments & Payouts.

Support contact for payout help:

ReTail Customer Support
Crutchfield Interactive LLC
support@retailpetapp.com
(877) 514-3697

## Listing Inactivity

FINAL: Do not automatically delete inactive listings.

Target lifecycle:

- Around 90 days active: seller receives an availability reminder.
- Around 120 days: seller receives a second reminder.
- Around 150 days without confirmation: listing moves to inactive/archive state.
- Seller can later reactivate the listing.

Automation for this lifecycle is a later implementation task.

## Account Inactivity

FINAL: Do not automatically delete user accounts simply for inactivity.

Accounts may remain dormant. Account deletion should happen when a user requests deletion, ReTail removes the account for safety/policy reasons, or legal/operational retention rules require another outcome.

Transaction, dispute, moderation, and safety records may be retained where operationally or legally necessary.

## Shipping Deadline

FINAL: Sellers should ship within 5 calendar days of purchase unless a shorter stated handling time applies.

If the seller has not shipped, ReTail may remind or warn the seller, and the buyer becomes eligible to request cancellation/refund review through the support flow.

## Shipping Provider And Checkout

FINAL: EasyPost is ReTail's shipping provider for rates, labels, tracking, and carrier events.

CURRENT BETA STATUS: PENDING EXTERNAL PROVIDER SETUP. EasyPost account verification/API-key access is not complete yet, so EasyPost migrations, webhooks, secrets, live rates, label purchases, and tracking webhooks must not be treated as active in the normal beta build.

FINAL: Payment stays on ReTail. Shipped marketplace transactions are paid through ReTail Protected Checkout/Stripe, then ReTail purchases the EasyPost label after payment succeeds.

FINAL: ReTail automatically selects the lowest-cost eligible tracked shipping service. Buyers do not choose from multiple carrier/service rates at launch.

FINAL: Untracked shipping services are excluded from the launch checkout flow.

FINAL: ReTail has no postage markup at launch. Actual postage is tracked separately from item price and platform fees.

FINAL: Sellers must provide accurate package weight, package dimensions, and ship-from ZIP code when offering shipping. Sellers are responsible for carrier postage adjustments caused by inaccurate package information. Automated negative seller balances are deferred; adjustments should be routed to admin/support reconciliation until payout accounting is deliberately expanded.

FINAL: Sellers may choose either "Buyer pays shipping" or "Free shipping for buyer." Buyer-paid shipping is added to the buyer total and retained by ReTail for postage purchase. Free shipping charges the buyer $0 for shipping and accounts for postage against seller proceeds/support reconciliation.

FINAL: Label generation happens only after successful payment. Label creation must be idempotent so Stripe webhook retries or support retries do not buy duplicate labels.

FINAL: Tracking is attached automatically from EasyPost whenever available. Manual tracking remains fallback-only.

FINAL: Carrier acceptance/scanning defines shipped status. Label created does not count as shipped.

FINAL: Unused labels should be refunded/voided through EasyPost when eligible. Postage refund state is separate from any Stripe buyer refund.

FINAL: Local pickup remains paid through ReTail when protected checkout is used. Local pickup does not use EasyPost rates, labels, or tracking.

FINAL: Off-platform payments are not covered by ReTail payment/refund protection.

OPERATIONAL REQUIREMENT: Crutchfield Interactive LLC must keep sufficient EasyPost wallet funding available for label purchase. Bank/ACH funding is configured outside the ReTail codebase.

## Cancellation

FINAL: Before shipment, buyers may request cancellation.

FINAL: If the seller has not shipped within the allowed shipping window, buyers may request cancellation/refund review.

FINAL: After shipment, ordinary buyer's-remorse cancellation is not guaranteed. Changed mind, no longer needed, wrong size purchased by buyer, and buyer preference changes are not automatic refund reasons.

## Refund Eligibility

FINAL: Post-shipment refund/return support should be available for qualifying problems such as:

- Item materially not as described.
- Wrong item received.
- Item damaged in transit.
- Prohibited or dangerous item.
- Fraudulent/counterfeit item where applicable.
- Package never received.
- Other significant order issue requiring admin review.

Buyer’s remorse should not automatically qualify.

Do not automatically issue refunds from the client. Refund actions must continue through secure server/admin-authorized payment handling.

## Buyer Inspection Window

FINAL: Buyers should have 48 hours after confirmed delivery to report a significant item-condition/problem claim.

Do not automatically close legitimate missing-package claims solely because a carrier says delivered. Missing-package claims require support review.

## Partial Refunds

FINAL: Partial refunds may be handled by ReTail support/admin where appropriate.

Do not allow arbitrary buyer/seller client-side amount manipulation. Partial refunds must continue through secure Stripe/admin handling.

## Return Shipping

FINAL: If the seller materially misrepresented the item, return shipping should generally be seller responsibility.

Other cases may be determined by ReTail support case by case.

## Off-Platform Payments

FINAL: If users meet locally and choose to pay outside ReTail, ReTail payment/refund protection does not apply because ReTail did not process the payment.

Users may still use ReTail messaging and safety/reporting tools. Do not imply ReTail guarantees off-platform payments.

## Local Meetup Safety

FINAL: ReTail should encourage users to:

- Meet in a public, well-lit location.
- Avoid sharing a home address unless independently chosen.
- Keep communication in ReTail when possible.
- Use caution when meeting strangers.

Do not display exact meetup locations publicly on listings.

## Blocking / Record Retention

FINAL: Blocking another user should prevent new direct contact/messaging as designed.

Blocking must not erase existing transaction records, reports, moderation history, or prevent admins from reviewing relevant records.

Deleted listings/accounts involved in transactions or reports should be soft-deleted or otherwise retained as needed for moderation/dispute history.

## Transaction Support

FINAL: ReTail should provide a transaction-support path for order, payment, refund, cancellation, return, shipping, and payout issues.

Buyer entry point: "Get Help With This Order".

Seller entry point: "Get Help With This Sale".

Submitting a support case must not automatically issue a refund, cancel an order, or change Stripe payment state.

## Support / Admin Workflow

FINAL: Transaction support cases should be visible to admins and linked to transaction, listing, buyer, seller, requester, issue category, description, status, notes, and customer-visible response.

Buyers and sellers may see support cases for transactions they are party to. Unrelated users must not see support cases.

Only admins may update admin-only fields or initiate protected moderation/payment actions. Do not duplicate Stripe refund logic in support tickets.
