# Policy Versioning

ReTail policy versions use the policy publication date in ISO 8601 format: `YYYY-MM-DD`.

The app's current versions are centralized in `src/constants/policyVersions.ts`. A materially updated policy receives its actual publication date and can trigger renewed acceptance when ReTail deliberately changes the corresponding current-version constant and backend check.
