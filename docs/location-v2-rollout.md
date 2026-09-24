# Location Architecture v2 Rollout

This runbook prepares a controlled rollout. Location v2 is additive: legacy search areas and old RPCs remain available throughout deployment and monitoring.

## Preconditions

- Use the approved production project and a reviewed commit containing Phases 1-5.
- Resolve migration-history drift before applying SQL.
- Apply only explicitly approved migration files. Do not use `supabase db push`.
- Do not deploy `20260914230150_checkout_payment_intent_strict_enforcement_v1.sql`.
- Keep ISO and Rescue Hub on their current location architecture.
- Configure `GEOAPIFY_API_KEY` and a strong `RETAIL_LOCATION_BACKFILL_WEBHOOK_SECRET` only as Supabase Edge Function secrets. Never place either in client config or source control.

## Controlled Order

1. Run `ops/location-v2-production-audit.sql` through an approved read-only connection and review invalid ZIP/state rows, unresolved ZIP groups, and current trusted coverage.
2. Confirm the exact authoritative migration versions and SQL for Phases 1-5.
3. Configure `GEOAPIFY_API_KEY` and `RETAIL_LOCATION_BACKFILL_WEBHOOK_SECRET` in Supabase Edge Function secrets.
4. Apply the five Location v2 migrations individually in order: foundation, resolver, listing integration, geographic marketplace search, then backfill support.
5. Verify grants, private-schema access, RPC signatures, indexes, and migration history after each migration.
6. Deploy `resolve-marketplace-location` and `backfill-marketplace-locations` only.
7. Smoke-test the resolver with a controlled authenticated account. Confirm responses contain no coordinates or provider payloads.
8. Invoke `backfill-marketplace-locations` with the default dry-run mode and a batch limit of 10.
9. Review mismatches, invalid records, provider lookups needed, and unresolved ZIPs. Do not correct listing data automatically.
10. Execute one explicitly authorized batch with `{ "dryRun": false, "execute": true, "limit": 10 }`.
11. Verify seller-entered display city, trusted state/ZIP, trusted location ID, NULL public listing coordinate fields, unchanged listing business fields, and legacy search-area compatibility.
12. Verify old marketplace feeds and old clients still work.
13. Verify the v2 geographic feed for a trusted buyer origin, including a trusted listing whose `search_area_id` is null.
14. Continue bounded backfill batches only while health checks remain clean.
15. Release the Location v2 client through the separately approved client release process.
16. Monitor resolver failures, backfill failures, v2-to-legacy fallback, query latency, and unmatched ZIP/state groups.
17. Keep the legacy fallback active. Retire legacy area dependence only in a later, separately reviewed phase.

## Smoke Test Matrix

| Case | Expected result |
| --- | --- |
| Current launch-area ZIP | Resolver returns canonical US postal location; v2 and legacy feeds remain available. |
| Small-town ZIP missing from old city map | Resolver succeeds without hardcoded city membership; trusted listing appears geographically. |
| ZIP in a new US region | Resolver and cache work without adding a marketplace area. |
| Invalid ZIP | Safe validation error; no cache or listing mutation. |
| ZIP/state mismatch | Safe mismatch; no cache attachment or listing mutation. |
| Geoapify unavailable | Uncached ZIP remains unchanged and is reported unresolved. |
| Cached ZIP while Geoapify unavailable | Cache hit remains usable with zero provider call. |
| Legacy listing with trusted ZIP cache | Dry-run reports eligible; execution attaches canonical trusted location. |
| Old-client legacy-area listing | Existing RPC and area-based behavior still work. |
| Trusted listing with null `search_area_id` | v2 feed joins `marketplace_location_id` to the private trusted point; the public listing row and response expose no coordinates or ZIP. |

## Rollback and Pause

Pause new backfill invocations and client rollout first. The database changes are additive, so attached trusted location IDs and private cached locations do not need to be deleted. Old listing RPCs, `search_area_id`, old nearby RPCs, and the client v2-to-legacy RPC fallback remain available. If v2 feed health degrades, hold the new client or use the existing fallback while retaining private cached geography for diagnosis.

No additional feature-flag system is required for this rollout. The missing-RPC v2-to-legacy fallback is sufficient for emergency compatibility before or during backend rollout; after v2 is live, operational rollback should pause client release/backfill or ship a separately reviewed client switch rather than destructively removing trusted data.

## Data Blockers

Invalid/missing ZIPs, invalid state codes, ZIP/state mismatches, inactive or malformed trusted cache rows, and provider failures block only the affected listings. City-label differences alone do not block a matching ZIP/state: the seller locality remains the display city while the trusted provider locality and point remain private.

## Trusted Location Privacy

- Trusted coordinates live only in `private.marketplace_locations`.
- `public.listings.marketplace_location_id` is the trusted relationship used by Location v2.
- Location v2 leaves `public.listings.latitude`, `longitude`, and `location_point` unused and NULL, including after backfill.
- Production currently grants authenticated users table-level `SELECT` on `public.listings`; Location v2 does not change that old-client compatibility grant and remains private because trusted coordinates are never stored on those rows.
- Geographic marketplace search joins the listing location ID to the private cache and applies `ST_DWithin` and `ST_Distance` to the private trusted point.
- Backfill attaches only the trusted location ID and preserves seller display city, state, and ZIP.
