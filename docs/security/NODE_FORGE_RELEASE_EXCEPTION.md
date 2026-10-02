# Temporary node-forge Release Exception

Reviewed for ReTail 1.2.0 on 2026-10-02.

## Exact exception

- Package: `node-forge`
- Advisory: `GHSA-86w9-cpqp-85rv`
- Reviewed installed version: `1.4.0`
- Severity: High
- Allowed dependency scope: transitive Expo CLI/build tooling only

This is not a package-wide or severity-wide exception. Any other `node-forge`
advisory, any other High/Critical advisory, a different installed version, or a
dependency path outside Expo CLI/build tooling remains release-blocking.

## Rationale

The advisory affects `node-forge` through 1.4.0. At review time, official npm
lists 1.4.0 as latest and no official patched version is available. ReTail
receives it through these tooling paths:

- `expo > @expo/cli > node-forge`
- `expo > @expo/cli > @expo/code-signing-certificates > node-forge`

Repository application code does not import `node-forge`. These packages are
used by Expo CLI and code-signing/build tooling and are not bundled into the
installed ReTail React Native application runtime.

ReTail will not use an unofficial fork, patch cryptographic code locally,
remove required Expo tooling, or major-upgrade Expo solely to bypass this
advisory for the 1.2.0 release.

## Removal condition

Remove the exception from `scripts/dependency-audit-policy.mjs` as soon as an
official patched `node-forge` version or a compatible Expo 57 dependency path
is available. The normal dependency gate continues to block every unreviewed
High or Critical advisory.
