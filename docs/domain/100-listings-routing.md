# 100 Listings promotion routing

## Current architecture and failure mode

`retailpetapp.com` and `www.retailpetapp.com` currently serve the exported Expo web application. Its SPA fallback returns the Expo shell with HTTP 200 for unknown paths, including `/100-listings/` and `/100-listings/rules/`. That is why those URLs appear reachable while not serving the Astro promotion pages.

The existing `retail-prelaunch` Cloudflare Pages project hosts the static marketing site at `retail-prelaunch.pages.dev`. The current Pages deployment predates the Promotion routes, so `/100-listings/` returns 404 there until the updated `marketing-site/dist` is deployed.

The existing `retail-public-links` Cloudflare Worker already owns narrowly scoped `retailpetapp.com` routes for listings, app association files, and authentication callbacks. No DNS or hosting-provider change is required.

## Scoped correction

The Worker configuration adds only these route families on the existing zone:

- `retailpetapp.com/100-listings*`
- `www.retailpetapp.com/100-listings*`
- `retailpetapp.com/api/100-listings/status`
- `www.retailpetapp.com/api/100-listings/status`

Promotion pages are proxied to the existing `retail-prelaunch.pages.dev` project. Generated Astro assets are rewritten under `/100-listings-static/`, which is covered by the same narrow Worker route and avoids taking over the Expo application's root assets or fallback. All unrelated website, app-link, listing, and authentication routes keep their existing owners.

The status endpoint calls the existing public aggregate RPC `community_listing_campaign_public_status`. Its response contains only the count, target, entry threshold, maximum entries, dates, and active flag—never participant, seller, listing, or contact details.

## Safe deployment order

Do not deploy while the Google Form contradicts the approved Promotion contract.

After the form is corrected and independently verified:

1. Build and verify `marketing-site/dist`.
2. Deploy that exact output to the existing `retail-prelaunch` Pages project.
3. Verify both Promotion routes directly on `retail-prelaunch.pages.dev`.
4. Deploy the existing `retail-public-links` Worker using `web-worker/wrangler.jsonc`.
5. Verify the custom-domain pages, scoped assets, aggregate status endpoint, listing deep links, app association files, and auth callback routes.

Established direct-deployment commands, when the existing Cloudflare account is authenticated, are:

```bash
npx wrangler pages deploy marketing-site/dist --project-name retail-prelaunch
npx wrangler deploy --config web-worker/wrangler.jsonc
```

Do not create a project, alter DNS, attach a different domain, or widen the Worker route patterns.
