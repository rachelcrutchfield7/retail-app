# Contributing To ReTail

## Development Rules

- Keep the existing UI and navigation structure unless a task explicitly changes it.
- Put Supabase access in `src/services/`.
- Put reusable stateful behavior in `src/hooks/`.
- Keep screen files focused on composition and user interaction.
- Do not commit secrets, credentials, or real user data.
- Do not weaken RLS to make a client-side feature work.

## Before Opening A Pull Request

Run:

```sh
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm export:web
```

## Database Changes

- Create SQL files under `supabase/`.
- Keep changes idempotent where practical.
- Enable RLS for any table exposed through Supabase APIs.
- Document manual SQL steps in `README.md` or `docs/RELEASE_CHECKLIST.md`.

## Beta Safety

- Use beta/staging Supabase projects for tester data.
- Keep demo credentials out of beta and production builds.
- Do not mark untested flows as passed in QA docs.
