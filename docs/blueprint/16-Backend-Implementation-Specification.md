# 16 - Backend Implementation Specification

**Project:** ReTail
**Version:** 1.0

---

# Purpose

This document defines exactly how the ReTail backend must be implemented.

The backend will use:

* Supabase Authentication
* PostgreSQL
* Supabase Storage
* Row Level Security (RLS)
* Edge Functions (only when necessary)
* Realtime subscriptions for messaging and notifications

No custom backend server is required for Version 1.

---

# Backend Responsibilities

The backend is responsible for:

* User authentication
* Authorization
* Database access
* Image storage
* Realtime messaging
* Push notification support
* Data validation
* Security
* Audit logging
* Content moderation support

---

# Supabase Project Configuration

Create one Supabase project.

Enable:

```text
Authentication
Database
Storage
Realtime
Edge Functions
SQL Editor
Logs
```

Disable anything not used by the MVP.

---

# Authentication Providers

Enable:

```text
Email
Google
Apple
```

Require:

* Email verification
* Secure password recovery
* Session persistence

---

# Storage Buckets

Create the following buckets.

## avatars

Purpose:

User profile photos.

Rules:

```text
Public read
Authenticated upload
Only owner can replace image
```

---

## listings

Purpose:

Listing photos.

Rules:

```text
Public read
Authenticated upload
Maximum 15 photos per listing
Maximum file size: 10 MB
Allowed formats:
JPEG
PNG
WEBP
```

---

## message-images

Purpose:

Photos shared in conversations.

Rules:

```text
Private
Accessible only to conversation participants
Maximum file size: 10 MB
```

---

# Row Level Security

Enable RLS on **every table**.

Never disable it.

---

## Profiles

Anyone may:

```text
Read public profile
```

Owner may:

```text
Update own profile
```

Only admins:

```text
Ban users
Verify users
```

---

## Listings

Anyone:

```text
Read active listings
```

Owner:

```text
Create
Edit
Archive
Delete
```

Admins:

```text
Remove any listing
```

---

## Favorites

Users may:

```text
Read only their favorites
Create only their favorites
Delete only their favorites
```

---

## Conversations

Participants only.

No one else.

---

## Messages

Participants only.

---

## Reviews

Public read.

Only reviewer can create.

Never edit rating after submission.

(Comment edits may be allowed for a short window if desired.)

---

## Reports

Reporter:

Can create.

Admin:

Can read.

Can update.

Regular users:

Cannot read reports submitted by others.

---

# Edge Functions

Use Edge Functions only when business logic belongs on the server.

Examples:

Create Profile

Triggered after successful registration if not handled client-side.

---

Send Push Notifications

When:

* New message
* New review
* Favorite
* Listing sold

---

Future:

Moderation automation

Spam detection

Email digests

---

# Database Migrations

Never edit production tables manually.

Use migrations.

Example:

```text
supabase/
migrations/
0001_initial_schema.sql
0002_reviews.sql
0003_notifications.sql
```

---

# Seed Data

Create seed.sql

Populate:

* Categories
* Conditions
* Example listings
* Demo users
* Test conversations

---

# Logging

Track:

* Authentication failures
* Upload failures
* Database errors
* Edge Function failures
* Notification failures

---

# Image Processing

Before upload:

* Resize large images
* Compress images
* Strip metadata (EXIF)
* Generate thumbnails
* Preserve aspect ratio

---

# Rate Limiting

Implement limits such as:

```text
Maximum 20 listings/day
Maximum 100 messages/hour
Maximum 10 reports/day
Maximum 5 account creations/hour/IP
```

(Exact values can be adjusted before launch.)

---

# Backup Strategy

Enable automated Supabase backups.

Maintain SQL migrations in Git.

Never rely solely on live database state.

---

# Monitoring

Track:

* API latency
* Failed logins
* Failed uploads
* Storage usage
* Database size
* Slow queries
* Crash reports

---

# Environment Variables

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
GOOGLE_MAPS_API_KEY
POSTHOG_KEY
SENTRY_DSN
```

Never expose:

* Service role keys
* JWT secrets
* Database passwords

---

# Acceptance Criteria

Backend is complete when:

* Authentication works.
* Storage buckets are configured.
* RLS policies are enforced.
* Database schema is migrated successfully.
* Image uploads work.
* Messaging is realtime.
* Notifications are supported.
* Audit logging exists.
* Seed data loads successfully.

---

# Codex Instruction

Implement the backend according to this specification.

Do not bypass Row Level Security.

Do not expose privileged credentials to the client.

Prefer migrations over manual schema edits.

Keep all business logic centralized in services and server-side policies where appropriate.
