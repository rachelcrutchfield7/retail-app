# ReTail Mobile App

This is the first functioning ReTail mobile app prototype built from the blueprint.

## What Works

- Browse local pet supply listings.
- Search and filter by category.
- View listing details.
- Sign into a local demo account as a regular user or animal rescue.
- Save favorites.
- Create and publish a local listing.
- View message and profile screens.

## Structure

- `src/AppShell.tsx` owns local app state and screen routing.
- `src/screens/` contains full-screen experiences.
- `src/components/` contains reusable UI building blocks.
- `src/constants/` contains shared product constants and theme tokens.
- `src/data/` contains temporary local prototype data.
- `src/validation/` contains shared business rules.
- `tests/` contains the first business-logic tests.

## Run

Install dependencies:

```sh
pnpm install
```

Start an Expo development server:

```sh
pnpm web
```

If Metro hits the macOS file-watcher limit, use the production web preview:

```sh
pnpm export:web
pnpm preview
```

Then open:

```txt
http://127.0.0.1:8082
```

## Test

Run the validation tests:

```sh
pnpm test
```
