# Accepted Differences From Golden Layout

Golden reference:

golden-layout-94d61284

Only differences explicitly approved by Rachel belong here.

## Authentication modal

Allowed difference:

Continue with Google button.

- File: `src/components/feedback/AuthModal.tsx`

Visual rule:

The original modal dimensions, email fields, typography, and global button styles remain unchanged.

## Rescue Hub

Allowed difference:

Rescue cards may open public rescue profiles and active rescue listings.

- File: `src/screens/RescueHubScreen.tsx`
- File: `src/sprint4/Sprint4App.tsx`

Visual rule:

Existing Rescue Hub card presentation remains unchanged.

## Messaging

Allowed difference:

Keyboard-safe behavior may differ where necessary to keep messages and composer visible.

- File: `src/components/messaging/MessageInput.tsx`

Visual rule:

Bubble style and general presentation remain unchanged.

## Android navigation

Allowed difference:

Android system back-button behavior may be added without changing visible navigation.

- File: `src/AppShell.tsx`

Visual rule:

Visible navigation remains unchanged.

## Listing photo permissions

Allowed difference:

Android may show a native photo-access alert when permission is denied.

- File: `src/components/forms/ImageUploader.tsx`

Visual rule:

The listing form and image-uploader presentation remain unchanged.

## Listing submission and owner confirmations

Allowed difference:

Listing submission may lock while an upload is active, and destructive owner actions may use an on-screen confirmation modal.

- File: `src/sprint3/Sprint3App.tsx`

Visual rule:

This exception is limited to preventing duplicate submissions and keeping confirmations visible. It does not authorize changes to listing-card, listing-detail, form, or navigation geometry.

## Rescue donation labels

Allowed difference:

Donation listings may use the approved Rescue Donation label.

- File: `src/components/marketplace/PriceTag.tsx`

Visual rule:

Price-tag dimensions, typography, and placement remain unchanged.

## Distance Filter

- Allowed difference: Distance title remains readable in dark mode.
- File: `src/components/location/DistanceFilter.tsx`
- Visual rule: This exception is limited to dark-mode readability and does not authorize changes to Distance filter dimensions, spacing, layout, controls, or general presentation.

## Signup consent and marketing preference

Allowed difference:

Account creation may include the required policy-acceptance checkbox and the separate optional marketing-email checkbox. Authenticated accounts without current acceptance may see the one-time Finish Setting Up ReTail gate. Settings may include the Marketing emails toggle.

- File: `src/components/feedback/AuthModal.tsx`
- File: `src/sprint3/Sprint3App.tsx`
- File: `src/sprint4/Sprint4App.tsx`
- File: `src/AppShell.tsx`

Visual rule:

This exception is limited to the requested account/compliance controls and gate. It does not authorize changes to authentication fields, marketplace presentation, profile presentation, navigation, global controls, spacing, typography, or theme.
