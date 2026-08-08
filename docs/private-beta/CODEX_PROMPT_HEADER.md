# REQUIRED RETAIL CODEX TASK RULES

Before starting:

Read:

docs/private-beta/BETA_FREEZE_RULES.md
docs/private-beta/CODEX_TASK_SCOPE.md
docs/private-beta/PROTECTED_UI_FILES.txt
docs/private-beta/CODEX_WORKING_RULES.md

Golden visual reference:

Expo build 94d61284
Git tag golden-layout-94d61284

Rules:

- One task only.
- Modify only allowed files.
- Do not expand scope silently.
- Do not redesign unrelated UI.
- Do not change reusable UI components unless explicitly authorized.
- Do not change global theme unless explicitly authorized.
- Do not change navigation unless explicitly authorized.
- Do not refactor unrelated code.
- If a protected file is needed unexpectedly, STOP and report why.
- Preserve all working functionality outside the task.
- Run tests.
- Run protected UI checker.
- Run task diff report.
- Show changed files before build.
- Do not merge automatically.

Future Codex prompts can start with:

```text
Follow docs/private-beta/CODEX_PROMPT_HEADER.md before making any changes.
```
