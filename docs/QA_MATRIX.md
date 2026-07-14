# ReTail Manual QA Matrix

Do not mark a row as passed until it has been run on the named platform or device.

| Area | Platform / Device | Test Steps | Expected Result | Actual Result | Status | Bug |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication | iPhone small screen | Register, verify email, sign in, sign out | Account works and session persists | Not run | Not run | |
| Authentication | Android small screen | Wrong password then correct password | Friendly error, then successful sign-in | Not run | Not run | |
| Listings | iPhone large screen | Create sale, free, and donation listings | Listings persist after refresh | Not run | Not run | |
| Listings | Android large screen | Upload multiple images and edit listing | Images and edits persist | Not run | Not run | |
| Search | Web desktop | Keyword search and category filter | Accurate filtered results or empty state | Not run | Not run | |
| Search | Web narrow viewport | Long listing title and empty results | Text wraps cleanly, no overlap | Not run | Not run | |
| Favorites | Existing account | Favorite, unfavorite, refresh | State persists and is user-specific | Not run | Not run | |
| Messaging | Two regular accounts | Start conversation and send both directions | Realtime messages and unread badges update | Not run | Not run | |
| Blocking | Blocked-user pair | Block, attempt message, unblock | Messaging disabled then restored | Not run | Not run | |
| Transactions | Seller and buyer | Mark sold to buyer | Completed transaction creates review eligibility | Not run | Not run | |
| Reviews | Seller and buyer | Review both directions, try duplicate | Ratings persist, duplicate rejected | Not run | Not run | |
| Notifications | Existing account | Favorite, message, review, mark all read | Correct notification and unread behavior | Not run | Not run | |
| Reports | Regular account | Report listing, user, and message | Confirmation shown; duplicate prevented | Not run | Not run | |
| Rescue Hub | Rescue account | Edit profile, wishlist, urgent needs | Approved rescue appears with needs | Not run | Not run | |
| Accessibility | Large text | Browse, listing details, settings | Content remains usable with large text | Not run | Not run | |
| Network | Offline state | Browse cached content, try mutation | Offline banner appears; unsafe action fails clearly | Not run | Not run | |
| Account | Disposable account | Delete account | Profile anonymized and active listings archived | Not run | Not run | |
