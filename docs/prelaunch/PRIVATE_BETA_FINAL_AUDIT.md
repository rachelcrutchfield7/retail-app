# ReTail Private Beta Final Security + Release Audit

Date: 2026-08-10

Starting commit: `7af203321426ed933322915908196fa152a0c7c4`

This audit reviewed the current private-beta code and live Supabase metadata for readiness to send ReTail to a small Wave 1 group of external testers. It did not change app runtime code, database objects, Edge Functions, Stripe configuration, dependencies, production data, or EAS build configuration.

## 2026-08-11 Pre-Build Consolidation Update

Current branch: `codex/easypost-shipping-checkout`

Current baseline commit before consolidation: `14b715fea8d44f6659fefda03fdb846c1d3e873d`

This update verified the current app/backend state for the next Rachel-only beta candidate build, excluding EasyPost provider activation. The beta baseline has no unfinished EasyPost runtime implementation.

### Verification Summary

- Messages: focused static/service coverage passed. Conversation hydration now uses the canonical listing-detail path and falls back gracefully if listing enrichment fails.
- Login policy popup: removed. Returning users are not wrapped in the login-time policy gate.
- Signup consent: email and Google signup still enforce required Terms / Community Guidelines / Privacy consent; marketing remains optional and unchecked by default.
- My Listings: current client path uses `get_my_listings`.
- Admin panel: current client path uses canonical `admin_moderate_report`.
- Support cases: support case tables/RPCs are present in the live normal ReTail backend.
- Stripe Connect payout setup: app opens the canonical backend, validates Stripe-hosted onboarding/dashboard URLs, prevents duplicate launches, and handles return/refresh callbacks.
- Checkout UI: current UI reflects the final product direction that protected checkout stays on ReTail for shipped orders and local pickup; off-platform payment CTAs are absent.
- Expo/dependency health: `npx expo install --check` reported dependencies up to date using the local offline dependency map; `npx expo-doctor` passed 20/20.
- Typecheck, lint, deprecated backend usage check, and working-tree secret scan passed.

### EasyPost Status

EasyPost remains **PENDING EXTERNAL ACCOUNT VERIFICATION**.

Rachel is waiting for EasyPost account verification/API-key access. This update did not deploy EasyPost Edge Functions, add EasyPost secrets, create EasyPost webhooks, run live rate tests, buy labels, or apply EasyPost migrations to the normal ReTail backend.

### Seller Payout Publish Guard

Status: **LIVE / VERIFIED**.

Normal ReTail Supabase project `ycwgsdigvpmprqreoqiz` has the expected Wave 1 policy/support and Stripe foundation migrations through `20260810173611_product_policy_transaction_support`, plus `20260811103000_seller_payout_publish_guard`.

Live rollback-only synthetic verification confirmed:

- Sellers without payout readiness cannot publish paid sale listings.
- Payout-ready sellers can publish paid sale listings.
- Local-pickup paid listings still require payout readiness.
- Rescue physical-goods donation needs are not blocked by seller payout requirements.
- Buyer checkout rechecks seller payout readiness and blocks payout-ineligible sellers before payment intent creation.

No synthetic users/listings from this verification remained after rollback.

## Executive Summary

ReTail is suitable for a small, closely monitored Wave 1 private beta after normal pre-build configuration validation. No P0 blockers were found in the inspected areas, and no P1 issue remains for the current beta baseline.

The highest remaining items are not layout or app-start blockers. They are controlled operational/security hardening items:

- Current non-v2 public rescue RPCs used by the app do not expose private physical addresses, but the unused public v2 rescue RPCs can return physical address fields for rescues marked as physical locations. This needs an explicit product/privacy decision before adopting v2 broadly.
- Supabase Auth leaked password protection is disabled and should be enabled in the Dashboard before a wider public launch.
- Supabase advisor warnings remain for extension-managed objects, intentionally RPC-only tables, SECURITY DEFINER RPCs, and performance tuning. These should be tracked, not blindly fixed before beta.

## Environment Safety

Intended architecture verified from repository configuration:

- General beta preview: `EXPO_PUBLIC_APP_ENV=beta`, normal ReTail Supabase backend, existing beta users/listings/messages/rescues, Stripe payments disabled or beta-safe.
- Payments test: ReTail Payments Test Supabase project `jqzaxzylijbwjdzoqsen`, Stripe test mode, synthetic payment testing.
- Production: normal ReTail Supabase project `ycwgsdigvpmprqreoqiz`, Stripe live mode.

Safety controls found:

- `src/constants/config.ts` rejects release-like builds using local, placeholder, public website, or unapproved Supabase URLs.
- Beta builds with Stripe payments enabled must use the approved payments-test Supabase URL and a `pk_test_` Stripe publishable key.
- Beta builds with Stripe payments disabled must use the approved production ReTail Supabase URL.
- Production builds must use the approved production ReTail Supabase URL and a live Stripe publishable key when payments are enabled.
- `scripts/validate-beta-build-config.mjs` runs during `eas-build-pre-install` and validates preview build Supabase URL/key safety.
- `eas.json` keeps preview as internal APK distribution and production as app-bundle distribution.

Local shell variables were not treated as the source of truth for EAS secrets. No full credential values were printed or recorded.

## Secret Exposure

`pnpm security:secrets` passed.

Repository searches found only placeholders, secret-name references, scripts, documentation, and server-side Edge Function environment reads. No client-side `sk_*`, `whsec_*`, Supabase service-role key, database password, private key, Cloudflare token, Google client secret, or Stripe webhook secret was found in active client code.

Client-side secret exposure: none found.

## Auth

The app uses Supabase Auth with email/password and Google sign-in. Current startup config validation prevents release-like builds from silently running against unsafe Supabase URLs or server-only credentials.

Recent consent flow requirements appear represented in code and backend RPCs:

- Required Terms / Community Guidelines / Privacy acceptance is mandatory.
- Marketing email consent is optional and defaults false.
- Consent state is persisted through `user_consents` and RPCs instead of only local checkbox state.

No P0 auth blocker was found.

## RLS

Live production RLS check confirmed RLS enabled on reviewed user-data and operational tables, including:

- `profiles`
- `listings`
- `listing_images`
- `messages`
- `conversations`
- `reports`
- `notifications`
- `favorites`
- `reviews`
- `rescue_profiles`
- `rescue_needs`
- `rescue_wishlist_items`
- `user_consents`
- `notification_preferences`
- `device_tokens`
- `transactions`
- `transaction_payment_events`
- `stripe_webhook_events`

Advisor-reported RLS-enabled/no-policy tables:

- `device_tokens`
- `marketplace_search_areas`
- `notification_preferences`
- `rate_limit_events`
- `stripe_webhook_events`

Audit interpretation:

- These appear consistent with RPC-only, service-role, or internal/server-managed access patterns.
- They should not receive direct policies merely to silence the advisor.
- No table containing user data was identified with RLS unexpectedly disabled, excluding extension-managed `spatial_ref_sys`.

## Admin

Canonical admin moderation RPC: `admin_moderate_report`.

Findings:

- Current active client service code calls `admin_moderate_report`.
- Deprecated admin RPCs `admin_update_report` and `admin_update_report_phase_f_base` remain in the database for compatibility, but active client/service code is guarded against using them.
- `admin_moderate_report` is SECURITY DEFINER, authenticated executable, and uses server-side admin authorization through `private.is_admin`.
- `private.is_admin` requires `is_admin=true`, `is_banned=false`, and `deleted_at is null`, so banned/deleted admins are blocked server-side.
- Admin actions do not require a service-role credential in the mobile client.

No P0 admin blocker was found.

## Reports

Report-related checks:

- `submit_report` is authenticated and uses server-side auth/account checks.
- Normal report submission does not grant direct moderation-field control.
- Admin moderation uses the canonical `admin_moderate_report` RPC.
- Report storage remains RLS protected.

No P0 report blocker was found.

## Messaging

Messaging checks:

- `create_or_get_conversation` uses `private.require_active_account()`, validates listing/rescue context, prevents self-message, checks blocked relationships, and applies rate limiting.
- `send_message` is authenticated and server-side authorization controlled.
- Conversation membership is enforced through private helper functions and RLS policies.
- `soft_delete_own_message` is authenticated and scoped to the caller.
- Message images are in a private Storage bucket with participant-based read policies.

No P0 messaging blocker was found.

## Listings

Listing checks:

- `get_my_listings` derives the owner from `private.require_active_account()` and filters `l.seller_id = caller_id`.
- It does not accept a client-provided user ID that could retrieve another user's private listings.
- Listing mutation RPCs use authenticated server-side identity and active-account checks.
- Deprecated backend usage guard prevents active client/service code from reintroducing deprecated admin report RPCs.

No P0 listing blocker was found.

## Storage / Photos

Storage buckets reviewed:

| Bucket | Public | Limit | MIME types |
| --- | --- | --- | --- |
| `avatars` | yes | 10 MB | `image/jpeg`, `image/png`, `image/webp` |
| `listings` | yes | 10 MB | `image/jpeg`, `image/png`, `image/webp` |
| `message-images` | no | 10 MB | `image/jpeg`, `image/png`, `image/webp` |

Policy checks:

- Listing image paths require the first path segment to match `auth.uid()` and the second path segment to match an owned, non-deleted listing.
- Avatar paths are scoped to the authenticated user's folder.
- Message image reads require conversation participation.
- Message image uploads require valid path structure, active account, conversation participation, and no blocked relationship.
- Storage policies restrict image extensions to jpg/jpeg/png/webp.

Current listing photo implementation remains compatible with the aligned Expo dependencies:

- `ImageUploader.tsx` uses Image Picker asset URIs for native listing photos and does not request Base64 for that flow.
- `localImageFile.ts` uses Expo File APIs for native file/content URIs and ArrayBuffer upload bodies for listing photos.
- Legacy data URIs are decoded locally instead of being passed to native fetch.
- `storageService.ts` uploads listing image binary data as ArrayBuffer.

No P0 photo/storage blocker was found.

## Consent / Privacy

Consent checks:

- Required policy consent is enforced separately from marketing consent.
- Marketing consent is optional, unchecked by default, and does not block signup.
- Consent records are server-persisted through `user_consents`.
- `user_consents` has RLS enabled and owner-scoped access.
- Marketing preference changes are recorded as consent events rather than silently rewriting history.

Public profile/listing RPC review did not identify exposure of private email, phone, Stripe account IDs, consent state, device tokens, payment IDs, or deleted/private messages in the current app-facing public RPCs.

No P0 consent/privacy blocker was found.

## Rescues

Current non-v2 rescue RPCs used by the app:

- `get_public_rescue_feed`
- `get_public_rescue_by_owner`

These currently return public rescue profile fields such as name, slug, summary, city/state, website URL, public contact hint, verification flag, needs/wishlist summaries, and distance band. They do not expose private physical address fields or internal verification data.

Important medium finding:

- Public v2 rescue RPCs `get_public_rescue_feed_v2` and `get_public_rescue_by_owner_v2` are not used by current client code, but are callable and can return physical address fields for rescues marked as physical locations. This may be intended, but it needs a clear product/privacy decision before v2 adoption.

## Stripe

No Stripe business logic was changed.

Current backend architecture:

- Payment creation occurs in authenticated Edge Function `stripe-create-payment-intent`.
- Stripe secret key is read server-side from Edge Function environment.
- Stripe webhook function verifies Stripe signatures with `STRIPE_WEBHOOK_SECRET`.
- Webhook replay/idempotency protection exists through `stripe_webhook_events` and claim/mark RPCs.
- Mobile app uses Stripe publishable key only.

General beta safety:

- Beta runtime config rejects live payments unless explicitly configured.
- If beta payments are enabled, config requires the payments-test Supabase backend and a `pk_test_` publishable key.
- If beta payments are disabled, config requires the normal ReTail Supabase backend.

No P0 Stripe beta blocker was found from repository configuration. Before a payment-testing build, use the isolated payments-test build path, not the normal general beta build.

## Edge Functions

Live production Supabase Edge Functions reviewed:

| Name | Auth required | Purpose | Publicly invokable | Risk |
| --- | --- | --- | --- | --- |
| `delete-account` | JWT required | Authenticated account deletion | no | Low, server-side auth and service role isolated to function |
| `send-notification` | Internal secret or authenticated request | Notification email delivery | yes | Medium operational; verify `RETAIL_NOTIFICATION_WEBHOOK_SECRET` remains configured |
| `stripe-create-payment-intent` | JWT required | Create checkout PaymentIntent | no | Low/medium, payment-sensitive but server-side authenticated |
| `stripe-connect-account` | JWT required | Create/connect seller Stripe account | no | Low/medium, server-side authenticated |
| `stripe-account-status` | JWT required | Read seller Connect status | no | Low |
| `stripe-connect-login-link` | JWT required | Create seller dashboard login link | no | Low/medium |
| `stripe-webhook` | Stripe signature required | Stripe event ingestion | yes | Low/medium, intentionally public but signature-verified |

Webhook/public functions:

- `stripe-webhook` is intentionally unauthenticated by Supabase JWT and validates Stripe signatures.
- `send-notification` is intentionally callable for trusted backend automation and verifies either an internal notification secret or a valid authenticated request.
- No service-role/server secret was found returned to clients.

No P0 Edge Function blocker was found.

## Supabase Advisors

Security advisor summary:

- Leaked Password Protection disabled: P2 medium manual Dashboard hardening.
- RLS enabled with no direct policies on several RPC/internal tables: informational/low, likely intentional.
- PostGIS/citext extension-in-public and `spatial_ref_sys` RLS warning: low, extension-management issue.
- SECURITY DEFINER executable warnings on public discovery RPCs and authenticated RPCs: mostly intentional, but continue reviewing privileged RPCs before public launch.
- Public rescue v2 physical-address exposure: P2 medium product/privacy decision before adopting v2.

Performance advisor summary:

- Missing indexes on several foreign keys, including listing reservation and report/review relationships.
- RLS initplan optimization suggestions for policies using `auth.uid()`.
- Multiple permissive policy warnings on several public/user tables.
- Unused index warnings should be deferred until representative beta usage exists.

No performance advisor finding should be blindly fixed before Wave 1 unless it becomes a measurable beta issue.

## Expo / Native Dependencies

Recently aligned packages inspected:

- `@stripe/stripe-react-native` `^0.64.0`
- `expo-file-system` `~57.0.2`
- `expo-image-picker` `~57.0.8`
- `expo-notifications` `~57.0.9`
- `react-native` `0.86.2`

API compatibility checks:

- Stripe PaymentSheet APIs used by ReTail are present in installed `@stripe/stripe-react-native` typings.
- Expo File APIs used by listing photo upload are present in installed `expo-file-system`.
- Expo Image Picker APIs/options used by listing upload are present in installed `expo-image-picker`.

Required checks:

- `npx expo-doctor`: pass, 20/20 checks.
- `npx expo install --check`: pass, dependencies up to date.
- `pnpm typecheck`: pass.
- `pnpm lint`: pass.
- `pnpm check:deprecated-backend`: pass.

No Expo/native P0 blocker was found.

## Release Configuration

Configuration reviewed:

- App name: ReTail.
- Scheme: `retail`.
- Android package: `com.raecrutchfield.retail`.
- iOS bundle identifier: `com.raecrutchfield.retail`.
- Preview EAS profile: internal distribution, APK, auto-increment, beta app environment.
- Production EAS profile: app-bundle, production app environment.
- Deep links: `retailpetapp.com` and `www.retailpetapp.com`.
- Android permissions: camera, media images, approximate location, push notifications.
- iOS permissions: camera, photo library, approximate location.

No dev-only bundle/package identifier was found in release config. No version/build change was made.

## Crash / Startup / Error Audit

Startup guardrails reviewed:

- Release-like builds validate Supabase URL safety.
- Missing Supabase configuration is detected.
- Server-only Supabase credentials are rejected from public/client configuration.
- Stripe mode is validated when payments are enabled.

No current recurring beta-crash evidence was identified from repository/static inspection. Live log review was not performed in this audit beyond Supabase metadata/advisors.

## Known Technical Debt

P3 or post-beta cleanup candidates:

- Deprecated admin RPCs remain deployed for compatibility but are no longer active client targets.
- Rescue v2 RPC adoption/deprecation needs a separate data-contract decision.
- Supabase performance advisor warnings should be handled in focused database-performance work.
- PostGIS/citext extension warnings should be reviewed separately, not mixed into Wave 1 beta stabilization.
- Leaked password protection should be enabled manually before wider launch.
- General beta EAS variables should be confirmed through the normal pre-build validator immediately before any release build.

## Wave 1 Blockers

P0 blockers found: none.

P1 high findings for current beta baseline: none.

Required before sending a build to Wave 1 testers:

- Run the normal pre-build validation in the same EAS profile that will be built.
- Confirm whether the build is a general beta build or an isolated payments-test build.
- Do not mix payments-test Supabase with general beta unless the goal is specifically Stripe test-mode payment validation.

## Post-Beta Items

Recommended during or after Wave 1:

- Decide whether public rescue physical addresses are intended and then either adopt or retire the rescue v2 RPCs.
- Enable Supabase leaked password protection manually in the Dashboard.
- Add performance indexes for report/review/reservation foreign keys after confirming workload.
- Optimize RLS policies using Supabase's recommended `(select auth.uid())` pattern in a focused performance task.
- Consolidate duplicate permissive RLS policies only after proving equivalent behavior.
- Plan a forward-only cleanup migration for deprecated backend objects after beta stability.
- Continue monitoring Edge Function logs for notification delivery and Stripe webhook failures.
