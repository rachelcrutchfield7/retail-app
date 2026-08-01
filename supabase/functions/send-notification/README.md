# send-notification

Sends branded ReTail notification emails through Resend.

## Required Supabase secrets

Set these in Supabase Edge Function secrets before production use:

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RETAIL_EMAIL_FROM="ReTail <notifications@retailpetapp.com>"
supabase secrets set RETAIL_APP_URL="https://www.retailpetapp.com"
supabase secrets set RETAIL_EMAIL_LOGO_URL="https://www.retailpetapp.com/assets/email/retail-logo-email.png"
```

Optional, but recommended for database-triggered notifications such as saved search matches:

```bash
supabase secrets set RETAIL_NOTIFICATION_WEBHOOK_SECRET="use-a-long-random-secret"
```

## Deploy

```bash
supabase functions deploy send-notification
```

This function has `verify_jwt = false` in `supabase/config.toml` because it supports both app-triggered calls and Supabase Database Webhooks. The function still validates either a Supabase user session or the private `x-retail-notification-secret` webhook header before sending anything.

## Saved search email webhook

App-created notifications call this function directly. Database-created notifications, especially saved search matches, need a Supabase Database Webhook:

- Table: `public.notifications`
- Event: `INSERT`
- Method: `POST`
- URL: `https://<project-ref>.supabase.co/functions/v1/send-notification`
- Header: `x-retail-notification-secret: <same RETAIL_NOTIFICATION_WEBHOOK_SECRET value>`

The function reads the inserted notification id from the webhook payload and sends the email only once.
