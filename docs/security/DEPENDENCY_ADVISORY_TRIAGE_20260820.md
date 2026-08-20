# ReTail Dependency Advisory Triage - 2026-08-20

Starting commit: `9feed227b6da3237deb1dec38519a96fa1a14a60`

## Scope

This triage covers the 12 High advisories reported by `pnpm audit --prod` after the Backend & Security Day regression gate.

No Expo SDK upgrade, React Native version change, Astro major upgrade, backend deployment, database change, Stripe change, ShipStation change, or EAS build was performed.

## Audit Counts

Before safe overrides:

- Low: 3
- Moderate: 6
- High: 12
- Critical: 0

After safe overrides:

- Low: 3
- Moderate: 5
- High: 5
- Critical: 0

## Safe Updates Applied

The following transitive patch-level overrides were applied at the workspace level:

| Package | Previous locked version | New locked version | Reason |
| --- | ---: | ---: | --- |
| `brace-expansion` | `5.0.7` | `5.0.9` | Fixes Expo/Metro tooling advisories `GHSA-mh99-v99m-4gvg` and `GHSA-rgw5-rvv9-x895`. |
| `fast-uri` | `3.1.4` | `3.1.5` | Fixes marketing-site language-server/checker advisory `GHSA-7p8r-x3mc-p8w7`. |
| `js-yaml` | `4.3.0` | `4.3.1` | Fixes Expo CLI tooling advisory `GHSA-5p4m-2wfm-xmqj`. |
| `nanoid` | `3.3.15` | `3.3.18` | Fixes Expo/Metro/PostCSS tooling advisories `GHSA-28wg-ghj8-5hjv` and `GHSA-2v37-7h3g-55p8`. |
| `postcss` | `8.5.16` | `8.5.23` | Fixes Expo/Metro tooling advisory `GHSA-r28c-9q8g-f849`. |

## High Advisories Reviewed

| Package | Advisory | Dependency path | Exposure classification | Runtime reachable | Action |
| --- | --- | --- | --- | --- | --- |
| `sharp` | `GHSA-f88m-g3jw-g9cj` | `marketing-site > astro > sharp` | Build/development tooling only for the static marketing site. | No evidence of deployed ReTail server runtime execution. Static output does not ship `sharp`. | Left unchanged because fixed range requires `sharp >=0.35.0` through the Astro toolchain; do not force outside Astro compatibility. |
| `brace-expansion` | `GHSA-mh99-v99m-4gvg` | Expo/Metro CLI chain through `glob > minimatch` | Build/development tooling only. | Not included in installed APK/IPA runtime. | Fixed with workspace override to `5.0.9`. |
| `fast-uri` | `GHSA-7p8r-x3mc-p8w7` | `marketing-site > @astrojs/check > language server > ajv` | Build/development tooling only. | Not public runtime; used by local/static-site checking. | Fixed with workspace override to `3.1.5`. |
| `brace-expansion` | `GHSA-rgw5-rvv9-x895` | Expo/Metro CLI chain through `glob > minimatch` | Build/development tooling only. | Not included in installed APK/IPA runtime. | Fixed with workspace override to `5.0.9`. |
| `js-yaml` | `GHSA-5p4m-2wfm-xmqj` | Expo CLI chain through `@expo/xcpretty` | Build/development tooling only. | Not included in installed APK/IPA runtime. | Fixed with workspace override to `4.3.1`. |
| `image-size` | `GHSA-w3rx-r6r6-pgpr` | Expo/Metro CLI chain through `metro` | Build/development tooling only. | Not included in installed APK/IPA runtime. Practical exposure requires crafted image input during build/dev processing. | Left unchanged because fixed range is `>=2.0.3`, while Expo SDK 57 currently locks Metro to `image-size@1.2.1`. Do not override across the major line without Expo compatibility confirmation. |
| `image-size` | `GHSA-5p2g-fcmc-qvqq` | Expo/Metro CLI chain through `metro` | Build/development tooling only. | Not included in installed APK/IPA runtime. Practical exposure requires crafted image input during build/dev processing. | Left unchanged for the same Expo/Metro compatibility reason. |
| `nanoid` | `GHSA-28wg-ghj8-5hjv` | Expo/Metro/PostCSS tooling chain | Build/development tooling only. | Not included in installed APK/IPA runtime. | Fixed with workspace override to `3.3.18`. |
| `astro` | `GHSA-2pvr-wf23-7pc7` | `marketing-site > astro` | Static-site build tooling unless the Astro app is deployed with a server runtime. | Current repository evidence shows `retailpetapp.com/listing/*` and `/.well-known/*` are served by the Cloudflare Worker; root public pages are documented as `site/`. `marketing-site` is a static output project and was not completed from Codex deployment. | Left unchanged because fixed range requires Astro 6.x. Before public deployment of `marketing-site`, either upgrade Astro deliberately or keep serving the existing static `site/`/Worker architecture. |
| `astro` | `GHSA-8hv8-536x-4wqp` | `marketing-site > astro` | Static-site build tooling unless the Astro app is deployed with a server runtime. | Same as above. | Left unchanged for the same Astro major-version reason. |
| `nanoid` | `GHSA-2v37-7h3g-55p8` | Expo/Metro/PostCSS tooling chain | Build/development tooling only. | Not included in installed APK/IPA runtime. | Fixed with workspace override to `3.3.18`. |
| `postcss` | `GHSA-r28c-9q8g-f849` | Expo/Metro config tooling chain | Build/development tooling only. | Not included in installed APK/IPA runtime. | Fixed with workspace override to `8.5.23`. |

## Remaining High Advisories

| Package | Advisories | Launch classification | Rationale |
| --- | --- | --- | --- |
| `image-size` | `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq` | Dev/build-only; accepted temporary risk. | Comes through Expo/Metro build tooling. It is not part of the installed app runtime, and the safe fix is constrained by Expo SDK 57's Metro dependency graph. |
| `astro` | `GHSA-2pvr-wf23-7pc7`, `GHSA-8hv8-536x-4wqp` | Public web launch follow-up before deploying `marketing-site` as a dynamic/server-rendered site. | Requires Astro 6.x. Current ReTail public listing and well-known routes use the Cloudflare Worker; root public pages are documented as static `site/`. |
| `sharp` | `GHSA-f88m-g3jw-g9cj` | Static-site build-only; accepted temporary risk unless deploying/operating Astro build pipeline for public web. | Used by Astro image tooling. `sharp` does not ship in static output and is not a mobile/backend runtime dependency. |

## Public-Launch Decision

No remaining High advisory is currently classified as mobile production runtime, backend runtime, or deployed Supabase Edge Function runtime.

Before public launch of the Astro `marketing-site`, choose one of:

1. Keep the current static `site/` plus Cloudflare Worker architecture and remove/park unused Astro workspace if not needed.
2. Perform a separate, deliberate Astro major upgrade and validate the full static site.

Before upgrading Expo SDK or Metro, wait for an Expo-compatible dependency path that resolves `image-size` without forcing an unsupported major override.
