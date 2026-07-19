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
| Transactions | Buyer cannot complete or reassign transaction | Phase E RPC and static tests added; live API test required |
| Transactions | Linked buyer must be conversation participant | Phase E RPC and static tests added; live API test required |
| Transactions | Unlinked completion creates no fake transaction | Phase E RPC added; live API test required |
| Reviews | Reviewer, reviewee, and listing are derived from completed transaction | Phase E RPC and static tests added; live API test required |
| Reviews | Review summary uses all valid reviews | Phase E RPC and service test added; live API test required |
| Reports | Reporter cannot read admin notes or evidence | Phase E reporter-safe RPC added; live API test required |
| Reports | Duplicate open/reviewing report denied per reporter and target | Phase E partial unique indexes added; live API test required |
| Moderation | Admin report status changes create immutable audit events | Phase E RPC and table added; live API test required |
| Notifications | Client cannot fabricate arbitrary notifications | Generic notification helper removed; static tests added; live API test required |
| Notifications | Read/delete actions use controlled RPCs and soft delete | Phase E service/static tests added; live API test required |
| Preferences | Notification preferences derive user ID server-side | Phase E RPC and static tests added; live API test required |
| Device tokens | Device token registration/removal derives user ID server-side | Phase E RPC and static tests added; live API test required |
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
