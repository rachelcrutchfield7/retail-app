# ReTail Beta Release Workflow

## Stable branch

Approved founder-preview code should live on:

beta-release-candidate

## Feature workflow

Every feature or bug fix:

1. Start from beta-release-candidate.
2. Create one dedicated branch.
3. Implement one narrowly scoped task.
4. Run tests.
5. Run protected UI check.
6. Run task diff report.
7. Review changed files.
8. Create Rachel-only EAS preview.
9. Rachel tests the preview.
10. If approved, merge into beta-release-candidate.
11. If rejected, do not merge.
12. Fix or abandon that isolated branch.

When running local preview-build scripts, set the task base explicitly after the release-candidate branch exists:

```bash
RETAIL_BETA_BASE_REF=origin/beta-release-candidate pnpm build:preview:android
```

Without an override, the checker deliberately compares against `golden-layout-94d61284`.

## Never stack untested changes

Do not:

Fix A
-> Fix B
-> Feature C
-> Build

Instead:

Fix A
-> Build
-> Rachel approves
-> Merge

Fix B
-> Build
-> Rachel approves
-> Merge

Feature C
-> Build
-> Rachel approves
-> Merge

## Beta freeze

Once a build is selected for external testers:

Create a release tag.

Example:

beta-rc-1

The exact tagged commit is what testers receive.

Do not silently replace it with later code.

## Emergency rollback

If a new build regresses:

Return immediately to the last approved release candidate.

Do not attempt multiple speculative fixes on top of the broken branch.

## Golden layout

Expo build 94d61284 remains the visual source of truth until Rachel explicitly approves a redesign.

## Optional local hook

GitHub Actions is the authoritative guard. A contributor may also install the local pre-push check with:

```bash
pnpm install:beta-git-hooks
```

The installer does not alter global Git configuration and will not overwrite an existing pre-push hook.
