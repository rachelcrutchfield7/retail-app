# Phase D Storage Model

Date: 2026-07-19

## Goals

Phase D storage hardening prevents:

- arbitrary external image URLs in messages
- private message image leakage
- broad avatar/listing object enumeration
- listing image path spoofing
- silent accumulation of removed listing images without a cleanup record

## Buckets

| Bucket | Public | File Limit | Allowed Types | Purpose |
| --- | --- | --- | --- | --- |
| `avatars` | Yes | 10 MB | JPEG, PNG, WEBP | Public profile images |
| `listings` | Yes | 10 MB | JPEG, PNG, WEBP | Public listing images |
| `message-images` | No | 10 MB | JPEG, PNG, WEBP | Private conversation attachments |

Public buckets may still serve a known object URL. They no longer have broad public database `select` policies for object enumeration.

## Message Attachments

New message image records store:

- `attachment_bucket`
- `attachment_path`
- `attachment_mime_type`
- `attachment_size_bytes`
- `attachment_width`
- `attachment_height`

They do not store:

- external URLs
- signed URLs
- `http:` or `https:` attachment values
- arbitrary `data:` or `javascript:` values

Allowed message image path:

```text
<conversation_id>/<auth.uid()>/<random_uuid>.<jpg|jpeg|png|webp>
```

The upload policy verifies:

- user is authenticated and active
- first path segment is a valid conversation
- second path segment equals `auth.uid()`
- user participates in the conversation
- neither participant has blocked the other
- extension is allowed
- MIME type is constrained by the bucket

Read access verifies:

- bucket is `message-images`
- caller is an active conversation participant
- path matches the expected conversation/uploader pattern
- object is referenced by a non-deleted message row

Read access does not reject historical attachments merely because participants later blocked each other. Blocking prevents new uploads, replacements, and messages, but existing image evidence remains readable to participants.

Delete/update access is limited to the uploader path.

Phase D.1 adds a canonical attachment path helper and validates the uploaded object against `storage.objects` before message creation:

- object bucket is `message-images`
- object path exactly matches the submitted path
- object owner is the sender
- object MIME type matches the submitted MIME type
- object size matches the submitted size
- object size is positive and within the bucket limit

## Application Behavior

Upload flow:

1. User chooses a local image.
2. App uploads to `message-images`.
3. App sends only private attachment metadata to `send_message`.
4. Database validates the storage object and creates the message.

Read flow:

1. App reads participant-scoped messages.
2. If a message has private attachment metadata, the app requests a short-lived signed URL.
3. The signed URL is used only for display.
4. The signed URL is not stored or logged.

Legacy behavior:

- Existing `messages.image_url` rows are preserved for moderation context.
- New image messages cannot use `image_url`.
- The app no longer renders arbitrary external legacy image URLs.

## Listing Images

Listing image object paths are tied to the real listing owner and listing id:

```text
<seller_id>/<listing_id>/<filename>.<jpg|jpeg|png|webp>
```

The app rejects new external listing image URLs unless they are already ReTail Supabase public object URLs from the configured project.

Database trigger `protect_listing_image_phase_d_fields` rejects new listing image rows unless the URL points to a valid ReTail listing storage path owned by the listing seller.

## Removed Listing Cleanup

Deleting a listing is not treated as an atomic database-plus-Storage operation.

Instead, `delete_my_listing` queues cleanup work in `storage_cleanup_jobs`:

- bucket id
- object path
- source table
- source id
- reason
- status
- attempts
- last error
- timestamps

This preserves auditability and allows a future worker or Edge Function to retry Storage deletion safely.

## Operational Notes

Supabase owns parts of the `storage` schema. Phase D does not alter owner-managed `storage.objects` table settings. It changes ReTail bucket configuration and ReTail object policies only.

Known public URLs for avatar and listing images should continue to render. Object listing through the database API should no longer be broadly available.
