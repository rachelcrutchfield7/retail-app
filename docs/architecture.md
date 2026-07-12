# ReTail Mobile Architecture

This app currently runs as a single-shell Expo prototype while the project moves toward the full Expo Router architecture defined in the blueprint.

Current production-facing rule:

```text
Screen -> Hook -> Service -> Supabase/local service adapter
```

Supabase is not connected yet. Until it is, services use the local service adapter in `src/services/localStore.ts`.
