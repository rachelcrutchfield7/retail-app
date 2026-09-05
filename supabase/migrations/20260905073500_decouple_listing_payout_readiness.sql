-- Sellers may publish marketplace inventory before completing Stripe payout
-- onboarding. Paid checkout remains protected by reserve_stripe_checkout_listing.
drop trigger if exists enforce_paid_listing_payout_readiness_before_write
on public.listings;
