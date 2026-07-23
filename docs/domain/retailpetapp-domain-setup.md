# ReTail Domain Setup

Domain: `retailpetapp.com`

Registrar/DNS: Cloudflare

## Public URLs

| Purpose | URL |
| --- | --- |
| Landing page | `https://retailpetapp.com` |
| Private beta | `https://retailpetapp.com/beta` |
| Privacy Policy | `https://retailpetapp.com/privacy` |
| Terms of Service | `https://retailpetapp.com/terms` |
| Community Guidelines | `https://retailpetapp.com/community-guidelines` |
| General contact | `contact@retailpetapp.com` |
| Support, payment issues, user issues, and reports | `support@retailpetapp.com` |

## Cloudflare Pages

Deploy the static site from:

```text
site/
```

Suggested Cloudflare Pages settings:

```text
Build command: none
Build output directory: site
```

## App Links

The Expo app is configured for:

```text
scheme: retail
iOS associated domains:
  applinks:retailpetapp.com
  applinks:www.retailpetapp.com
Android intent filters:
  https://retailpetapp.com
  https://www.retailpetapp.com
```

Before relying on universal links publicly, the domain still needs platform association files:

```text
https://retailpetapp.com/.well-known/apple-app-site-association
https://retailpetapp.com/.well-known/assetlinks.json
```

Those files require the final Apple Team ID and Android signing certificate SHA-256 fingerprint. Do not guess those values.

## Supabase Auth

Before using the public domain for authentication redirects, add these to the Supabase Auth dashboard:

```text
https://retailpetapp.com
https://retailpetapp.com/beta
https://retailpetapp.com/auth/callback
https://retailpetapp.com/reset-password
```

Keep local development URLs separate from beta and production redirect URLs.

## Email Routing

Both domain email addresses are live:

```text
contact@retailpetapp.com
support@retailpetapp.com
```

Use `contact@retailpetapp.com` for general questions, beta access, partnerships, rescue outreach, and press. Use `support@retailpetapp.com` for payment issues, user issues, account access, reports, safety concerns, and moderation questions.
