# ReTail Beta Freeze Rules

## Status

ReTail is in founder-preview stabilization before small-group beta testing.

The approved mobile presentation is frozen.

Golden Expo build:

94d61284

Golden Git reference:

golden-layout-94d61284

## Core rule

Feature and bug-fix work must preserve the approved ReTail mobile layout unless Rachel explicitly requests a visual change.

A feature request is NOT permission to redesign surrounding UI.

## Frozen global presentation

The following may not be changed incidentally:

- Global spacing
- Screen padding
- Typography
- Font sizing
- Font weight
- Color palette
- Button dimensions
- Card dimensions
- Listing-card geometry
- Bottom-navigation geometry
- Header geometry
- Border radii
- Shadows
- Safe-area handling
- Screen wrappers
- Responsive layout rules
- Grid/list sizing
- Keyboard layout behavior
- Theme architecture

## Feature-work rule

When implementing a feature:

1. Use the existing UI.
2. Modify the minimum number of files.
3. Prefer local changes over global component changes.
4. Do not modify reusable UI components unless the task explicitly targets them.
5. Do not refactor unrelated code.
6. Do not perform cleanup outside the requested scope.
7. Do not redesign the surrounding screen.
8. Do not change theme tokens to make one feature fit.
9. Do not alter navigation unless navigation is explicitly part of the task.

## Protected-file rule

Protected UI files may not be changed unless:

- Rachel explicitly requested a change to that component or screen; or
- The task cannot function without the modification.

If a protected file appears necessary but was not explicitly authorized:

STOP before editing it.

Report:

- the file
- why it appears necessary
- the exact proposed change
- whether an alternative exists

## Golden-layout rule

Expo build 94d61284 is the canonical visual reference.

When uncertain about layout, compare against:

golden-layout-94d61284

Do not guess.

Do not recreate the layout from memory.

## Beta change policy

Until small-group beta begins, permitted work should primarily be:

- Crash fixes
- Broken authentication
- Broken navigation
- Incorrect data
- Broken payments
- Broken messaging
- Safety or moderation issues
- Serious layout regressions
- App Store / Google Play blockers

Avoid unrelated feature additions and broad refactors during stabilization.

## Build approval rule

A Codex task must not automatically become the next approved beta build.

Required sequence:

Code change
-> Tests
-> Diff review
-> Protected-file check
-> Rachel-only Expo preview
-> Rachel approval
-> Merge into beta release candidate

## Scope rule

One feature or bug should normally equal one branch.

Examples:

feature/google-sign-in
fix/settings-loading
fix/rescue-counts
fix/android-back-navigation

Do not combine unrelated work into one task.

## Current priority

Stability is more important than architectural elegance.

A small, isolated fix is preferable to a broad refactor.
