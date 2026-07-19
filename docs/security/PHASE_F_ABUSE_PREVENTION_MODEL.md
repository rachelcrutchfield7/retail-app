# Phase F Abuse Prevention Model

Date: 2026-07-19

## Purpose

Phase F adds simple, explainable abuse controls to ReTail without introducing an opaque moderation classifier.

## Message Controls

Message writes are checked in the database before insert.

The database rejects:

- blank text messages
- repeated identical text in the same conversation within the duplicate guard window
- messages with excessive links
- messages with unsupported link schemes such as `javascript:`, `data:`, `file:`, or `vbscript:`
- suspicious control characters
- image-message bursts over the configured image limit

Message duplicate detection stores only a normalized hash, never the raw body.

## Offer Controls

Offers continue to use structured message payloads, but list previews and notifications must display friendly ReTail offer copy rather than raw `RETAIL_OFFER::...` payload text.

Repeated identical offer payloads are covered by the same duplicate guard as regular text messages.

## Notification Amplification Controls

Notifications are still created by server-owned functions and triggers.

Phase F specifically prevents favorite toggling from producing repeated historical notifications by using a deterministic favorite dedupe key based on the listing and favoriting user.

Saved-search notifications already use deterministic dedupe keys based on the saved search and listing.

## Public Search Controls

Public discovery functions now validate request shape before executing:

- page numbers must be positive and bounded
- page size cannot exceed 50
- search text cannot exceed 80 characters
- wildcard-only search strings are rejected

Nearby functions remain authenticated-only and use the caller's saved coarse marketplace search area.

## Account-State Controls

State-changing paths call `private.require_active_account()` either directly or through Phase F triggers. Banned, deleted, or inactive accounts receive the stable marker `RETAIL_ACCOUNT_NOT_ACTIVE`.

## Operational Notes

These controls are intentionally conservative. If beta testers hit limits during normal use, adjust thresholds through a new reviewed migration rather than disabling database enforcement.
