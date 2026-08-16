# send-notification

Canonical ReTail notification delivery function.

This function runs after a canonical `public.notifications` row exists. It may deliver:

- notification email through Resend
- native push through Expo Push Service

The in-app notification row remains authoritative. Email or push delivery failures must not undo the business event that created the notification.

JWT verification is intentionally disabled only because the function enforces either:

- `x-retail-notification-secret` for trusted database/webhook calls, or
- a related authenticated user check for direct retry requests.
