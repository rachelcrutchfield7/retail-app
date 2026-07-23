# ReTail Pre-Launch Website Handoff

## Purpose

This website establishes a public pre-launch presence for ReTail at `retailpetapp.com`.

It is designed to support:

- Apple Developer organization enrollment
- Google Play organization verification
- Stripe business verification
- Public explanation of ReTail before marketplace launch
- Legal, safety, privacy, and contact access

ReTail is owned and operated by Crutchfield Interactive LLC.

## Local Development

```bash
cd marketing-site
pnpm install --frozen-lockfile
pnpm dev
```

## Production Build

```bash
cd marketing-site
pnpm check
pnpm build
```

The static output is generated at:

```text
marketing-site/dist
```

## Cloudflare Pages Settings

Recommended project name:

```text
retail-prelaunch
```

Cloudflare Pages settings:

```text
Root directory: marketing-site
Build command: pnpm build
Output directory: dist
```

No database, Supabase connection, Stripe key, or server secret is required.

## Custom Domains

Primary domain:

```text
retailpetapp.com
```

Also support:

```text
www.retailpetapp.com
```

The site includes a Cloudflare Pages `_redirects` rule intended to redirect `www.retailpetapp.com` to `retailpetapp.com` while preserving the path.

## DNS Records Reviewed

Existing email-related DNS records found before deployment work:

- MX `retailpetapp.com` -> `route1.mx.cloudflare.net`
- MX `retailpetapp.com` -> `route2.mx.cloudflare.net`
- MX `retailpetapp.com` -> `route3.mx.cloudflare.net`
- TXT `cf2024-1._domainkey.retailpetapp.com` for DKIM
- TXT `retailpetapp.com` SPF record: `v=spf1 include:_spf.mx.cloudflare.net ~all`

These records support the domain email system and should be preserved.

## DNS Records Changed

None at the time this handoff was written.

## Email DNS Preservation

The website files do not require changes to MX, DKIM, SPF, DMARC, or Cloudflare Email Routing records.

Before connecting custom domains in Cloudflare Pages, preserve all email-routing records so these addresses continue working:

- `contact@retailpetapp.com`
- `support@retailpetapp.com`

## Routes Created

- `/`
- `/how-it-works`
- `/rescue-hub`
- `/safety`
- `/about`
- `/contact`
- `/private-beta`
- `/privacy`
- `/terms`
- `/community-guidelines`
- `/refunds-and-disputes`
- `/shipping-and-fulfillment`
- `/prohibited-items`
- `/404`
- `/robots.txt`
- `/sitemap.xml`
- `/.well-known/security.txt`

## Brand Assets Used

Copied from the mobile repository into `marketing-site/public/assets/`:

- `retail-logo-header.png`
- `app-icon.png`
- `adaptive-icon.png`

The Open Graph image uses the ReTail logo and ReTail brand colors.

## Screenshot Sources

No safe beta screenshots were present in the repository at creation time.

The first version intentionally launches without app screenshots rather than using fake marketplace screens, fake listings, fake users, or fake rescue activity.

## Policies Created Or Reused

Public policy pages adapt existing ReTail policy language from:

- `docs/legal/privacy-policy.md`
- `docs/legal/terms-of-service.md`
- `docs/legal/community-guidelines.md`

Additional public pages were created for:

- Refunds and disputes
- Shipping and fulfillment
- Prohibited items
- Safety
- Private beta status

## Items For Attorney Review Before Public Marketplace Launch

- Final Terms of Service
- Privacy Policy
- Refund and dispute policy
- Shipping and fulfillment policy
- Rescue donation language
- Payment protection language
- Outside-payment liability language
- Account deletion and data retention wording
- Any marketplace fee disclosure

The public website does not display "draft" or "needs legal review" labels.

## Items To Update When Stripe Becomes Active

- Refunds and disputes page
- How It Works payment language
- Terms of Service payment language
- Shipping and fulfillment page if shipping labels or payment-backed shipping become active
- Any checkout, fees, payment protection, or dispute timeline language

Do not claim ReTail provides payment protection until the actual Stripe-backed workflow and support process are implemented.

## Items To Update When The Apple App Launches

- Add Apple App Store badge only after the public App Store listing is live.
- Add the confirmed Apple app URL.
- Add Apple App Site Association only after Apple Team ID, bundle ID, and production values are confirmed.

## Items To Update When The Android App Launches

- Add Google Play badge only after the public Google Play listing is live.
- Add the confirmed Google Play URL.
- Add `/.well-known/assetlinks.json` only after the Android signing fingerprint and package values are confirmed.

## Deep-Link Association Values Still Needed

Do not publish mobile deep-link association files until these values are confirmed:

- Android SHA-256 signing certificate fingerprint
- Android package confirmation for production
- Apple Team ID
- iOS bundle identifier confirmation for production

## Updating The Private-Beta Notice

The homepage private-beta notice is in:

```text
src/pages/index.astro
```

The detailed beta page is in:

```text
src/pages/[slug].astro
```

Search for:

```text
private beta
```

Update the language only when ReTail's public launch status changes.

## Adding App Store Download Buttons Later

Add app-store buttons only when the public app listings are live.

Do not add:

- Private APK links
- EAS build URLs
- TestFlight invitation links
- Beta passwords
- Test credentials

## Future Web Marketplace

The future browser marketplace can live at:

```text
app.retailpetapp.com
```

That future app should be created separately and should not replace this marketing site.

## Verification Checklists

### Apple Developer Organization Enrollment

The website provides:

- Public company name: Crutchfield Interactive LLC
- Product brand: ReTail
- Domain email addresses
- Privacy Policy
- Terms of Service
- Community Guidelines
- Safety and prohibited-items pages
- Clear private-beta status

This does not guarantee approval.

### Google Play Organization Verification

The website provides:

- Public product description
- Domain contact emails
- Legal and safety policies
- Prohibited-items policy, including no live animals
- Clear statement that public marketplace access is not yet available

This does not guarantee approval.

### Stripe Business Verification

The website provides:

- Business/product explanation
- Operating company name
- Contact and support emails
- Refunds and disputes page
- Shipping and fulfillment page
- Private-beta payment status

This does not guarantee approval.
