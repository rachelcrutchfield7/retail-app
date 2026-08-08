# ReTail Codex Working Rules

Every Codex task must:

1. Read BETA_FREEZE_RULES.md.
2. Read CODEX_TASK_SCOPE.md.
3. Check the current Git branch.
4. Record the starting commit.
5. Work on a dedicated branch.
6. Modify only files allowed by the task.
7. Avoid broad refactors.
8. Avoid broad cleanup.
9. Avoid unrelated upgrades.
10. Preserve golden layout build 94d61284.
11. Run tests.
12. Run the protected UI checker.
13. Show git diff --name-only.
14. Show git diff --stat.
15. Report every changed file.
16. Do not build until checks pass.
17. Do not merge automatically.
18. Do not force push.
19. Do not modify main directly.
20. Stop rather than guess when scope is unclear.

The following phrases in a task do NOT authorize broad work:

- polish
- clean up
- improve
- modernize
- make responsive
- make consistent
- fix styling
- optimize
- refactor

Those phrases must be interpreted narrowly and only within explicitly allowed files.

Stability is the priority during beta freeze.
