import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const migration = readFileSync(
  join(root, 'supabase/migrations/20260820225547_shipping_notification_fk_indexes.sql'),
  'utf8',
);

test('hot-path FK index migration is additive only', () => {
  assert.doesNotMatch(migration, /\bdrop\b/i);
  assert.doesNotMatch(migration, /\balter\s+table\b/i);
  assert.doesNotMatch(migration, /\bcreate\s+table\b/i);
  assert.doesNotMatch(migration, /\bcreate\s+policy\b/i);
  assert.doesNotMatch(migration, /\brevoke\b|\bgrant\b/i);
  assert.doesNotMatch(migration, /\benable\s+row\s+level\s+security\b/i);
});

test('hot-path FK index migration covers shipping quote lookups', () => {
  assert.match(migration, /idx_shipping_rate_quotes_listing[\s\S]+shipping_rate_quotes\s+\(listing_id\)/);
  assert.match(migration, /idx_shipping_rate_quotes_seller[\s\S]+shipping_rate_quotes\s+\(seller_id\)/);
  assert.match(migration, /idx_shipping_rate_quotes_seller_origin[\s\S]+shipping_rate_quotes\s+\(seller_origin_id\)/);
  assert.match(migration, /idx_shipping_rate_quotes_transaction[\s\S]+shipping_rate_quotes\s+\(transaction_id\)/);
});

test('hot-path FK index migration covers private transaction shipping detail lookups', () => {
  assert.match(migration, /idx_transaction_shipping_details_buyer[\s\S]+transaction_shipping_details\s+\(buyer_id\)/);
  assert.match(migration, /idx_transaction_shipping_details_seller[\s\S]+transaction_shipping_details\s+\(seller_id\)/);
  assert.match(migration, /idx_transaction_shipping_details_seller_origin[\s\S]+transaction_shipping_details\s+\(seller_origin_id\)/);
  assert.doesNotMatch(migration, /transaction_shipping_details\s+\(transaction_id\)/);
});

test('hot-path FK index migration covers push delivery and listing reservation lookups', () => {
  assert.match(migration, /notification_push_deliveries_device_token_idx[\s\S]+notification_push_deliveries\s+\(device_token_id\)/);
  assert.match(migration, /idx_listings_reserved_by[\s\S]+listings\s+\(reserved_by\)/);
  assert.match(migration, /idx_listings_reservation_transaction[\s\S]+listings\s+\(reservation_transaction_id\)/);
});
