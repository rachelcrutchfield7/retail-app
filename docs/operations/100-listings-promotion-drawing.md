# ReTail 100 Listings in 72 Hours — Reconciliation and Drawing Procedure

This procedure is for the October 9–12, 2026 Promotion. It is a local administrative workflow; it does not change production data and must never be exposed as a public mobile feature.

## Privacy and custody

- Export and process participant data only after the Promotion Period ends.
- Store the exports and generated JSON outside the repository in an access-controlled working directory.
- Never commit entrant exports, reconciled pools, drawing audits, or screenshots containing participant information.
- Limit access to staff administering the Promotion. Delete temporary copies under the applicable retention policy after the Promotion is closed.
- The utilities refuse input and output paths inside this repository.

## 1. Freeze the source records

Record the export time and preserve read-only copies of:

1. The authoritative ReTail campaign entry export for `community_100_listings_72_hours_v1`.
2. The Google Form response CSV downloaded after the form closes.

The ReTail CSV must contain these headers:

```text
seller_id,account_email,entry_count,contact_reference
```

`seller_id` and `entry_count` come from the authoritative campaign entry data. `account_email` must be obtained through an authorized administrative export so cross-method matches can be detected. `contact_reference` may be an internal support reference; do not use a public username as the sole identifier.

The Google CSV may use Google Forms' displayed question headers. The reconciliation utility recognizes:

- Timestamp
- Email Address or Email
- Full name
- State of residence
- Are you 18 years of age or older?
- Official Rules acknowledgment
- ReTail username or account email, if applicable

The optional ReTail account value is used only when it is a valid email address. Marketing consent is ignored for entry eligibility.

## 2. Reconcile the final pool

Run from the repository root, using paths outside the repository:

```bash
node scripts/reconcile-100-listings-promotion.mjs \
  --retail /secure/path/retail-entries.csv \
  --amoe /secure/path/google-form-responses.csv \
  --output /secure/path/reconciled-pool.json
```

The utility:

- normalizes email addresses and stable ReTail identifiers;
- joins likely cross-method matches through shared account/contact emails;
- rejects AMOE submissions outside `2026-10-09T13:00:00Z` through, but not including, `2026-10-12T13:00:00Z`;
- rejects AMOE rows missing age confirmation, state, name, contact email, or Official Rules agreement;
- gives every valid AMOE entrant five entries;
- preserves the authoritative ReTail entry count from one through five;
- uses the greater of AMOE and listing-method entries for a matched person, capped at five;
- reports rejected row numbers and reasons without echoing their personal information.

Review every rejected row and every cross-method match. Resolve ambiguous identities using the least amount of participant information necessary. If a correction is required, correct a secured copy of the input export and regenerate the pool; never hand-edit the final ticket counts.

Before drawing, confirm:

- every `entryCount` is an integer from one through five;
- `eligibleEntries` equals the sum of all entrant entry counts;
- duplicate AMOE submissions and known cross-method matches appear once;
- every pool record has a usable contact method or protected internal contact reference.

## 3. Select the potential winner

Run only after the reconciled pool is approved. For stronger separation of duties, have a second person provide a freshly generated 32-byte hexadecimal seed and record its SHA-256 commitment before the draw.

```bash
node scripts/select-100-listings-winner.mjs \
  --pool /secure/path/reconciled-pool.json \
  --audit /secure/path/draw-1-audit.json \
  --seed 64_HEXADECIMAL_CHARACTERS
```

If `--seed` is omitted, the utility generates 32 cryptographically secure random bytes. The audit record contains the seed, its SHA-256 hash, a canonical pool SHA-256, the weighted ticket number, counts, selection method, timestamp, and the selected entrant's protected contact reference. Those values allow the draw to be independently reproduced.

Preserve the first audit file unchanged. Do not rerun a draw merely to obtain a different result.

## 4. Alternate potential winner

If the selected entrant is unreachable, ineligible, does not respond within 72 hours, or declines the prize, document the reason outside the repository and run the next draw with the prior entrant excluded:

```bash
node scripts/select-100-listings-winner.mjs \
  --pool /secure/path/reconciled-pool.json \
  --audit /secure/path/draw-2-audit.json \
  --draw-number 2 \
  --exclude promotion:PRIOR_ENTRANT_REFERENCE \
  --seed A_NEW_64_CHARACTER_HEXADECIMAL_SEED
```

Use another `--exclude` option for each previously selected entrant. Keep all draw audits and notification records together in the restricted Promotion file.

## 5. Winner contact and closeout

Contact the potential winner using the ReTail account contact information or valid AMOE contact information in the reconciled record. Allow 72 hours to respond and verify eligibility before awarding the prize. Record the chosen prize, fulfillment confirmation, and any required tax documentation without publishing private contact information.

Do not claim a winner publicly until eligibility is confirmed and the prize is accepted.
