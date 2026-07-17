# Phase C Protected Field Matrix

This matrix defines read/write ownership for protected ReTail tables after Phase C.

Write role legend:

- Owner RPC: authenticated owner through a controlled RPC.
- Lifecycle RPC: authenticated listing owner through a dedicated status/action RPC.
- Admin RPC: authenticated admin through a controlled RPC.
- System: database default, trigger, audit process, or future trusted server function.
- None: never client writable.

## Profiles

| Column | Classification | Read Roles | Write Roles | Approved Mutation Path | Reason | Test Coverage |
|---|---|---|---|---|---|---|
| `id` | System identity | Owner, admin, public profile RPC | System | `create_my_profile` derives `auth.uid()` | Prevent account impersonation | Phase C migration/test |
| `account_type` | Account role | Owner, admin, public profile RPC | System | `create_my_profile` only | Controls regular/rescue UX | Phase C migration/test |
| `display_name` | Public profile content | Owner, admin, public profile RPC | Owner RPC | `update_my_profile` | User-facing name | Phase C migration/test |
| `username` | Public profile content | Owner, admin, public profile RPC | Owner RPC | `update_my_profile` | Public identity handle | Phase C migration/test |
| `bio` | Public profile content | Owner, admin, public profile RPC | Owner RPC | `update_my_profile` | User-controlled profile copy | Phase C migration/test |
| `avatar_url` | Public profile content | Owner, admin, public profile RPC | Owner RPC | `update_my_profile` after avatar upload | User-controlled profile photo | Phase C migration/test |
| `city` | Coarse public location | Owner, admin, public profile RPC when allowed | Owner RPC | `update_my_profile` | City-level marketplace context | Phase B/C tests |
| `state` | Coarse public location | Owner, admin, public profile RPC when allowed | Owner RPC | `update_my_profile` | State-level marketplace context | Phase B/C tests |
| `zip_code` | Private location | Owner, admin | Owner RPC | `update_my_profile` | Needed for user settings, not public display | Phase B/C tests |
| `latitude` | Protected exact location | Admin/internal only | None | No client path | Avoid exact home-location exposure | Phase B/C tests |
| `longitude` | Protected exact location | Admin/internal only | None | No client path | Avoid exact home-location exposure | Phase B/C tests |
| `buyer_rating` | System reputation | Owner, admin, public profile RPC | System | Review/transaction logic only | Prevent forged trust scores | Phase C migration/test |
| `seller_rating` | System reputation | Owner, admin, public profile RPC | System | Review/transaction logic only | Prevent forged trust scores | Phase C migration/test |
| `review_count` | System counter | Owner, admin, public profile RPC | System | Review trigger/function only | Prevent forged review counts | Phase C migration/test |
| `listings_count` | System counter | Owner, admin, public profile RPC | System | Listing count trigger/function only | Prevent forged marketplace stats | Phase C migration/test |
| `completed_sales_count` | System counter | Owner, admin, public profile RPC | System | Transaction logic only | Prevent forged sales history | Phase C migration/test |
| `is_verified` | Trust/admin state | Owner, admin, public profile RPC | Admin RPC/future trusted flow | No owner write path | Prevent fake verification | Phase C migration/test |
| `is_admin` | Admin privilege | Owner row, admin | Admin-only trusted process | No client owner path | Prevent privilege escalation | Phase C migration/test |
| `is_banned` | Moderation state | Owner row, admin | Admin-only trusted process | No client owner path | Prevent bypassing moderation | Phase C migration/test |
| `created_at` | System timestamp | Owner, admin, public profile RPC | System | Database default | Audit integrity | Phase C migration/test |
| `updated_at` | System timestamp | Owner, admin | System | `set_updated_at` trigger | Audit integrity | Phase C migration/test |
| `deleted_at` | Lifecycle/moderation | Owner row, admin | System/admin trusted flow | `delete_current_account` | Preserve deletion/audit semantics | Phase C migration/test |

## Listings

| Column | Classification | Read Roles | Write Roles | Approved Mutation Path | Reason | Test Coverage |
|---|---|---|---|---|---|---|
| `id` | System identity | Owner, admin, public listing RPC | System | Database default | Prevent row spoofing | Phase C migration/test |
| `seller_id` | Ownership | Owner, admin, public listing RPC | System | `create_listing` derives `auth.uid()` | Prevent listing reassignment | Phase C migration/test |
| `category_id` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Seller-selected category | Phase C migration/test |
| `title` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Marketplace display | Phase C migration/test |
| `description` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Marketplace display | Phase C migration/test |
| `price` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Sale/free/donation display | Phase C migration/test |
| `listing_type` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Sale/free/donation mode | Phase C migration/test |
| `condition` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Item quality filter | Phase C migration/test |
| `status` | Listing lifecycle | Owner, admin, public listing RPC | Lifecycle RPC | `archive_my_listing`, `delete_my_listing`, `mark_my_listing_sold`, `mark_my_listing_donated` | Prevent forged lifecycle transitions | Phase C migration/test |
| `brand` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Optional item detail | Phase C migration/test |
| `city` | Coarse public location | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Local marketplace discovery | Phase B/C tests |
| `state` | Coarse public location | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Local marketplace discovery | Phase B/C tests |
| `zip_code` | Private location | Owner, admin | Owner RPC | `create_listing`, `update_my_listing` | Used for coarse search-area derivation | Phase B/C tests |
| `latitude` | Protected exact location | Admin/internal only | None | No client path | Avoid exact item-location exposure | Phase B/C tests |
| `longitude` | Protected exact location | Admin/internal only | None | No client path | Avoid exact item-location exposure | Phase B/C tests |
| `pickup_available` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Buyer coordination | Phase C migration/test |
| `shipping_available` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Buyer coordination | Phase C migration/test |
| `view_count` | System counter | Owner, admin, public listing RPC | System | Future trusted view tracking | Prevent popularity spoofing | Phase C migration/test |
| `favorite_count` | System counter | Owner, admin, public listing RPC | System | Favorite trigger/function | Prevent popularity spoofing | Phase C migration/test |
| `message_count` | System counter | Owner, admin, public listing RPC | System | Message trigger/function | Prevent engagement spoofing | Phase C migration/test |
| `published_at` | System timestamp | Owner, admin, public listing RPC | System | Database default/trusted publish flow | Sort/audit integrity | Phase C migration/test |
| `created_at` | System timestamp | Owner, admin, public listing RPC | System | Database default | Audit integrity | Phase C migration/test |
| `updated_at` | System timestamp | Owner, admin | System | `set_updated_at` trigger | Audit integrity | Phase C migration/test |
| `deleted_at` | Lifecycle/moderation | Owner, admin | Lifecycle RPC/admin trusted flow | `delete_my_listing` | Preserve moderation/audit semantics | Phase C migration/test |
| `location_point` | Protected exact/coarse geometry | Admin/internal only | System | Location sync trigger only | Prevent coordinate leakage/manipulation | Phase B/C tests |
| `porch_pickup_available` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Buyer coordination | Phase C migration/test |
| `meetup_available` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Buyer coordination | Phase C migration/test |
| `item_dimensions` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Shipping/fit detail | Phase C migration/test |
| `pet_size` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Fit detail | Phase C migration/test |
| `condition_notes` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Item quality detail | Phase C migration/test |
| `availability_notes` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Pickup/meetup detail | Phase C migration/test |
| `reason_for_listing` | Listing content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Seller context | Phase C migration/test |
| `safety_confirmed` | Seller attestation | Owner, admin | Owner RPC | `create_listing`, `update_my_listing` | Marketplace safety acknowledgement | Phase C migration/test |
| `shipping_payer` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Shipping expectation | Phase C migration/test |
| `shipping_cost_estimate` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Shipping estimate | Phase C migration/test |
| `handling_time` | Fulfillment content | Owner, admin, public listing RPC | Owner RPC | `create_listing`, `update_my_listing` | Shipping expectation | Phase C migration/test |
| `ship_from_zip_code` | Private location | Owner, admin | Owner RPC | `create_listing`, `update_my_listing` | Shipping estimate only, not public | Phase B/C tests |
| `search_area_id` | Server-derived coarse area | Admin/internal only | System | Search-area trigger only | Prevent distance manipulation | Phase B.2/C tests |

## Rescue Profiles

| Column | Classification | Read Roles | Write Roles | Approved Mutation Path | Reason | Test Coverage |
|---|---|---|---|---|---|---|
| `id` | System identity | Owner, admin, public rescue RPC | System | Database default | Prevent row spoofing | Phase C migration/test |
| `owner_id` | Ownership | Owner, admin | System | `update_my_rescue_profile` derives `auth.uid()` | Prevent rescue reassignment | Phase C migration/test |
| `name` | Rescue public content | Owner, admin, public rescue RPC | Owner RPC | `update_my_rescue_profile` | Public organization name | Phase C migration/test |
| `slug` | System/public identifier | Owner, admin, public rescue RPC | System | `update_my_rescue_profile` derives slug | Prevent routing/identity spoofing | Phase C migration/test |
| `summary` | Rescue public content | Owner, admin, public rescue RPC | Owner RPC | `update_my_rescue_profile` | Public rescue description | Phase C migration/test |
| `city` | Coarse public location | Owner, admin, public rescue RPC | Owner RPC | `update_my_rescue_profile` | Rescue discovery | Phase B/C tests |
| `state` | Coarse public location | Owner, admin, public rescue RPC | Owner RPC | `update_my_rescue_profile` | Rescue discovery | Phase B/C tests |
| `zip_code` | Private location | Owner, admin | Owner RPC | `update_my_rescue_profile` | Coarse search-area derivation | Phase B/C tests |
| `latitude` | Protected exact location | Admin/internal only | None | No client path | Avoid exact location exposure | Phase B/C tests |
| `longitude` | Protected exact location | Admin/internal only | None | No client path | Avoid exact location exposure | Phase B/C tests |
| `location_point` | Protected exact/coarse geometry | Admin/internal only | System | Location sync trigger only | Prevent coordinate leakage/manipulation | Phase B/C tests |
| `website_url` | Rescue public content | Owner, admin, public rescue RPC | Owner RPC | `update_my_rescue_profile` | Public organization website | Phase C migration/test |
| `contact_hint` | Rescue public content | Owner, admin, public rescue RPC | Owner RPC | `update_my_rescue_profile` | Donation coordination instructions | Phase C migration/test |
| `is_verified` | Trust/admin state | Owner, admin, public rescue RPC | Admin RPC | `admin_set_rescue_verification` | Prevent fake verification | Phase C migration/test |
| `is_active` | Moderation state | Owner, admin, public rescue RPC | Admin RPC | `admin_set_rescue_verification` / future moderation | Prevent bypassing moderation | Phase C migration/test |
| `created_at` | System timestamp | Owner, admin, public rescue RPC | System | Database default | Audit integrity | Phase C migration/test |
| `updated_at` | System timestamp | Owner, admin | System | `set_updated_at` trigger | Audit integrity | Phase C migration/test |
| `deleted_at` | Lifecycle/moderation | Owner, admin | Admin/system trusted flow | Future rescue deletion/moderation RPC | Preserve audit semantics | Phase C migration/test |
| `animals_rescued` | Rescue public content | Owner, admin, public rescue RPC | Owner RPC | `update_my_rescue_profile` | Public rescue focus | Phase C migration/test |
| `contact_person` | Private contact data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Verification/admin contact only | Phase B/C tests |
| `contact_email` | Private contact data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Verification/admin contact only | Phase B/C tests |
| `contact_phone` | Private contact data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Verification/admin contact only | Phase B/C tests |
| `organization_type` | Rescue profile data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Foster/physical/hybrid classification | Phase C migration/test |
| `has_501c3` | Private verification data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Verification context, not public | Phase B/C tests |
| `ein` | Sensitive verification data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Verification context, not public | Phase B/C tests |
| `verification_status` | Admin workflow state | Owner, admin | Admin RPC | `admin_set_rescue_verification` | Prevent self-approval | Phase C migration/test |
| `address_line1` | Private address data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Donation/admin context, not public discovery | Phase B/C tests |
| `address_line2` | Private address data | Owner, admin | Owner RPC | `update_my_rescue_profile` | Donation/admin context, not public discovery | Phase B/C tests |
| `search_area_id` | Server-derived coarse area | Admin/internal only | System | Search-area trigger only | Prevent distance manipulation | Phase B.2/C tests |
