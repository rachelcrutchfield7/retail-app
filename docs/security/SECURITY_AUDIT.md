# ReTail Security Audit

Date: 2026-07-14
Scope: Repository and Supabase SQL analysis only
Status: Findings documented; no remediation applied

## 1. Executive Summary

ReTail has several strong foundations already in place: Supabase Row Level Security is enabled across the main tables, native mobile sessions use `expo-secure-store`, sign-out clears React Query cache data, client code rejects obvious secret Supabase keys, and the newer Sprint 5.5 SQL introduces important hardening for profile fields, rescue verification, messages, transactions, reports, and notifications.

The current codebase should not be considered ready for beta until the release-blocking database privacy and direct API issues are remediated or independently verified in the live Supabase project. The main concern is not the visible app UI. It is what an attacker can do by calling Supabase directly with the public client key and their own user token.

Recommended release decision: **Blocked from beta**

Highest-priority issue: public Supabase table access and older/fallback SQL paths can expose exact location, ZIP code, street address, rescue contact details, and system fields that the UI does not visibly show.

Finding counts:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 8 |
| Medium | 10 |
| Low | 5 |
| Informational | 5 |

## 2. Architecture Reviewed

Reviewed areas:

- Expo React Native app configuration and permissions.
- Supabase client configuration.
- Auth state, sign-in, sign-out, session persistence, and React Query cache behavior.
- Environment-variable handling and repository secret protections.
- Supabase database schema, policies, migrations, functions, triggers, grants, storage buckets, and realtime support.
- Services for listings, profiles, rescues, messaging, storage, notifications, transactions, reviews, reports, blocks, saved searches, account deletion, analytics, and settings.
- Dependency declarations and `pnpm audit --prod --json` advisory output.

Important limitation:

The audit reviewed repository files, not the live Supabase project state. The live database may or may not have every SQL file applied in the intended order. Several risks below depend on whether `supabase/sprint55_security_remediation.sql` is actually applied in production.

## 3. Critical Findings

No critical vulnerabilities were confirmed from repository analysis alone. This does not mean the application is vulnerability-free.

## 4. High Findings

### H-01: Public table policies can expose precise location and private profile data

Severity: High

Affected files or SQL objects:

- `supabase/policies.sql:66`
- `supabase/policies.sql:98`
- `supabase/distance.sql:260`
- `supabase/rescue_accounts.sql:108`
- `supabase/schema.sql:141`
- `supabase/schema.sql:226`
- `supabase/distance.sql:172`
- `supabase/rescue_accounts.sql:4`

Affected table, function, policy, or component:

- `profiles`
- `listings`
- `rescue_profiles`
- `Profiles are publicly readable`
- `Active listings are publicly readable`
- `Verified rescues are publicly readable`
- rescue table grants

Attack scenario:

An anonymous or authenticated attacker uses the public Supabase key to query exposed REST endpoints directly, requesting all columns from `profiles`, `listings`, or `rescue_profiles`. Table-level RLS limits rows but does not hide sensitive columns.

Likely impact:

The attacker may obtain ZIP codes, latitude, longitude, street addresses, rescue contact person details, EIN/501(c)(3) status fields, profile system flags, and exact listing or rescue locations. This conflicts with ReTail's privacy rule of showing city/state and approximate distance rather than precise location.

Evidence:

- Public profile read policy allows rows where `deleted_at is null and is_banned = false` in `supabase/policies.sql:66`.
- Public active listing read policy allows active listing rows in `supabase/policies.sql:98`.
- `profiles` includes `zip_code`, `latitude`, `longitude`, `is_admin`, `is_banned`, and `is_verified` in `supabase/schema.sql:141`.
- `listings` includes `zip_code`, `latitude`, `longitude`, and `ship_from_zip_code` in `supabase/schema.sql:226`.
- `rescue_profiles` includes `zip_code`, `address_line1`, `address_line2`, `latitude`, and `longitude` in `supabase/distance.sql:172`.
- Rescue expansion adds `contact_person`, `contact_email`, `contact_phone`, `has_501c3`, `ein`, and `verification_status` in `supabase/rescue_accounts.sql:4`.
- `supabase/rescue_accounts.sql:108` grants select on rescue tables to `anon` and `authenticated`.

Recommended remediation:

Replace public table reads with safe RPCs or security-invoker views that return only approved public fields. Revoke direct `anon` and broad `authenticated` select access from sensitive base tables where possible. If base-table access must remain, use column-level privileges and separate public/private profile tables. Do not expose exact coordinates, ZIP codes, address lines, admin flags, moderation flags, or rescue verification evidence through public tables.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

### H-02: Safe location RPCs exist, but fallback/direct query paths can still leak exact coordinates

Severity: High

Affected files or SQL objects:

- `src/services/listingService.ts:134`
- `src/services/listingService.ts:246`
- `src/services/listingService.ts:293`
- `src/services/rescueService.ts:334`
- `src/services/rescueService.ts:581`
- `supabase/distance.sql:321`
- `supabase/rescue_accounts.sql:119`
- `supabase/sprint55_security_remediation.sql:221`
- `supabase/sprint55_security_remediation.sql:1147`

Affected table, function, policy, or component:

- `get_nearby_listings`
- `get_public_listing_detail`
- `get_nearby_rescues`
- listing and rescue service fallback queries

Attack scenario:

If a safe RPC is missing, outdated, not applied, or unavailable, the app falls back to direct table selects. A direct API caller can also bypass the app and query base tables or older RPCs directly. Older rescue RPC definitions return precise ZIP, address, latitude, and longitude.

Likely impact:

Users and rescues can have their exact locations inferred or directly exposed. Distance responses can also be used as a location oracle if an attacker repeatedly queries from different origins.

Evidence:

- `getNearbyListings` falls back to direct `listings` select in `src/services/listingService.ts:134`.
- Client-side distance fallback reads `latitude` and `longitude` from listing rows in `src/services/listingService.ts:246`.
- Listing detail falls back to direct `listings` select if `get_public_listing_detail` does not return data in `src/services/listingService.ts:293`.
- Rescue hub loads verified rescues directly from `rescue_profiles` in `src/services/rescueService.ts:334`.
- Rescue result mapping can include `latitude`, `longitude`, address, and ZIP fields in `src/services/rescueService.ts:581`.
- Older rescue RPCs return ZIP, address, latitude, and longitude in `supabase/distance.sql:321` and `supabase/rescue_accounts.sql:119`.
- Sprint 5.5 introduces safer RPCs in `supabase/sprint55_security_remediation.sql:221`, but grants remain public in `supabase/sprint55_security_remediation.sql:1147`.

Recommended remediation:

Make safe RPCs the only public discovery path. Remove direct table fallbacks that depend on private columns. Confirm live PostgREST schema cache only exposes safe RPC definitions. Return rounded distance bands rather than precise distance when practical. Add automated tests that fail if public listing, profile, or rescue responses include `latitude`, `longitude`, `zip_code`, `address_line1`, `address_line2`, `ship_from_zip_code`, `contact_email`, `contact_phone`, or `ein`.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

### H-03: Listing owners can manipulate listing counters and system-managed fields through direct updates

Severity: High

Affected files or SQL objects:

- `supabase/policies.sql:113`
- `supabase/schema.sql:235`
- `supabase/schema.sql:256`
- `src/services/listingService.ts:486`

Affected table, function, policy, or component:

- `listings`
- `Users update their own listings`

Attack scenario:

An authenticated seller bypasses the UI and calls Supabase directly to update their listing row. The RLS policy checks row ownership but does not restrict which columns can change. The seller can modify fields that should be system-managed.

Likely impact:

A seller can inflate `favorite_count`, `message_count`, `view_count`, manipulate `published_at`, alter status transitions, or set values that make a listing appear more popular or trustworthy than it is.

Evidence:

- `Users update their own listings` allows owner updates in `supabase/policies.sql:113`.
- `listings` contains status and counters in `supabase/schema.sql:235` and `supabase/schema.sql:256`.
- The app service updates a curated payload in `src/services/listingService.ts:486`, but client code is not a security boundary.

Recommended remediation:

Add a `protect_listing_system_fields()` trigger that blocks non-admin updates to counters, `seller_id`, `published_at`, `created_at`, moderation status fields, and any other system-owned fields. Consider replacing broad direct listing updates with RPCs for seller-editable fields only.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

### H-04: Rescue verification and private rescue data are only safe if Sprint 5.5 hardening is applied

Severity: High

Affected files or SQL objects:

- `supabase/distance.sql:264`
- `supabase/rescue_accounts.sql:4`
- `supabase/rescue_accounts.sql:108`
- `supabase/sprint55_security_remediation.sql:55`
- `src/services/rescueService.ts:117`

Affected table, function, policy, or component:

- `rescue_profiles`
- `protect_rescue_verification_fields`
- rescue signup/update flow

Attack scenario:

If the older rescue policies are applied without Sprint 5.5, a rescue owner can manage their rescue profile row broadly. Because verification fields and sensitive organization fields live on the same table, a direct API caller may attempt to self-verify, alter verification state, or expose private organization details.

Likely impact:

Fake rescues could appear verified, donors could be misled, and private rescue contact or tax status details could be exposed through public reads.

Evidence:

- Older policy lets rescue owners manage profiles in `supabase/distance.sql:264`.
- Rescue expansion adds verification and private contact fields in `supabase/rescue_accounts.sql:4`.
- Rescue table select/insert/update/delete grants are broad in `supabase/rescue_accounts.sql:108`.
- Sprint 5.5 adds `protect_rescue_verification_fields()` in `supabase/sprint55_security_remediation.sql:55`.
- Client service upserts rescue profile data in `src/services/rescueService.ts:117`, but direct API requests can bypass client validation.

Recommended remediation:

Verify Sprint 5.5 is applied in the live database. Split rescue public profile data from private verification/application data, or enforce column-level grants. Restrict rescue owner updates to descriptive public fields only. Move verification approval to admin-only RPCs.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

### H-05: Transaction completion can target an arbitrary active buyer

Severity: High

Affected files or SQL objects:

- `supabase/sprint55_security_remediation.sql:843`
- `src/services/transactionService.ts:167`

Affected table, function, policy, or component:

- `complete_listing_transaction`
- `transactions`
- reviews eligibility

Attack scenario:

A seller calls `complete_listing_transaction` directly and supplies any active non-blocked user UUID as the buyer. The function verifies the seller owns the listing and the buyer account is active, but it does not require a conversation, accepted offer, buyer confirmation, or other evidence that the target buyer participated in the transaction.

Likely impact:

Sellers can fabricate completed transactions, trigger review eligibility, create unwanted notifications, or harass users by marking them as buyers/recipients.

Evidence:

- `complete_listing_transaction` checks listing ownership in `supabase/sprint55_security_remediation.sql:862`.
- It checks target buyer is not null, not self, active, and not blocked in `supabase/sprint55_security_remediation.sql:873`.
- It inserts a completed transaction using the supplied buyer in `supabase/sprint55_security_remediation.sql:901`.
- No check requires a conversation participant, accepted offer, or buyer confirmation.

Recommended remediation:

Require the buyer to be part of an existing conversation for the listing and require either buyer acceptance, accepted offer, or explicit buyer confirmation before creating a completed transaction. Add tests that direct RPC calls with unrelated user IDs fail.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

### H-06: Message image privacy can be bypassed with external image URLs

Severity: High

Affected files or SQL objects:

- `src/services/messageService.ts:157`
- `src/services/messageService.ts:106`
- `supabase/policies.sql:218`
- `supabase/storage.sql:65`

Affected table, function, policy, or component:

- `messages.image_url`
- `message-images` storage bucket
- `Conversation participants can send messages`

Attack scenario:

An authenticated conversation participant sends an image message with an arbitrary external `https://` URL instead of uploading to the private `message-images` bucket. The client service explicitly returns external URLs without upload, and direct API callers can insert arbitrary `image_url` values.

Likely impact:

Private message images may be hosted outside ReTail controls, can be tracking URLs, may remain accessible after message deletion, and are not protected by the `message-images` storage policies.

Evidence:

- `uploadMessageImage` returns any `http` URL directly in `src/services/messageService.ts:157`.
- `sendMessage` inserts `image_url` into `messages` in `src/services/messageService.ts:106`.
- Message insert policy validates participant status but not image URL origin in `supabase/policies.sql:218`.
- Private storage policy only protects objects actually stored in `message-images` in `supabase/storage.sql:65`.

Recommended remediation:

Require image messages to reference a storage object path owned by the `message-images` bucket. Add a database check or trigger to reject external URLs. Store storage path plus bucket rather than public/signed URL in `messages`. Generate signed URLs when reading messages.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

### H-07: Removed or abandoned listing images can remain publicly accessible

Severity: High

Affected files or SQL objects:

- `supabase/storage.sql:13`
- `supabase/storage.sql:48`
- `src/services/storageService.ts:21`
- `src/services/storageService.ts:88`

Affected table, function, policy, or component:

- `listings` storage bucket
- `listing_images`

Attack scenario:

An attacker keeps a listing image URL after a listing is archived, removed, or deleted. Because the `listings` bucket is public and the storage select policy does not check listing status, the object remains readable if it still exists.

Likely impact:

Images from removed listings, deleted listings, or abandoned uploads may remain publicly accessible by URL. This can expose home interiors, personal items, or location clues.

Evidence:

- `listings` bucket is public in `supabase/storage.sql:13`.
- Public listing storage read policy allows all objects in that bucket in `supabase/storage.sql:48`.
- The upload service accepts external URLs without upload in `src/services/storageService.ts:21`.
- Deletion depends on app-side cleanup in `src/services/storageService.ts:88`.

Recommended remediation:

Move listing media behind signed URLs or make public listing media use a status-aware serving RPC/Edge Function. Store object paths in the database and generate URLs only for active listings. Add cleanup jobs for archived/removed listing media and orphaned storage objects. Reject external listing image URLs.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

### H-08: Report and notification integrity depends on hardening SQL being applied

Severity: High

Affected files or SQL objects:

- `supabase/policies.sql:298`
- `supabase/policies.sql:333`
- `supabase/policies.sql:347`
- `supabase/schema.sql:438`
- `supabase/sprint55_security_remediation.sql:717`
- `supabase/sprint55_security_remediation.sql:919`
- `supabase/sprint55_security_remediation.sql:1082`

Affected table, function, policy, or component:

- `reports`
- `notifications`
- `submit_report`
- `create_user_notification`

Attack scenario:

If the base policies are live without Sprint 5.5, users can directly insert report rows with caller-controlled fields and can fabricate certain notification rows when relationship checks pass. Even with Sprint 5.5, live application order must be verified because the older broad policies remain in repository history.

Likely impact:

Moderation queues can contain untrusted status/evidence metadata, users can receive misleading notifications, and admin workflows may be polluted by forged records.

Evidence:

- Base report insert policy only checks `reporter_id` in `supabase/policies.sql:298`.
- Reports table includes status, evidence, assigned admin, admin notes, and resolution fields in `supabase/schema.sql:438`.
- Base notification insert policies allow client-created message and favorite notifications in `supabase/policies.sql:333` and `supabase/policies.sql:347`.
- Sprint 5.5 introduces `submit_report` in `supabase/sprint55_security_remediation.sql:717` and `create_user_notification` in `supabase/sprint55_security_remediation.sql:919`.
- Sprint 5.5 drops older user-created report and notification policies in `supabase/sprint55_security_remediation.sql:1082`.

Recommended remediation:

Verify the live database has only the hardened report and notification policies. Keep report and notification creation behind RPCs that set trusted fields server-side. Add database tests that direct table inserts are denied for non-admin users.

Blocks beta testing: Yes

Requires database changes: Yes

Requires independent penetration test: Yes

## 5. Medium Findings

### M-01: Message rate limiting is client/service-side and can be bypassed

Severity: Medium

Affected files or SQL objects:

- `src/services/messageService.ts:37`
- `supabase/policies.sql:373`
- `supabase/schema.sql:595`

Affected table, function, policy, or component:

- `messages`
- `rate_limit_events`
- `enforceRateLimit`

Attack scenario:

An authenticated user bypasses the app service and inserts messages directly through Supabase REST. The service counts recent messages, but the database does not enforce the 100 messages/hour rule.

Likely impact:

Spam, harassment, and notification abuse.

Evidence:

- Client service counts recent messages in `src/services/messageService.ts:37`.
- `rate_limit_events` exists in `supabase/schema.sql:595`.
- Policy allows event inserts in `supabase/policies.sql:373`, but no enforced rate-limit RPC or trigger was found.

Recommended remediation:

Move message sending behind a database RPC that records and enforces rate-limit events transactionally. Add limits for messages, reports, listings, account actions, and notification creation.

Blocks beta testing: Conditional. It blocks public beta; it may be acceptable only for a tiny controlled beta after H findings are fixed.

Requires database changes: Yes

Requires independent penetration test: Yes

### M-02: SECURITY DEFINER helper functions may be callable for arbitrary user IDs

Severity: Medium

Affected files or SQL objects:

- `supabase/schema.sql:165`
- `supabase/schema.sql:182`
- `supabase/realtime_messaging.sql:4`

Affected table, function, policy, or component:

- `is_admin`
- `is_account_active`
- `is_blocked_between`

Attack scenario:

An authenticated user calls helper functions directly with arbitrary UUIDs to enumerate whether a user is an admin, active, or blocked relative to another account.

Likely impact:

Information disclosure and a larger `SECURITY DEFINER` attack surface. This does not directly grant admin access, but these functions bypass ordinary RLS and should have minimal execute grants.

Evidence:

- `is_admin(user_id uuid default auth.uid())` is security definer in `supabase/schema.sql:165`.
- `is_account_active(user_id uuid default auth.uid())` is security definer in `supabase/schema.sql:182`.
- `is_blocked_between(first_user uuid, second_user uuid)` is security definer in `supabase/realtime_messaging.sql:4`.
- Sprint 5.5 revokes execute on several functions in `supabase/sprint55_security_remediation.sql:1129`, but these helper functions were not included in the observed revoke list.

Recommended remediation:

Revoke execute from `public`, `anon`, and broad `authenticated` on helper functions not intended for direct client calls. For policy helper functions, keep them callable by the database owner/policies but not exposed as public RPC endpoints. Avoid accepting arbitrary target user IDs unless necessary.

Blocks beta testing: No by itself, but should be fixed before public beta.

Requires database changes: Yes

Requires independent penetration test: Yes

### M-03: Base update policies for conversations, messages, transactions, and reviews are overbroad unless Sprint 5.5 is live

Severity: Medium

Affected files or SQL objects:

- `supabase/policies.sql:203`
- `supabase/policies.sql:230`
- `supabase/policies.sql:268`
- `supabase/policies.sql:293`
- `supabase/sprint55_security_remediation.sql:1034`

Affected table, function, policy, or component:

- `conversations`
- `messages`
- `transactions`
- `reviews`

Attack scenario:

If Sprint 5.5 has not been applied or was partially applied, authenticated participants may directly update rows that should only be updated through constrained RPCs or triggers.

Likely impact:

Conversation metadata, transaction status, and review comments or deletion fields could be manipulated beyond intended UI behavior.

Evidence:

- Base conversation participant update policy exists in `supabase/policies.sql:203`.
- Base message participant update policy exists in `supabase/policies.sql:230`.
- Base transaction participant update policy exists in `supabase/policies.sql:268`.
- Base review owner update policy exists in `supabase/policies.sql:293`.
- Sprint 5.5 drops several broad participant update policies in `supabase/sprint55_security_remediation.sql:1034`.

Recommended remediation:

Verify the live database has Sprint 5.5 policies and triggers applied. Keep direct updates denied for non-admins. Use RPCs for read receipts, soft-delete, transaction completion, and any review edit flow.

Blocks beta testing: Yes if Sprint 5.5 is not live; otherwise no.

Requires database changes: Yes

Requires independent penetration test: Yes

### M-04: Public distance endpoints can be used as a location oracle

Severity: Medium

Affected files or SQL objects:

- `supabase/sprint55_security_remediation.sql:345`
- `supabase/sprint55_security_remediation.sql:355`
- `supabase/rescue_accounts.sql:208`
- `supabase/distance.sql:380`

Affected table, function, policy, or component:

- `get_nearby_listings`
- `get_nearby_rescues`

Attack scenario:

An attacker calls public distance RPCs repeatedly from different supplied origins. Even if exact coordinates are not returned, the returned distance can be used to approximate a listing or rescue location.

Likely impact:

Approximate location privacy can degrade into precise location inference, especially in rural areas or with repeated queries.

Evidence:

- Sprint 5.5 listing RPC returns rounded distance in `supabase/sprint55_security_remediation.sql:345`.
- Radius is public and accepts caller-supplied origins in `supabase/sprint55_security_remediation.sql:355`.
- Older rescue RPCs return unrounded `st_distance` in `supabase/rescue_accounts.sql:208` and `supabase/distance.sql:380`.

Recommended remediation:

Return distance bands such as "under 1 mi", "1-5 mi", "5-10 mi", or round to a coarser level. Rate-limit anonymous distance queries. Consider requiring authentication for fine distance sorting.

Blocks beta testing: No if exact fields are removed first; yes if combined with H-01/H-02.

Requires database changes: Yes

Requires independent penetration test: Yes

### M-05: Privacy settings are not durable or enforced server-side

Severity: Medium

Affected files or SQL objects:

- `src/services/settingsService.ts:9`
- `src/services/settingsService.ts:41`

Affected table, function, policy, or component:

- Privacy settings service
- profile visibility behavior

Attack scenario:

A user changes privacy settings in the app and assumes those preferences restrict access. The current implementation stores privacy overrides in memory, so they do not survive refresh and do not affect database policies or public RPCs.

Likely impact:

Privacy expectations may not match actual exposure. This is especially sensitive for profile location and contact preferences.

Evidence:

- Privacy defaults and overrides are stored in module memory in `src/services/settingsService.ts:9`.
- `updatePrivacySettings` updates only the in-memory object in `src/services/settingsService.ts:41`.

Recommended remediation:

Persist privacy preferences to a dedicated table and enforce them in safe public RPCs. Do not show toggles that imply server-side privacy until the database honors them.

Blocks beta testing: Conditional. It blocks beta if privacy controls are visible to testers.

Requires database changes: Yes

Requires independent penetration test: No

### M-06: Account deletion has a client-side fallback that may leave deletion incomplete

Severity: Medium

Affected files or SQL objects:

- `src/services/accountService.ts:43`
- `supabase/sprint5_step2_trust_settings.sql:85`

Affected table, function, policy, or component:

- `delete_current_account`
- `profiles`
- `listings`
- account deletion service

Attack scenario:

If the `delete_current_account` RPC is missing or fails, the app attempts a client-side fallback update. Under hardened profile triggers, this fallback may fail or only partially remove user data.

Likely impact:

A user may believe an account was deleted when profile data, active listings, device tokens, or auth access remain in place.

Evidence:

- Account deletion service calls `delete_current_account` first in `src/services/accountService.ts:43`.
- It falls back to client-side profile/listing updates afterward in `src/services/accountService.ts:52`.
- The server-side deletion RPC is defined in `supabase/sprint5_step2_trust_settings.sql:85`.

Recommended remediation:

For production, require the server-side deletion RPC and fail safely if it is missing. Add a deletion verification step and admin audit event. Consider a separate process for actual Supabase Auth user deletion where appropriate.

Blocks beta testing: No, but it should be fixed before public beta.

Requires database changes: Possibly

Requires independent penetration test: No

### M-07: Auth metadata is used during account/profile creation

Severity: Medium

Affected files or SQL objects:

- `src/services/authService.ts:69`
- `src/services/supabaseData.ts:217`
- `supabase/sprint55_security_remediation.sql:20`

Affected table, function, policy, or component:

- Supabase `user_metadata`
- profile creation
- rescue profile bootstrap

Attack scenario:

User-editable Supabase metadata is used to seed profile and rescue information. If profile creation is delayed or retried, a malicious user may attempt to alter metadata before the app creates profile rows.

Likely impact:

Incorrect account type or rescue bootstrap data could be written during account setup. Sprint 5.5 profile triggers reduce the risk after profile creation, but the initialization path is still trust-sensitive.

Evidence:

- Signup stores `account_type` and rescue profile data in `user_metadata` in `src/services/authService.ts:69`.
- Profile creation reads metadata in `src/services/supabaseData.ts:217`.
- Sprint 5.5 protects profile system fields after creation in `supabase/sprint55_security_remediation.sql:20`.

Recommended remediation:

Use a server-side signup/profile creation function for trusted account type assignment. Treat `user_metadata` as display-only or untrusted input. Require admin approval for rescue verification regardless of metadata.

Blocks beta testing: No if Sprint 5.5 is live; otherwise conditional.

Requires database changes: Yes

Requires independent penetration test: No

### M-08: App Store privacy manifest appears incomplete for collected data and permissions

Severity: Medium

Affected files or SQL objects:

- `app.json:27`
- `app.json:31`
- `app.json:47`

Affected table, function, policy, or component:

- iOS privacy manifest
- app permissions
- legal/compliance readiness

Attack scenario:

The app collects or processes photos, location, user-generated content, contact information, device tokens, and messages, but the manifest currently lists only email address as collected data.

Likely impact:

App Store review risk and privacy compliance mismatch.

Evidence:

- Camera, photo library, and location usage descriptions are present in `app.json:27`.
- Privacy manifest lists only email address in `app.json:31`.
- Android permissions include camera, media images, coarse location, and notifications in `app.json:47`.

Recommended remediation:

Update the privacy manifest and store privacy labels to cover account identifiers, location, photos/media, user-generated content, messages, device tokens, diagnostics, and any analytics data actually sent to vendors.

Blocks beta testing: No for internal local testing; yes before TestFlight/App Store submission.

Requires database changes: No

Requires independent penetration test: No

### M-09: Moderate transitive dependency advisory is present

Severity: Medium

Affected files or SQL objects:

- `package.json`
- `pnpm-lock.yaml`

Affected table, function, policy, or component:

- `uuid` transitive dependency through Expo tooling

Attack scenario:

`pnpm audit --prod --json` reported GHSA-w5hq-g745-h8pq for `uuid` 7.0.3, a missing buffer bounds check in v3/v5/v6 when a buffer is provided.

Likely impact:

The reported vulnerable path appears to be through Expo/config tooling, not directly from ReTail application code. Risk is likely lower at runtime, but it should still be resolved or accepted with a documented rationale before release.

Evidence:

- Package audit reported one moderate advisory for `uuid` with vulnerable versions `<11.1.1`.
- Dependency paths include Expo tooling packages.

Recommended remediation:

Upgrade Expo dependencies when compatible, use package overrides only if Expo supports them, and rerun the audit. Document any accepted residual risk.

Blocks beta testing: No by itself.

Requires database changes: No

Requires independent penetration test: No

### M-10: Report RPC does not appear to verify message-report participation

Severity: Medium

Affected files or SQL objects:

- `supabase/sprint55_security_remediation.sql:717`

Affected table, function, policy, or component:

- `submit_report`
- `reports`
- `messages`

Attack scenario:

An authenticated user who knows or guesses a message UUID calls `submit_report` for a message they did not participate in. The function is security definer, so internal selects can bypass ordinary message RLS unless the function explicitly checks conversation participation.

Likely impact:

Moderation records could be created for messages unrelated to the reporter. UUID guessing is difficult, but leaked IDs or copied URLs could make this practical.

Evidence:

- `submit_report` is defined as a security definer function beginning at `supabase/sprint55_security_remediation.sql:717`.
- The function centralizes report creation, but no explicit message participant check was observed in the reviewed function body.

Recommended remediation:

For message reports, require the reporter to be a buyer or seller in the message's conversation. Add a database test where a nonparticipant tries to report a known message UUID and is denied.

Blocks beta testing: No by itself, but fix before public beta.

Requires database changes: Yes

Requires independent penetration test: Yes

## 6. Low Findings

### L-01: Secret scanner coverage is useful but narrow

Severity: Low

Affected files or SQL objects:

- `scripts/lint.mjs:7`

Affected table, function, policy, or component:

- repository lint script

Attack scenario:

A developer accidentally commits a secret format not covered by the current patterns.

Likely impact:

Credential leakage could be missed by local linting.

Evidence:

- Current secret patterns include service role markers, `sb_secret_`, `JWT_SECRET`, `DATABASE_URL`, private keys, and `sk_live_` in `scripts/lint.mjs:7`.

Recommended remediation:

Add more patterns for common publishable/secret confusion, Stripe test secret keys, Google API private files, Expo tokens, Sentry auth tokens, GitHub tokens, and Supabase service role variable names. Add a CI secret-scanning tool.

Blocks beta testing: No

Requires database changes: No

Requires independent penetration test: No

### L-02: Analytics, crash reporting, and notification integrations are still stub-like

Severity: Low

Affected files or SQL objects:

- `src/lib/analytics.ts`
- `src/lib/sentry.ts`
- `src/lib/notifications.ts`

Affected table, function, policy, or component:

- production monitoring
- incident response

Attack scenario:

Security or reliability incidents occur during beta, but the app does not send enough production telemetry to detect and triage them.

Likely impact:

Slower detection of auth errors, upload failures, messaging failures, and abuse patterns.

Evidence:

- Analytics and Sentry modules are currently local/in-memory wrappers rather than full vendor integration.

Recommended remediation:

Before public testing, enable production-grade monitoring with PII filtering. Ensure logs never include passwords, tokens, message bodies, report details, exact coordinates, or phone/email data unless explicitly required and protected.

Blocks beta testing: No for internal testing; conditional for broader beta.

Requires database changes: No

Requires independent penetration test: No

### L-03: Image metadata stripping and compression are not enforced server-side

Severity: Low

Affected files or SQL objects:

- `src/services/storageService.ts:32`
- `src/services/messageService.ts:167`
- `supabase/storage.sql:13`

Affected table, function, policy, or component:

- listing image uploads
- message image uploads
- storage buckets

Attack scenario:

Uploaded images may include EXIF metadata or be larger than expected until rejected by bucket limits.

Likely impact:

Potential privacy leakage through image metadata and inconsistent upload performance.

Evidence:

- Listing upload reads blobs and uploads them directly in `src/services/storageService.ts:32`.
- Message upload reads blobs and uploads them directly in `src/services/messageService.ts:167`.
- Storage buckets restrict MIME types and file size in `supabase/storage.sql:13`, but this does not strip metadata.

Recommended remediation:

Compress images and strip EXIF metadata before upload. Consider server-side validation or an Edge Function/image pipeline for final enforcement.

Blocks beta testing: No, but recommended before public launch.

Requires database changes: No

Requires independent penetration test: No

### L-04: Web sessions use localStorage

Severity: Low

Affected files or SQL objects:

- `src/lib/supabase.ts:39`

Affected table, function, policy, or component:

- web auth session storage

Attack scenario:

If the web app has an XSS vulnerability, localStorage-backed sessions can be stolen. Native mobile uses secure storage, but web preview/deployment uses localStorage.

Likely impact:

Account takeover in a compromised web context.

Evidence:

- Native React Native uses `expo-secure-store` in `src/lib/supabase.ts:34`.
- Web fallback uses `localStorage` in `src/lib/supabase.ts:39`.

Recommended remediation:

If ReTail web becomes public, add a dedicated web security review, strict CSP, dependency checks, and consider Supabase SSR/cookie-based auth for web. For mobile-only beta, document the web preview as non-production.

Blocks beta testing: No for native mobile beta.

Requires database changes: No

Requires independent penetration test: No

### L-05: React Query cache lifetime is infinite, though sign-out clears it

Severity: Low

Affected files or SQL objects:

- `src/lib/queryClient.ts:7`
- `src/auth/AuthContext.tsx:147`
- `src/auth/AuthContext.tsx:205`

Affected table, function, policy, or component:

- React Query cache
- auth state

Attack scenario:

In-memory cache persists for the life of the app process. Sign-out clears it, but crashes, hot reloads, or account switching edge cases should be tested.

Likely impact:

Low risk of stale UI data in edge cases, not confirmed cross-account leakage.

Evidence:

- Query `gcTime` is `Infinity` in `src/lib/queryClient.ts:7`.
- Auth state listener clears query data on sign-out in `src/auth/AuthContext.tsx:147`.
- Manual sign-out clears query data in `src/auth/AuthContext.tsx:205`.

Recommended remediation:

Keep the sign-out clearing behavior, add tests for account switching, and consider finite `gcTime` for sensitive query groups such as messages and notifications.

Blocks beta testing: No

Requires database changes: No

Requires independent penetration test: No

## 7. Informational Findings

### I-01: No committed private environment file was observed in tracked files

Severity: Informational

Affected files or SQL objects:

- `.gitignore:7`
- `.env.example:1`

Affected table, function, policy, or component:

- environment configuration

Attack scenario:

Private keys or local credentials could be accidentally committed if ignored files are not respected.

Likely impact:

Credential exposure.

Evidence:

- `.env`, `.env.local`, `.env.*.local`, signing credentials, and platform credential files are ignored in `.gitignore:7`.
- `.env.example` contains blank public variable names only in `.env.example:1`.

Recommended remediation:

Keep `.env.local` untracked. Add CI secret scanning before every merge.

Blocks beta testing: No

Requires database changes: No

Requires independent penetration test: No

### I-02: Client rejects obvious secret Supabase keys in public environment variables

Severity: Informational

Affected files or SQL objects:

- `src/constants/config.ts:32`
- `src/lib/supabase.ts:96`

Affected table, function, policy, or component:

- Supabase client config

Attack scenario:

A developer accidentally puts a secret Supabase key in `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Likely impact:

Reduced chance of privileged credential exposure in the app bundle.

Evidence:

- `isClientSafeSupabaseKey` blocks known secret patterns in `src/constants/config.ts:32`.
- Supabase client creation rejects unsafe keys in `src/lib/supabase.ts:96`.

Recommended remediation:

Keep this guard and expand scanner coverage. Do not rely on client-side checks as the only secret protection.

Blocks beta testing: No

Requires database changes: No

Requires independent penetration test: No

### I-03: Native session storage is stronger than web storage

Severity: Informational

Affected files or SQL objects:

- `src/lib/supabase.ts:34`
- `src/lib/supabase.ts:48`

Affected table, function, policy, or component:

- Supabase session persistence

Attack scenario:

Mobile device storage is inspected or backed up.

Likely impact:

Native session protection is improved by using secure storage rather than plain async storage.

Evidence:

- Native sessions use `expo-secure-store` in `src/lib/supabase.ts:34`.
- Keychain accessibility is set to `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` in `src/lib/supabase.ts:48`.

Recommended remediation:

Keep secure storage for native builds. For web, treat localStorage auth as a separate risk.

Blocks beta testing: No

Requires database changes: No

Requires independent penetration test: No

### I-04: RLS is enabled across core tables

Severity: Informational

Affected files or SQL objects:

- `supabase/policies.sql:1`

Affected table, function, policy, or component:

- Supabase database tables

Attack scenario:

If RLS were disabled, public keys could read or write large portions of the database.

Likely impact:

RLS is a necessary baseline control.

Evidence:

- RLS is enabled for core tables at the top of `supabase/policies.sql:1`.

Recommended remediation:

Keep RLS enabled and add tests that verify it remains enabled for every user-facing table.

Blocks beta testing: No

Requires database changes: No

Requires independent penetration test: No

### I-05: Sprint 5.5 hardening adds important controls but requires live verification

Severity: Informational

Affected files or SQL objects:

- `supabase/sprint55_security_remediation.sql:1`

Affected table, function, policy, or component:

- profile protection
- rescue verification protection
- safe public RPCs
- report and notification RPCs
- update policy tightening

Attack scenario:

The repository contains hardened SQL, but if the live project has not run it fully, the app may still rely on older weaker policies.

Likely impact:

Security posture may differ between repository intent and production reality.

Evidence:

- Sprint 5.5 states it tightens direct API writes and creates safe public discovery RPCs in `supabase/sprint55_security_remediation.sql:1`.

Recommended remediation:

Run a live database verification script that checks policies, grants, function definitions, trigger existence, and returned RPC columns.

Blocks beta testing: Yes until verified

Requires database changes: Possibly

Requires independent penetration test: Yes

## 8. Positive Security Controls Already Present

- RLS is enabled across core tables in `supabase/policies.sql`.
- Native mobile sessions use `expo-secure-store` in `src/lib/supabase.ts`.
- Sign-out clears React Query cache and auth state in `src/auth/AuthContext.tsx`.
- `.gitignore` excludes local env files and signing credential files.
- `.env.example` contains blank public variables rather than real secrets.
- Supabase client config rejects obvious secret key patterns.
- Sprint 5.5 SQL introduces safer public listing/profile/rescue RPCs.
- Sprint 5.5 SQL protects profile system fields and rescue verification fields.
- Sprint 5.5 SQL moves reports and notifications toward server-controlled RPCs.
- Message storage bucket is private by default.
- Duplicate report constraints exist in `supabase/report_uniqueness.sql`.
- Package versions are pinned rather than using `latest` or `*`.

## 9. Unknowns That Could Not Be Verified

- Whether every Supabase SQL file has been applied to the live project in the intended order.
- Whether the live database grants allow direct table access beyond what repository SQL suggests.
- Whether the live PostgREST schema cache has old RPC signatures or old policies still active.
- Whether Supabase Auth settings require email verification and strong password rules in the dashboard.
- Whether Storage bucket public/private settings in the live dashboard match `supabase/storage.sql`.
- Whether Realtime authorization is enabled and behaving correctly in the live project.
- Whether push notification credentials, Sentry, PostHog, and Stripe settings are configured safely outside the repository.
- Whether any local `.env.local` values are safe; the file is intentionally ignored and was not copied into the audit.
- Whether mobile app build artifacts contain unexpected secrets.
- Whether EAS, GitHub, and Supabase dashboard account permissions are least privilege.

## 10. Recommended Release Decision

Release decision: **Blocked from beta**

Reason:

ReTail should not enter beta until the public data exposure issues are fixed or verified impossible in the live Supabase project. The app handles exact user, listing, and rescue location data. The current repository contains policies, grants, older RPCs, and direct fallback paths that can expose sensitive columns or allow trust data manipulation through direct API calls.

Minimum security gate before controlled beta:

1. Verify the live database has Sprint 5.5 hardening applied.
2. Remove or lock down public direct table access to sensitive columns.
3. Remove exact location/address fields from all public APIs.
4. Add database tests for direct Supabase calls, not only UI flows.
5. Confirm listing counters, rescue verification, transactions, reports, and notifications cannot be manipulated by direct API calls.
6. Confirm message images and removed listing images cannot bypass intended storage privacy.
7. Rerun dependency audit after package updates or document accepted risks.
