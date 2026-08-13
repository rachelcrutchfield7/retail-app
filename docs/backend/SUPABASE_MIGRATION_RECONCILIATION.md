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
