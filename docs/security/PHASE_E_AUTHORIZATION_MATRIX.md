# Phase E Authorization Matrix

Date: 2026-07-19
Branch: `security-phase-e`
Migration: `20260719120708_phase_e_transactions_reviews_reports_notifications_security.sql`

## Summary

Phase E moves high-trust marketplace operations from direct client table writes to controlled authenticated RPCs and trusted database triggers.

## Table Access

| Table | Anonymous | Authenticated User | Admin | Writes |
| --- | --- | --- | --- | --- |
| `transactions` | No access | Select only when buyer or seller | Select all through RLS | RPC only |
| `reviews` | Public select of non-deleted reviews | Public select of non-deleted reviews | Public select | `create_transaction_review` only |
| `reports` | No access | No base-table reporter read | Admin select | `submit_report`; current Admin Panel moderation uses `admin_moderate_report` |
| `report_moderation_events` | No access | No access | Select only | Created by canonical admin moderation flow |
| `notifications` | No access | Select own non-deleted notifications | Own select by policy | Trusted database logic and read/delete RPCs |
| `notification_preferences` | No access | RPC only | RPC only for own user | `update_my_notification_preferences` only |
| `device_tokens` | No access | RPC only | RPC only for own user | `register_my_device_token` and `remove_my_device_token` only |

## Public RPCs

| RPC | Role | Purpose |
| --- | --- | --- |
| `complete_listing_transaction` | `authenticated` | Seller completes an active listing, with optional linked buyer |
| `create_transaction_review` | `authenticated` | Buyer or seller reviews the other transaction participant |
| `get_user_review_summary` | `anon`, `authenticated` | Calculates authoritative review totals |
| `has_existing_report` | `authenticated` | Returns only whether the caller already has an active report |
| `submit_report` | `authenticated` | Creates a server-derived report |
| `get_my_reports` | `authenticated` | Reporter-safe report history |
| `admin_moderate_report` | `authenticated` | Canonical Admin Panel report moderation and actions |
| `mark_notification_read` | `authenticated` | Marks one owned notification read |
| `mark_all_notifications_read` | `authenticated` | Marks caller notifications read |
| `delete_my_notification` | `authenticated` | Soft-deletes one owned notification |
| `get_my_notification_preferences` | `authenticated` | Returns caller preferences or defaults |
| `update_my_notification_preferences` | `authenticated` | Updates caller preferences |
| `register_my_device_token` | `authenticated` | Registers or transfers one device token |
| `remove_my_device_token` | `authenticated` | Removes caller ownership of one token |

## Internal Helpers

`private.create_notification_for_event` and `private.notification_preference_allows` are internal helpers. They use fixed search paths, fully qualified objects, and no client execution grants.

## Removed Paths

The Phase E migration removes the generic `create_user_notification` function and drops legacy direct-write policies for transactions, reviews, reports, notifications, notification preferences, and device tokens.
