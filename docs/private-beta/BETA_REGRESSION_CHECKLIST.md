# ReTail Beta Regression Checklist

Run this before approving a new Android preview build for external beta testers.

## Mobile Layout

- Open the app at a 360-390px phone width.
- Home, Search/Browse, Favorites, Sell/Create Listing, Profile, Settings, Messages, Conversation, Listing Detail, Rescue Hub, and Rescue Profile fit without horizontal scrolling.
- Bottom navigation stays compact and fully visible.
- Headers do not overlap screen content.
- Primary buttons are readable and not cut off.
- Listing cards, action buttons, and rescue cards stay inside the viewport.
- Keyboard stays usable in create-listing forms and conversations.
- Dark mode remains readable.

## Rescue Hub

- Home Rescue Hub counts come from the live Rescue Hub data source.
- Home does not show fake rescue or urgent-need counts when live data is empty.
- Home shows a clean loading state while rescue counts load.
- Home shows a small fallback if rescue counts fail.
- Rescue Hub loads the same live rescue data as the Home banner.
- Rescue cards open public rescue profile pages.
- Rescue Profile shows only public rescue fields.
- Rescue Profile includes urgent needs, wishlist items, public website/instructions when available, and verified status.
- Rescue Profile includes a `Message rescue` action.
- Signed-out users see a sign-in prompt before messaging.
- Signed-in users see a helpful unavailable message if no valid public messaging route exists.
- Android back from Rescue Profile returns to Rescue Hub.

## Listings

- Sale listing actions are readable and aligned.
- Free listing actions are readable and do not show Stripe checkout.
- Rescue donation listing actions are readable and do not show Stripe checkout.
- Current user's own listing shows owner tools, not buyer checkout.
- Sold, donated, archived, or removed listings do not show active buyer actions.
- Report Listing is visually secondary and not confused with checkout.
- Buttons do not overflow in light or dark mode.

## Settings

- Settings opens for signed-in users.
- Settings does not hang forever on failed requests.
- Recoverable settings errors show an error state with retry.
- Signed-out Settings path shows a sign-in/account message instead of crashing.
- Appearance controls support System, Light, and Dark.
- Notification, privacy/safety, blocked accounts, legal/safety, support/about content remain visible where supported.

## Android Back Button

- Android back from Listing Detail returns to the previous list/page.
- Android back from Rescue Profile returns to Rescue Hub.
- Android back from Conversation returns to Messages.
- Android back from Settings returns to Profile.
- Android back from modal/report flows closes or backs out safely.
- Android back from root tab screens uses the normal Android behavior.
- Repeated back presses do not crash or log the user out.

## Smoke Checks

- App starts successfully.
- Auth/login still works.
- Home loads.
- Search/Browse loads.
- Listing creation still works.
- Listing detail opens.
- Favorites still work.
- Messages still work with keyboard open.
- Listing and message reports still work.
- Admin panel still loads for admin accounts.
- Rescue Hub still loads.
- Stripe remains safely disabled when not configured.
