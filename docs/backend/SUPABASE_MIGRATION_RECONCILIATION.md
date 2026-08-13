# Supabase Migration Reconciliation

Date: 2026-08-13

Normal ReTail project: `ycwgsdigvpmprqreoqiz`

This document records the current local-vs-live Supabase migration drift observed while preparing the native push notification backend. It is documentation only; it does not authorize deleting migration history, marking unapplied migrations as applied, or rerunning historical migrations blindly.

## Current State

- `supabase db push --dry-run` cannot produce a safe plan because remote migration versions exist that are not present locally.
- The Stripe Tax schema was verified absent, then applied through the supported Supabase single-migration connector path.
- Supabase recorded that connector-applied migration as `20260813125113_authoritative_checkout_stripe_tax`.
- The local repository still contains the original reviewed file `20260812120000_authoritative_checkout_stripe_tax.sql`.
- The push notification migration `20260812153000_push_notification_delivery_tracking.sql` remains unapplied.

## Exact Historical Files Restored

| Live Version | Live Name | Restored Local File | Source Commit | Action |
| --- | --- | --- | --- | --- |
| `20260802012858` | `repair_admin_report_actions` | `supabase/migrations/20260802012858_repair_admin_report_actions.sql` | `ded8fa3df81a7e246689dcf93cc854b2d1929637` | restored |
| `20260802132552` | `admin_report_messaging` | `supabase/migrations/20260802132552_admin_report_messaging.sql` | `d9323407bcbecbc66ce3e937a3c36ce6f79fd518` | restored |

## Timestamp Drift / Missing Local Files

| Live Version | Live Name | Local Equivalent | Local Version | Schema Effect Verified Live | Confidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| `20260706182330` | `initial_retail_schema` | base schema files, not migration file | none | partial | medium | defer; recover baseline provenance separately |
| `20260706182437` | `retail_rls_policies` | `supabase/policies.sql`, not migration file | none | partial | medium | defer; recover baseline provenance separately |
| `20260706182504` | `retail_storage_buckets` | `supabase/storage.sql`, not migration file | none | partial | medium | defer; recover baseline provenance separately |
| `20260710152514` | `distance_search_foundation` | `supabase/distance.sql`, not migration file | none | partial | medium | defer; recover baseline provenance separately |
| `20260711231736` | `add_rescue_public_address_fields` | unknown historical migration | none | partial | low | defer |
| `20260712124317` | `add_listing_getting_options` | `supabase/listing_getting_options.sql`, not migration file | none | partial | medium | defer |
| `20260712125357` | `add_listing_detail_fields` | `supabase/listing_detail_fields.sql`, not migration file | none | partial | medium | defer |
| `20260727134418` | `public_rescue_physical_address_fields` | historical branch file not present locally | none | partial | low | defer |
| `20260727141839` | `admin_report_moderation_actions` | `20260727194012_admin_report_moderation_actions.sql` in Git history / later admin migrations | none on current branch | yes | medium | document |
| `20260730150339` | `notification_email_preferences` | `20260730143000_notification_email_preferences.sql` in Git history | none on current branch | yes | medium | document |
| `20260730152959` | `restore_conversation_message_insert_policy` | `20260730150000_restore_conversation_message_insert_policy.sql` in Git history | none on current branch | partial | medium | document |
| `20260730154202` | `restore_messaging_insert_grants` | `20260730151000_restore_messaging_insert_grants.sql` in Git history | none on current branch | partial | medium | document |
| `20260730154638` | `restore_create_user_notification_rpc` | `20260730152000_restore_create_user_notification_rpc.sql` in Git history | none on current branch | yes | medium | document |
| `20260730163443` | `rescue_public_conversation_policy` | `20260730184000_rescue_public_messaging.sql` in Git history | none on current branch | partial | medium | document |
| `20260730163512` | `rescue_public_feed_owner_id` | `20260730184000_rescue_public_messaging.sql` in Git history | none on current branch | yes | medium | document |
| `20260730163536` | `rescue_public_by_owner_owner_id` | `20260730184000_rescue_public_messaging.sql` in Git history | none on current branch | yes | medium | document |
| `20260730163609` | `nearby_rescues_owner_id` | `20260730184000_rescue_public_messaging.sql` in Git history | none on current branch | yes | medium | document |
| `20260803012715` | `fix_admin_report_moderation_actions` | `20260802000000_fix_admin_report_moderation_actions.sql` | `20260802000000` | yes | medium | document |
| `20260808182635` | `signup_consent_and_marketing_preferences` | `20260808172854_signup_consent_and_marketing_preferences.sql` | `20260808172854` | yes | high | document |
| `20260808223605` | `stripe_schema_readiness` | `20260808190000_stripe_schema_readiness.sql` | `20260808190000` | yes | high | document |
| `20260808224818` | `stripe_webhook_idempotency` | `20260808231000_stripe_webhook_idempotency.sql` | `20260808231000` | yes | high | document |
| `20260808232211` | `stripe_checkout_reservation` | `20260808234000_stripe_checkout_reservation.sql` | `20260808234000` | yes | high | document |
| `20260808234452` | `stripe_refund_dispute_tracking` | `20260808183625_stripe_refund_dispute_tracking.sql` | `20260808183625` | yes | high | document |
| `20260810173611` | `product_policy_transaction_support` | `20260810111020_product_policy_transaction_support.sql` | `20260810111020` | yes | high | document |
| `20260811185910` | `seller_payout_publish_guard` | `20260811103000_seller_payout_publish_guard.sql` | `20260811103000` | yes | high | document |
| `20260813125113` | `authoritative_checkout_stripe_tax` | `20260812120000_authoritative_checkout_stripe_tax.sql` | `20260812120000` | yes | high | document |

## Local-Only Migration Classification

| Local Version | Name | Classification | Notes |
| --- | --- | --- | --- |
| `20260723090000` | `rescue_donations_sorting_and_eligibility` | schema effects appear live, ledger not matched | sorted listing RPCs exist live; no matching live migration row found |
| `20260723103000` | `fix_rescue_donation_sorted_feed_bounds` | schema effects appear live, ledger not matched | sorted listing RPCs exist live; no matching live migration row found |
| `20260802000000` | `fix_admin_report_moderation_actions` | equivalent/superseded by live admin repair generations | live admin moderation and report queue objects exist |
| `20260808172854` | `signup_consent_and_marketing_preferences` | equivalent to live timestamp-drifted migration | live user consent and preference objects exist |
| `20260808183625` | `stripe_refund_dispute_tracking` | equivalent to live timestamp-drifted migration | live refund/dispute objects exist |
| `20260808190000` | `stripe_schema_readiness` | equivalent to live timestamp-drifted migration | live Stripe profile/transaction fields exist |
| `20260808231000` | `stripe_webhook_idempotency` | equivalent to live timestamp-drifted migration | live `stripe_webhook_events` exists |
| `20260808234000` | `stripe_checkout_reservation` | equivalent to live timestamp-drifted migration | live checkout reservation fields/functions exist |
| `20260810090000` | `beta_my_listings_admin_report_queue` | schema effects appear live, ledger not matched | live `get_my_listings` and `get_admin_report_queue` exist |
| `20260810111020` | `product_policy_transaction_support` | equivalent to live timestamp-drifted migration | live support cases exist |
| `20260811103000` | `seller_payout_publish_guard` | equivalent to live timestamp-drifted migration | live seller payout guard exists |
| `20260812120000` | `authoritative_checkout_stripe_tax` | equivalent to live connector-applied migration | live recorded as `20260813125113_authoritative_checkout_stripe_tax` |
| `20260812153000` | `push_notification_delivery_tracking` | truly pending | push delivery table and invalid-token cleanup RPC are not live |

## Recommendation

Do not repair migration history yet. The repository still does not contain exact local files for many live versions, and several local-only files have live-equivalent schema effects under different timestamps. A safe repair would require a deliberate follow-up decision:

1. Either restore or recreate exact historical migration files for all live-only versions where provenance is available.
2. Decide whether timestamp-drifted local files should be kept as historical notes, superseded, or replaced by exact live-version copies.
3. Only use `supabase migration repair` after proving every marked-applied local migration has its schema effects live.

Until then, `supabase db push --dry-run` should not be trusted as the deployment gate for the push migration.

## Baseline Attempt on 2026-08-13

Goal: use an official baseline approach so future `supabase db push --dry-run` can become trustworthy before applying the push notification migration.

Result: blocked before any migration-history mutation.

Commands attempted:

- `npx supabase db dump --linked -f backups/supabase/ycwgsdigvpmprqreoqiz_schema_20260813.sql`
- `npx supabase db pull --linked`
- `npx supabase migration list --linked`

Findings:

- `supabase db dump` could not create a schema backup because the current CLI path requires Docker for the dump operation and Docker Desktop is not available in this environment.
- The failed dump initially produced an empty local file at `backups/supabase/ycwgsdigvpmprqreoqiz_schema_20260813.sql`; it was removed and must not be treated as a valid backup.
- `supabase db pull --linked` failed before generating a remote baseline migration because the remote migration history still does not match local files.
- The CLI repair suggestion included `supabase migration repair --status applied 20260812153000`, but the push notification migration is not live. Marking it applied would be false.
- No migration repair was run.
- No push migration was applied.
- No Edge Function was deployed.

Operational rule going forward:

All production schema changes must go through committed migration files. If a migration must be applied through a connector because CLI history is blocked, immediately document the live recorded migration version and reconcile the repository before relying on `db push` again.

Next safe options:

1. Obtain a true schema-only backup using a machine with Docker Desktop or local Postgres `pg_dump` available, then repeat the official baseline workflow.
2. Restore exact migration files for every live-only version where possible, including early baseline migrations.
3. Create a deliberate forward-only baseline strategy for timestamp-drifted migrations, reviewed before using `supabase migration repair`.
4. Do not mark `20260812153000_push_notification_delivery_tracking` as applied until the push schema is actually live.

## Docker-Enabled Baseline Attempt on 2026-08-13

Docker Desktop was later installed and verified from the terminal.

Schema backup:

- Backup path: `/private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_schema_20260813_081656.sql`
- Size: 764 KB
- Lines: 16,997
- Verified contents include core public tables, RLS policies, support cases, device tokens, Stripe Tax transaction fields, and Stripe Tax indexes.
- Verified contents do not include `public.notification_push_deliveries`, which matches the live schema audit that push delivery tracking remains unapplied.

Official baseline pull:

- `npx supabase db pull --linked` still failed before generating a baseline file.
- Failure code: `LegacyDbPullMigrationConflictError`
- Cause: remote migration history still does not match local files in `supabase/migrations`.
- The CLI again suggested marking `20260812153000` as applied, but live schema checks confirm `notification_push_deliveries` and `remove_invalid_device_token_from_push_delivery` do not exist. That repair would be false and must not be run.

Current verified live schema facts:

- Stripe Tax schema is live.
- Stripe Tax was recorded in live migration history as `20260813125113_authoritative_checkout_stripe_tax`.
- Push delivery schema is not live.
- Push migration `20260812153000_push_notification_delivery_tracking` is not recorded in live migration history.

## Exact File Recovery Search on 2026-08-13

Goal: recover only exact historical migration files for live migration versions that are already recorded as applied remotely. This pass intentionally did not invent replacement files, copy same-feature SQL under remote timestamps, repair migration history, apply pending migrations, or run `db push`.

Search scope:

- Exact-version lookup across all Git refs for every remaining live-only version using `supabase/migrations/<version>_*.sql`.
- Same-feature migration-name lookup across all Git refs.
- Historical non-migration SQL support files that appear to have fed the earliest remote migrations: `supabase/schema.sql`, `supabase/policies.sql`, `supabase/storage.sql`, `supabase/distance.sql`, `supabase/listing_getting_options.sql`, and `supabase/listing_detail_fields.sql`.
- Current schema backup at `/private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_schema_20260813_081656.sql` for live Stripe Tax and pending push-schema evidence.

Exact historical files recovered in this pass: none.

Exact-version result: no remaining live-only migration version was found in Git history as an exact `supabase/migrations/<version>_*.sql` file.

Timestamp/name equivalents identified:

| Live Version | Live Name | Evidence Found | Classification |
| --- | --- | --- | --- |
| `20260727141839` | `admin_report_moderation_actions` | `20260727194012_admin_report_moderation_actions.sql` and later `20260802000000_fix_admin_report_moderation_actions.sql` exist in Git history. | exact equivalent local migration identified under different timestamp/name, with later repairs |
| `20260730150339` | `notification_email_preferences` | `20260730143000_notification_email_preferences.sql` exists in Git history. | exact equivalent local migration identified under different timestamp/name |
| `20260730152959` | `restore_conversation_message_insert_policy` | `20260730150000_restore_conversation_message_insert_policy.sql` exists in Git history. | exact equivalent local migration identified under different timestamp/name |
| `20260730154202` | `restore_messaging_insert_grants` | `20260730151000_restore_messaging_insert_grants.sql` exists in Git history. | exact equivalent local migration identified under different timestamp/name |
| `20260730154638` | `restore_create_user_notification_rpc` | `20260730152000_restore_create_user_notification_rpc.sql` exists in Git history. | exact equivalent local migration identified under different timestamp/name |
| `20260730163443` | `rescue_public_conversation_policy` | Related changes are bundled in `20260730184000_rescue_public_messaging.sql` in Git history. | migration behavior reconstructed with high confidence but original provenance not proven |
| `20260730163512` | `rescue_public_feed_owner_id` | Related changes are bundled in `20260730184000_rescue_public_messaging.sql` in Git history. | migration behavior reconstructed with high confidence but original provenance not proven |
| `20260730163536` | `rescue_public_by_owner_owner_id` | Related changes are bundled in `20260730184000_rescue_public_messaging.sql` in Git history. | migration behavior reconstructed with high confidence but original provenance not proven |
| `20260730163609` | `nearby_rescues_owner_id` | Related changes are bundled in `20260730184000_rescue_public_messaging.sql` in Git history. | migration behavior reconstructed with high confidence but original provenance not proven |
| `20260803012715` | `fix_admin_report_moderation_actions` | `20260802000000_fix_admin_report_moderation_actions.sql` exists locally. | exact equivalent local migration identified under different timestamp/name |
| `20260808182635` | `signup_consent_and_marketing_preferences` | `20260808172854_signup_consent_and_marketing_preferences.sql` exists locally and was committed from the signup consent branch. | exact equivalent local migration identified under different timestamp/name |
| `20260808223605` | `stripe_schema_readiness` | `20260808190000_stripe_schema_readiness.sql` exists locally and was committed from the Stripe schema readiness branch. | exact equivalent local migration identified under different timestamp/name |
| `20260808224818` | `stripe_webhook_idempotency` | `20260808231000_stripe_webhook_idempotency.sql` exists locally and was committed from the Stripe webhook idempotency branch. | exact equivalent local migration identified under different timestamp/name |
| `20260808232211` | `stripe_checkout_reservation` | `20260808234000_stripe_checkout_reservation.sql` exists locally and was committed from the checkout reservation branch. | exact equivalent local migration identified under different timestamp/name |
| `20260808234452` | `stripe_refund_dispute_tracking` | `20260808183625_stripe_refund_dispute_tracking.sql` exists locally and was committed from the refund/dispute branch. | exact equivalent local migration identified under different timestamp/name |
| `20260810173611` | `product_policy_transaction_support` | `20260810111020_product_policy_transaction_support.sql` exists locally and was committed from the Wave 1 product policy branch. | exact equivalent local migration identified under different timestamp/name |
| `20260811185910` | `seller_payout_publish_guard` | `20260811103000_seller_payout_publish_guard.sql` exists locally and was committed from the Wave 1 beta baseline branch. | exact equivalent local migration identified under different timestamp/name |
| `20260813125113` | `authoritative_checkout_stripe_tax` | `20260812120000_authoritative_checkout_stripe_tax.sql` exists locally. The live schema backup contains Stripe Tax transaction fields, constraints, and `idx_transactions_stripe_tax_calculation_id`; it does not contain push delivery tracking objects. | exact equivalent local migration identified under different timestamp/name |

Unresolved live-only versions:

| Live Version | Live Name | Current Classification | Notes |
| --- | --- | --- | --- |
| `20260706182330` | `initial_retail_schema` | unresolved | No exact migration file found. Historical evidence points to baseline SQL in `supabase/schema.sql`, first added in `3f8e47c680b454837fc5baf6dcf2c9a789287cdd`, but this is not an exact migration file. |
| `20260706182437` | `retail_rls_policies` | unresolved | No exact migration file found. Historical evidence points to baseline SQL in `supabase/policies.sql`, first added in `3f8e47c680b454837fc5baf6dcf2c9a789287cdd`, but this is not an exact migration file. |
| `20260706182504` | `retail_storage_buckets` | unresolved | No exact migration file found. Historical evidence points to baseline SQL in `supabase/storage.sql`, first added in `3f8e47c680b454837fc5baf6dcf2c9a789287cdd`, but this is not an exact migration file. |
| `20260710152514` | `distance_search_foundation` | unresolved | No exact migration file found. Historical evidence points to baseline SQL in `supabase/distance.sql`, first added in `3f8e47c680b454837fc5baf6dcf2c9a789287cdd`, but this is not an exact migration file. |
| `20260711231736` | `add_rescue_public_address_fields` | unresolved | No exact migration file or same-name equivalent found in Git history. |
| `20260712124317` | `add_listing_getting_options` | unresolved | No exact migration file found. Historical evidence points to baseline SQL in `supabase/listing_getting_options.sql`, first added in `3f8e47c680b454837fc5baf6dcf2c9a789287cdd`, but this is not an exact migration file. |
| `20260712125357` | `add_listing_detail_fields` | unresolved | No exact migration file found. Historical evidence points to baseline SQL in `supabase/listing_detail_fields.sql`, first added in `3f8e47c680b454837fc5baf6dcf2c9a789287cdd`, but this is not an exact migration file. |
| `20260727134418` | `public_rescue_physical_address_fields` | unresolved | No exact migration file or same-name equivalent found in Git history. |

Stripe Tax drift classification:

`20260813125113_authoritative_checkout_stripe_tax` is timestamp/name drift from local reviewed migration `20260812120000_authoritative_checkout_stripe_tax.sql`. The live schema backup includes the Stripe Tax fields, constraints, and index added by that migration. The remote history timestamp differs because the migration was applied through the supported single-migration connector while CLI history was already blocked. This should be treated as a live-equivalent migration, not as evidence that Stripe Tax is pending.

## Remaining History Mismatch Classification

| Category | Versions | Proposed Action |
| --- | --- | --- |
| Exact historical migration missing locally | `20260706182330`, `20260706182437`, `20260706182504`, `20260710152514`, `20260711231736`, `20260712124317`, `20260712125357`, `20260727134418`, `20260727141839`, `20260730150339`, `20260730152959`, `20260730154202`, `20260730154638`, `20260730163443`, `20260730163512`, `20260730163536`, `20260730163609`, `20260803012715`, `20260808182635`, `20260808223605`, `20260808224818`, `20260808232211`, `20260808234452`, `20260810173611`, `20260811185910` | Restore or reconstruct exact local migration files when provenance can be proven. Do not delete remote history rows merely because local files are missing. |
| Timestamp/name drift where equivalent schema is already live | `20260803012715`, `20260808182635`, `20260808223605`, `20260808224818`, `20260808232211`, `20260808234452`, `20260810173611`, `20260811185910`, `20260813125113` | Prefer adding local files that match live history or a reviewed baseline strategy. Avoid `repair --status reverted` because schema effects are live. |
| Remote migration-history entry needing investigation | early/base migrations and rescue physical-address migrations | Recover original migration provenance before any history mutation. |
| Genuinely pending migration | `20260812153000_push_notification_delivery_tracking` | Do not repair as applied. Apply only after a trustworthy deployment path is approved. |

## Proposed Repair Plan

No repair commands are currently safe to execute.

Unsafe repair actions to avoid:

- Do not run `supabase migration repair --status applied 20260812153000`; push schema is absent.
- Do not run the CLI-suggested `--status reverted` commands for live-only rows without first restoring or replacing their local files. Those rows represent real live schema history, even when local filenames drifted.

Safer plan:

1. Restore exact local migration files for every live-only version where Git history or a trusted backup can prove the original SQL.
2. For live-only versions whose exact SQL cannot be recovered, create a reviewed baseline/reconciliation strategy that is intentionally documented before touching migration history.
3. For local-only migrations whose effects are already live under different timestamps, decide whether to keep them as historical development artifacts or replace them with exact live-version files. Do not mark them applied until the mismatch is resolved in a way that keeps `20260812153000` pending.
4. Only after local files and remote history can be made truthful, rerun `supabase migration list --linked`.
5. Only after `migration list` is coherent, run `supabase db push --dry-run`.
6. The only acceptable pending migration in that dry-run is `20260812153000_push_notification_delivery_tracking.sql`.

## Deliberate Reconciliation Strategy Design on 2026-08-13

This section designs the next reconciliation step. It does not execute migration repair, modify remote schema, modify remote migration history, apply the push migration, deploy `send-notification`, or create a build.

Official Supabase migration behavior relevant to this decision:

- `supabase db push` compares local files in `supabase/migrations` to rows in `supabase_migrations.schema_migrations` and runs only migrations that are local but not recorded remotely.
- `supabase migration repair` changes migration tracking history only; it does not run or revert SQL.
- `supabase db pull` can create a remote-schema migration, but the current project is too divergent for `db pull --linked` to complete before history normalization.

### Remote-Only Version Mapping

| Remote Version | Effects Definitely Present Live | Attributable Objects / Effects | Local Equivalent | Keep Remote Row Applied? | Proposed Representation |
| --- | --- | --- | --- | --- | --- |
| `20260706182330` | yes | Core application schema: public enums/tables including profiles, listings, listing images, favorites, conversations, messages, transactions, reviews, reports, blocks, notifications, device tokens, audit/rate-limit objects. | `supabase/schema.sql` baseline SQL, not an exact migration file. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260706182437` | yes | Baseline RLS enablement and policies for core public tables. | `supabase/policies.sql` baseline SQL, not an exact migration file. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260706182504` | partial | Storage bucket setup and storage object policies for avatars, listings, and message images. Schema backup proves storage policy/function shape, but bucket rows are data in `storage.buckets` and require live/dashboard verification before final baseline approval. | `supabase/storage.sql` baseline SQL, not an exact migration file. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration plus explicit storage bucket seed SQL |
| `20260710152514` | yes | PostGIS/distance foundation: listing `location_point`, GIST index, sync trigger/function, nearby listing RPC lineage. | `supabase/distance.sql` baseline SQL, not an exact migration file. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260711231736` | yes | Rescue public address fields/schema lineage; current live `rescue_profiles` contains physical-location/public rescue fields used by the app. | no exact or same-name file found | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260712124317` | yes | Listing getting options such as porch pickup and meetup availability plus related constraints. | `supabase/listing_getting_options.sql`, not an exact migration file. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260712125357` | yes | Listing detail and shipping-related fields such as dimensions, pet size, condition notes, shipping payer/cost, and handling time. | `supabase/listing_detail_fields.sql`, not an exact migration file. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260727134418` | yes | Public rescue physical-address fields and/or privacy controls represented in current rescue profile schema. | no exact or same-name file found | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260727141839` | yes | Admin report moderation action RPC lineage. | `20260727194012_admin_report_moderation_actions.sql` plus later admin repair migrations. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730150339` | yes | Notification preference schema/RPC lineage. | `20260730143000_notification_email_preferences.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730152959` | yes | Restored conversation/message insert policy lineage. | `20260730150000_restore_conversation_message_insert_policy.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730154202` | yes | Restored messaging grants lineage. | `20260730151000_restore_messaging_insert_grants.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730154638` | yes | Restored `create_user_notification` RPC lineage. | `20260730152000_restore_create_user_notification_rpc.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730163443` | yes | Rescue public conversation policy lineage. | bundled in `20260730184000_rescue_public_messaging.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730163512` | yes | Rescue public feed owner ID return shape. | bundled in `20260730184000_rescue_public_messaging.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730163536` | yes | Rescue public by-owner owner ID return shape. | bundled in `20260730184000_rescue_public_messaging.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260730163609` | yes | Nearby rescues owner ID return shape. | bundled in `20260730184000_rescue_public_messaging.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260803012715` | yes | Admin report moderation repair lineage. | `20260802000000_fix_admin_report_moderation_actions.sql` plus exact later admin files already restored. | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260808182635` | yes | Signup consent and marketing preference schema/RPCs. | `20260808172854_signup_consent_and_marketing_preferences.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260808223605` | yes | Stripe schema readiness fields/indexes/RPC support. | `20260808190000_stripe_schema_readiness.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260808224818` | yes | Stripe webhook idempotency table and processing support. | `20260808231000_stripe_webhook_idempotency.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260808232211` | yes | Checkout reservation fields/RPC support. | `20260808234000_stripe_checkout_reservation.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260808234452` | yes | Refund/dispute tracking schema. | `20260808183625_stripe_refund_dispute_tracking.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260810173611` | yes | Product policy and transaction support schema/RPCs. | `20260810111020_product_policy_transaction_support.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260811185910` | yes | Seller payout publish guard and checkout payout recheck. | `20260811103000_seller_payout_publish_guard.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |
| `20260813125113` | yes | Authoritative Stripe Tax checkout transaction fields, constraints, and index. | `20260812120000_authoritative_checkout_stripe_tax.sql` | no under baseline strategy; yes only under compatibility-history strategy | consolidated baseline migration |

### Strategy A: Reconstruct Local Compatibility History Matching Remote Timestamps

Concept:

1. Keep the current remote migration rows as applied.
2. Add local migration files for every remote-only timestamp.
3. Archive or otherwise remove local-only timestamp-drifted migrations from `supabase/migrations` so they do not appear pending.
4. Leave `20260812153000_push_notification_delivery_tracking.sql` as the only local-only pending migration.

Safety:

- Low to medium. It avoids remote history mutation, but it requires creating local files for historical versions whose exact original SQL cannot be proven.
- For unresolved early rows, no-op files would make `supabase migration list` look coherent while hiding the fact that a fresh `db reset` would not rebuild the schema.
- Idempotent compatibility files copied from baseline/support SQL would be more useful than no-ops for `db reset`, but they would still be reconstructed rather than exact historical provenance.

Reversibility:

- Local-only changes are reversible through Git.
- If future developers depend on the reconstructed compatibility files, later correction becomes harder.

Impact on existing production data:

- None if files are only added locally and no `db push` runs unexpected SQL.
- Risk appears when a reconstructed file is accidentally treated as pending against any environment that lacks the corresponding remote history row.

Impact on `supabase db reset`:

- No-op compatibility files fail this requirement because a fresh local database would miss schema dependencies.
- Reconstructed idempotent compatibility files could pass reset only if they fully reproduce the live schema in the correct order.

Impact on future `db push`:

- Could become coherent for the current remote if all remote timestamps are represented locally and timestamp-drifted local files are archived.
- Fragile for new environments because reconstructed history may not match actual production lineage.

Risk of schema loss:

- Moderate. Archiving current local migrations before a true baseline exists could remove the only reproducible source for some schema effects.

Risk of accidentally marking the push migration applied:

- Low if no repair commands are run.
- Still present if the CLI continues suggesting broad repairs and a human follows them.

Maintenance burden:

- High. The project would carry many historical compatibility files whose contents are partially reconstructed and whose purpose is easy to misunderstand.

Conclusion:

Strategy A is not recommended. No-op compatibility migrations are especially unsafe because they would make migration history appear healthy while breaking local rebuilds. Reconstructed alias migrations are better than no-ops but still less honest and more brittle than a deliberate baseline.

### Strategy B: Create a Deliberate Current-Schema Baseline

Concept:

1. Preserve the verified schema backup and current migration files.
2. Move all existing historical migrations except the genuinely pending push migration out of `supabase/migrations` into a clearly named archive folder that Supabase CLI does not scan.
3. Create one reviewed current-schema baseline migration representing the live schema as of the verified backup.
4. Keep `20260812153000_push_notification_delivery_tracking.sql` in `supabase/migrations` after the baseline.
5. Use `supabase migration repair` to normalize remote history: remove old historical rows from the remote migration-history table and mark the new baseline as applied.
6. Do not mark `20260812153000` as applied until its SQL actually runs.

Safety:

- Medium to high if performed with a fresh backup, reviewed baseline SQL, and a narrow repair command list.
- It changes migration history but not production schema/data.
- It avoids inventing many historical files and makes the repository honest about the current launch baseline.

Reversibility:

- Good for local repository changes through Git.
- Remote migration-history repair is reversible by restoring the pre-repair migration-history rows from the captured `supabase migration list --linked` output, but it requires care.
- Production schema/data is not changed by repair.

Impact on existing production data:

- No schema/data impact when only history repair is executed.
- Production data remains untouched.

Impact on `supabase db reset`:

- Best option. A fresh local database can be rebuilt from the baseline plus pending/future migrations.
- The baseline must include application-owned public/private schemas, RLS, policies, functions, triggers, indexes, extensions, storage policies, and storage bucket seed rows required by ReTail.

Impact on future `db push`:

- Best option. After repair, `supabase migration list --linked` should show the baseline as present locally and remotely, with only `20260812153000_push_notification_delivery_tracking.sql` pending.
- `supabase db push --dry-run` should then be trustworthy and show only the push notification migration.

Risk of schema loss:

- Low if the baseline is generated from the verified live backup and audited before repair.
- Main risk is an incomplete baseline, especially storage bucket rows and Supabase-managed schemas. This must be checked before execution.

Risk of accidentally marking the push migration applied:

- Low if the repair command list explicitly excludes `20260812153000`.
- The push migration stays local-only and pending.

Maintenance burden:

- Low to medium. Historical migrations are retained in an archive for research, while normal development starts from a clean current-schema baseline.

Conclusion:

Strategy B is recommended. It is the clearest way to satisfy all final-state requirements without pretending unrecoverable early migrations were recovered.

### Recommended Plan: Baseline and Repair, Not Compatibility No-Ops

Recommended strategy: Strategy B.

Why:

- It is honest about the fact that exact early migration provenance is unrecoverable.
- It keeps production schema/data untouched.
- It keeps Stripe Tax live and represented in the baseline.
- It keeps `20260812153000_push_notification_delivery_tracking.sql` pending.
- It makes future `db push --dry-run` useful again.
- It gives fresh local databases a reproducible baseline instead of a stack of no-op compatibility files.

Files that would be created:

- `supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql`
- `docs/backend/archived-migrations/prebaseline-20260813/README.md`

Files that would be archived:

- All existing migration files currently under `supabase/migrations` except `20260812153000_push_notification_delivery_tracking.sql`.
- Archive destination: `docs/backend/archived-migrations/prebaseline-20260813/supabase-migrations/`

Baseline content requirements:

- Include current live application schema from `/private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_schema_20260813_081656.sql`.
- Include app-required storage bucket seed SQL for `avatars`, `listings`, and `message-images`, because schema-only dumps do not reliably preserve rows in `storage.buckets`.
- Include extension declarations without pinning explicit extension versions.
- Exclude secrets, production data, auth users, storage objects, and migration-history table rows.
- Exclude `notification_push_deliveries` and `remove_invalid_device_token_from_push_delivery`, because those belong to the pending push migration.

Proposed migration repair commands, for later approval only:

```bash
# Mark the new baseline as already represented by the current live schema.
npx supabase migration repair --linked --status applied 20260812152900

# Remove old pre-baseline history rows after they are archived and represented by the baseline.
npx supabase migration repair --linked --status reverted \
  20260706182330 20260706182437 20260706182504 20260710152514 \
  20260711231736 20260712124317 20260712125357 20260717125609 \
  20260717134801 20260717161849 20260717171018 20260717174159 \
  20260717180029 20260719003237 20260719011141 20260719015639 \
  20260719015856 20260719015942 20260719120708 20260719175607 \
  20260720010133 20260720014405 20260720015113 20260720015350 \
  20260720120248 20260727134418 20260727141839 20260730150339 \
  20260730152959 20260730154202 20260730154638 20260730163443 \
  20260730163512 20260730163536 20260730163609 20260802012858 \
  20260802132552 20260803012715 20260808182635 20260808223605 \
  20260808224818 20260808232211 20260808234452 20260810173611 \
  20260811185910 20260813125113
```

Do not include `20260812153000` in any `--status applied` repair command. It is not live.

Expected migration list after repair:

| Local | Remote | Meaning |
| --- | --- | --- |
| `20260812152900` | `20260812152900` | Current-schema baseline applied/represented live |
| `20260812153000` | empty | Push notification delivery tracking remains pending |

Expected dry-run after repair:

- `supabase db push --dry-run` should show only `20260812153000_push_notification_delivery_tracking.sql`.
- If anything else appears, stop before push.

Rollback plan:

1. Keep the verified schema backup at `/private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_schema_20260813_081656.sql`.
2. Commit the archive/baseline files before any repair.
3. Save `supabase migration list --linked` output immediately before repair.
4. If repair produces an unexpected migration list, do not run `db push`.
5. Restore the repository with Git.
6. Restore remote history with inverse `supabase migration repair` commands based on the saved pre-repair list: mark removed historical versions `applied` again and mark the baseline `reverted`.
7. Re-run `supabase migration list --linked`.

Execution status:

- Repair executed: no.
- Remote history modified: no.
- Remote schema changes required: no.
- Push migration applied: no.
- `send-notification` deployed: no.
- EAS build created: no.

## Local Baseline Implementation on 2026-08-13

This implementation step created and validated the local baseline/archive structure only. It did not execute migration-history repair, modify remote schema, modify remote migration history, apply the push migration remotely, deploy `send-notification`, or create a build.

### Preserved Pre-Change Evidence

Local evidence snapshot:

- `/private/tmp/retail-supabase-backups/prebaseline-evidence-20260813/git_status_before.txt`
- `/private/tmp/retail-supabase-backups/prebaseline-evidence-20260813/migration_inventory_before.txt`
- `/private/tmp/retail-supabase-backups/prebaseline-evidence-20260813/migration_list_before.txt`
- `/private/tmp/retail-supabase-backups/prebaseline-evidence-20260813/SUPABASE_MIGRATION_RECONCILIATION_before.md`

Additional read-only storage-schema evidence:

- `/private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_storage_schema_20260813_baseline_audit.sql`

### Archive

Archive destination:

- `docs/backend/archived-migrations/prebaseline-20260813/`

Archived migration count:

- 32 historical/pre-baseline migration files.

Active migration files after archive:

- `supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql`
- `supabase/migrations/20260812153000_push_notification_delivery_tracking.sql`

### Baseline

Baseline file:

- `supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql`

Baseline timestamp:

- `20260812152900`

Ordering decision:

- The baseline was created on 2026-08-13 but intentionally uses `20260812152900` so it sorts one minute before the already-reviewed pending migration `20260812153000_push_notification_delivery_tracking.sql`.
- The pending push migration was not renamed and its contents were not changed.
- A filename suffix, `created_20260813`, records the actual reconciliation date.

Baseline source:

- Main application schema from verified remote schema backup `/private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_schema_20260813_081656.sql`.
- Live storage policy evidence from read-only storage-schema dump `/private/tmp/retail-supabase-backups/ycwgsdigvpmprqreoqiz_storage_schema_20260813_baseline_audit.sql`.
- Explicit ReTail storage bucket seed rows for `avatars`, `listings`, and `message-images`.

Supabase-managed exclusions:

- Optional/platform advisor extensions `hypopg`, `index_advisor`, `pg_stat_statements`, and `supabase_vault` were not included as baseline-required app schema.
- Supabase-managed `auth` and `storage` internal tables were not recreated by the baseline.
- ReTail-owned storage bucket rows and `storage.objects` policies were included without recreating storage internals.

Privilege normalization:

- The baseline now revokes inherited local default privileges from ReTail public/private functions and public tables immediately before replaying the verified remote grant section.
- This avoids local Supabase default grants drifting away from hosted grant state.

### Local Migration Validation

Docker:

- Docker Desktop verified accessible.

Local Supabase start:

- `npx supabase start` applied the baseline and push migration but initially failed the full service health check because analytics/vector/storage reported unhealthy.
- `npx supabase start --ignore-health-check` completed with local DB available; analytics/vector warnings remained local-service noise.

Fresh DB reset:

- `npx supabase db reset` completed successfully after the baseline privilege-normalization fix.
- Applied migration order:
  1. `20260812152900_prelaunch_current_schema_baseline_created_20260813.sql`
  2. `20260812153000_push_notification_delivery_tracking.sql`

Duplicate/dependency errors:

- none.

Local migration list after reset:

- `20260812152900`
- `20260812153000`

Focused local schema checks after reset:

- Stripe Tax fields present on `public.transactions`: 5/5.
- `idx_transactions_stripe_tax_calculation_id` present.
- Storage buckets present: `avatars:true`, `listings:true`, `message-images:false`.
- Storage `Phase D` object policies present: 7.
- Push delivery table present after push migration: `public.notification_push_deliveries`.
- Push cleanup RPC present after push migration: `public.remove_invalid_device_token_from_push_delivery(text)`.

### Remote vs Local Schema Comparison

Verified remote schema backup before push:

- public/private tables: 31
- public/private functions: 149
- public types: 15
- public indexes: 86
- public triggers: 58
- public policies: 53
- public RLS enable statements: 31
- public force RLS statements: 1

Fresh local schema after baseline plus pending push migration:

- public/private tables: 32
- public/private functions: 150
- public types: 15
- public indexes: 88
- public triggers: 59
- public policies: 53
- public RLS enable statements: 32
- public force RLS statements: 2

Meaningful differences:

- Expected push-migration delta: +1 table, +1 function, +2 indexes, +1 trigger, +1 RLS enable, +1 force RLS.
- Local dump includes local Supabase-managed `pg_net` extension output; this is not ReTail application schema.
- Optional remote advisor/platform extensions were excluded from the baseline as not required ReTail application schema.
- PostgreSQL dump output normalizes some equivalent RLS boolean expressions and grant ordering.
- No missing ReTail application table/function/type/index/trigger/policy was identified in the local baseline-plus-push dump.

Push baseline exclusion:

- `notification_push_deliveries`, `remove_invalid_device_token_from_push_delivery`, and `retail.trusted_push_token_cleanup` are absent from the baseline file.
- Those objects exist only in `20260812153000_push_notification_delivery_tracking.sql`.

### Remaining Remote Repair Plan

Do not run repair until Rachel explicitly approves the remote-history step.

The currently prepared local structure expects the later repair step to:

1. Mark `20260812152900` applied because the baseline represents current live schema.
2. Mark old pre-baseline remote history rows reverted because they are now archived and represented by the baseline.
3. Leave `20260812153000` unapplied/pending.
4. Run `supabase migration list --linked`.
5. Run `supabase db push --dry-run`.
6. Stop unless the dry-run shows only `20260812153000_push_notification_delivery_tracking.sql`.
