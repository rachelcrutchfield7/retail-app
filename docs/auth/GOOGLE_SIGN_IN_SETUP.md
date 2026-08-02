# ReTail Google Sign-In Setup

This app uses native Google sign-in only to obtain a Google ID token, then sends that token to Supabase Auth. Supabase remains the source of truth for sessions, profiles, account status, and identity linking.

## App Identifiers

- Android package: `com.raecrutchfield.retail`
- iOS bundle identifier: `com.raecrutchfield.retail`
- Expo project ID: `288a25e1-5824-4f77-a3f4-0607df5f7d89`

## Required Google OAuth Clients

Create these OAuth clients in Google Cloud:

- Web client
- Android client for `com.raecrutchfield.retail`
- iOS client for `com.raecrutchfield.retail`

Do not create a Firebase Auth system for ReTail. The mobile app signs in through Google, then Supabase validates the Google ID token.

## Environment Variables

Public mobile identifiers belong in EAS/Expo env:

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN=true
EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN_IOS=false
```

The Google Web Client Secret must never be placed in Expo, `.env.example`, `.env.local`, GitHub, or any `EXPO_PUBLIC_*` variable. Put the Web Client Secret only in the Supabase Google provider settings.

## Supabase Provider

In Supabase:

1. Open `Authentication`.
2. Open `Providers`.
3. Enable `Google`.
4. Add the Google Web Client ID.
5. Add the Google Web Client Secret.

Supabase handles the session and any supported identity linking. ReTail does not do custom account merging.

## Android EAS SHA-1

Google requires SHA-1 fingerprints for Android OAuth clients.

For internal APK beta builds, add the SHA-1 for the EAS signing certificate used by the preview Android build.

For Google Play releases, also add the Google Play App Signing SHA-1 from:

```text
Google Play Console > Release > Setup > App integrity
```

If Google sign-in works in one build but fails in another with a developer/configuration error, the missing SHA-1 is usually the first thing to check.

## iOS URL Scheme

The Expo config derives the reversed iOS URL scheme from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

Example:

```text
1234567890-example.apps.googleusercontent.com
```

becomes:

```text
com.googleusercontent.apps.1234567890-example
```

iOS Google sign-in is disabled by default through `EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN_IOS=false`. Keep it disabled until ReTail also supports Sign in with Apple, unless Rachel explicitly enables it for controlled testing.

## Native Build Requirement

This feature uses `@react-native-google-signin/google-signin`, which requires native code. It cannot be tested in Expo Go.

After the environment variables and dashboard settings are ready, create a new EAS build before testing:

```text
eas build --profile preview --platform android
```

Do not expect the current installed beta to show Google sign-in until a new native build is installed.

## Manual Testing

Test these cases before launch:

- New regular user signs in with Google.
- Existing email/password user signs in with Google using the same verified email.
- Existing rescue user signs in with Google using the same verified email.
- User cancels the Google account selector.
- Device does not have Google Play Services available.
- Supabase Google provider is disabled or misconfigured.
- Google returns no profile photo.
- Sign out, then sign in with a different Google account.

Expected ReTail behavior:

- A new Google user defaults to a regular account.
- Existing ReTail profile account type is preserved.
- Rescue verification is not granted automatically.
- Email/password login remains available.
- Web preview does not show the native Google button.

## Common Errors

- `DEVELOPER_ERROR`: usually wrong Android client, package name, or SHA-1.
- `Google sign-in is not ready yet`: required public client IDs are missing or Google sign-in is disabled.
- `Google Play Services are not available`: device does not support Google Play Services or needs an update.
- Supabase provider error: Google provider is not enabled or the Web Client Secret is wrong in Supabase.
