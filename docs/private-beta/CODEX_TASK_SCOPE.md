# Current Codex Task Scope

## Task

Describe the ONE requested feature or bug.

## Base branch

beta-release-candidate

## Allowed files

List every file Codex is permitted to modify.

Example:

src/services/googleAuthService.ts
src/services/authService.ts
src/auth/AuthContext.tsx
src/components/feedback/AuthModal.tsx

## Protected UI files explicitly authorized

None.

## Forbidden areas

Unless listed above, do not modify:

- global UI
- theme
- navigation
- listing presentation
- Rescue Hub presentation
- Settings presentation
- messaging presentation
- backend migrations
- Stripe
- website

## Scope rule

If another file becomes necessary:

STOP.

Report why that file is required before editing it.

Do not silently expand task scope.
