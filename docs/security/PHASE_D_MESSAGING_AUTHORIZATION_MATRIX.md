# Phase D Messaging Authorization Matrix

Date: 2026-07-18

## Conversations

| Action | Anonymous | Authenticated Nonparticipant | Buyer | Seller | Admin |
| --- | --- | --- | --- | --- | --- |
| Read conversation | Denied | Denied | Allowed | Allowed | Allowed |
| Create conversation | Denied | Only through RPC as buyer | Allowed through `create_or_get_conversation` | Denied for own listing | Not special-cased |
| Set buyer/seller/listing | Denied | Denied | Denied | Denied | Trusted server/admin-only path |
| Update shared metadata | Denied | Denied | Denied | Denied | Trusted server/admin-only path |
| Delete/archive shared conversation | Denied | Denied | Denied | Denied | Not implemented |

Rules:

- Client never submits `buyer_id` or `seller_id`.
- Buyer is always `auth.uid()`.
- Seller is derived from the active listing.
- Existing active conversation is reused.
- Soft-deleted matching conversation may be revived only by trusted RPC logic.

## Messages

| Action | Anonymous | Authenticated Nonparticipant | Sender | Recipient | Admin |
| --- | --- | --- | --- | --- | --- |
| Read message | Denied | Denied | Allowed | Allowed | Allowed |
| Send text message | Denied | Denied | Allowed through `send_message` | Allowed through `send_message` | Not special-cased |
| Send image message | Denied | Denied | Allowed with private attachment metadata | Allowed with private attachment metadata | Not special-cased |
| Set `sender_id` | Denied | Denied | Denied | Denied | Trusted server-only |
| Edit sent content | Denied | Denied | Denied | Denied | Not implemented |
| Mark read | Denied | Denied | Cannot mark own sent messages | Allowed through `mark_conversation_read` | Not special-cased |
| Soft delete message | Denied | Denied | Allowed through `soft_delete_own_message` | Denied | Not special-cased |

Rules:

- `sender_id` is always derived from `auth.uid()`.
- Text/system messages require a nonblank body of 2,000 characters or less.
- Image messages require private Storage metadata.
- New image messages reject `messages.image_url`.
- Direct `messages` insert/update/delete grants are removed from app roles.

## Blocking

| Action | Anonymous | Authenticated User | Other User | Admin |
| --- | --- | --- | --- | --- |
| Read own block list | Denied | Allowed | Denied | Allowed |
| Create block | Denied | Allowed through `block_user` | Cannot spoof blocker | Not special-cased |
| Delete block | Denied | Allowed through `unblock_user` | Cannot delete another blocker row | Not special-cased |
| Message after either-side block | Denied | Denied | Denied | Not special-cased |
| Upload new message image after either-side block | Denied | Denied | Denied | Not special-cased |

Historical reads remain available to participants after a block. New conversations, messages, and message-image uploads are denied.

## Storage

| Bucket | Public URL Serving | Object Listing | Upload | Update/Delete |
| --- | --- | --- | --- | --- |
| `avatars` | Known public URLs remain usable | No broad public object-listing policy | Owner path only | Owner path only |
| `listings` | Known public URLs remain usable | No broad public object-listing policy | Listing owner path tied to actual listing | Listing owner path tied to actual listing |
| `message-images` | Private only | Participant-scoped signed URL access | Participant path `<conversation>/<auth.uid()>/<uuid>.<ext>` | Uploader path only |

Message images are read with short-lived signed URLs. Signed URLs are never stored in the database.
