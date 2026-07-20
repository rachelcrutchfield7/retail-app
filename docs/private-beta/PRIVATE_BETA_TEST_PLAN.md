# Private Beta Test Plan

Date: 2026-07-19

Use disposable beta accounts and beta listings only.

For every scenario, testers should record:

```text
Result:
Tester notes:
Device:
App version:
```

## Account

| Scenario | Prerequisites | Steps | Expected Result | Severity If Failed |
| --- | --- | --- | --- | --- |
| Sign up | Fresh email | Create regular account | Account is created and verify-email flow appears | High |
| Rescue sign up | Rescue test data | Create rescue account | Rescue profile captures organization details and awaits approval | High |
| Sign in | Existing beta account | Sign in with email/password | User reaches marketplace | High |
| Sign out | Signed in | Sign out from settings | Private data clears and welcome/auth state appears | High |
| Reset password | Existing account | Request reset | App shows non-enumerating confirmation | Medium |
| Edit profile | Signed in | Change display name, website, address, avatar | Profile updates persist | Medium |
| Delete account | Disposable account | Complete delete flow | Account is anonymized/disabled and cannot mutate data | High |

## Listings

| Scenario | Prerequisites | Steps | Expected Result | Severity If Failed |
| --- | --- | --- | --- | --- |
| Create listing | Signed in | Add photo, title, price/free, category, condition, city/state, getting options | Listing appears in feed | High |
| Edit listing | Own listing | Change title/details/options | Updated listing persists | Medium |
| Add images | Own listing | Upload valid images | Images appear and cover image remains stable | Medium |
| Archive listing | Own active listing | Archive from owner actions | Listing leaves public active feed | Medium |
| Mark sold/donated | Own listing | Complete status action | Status updates and review path appears where eligible | High |

## Marketplace

| Scenario | Prerequisites | Steps | Expected Result | Severity If Failed |
| --- | --- | --- | --- | --- |
| Browse | Any user | Open Home | Listings load or clear empty/error state appears | High |
| Search | Listings exist | Search keyword and category | Results match filters | Medium |
| Location filter | Location permission/manual area | Adjust distance | Results sort/filter by approximate distance | Medium |
| Favorite | Signed in, not own listing | Save and unsave listing | Favorite persists after refresh | Medium |
| Saved search | Signed in | Save search and adjust alert | Saved search persists | Medium |

## Messaging

| Scenario | Prerequisites | Steps | Expected Result | Severity If Failed |
| --- | --- | --- | --- | --- |
| Start conversation | Buyer and seller accounts | Buyer messages seller | Conversation opens once, no duplicate thread | High |
| Send text | Conversation exists | Send message | Message appears for both participants | High |
| Send image | Conversation exists | Attach valid image | Participant can view, unrelated account cannot | High |
| Make offer | Paid listing | Buyer sends offer | Seller sees accept/decline/counter controls | Medium |
| Block/unblock | Conversation exists | Block then unblock user | Block prevents new messages while preserving history | High |
| Report message | Conversation exists | Report unsafe message | Report is submitted without exposing report data to other user | High |

## Trust

| Scenario | Prerequisites | Steps | Expected Result | Severity If Failed |
| --- | --- | --- | --- | --- |
| Review buyer/seller | Completed transaction | Submit star rating/comment | One review is created and duplicates are blocked | Medium |
| Report listing/user | Unsafe disposable listing/user | Submit report | Admin report panel receives it | High |
| Notifications | Trigger message/favorite/review | Open notification center | Notification appears and can be marked read | Medium |
| Preferences | Signed in | Change notification/privacy settings | Settings persist | Medium |

## Account Switching

| Scenario | Prerequisites | Steps | Expected Result | Severity If Failed |
| --- | --- | --- | --- | --- |
| Switch A to B | Two accounts on same device | Sign out A, sign in B | A's messages, profile, notifications, and cache are gone | High |
