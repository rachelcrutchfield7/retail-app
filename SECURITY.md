# ReTail Security Policy

## Reporting Security Issues

Please report security issues privately to the project owner. Do not create public GitHub issues for vulnerabilities.

Include:

- affected feature or screen
- steps to reproduce
- screenshots only if they do not expose private data
- account type used during testing
- whether the issue affects web, iOS, Android, or all platforms

## Sensitive Data Rules

Never commit:

- Supabase service-role keys
- database passwords
- JWT secrets
- Apple private keys
- Google service-account files
- signing credentials
- real user credentials
- real user messages, report details, or payment data

Only client-safe variables may use the `EXPO_PUBLIC_` prefix.

## Security Baseline

- Supabase Row Level Security must remain enabled.
- Messages and conversations are participant-only.
- Report moderation details are visible only to admins.
- Notifications, favorites, blocks, and device tokens are private to the owning user.
- Account deletion must use server-side database logic or another privileged server-side path, never a client-side service-role key.
- Public listing and rescue discovery must use safe RPCs that do not expose exact coordinates or private moderation fields.
- Native Supabase sessions must use encrypted device storage.

## Security Documentation

- [Security Model](docs/SECURITY_MODEL.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Security Test Matrix](docs/SECURITY_TEST_MATRIX.md)
- [Privacy Data Map](docs/PRIVACY_DATA_MAP.md)
- [Sprint 5.5 Remediation Report](docs/SECURITY_REMEDIATION_REPORT.md)
