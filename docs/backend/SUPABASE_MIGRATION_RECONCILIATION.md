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
