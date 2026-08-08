# ReTail Authorization Matrix

Date: 2026-08-08

This matrix captures the intended backend authorization model audited during pre-launch hardening. It is a regression reference, not a product spec for new features.

Legend:

- ALLOW: permitted by RLS/RPC/storage policy
- DENY: blocked server-side
- CONDITIONAL: permitted only when the listed relationship/state is true

| Resource / Action | Anonymous | Owner | Other User | Rescue Owner | Admin |
| --- | --- | --- | --- | --- | --- |
| Listings: public feed/detail | ALLOW active public rows | ALLOW own and public | ALLOW public rows | ALLOW public rows | ALLOW |
| Listings: create | DENY | ALLOW active account | DENY | ALLOW active rescue account if using normal listing flow | ALLOW |
| Listings: edit | DENY | ALLOW own unlocked listing | DENY | ALLOW own listing | ALLOW through admin policy/admin flow |
| Listings: delete/archive/status | DENY | ALLOW own eligible listing | DENY | ALLOW own eligible listing | ALLOW through admin/moderation flow |
| Listing images: public read | ALLOW for active public listing | ALLOW | ALLOW for active public listing | ALLOW | ALLOW |
| Listing images: upload/update/delete | DENY | CONDITIONAL path starts with owner id and listing belongs to owner | DENY | CONDITIONAL own listing | ALLOW through service/admin storage paths only |
| Profiles: public read | ALLOW public profile RPC only | ALLOW own row | ALLOW public fields only | ALLOW public fields only | ALLOW |
| Profiles: edit | DENY | ALLOW own mutable fields | DENY | ALLOW own mutable fields | ALLOW |
| Profiles: privileged fields | DENY | DENY `is_admin`, `is_banned`, `is_verified`, `account_type`, counters, coordinates, deletion fields | DENY | DENY | ALLOW admin-controlled paths |
| Conversations: read | DENY | CONDITIONAL participant | DENY | CONDITIONAL participant | ALLOW |
| Conversations: create | DENY | CONDITIONAL buyer/initiator, active target, not blocked | DENY | CONDITIONAL buyer/initiator, active target, not blocked | ALLOW for admin report-message context |
| Messages: read | DENY | CONDITIONAL conversation participant | DENY | CONDITIONAL conversation participant | ALLOW |
| Messages: send | DENY | CONDITIONAL participant, active, not blocked, valid body/attachment | DENY | CONDITIONAL participant, active, not blocked | ALLOW through admin/report path where intended |
| Messages: soft delete | DENY | ALLOW sender only | DENY | ALLOW sender only | ALLOW through moderation path |
| Blocks: manage | DENY | ALLOW own blocker relationship | DENY | ALLOW own blocker relationship | ALLOW read/admin where intended |
| Reports: submit | DENY | CONDITIONAL valid target, not self, participant for message reports | CONDITIONAL valid target and not self | CONDITIONAL valid target | ALLOW |
| Reports: read/admin notes/status | DENY | DENY except own report RPC if exposed | DENY | DENY | ALLOW |
| Reports: moderate/delete target | DENY | DENY | DENY | DENY | ALLOW server-side admin RPC only |
| Reviews: public read | ALLOW non-deleted reviews/summary | ALLOW | ALLOW | ALLOW | ALLOW |
| Reviews: create | DENY | CONDITIONAL transaction participant and not duplicate/self | DENY | CONDITIONAL transaction participant | ALLOW only through valid transaction flow |
| Transactions: read | DENY | CONDITIONAL buyer/seller participant | DENY | CONDITIONAL buyer/seller participant | ALLOW |
| Transactions: complete | DENY | CONDITIONAL seller-owned listing and valid buyer/outcome | DENY | CONDITIONAL seller-owned listing | ALLOW if admin-supported separately |
| Rescue profiles: public read | ALLOW verified active rescue public fields | ALLOW own private row | ALLOW verified active public fields | ALLOW own private row and public fields | ALLOW |
| Rescue profiles: create/update | DENY | DENY unless account type rescue | DENY | ALLOW own descriptive fields only | ALLOW |
| Rescue verification | DENY | DENY | DENY | DENY self-verification | ALLOW `admin_set_rescue_verification` |
| Rescue needs: public read | ALLOW active needs for verified rescues | ALLOW public rows | ALLOW public rows | ALLOW own/private management | ALLOW |
| Rescue needs: create/update/delete | DENY | DENY unless owning rescue | DENY | ALLOW own rescue needs | ALLOW |
| Rescue wishlist: public read | ALLOW active items for verified rescues | ALLOW public rows | ALLOW public rows | ALLOW own/private management | ALLOW |
| Rescue wishlist: create/update/delete | DENY | DENY unless owning rescue | DENY | ALLOW own rescue wishlist | ALLOW |
| Notifications: read | DENY | ALLOW own unread/non-deleted notifications | DENY | ALLOW own | ALLOW if admin policy/function exists |
| Notifications: write | DENY | CONDITIONAL validated event notification only | DENY arbitrary target | CONDITIONAL validated event notification only | ALLOW system/admin notifications |
| Notification preferences | DENY | ALLOW own through RPC | DENY | ALLOW own through RPC | ALLOW via service/admin if required |
| Device tokens | DENY | ALLOW register/remove own token through RPC | DENY | ALLOW own token through RPC | ALLOW service role |
| Consent history: read | DENY | ALLOW own rows | DENY | ALLOW own rows | ALLOW service/admin if needed |
| Consent history: write | DENY | CONDITIONAL append-only RPC using `auth.uid()` | DENY | CONDITIONAL own append-only RPC | ALLOW service/admin if needed |
| Marketing preference | DENY | ALLOW own append-only preference event | DENY | ALLOW own append-only preference event | ALLOW service/admin if needed |
| Privacy settings | DENY | ALLOW own settings | DENY | ALLOW own settings | ALLOW read/admin where intended |
| Avatar storage | DENY for writes | CONDITIONAL path starts with own id and image MIME | DENY writes | CONDITIONAL own path | ALLOW service role |
| Message-image storage | DENY | CONDITIONAL participant/uploader path and not blocked | DENY | CONDITIONAL participant/uploader path and not blocked | ALLOW service role |

## Key Server-Side Principles

- Admin status must be verified from database state via `private.is_admin()` or equivalent, never from hidden UI.
- User ownership must derive from `auth.uid()`.
- User-supplied `user_id`, `owner_id`, `seller_id`, `buyer_id`, admin id, and verification status values are not trusted for privileged decisions.
- Message and conversation authorization must check participant relationships server-side.
- Storage object authorization must validate both path owner and underlying domain object ownership/participation.
- Public RPCs may be anonymous only when their returned columns are deliberately public.
