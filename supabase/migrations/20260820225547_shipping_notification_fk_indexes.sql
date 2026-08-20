-- ReTail hot-path foreign-key support indexes.
-- Additive performance migration only: no RLS, policy, column, or FK semantics change.

create index if not exists idx_shipping_rate_quotes_listing
  on public.shipping_rate_quotes (listing_id);

create index if not exists idx_shipping_rate_quotes_seller
  on public.shipping_rate_quotes (seller_id);

create index if not exists idx_shipping_rate_quotes_seller_origin
  on public.shipping_rate_quotes (seller_origin_id);

create index if not exists idx_shipping_rate_quotes_transaction
  on public.shipping_rate_quotes (transaction_id)
  where transaction_id is not null;

create index if not exists idx_transaction_shipping_details_buyer
  on public.transaction_shipping_details (buyer_id);

create index if not exists idx_transaction_shipping_details_seller
  on public.transaction_shipping_details (seller_id);

create index if not exists idx_transaction_shipping_details_seller_origin
  on public.transaction_shipping_details (seller_origin_id);

create index if not exists notification_push_deliveries_device_token_idx
  on public.notification_push_deliveries (device_token_id);

create index if not exists idx_listings_reserved_by
  on public.listings (reserved_by)
  where reserved_by is not null;

create index if not exists idx_listings_reservation_transaction
  on public.listings (reservation_transaction_id)
  where reservation_transaction_id is not null;
