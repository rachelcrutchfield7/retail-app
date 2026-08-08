# ReTail Edge Function Deployment Inventory

Date: 2026-08-08

Project: `ycwgsdigvpmprqreoqiz`

Source: Supabase live Edge Function metadata and retrieved deployed source.

No functions were deployed during this audit.

| Function | Version | Deployed? | JWT verification | Repo source available before audit? | Source retrieved? | Source parity confirmed? | Audit status | Needs redeploy after remediation? |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| `delete-account` | 5 | yes | enabled | yes | yes | yes | Pass with operational caveats | no |
| `send-notification` | 4 | yes | disabled | no, README only | yes | yes | Pass with privacy/content caveat | no |
| `stripe-create-payment-intent` | 3 | yes | enabled | no | yes | yes | Needs remediation | yes |
| `stripe-connect-account` | 2 | yes | enabled | no | yes | yes | Needs remediation | yes |
| `stripe-account-status` | 2 | yes | enabled | no | yes | yes | Needs remediation | yes |
| `stripe-connect-login-link` | 2 | yes | enabled | no | yes | yes | Needs remediation | yes |
| `stripe-webhook` | 2 | yes | disabled | no | yes | yes | Needs remediation | yes |

## Live Metadata

- `delete-account`: `verify_jwt=true`, SHA256 `faf3ab6dacceecb4f9847302527cbe97d0a22e68d13285628f1646300c22a7b5`
- `send-notification`: `verify_jwt=false`, SHA256 `02792552e7db28e9f7e33121a7efab82f8e284128d9e59424246e69dd2d5687d`
- `stripe-create-payment-intent`: `verify_jwt=true`, SHA256 `506d3d6b5a135598355c87ec6028d56705817092bf008bac7c0c1521b54e1c18`
- `stripe-connect-account`: `verify_jwt=true`, SHA256 `99672c0c4744a1d7d1c810fa4b980b69395b87c79a670b508a943c327e720db5`
- `stripe-account-status`: `verify_jwt=true`, SHA256 `ae7d2560cfcd69fb48526069cb3b9d6dcf1f6bd1d3a72f58af9949641ebaf4c0`
- `stripe-connect-login-link`: `verify_jwt=true`, SHA256 `cbf3b504aad7effcbfa17acdc7aaa8aaa567d713ff6eeffac035168400691a58`
- `stripe-webhook`: `verify_jwt=false`, SHA256 `d9913d2723cce3d5eafb637cf8fe0cb44bba83eea9f7896af6b0783ebdfdb003`

## Source Sync Result

The exact deployed source returned by the Supabase connector was copied into:

- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/supabase.ts`
- `supabase/functions/_shared/stripe.ts`
- `supabase/functions/send-notification/index.ts`
- `supabase/functions/stripe-create-payment-intent/index.ts`
- `supabase/functions/stripe-connect-account/index.ts`
- `supabase/functions/stripe-account-status/index.ts`
- `supabase/functions/stripe-connect-login-link/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

`supabase/functions/delete-account/index.ts` already matched the retrieved deployed source.

## Notes

- `verify_jwt=false` is acceptable for `stripe-webhook` because the retrieved source verifies the Stripe signature before database writes.
- `verify_jwt=false` is acceptable for `send-notification` only because the retrieved source requires either `x-retail-notification-secret` or a valid Supabase user token with a relationship to the notification.
- Source parity is confirmed for the files retrieved during this audit, but no deployment was performed from this branch.
