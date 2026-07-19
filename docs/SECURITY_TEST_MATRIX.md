# Security Test Matrix

| Area | Test | Status |
| --- | --- | --- |
| Secrets | Repo scan for secret-like patterns | Passed with local lightweight scanner |
| Config | Ambiguous Supabase public key rejected | Automated static test added |
| Config | Service-style public credential rejected | Automated static test added |
| Session storage | Native Supabase auth storage uses SecureStore | Automated static test added |
| Account isolation | Sign-out clears private query cache | Automated static test added |
| Public listings | Nearby listing RPC omits coordinates and full ZIPs | Automated static test added |
| Public listings | Seller object is explicit safe JSON, not full profile | Automated static test added |
| Rescue hub | Nearby rescue RPC omits coordinates and street address | Automated static test added |
| Profiles | Direct protected profile field updates blocked | SQL trigger added; live API test required |
| Rescue verification | Rescue owner cannot self-verify | SQL trigger added; live API test required |
| Conversations | Buyer/seller/listing cannot be reassigned | SQL trigger/policy added; live API test required |
| Messages | Body/image/sender cannot be edited after send | SQL trigger/RPC added; live API test required |
| Messages | Public users cannot create `system` messages | Live rollback SQL check passed |
| Messages | Structured offer payloads do not show raw code in previews | Automated static test added |
| Transactions | Buyer cannot complete or reassign transaction | SQL RPC/policy added; live API test required |
| Reviews | Review target/rating cannot be rewritten by user | SQL trigger/policy added; live API test required |
| Reports | Reporter cannot read admin notes | Report read policy removed; live API test required |
| Notifications | Client cannot fabricate arbitrary notifications | Insert policies removed; live API test required |
| Blocking | Blocked users cannot message or upload message images | SQL policy checks added; live API test required |
| Storage | Private message images are participant-scoped | Existing policy strengthened; live storage test required |
| Storage | Message attachment path regex accepts canonical paths and rejects malformed paths | Live rollback SQL check passed |
| Storage | Message image send validates uploaded object metadata | SQL migration and static test added; real Storage API test pending |
| Dependencies | Pinned production dependencies | Automated static test added |
| Dependencies | Package-manager audit | Requires network audit run |
| Static analysis | Semgrep or equivalent | Not run locally |
| Supabase advisors | Security/performance advisors | Must be run in Supabase project |
| Mobile binary | MobSF or equivalent scan | Requires native preview builds |

## Required Live Test Accounts

- Anonymous client
- Account A
- Account B
- Unrelated Account C
- Blocked account
- Banned account
- Administrator account
- Unverified rescue account

Automated static checks do not replace direct Supabase API authorization testing with these accounts.
