# ReTail Supabase Email Templates

These files are the branded HTML templates for the emails people receive from ReTail through Supabase Auth.

Supabase dashboard path:

```text
Authentication -> Emails -> Templates
```

If the project uses Supabase's default email provider on a newer free-tier project, Supabase may block template customization. Use a Pro project or configure custom SMTP first, then paste these templates.

## Templates

| Supabase template | Subject | HTML file |
| --- | --- | --- |
| Confirm signup | Confirm your ReTail account | `confirm-signup.html` |
| Reset password | Reset your ReTail password | `reset-password.html` |
| Change email address | Confirm your ReTail email change | `change-email.html` |
| Magic link / OTP | Sign in to ReTail | `magic-link.html` |
| Invite user | You have been invited to ReTail | `invite-user.html` |
| Reauthentication | Your ReTail verification code | `reauthentication.html` |

## Sender

Recommended sender name:

```text
ReTail
```

Recommended sender email:

```text
support@retailpetapp.com
```

## Logo

The welcome email uses this app asset:

```text
assets/email/retail-logo-email.png
```

Email clients can only load images from a public URL, so the matching hosted URL in the template is:

```text
https://www.retailpetapp.com/assets/email/retail-logo-email.png
```

Make sure that file is uploaded to the website at the same path before sending production emails.

## Notes

The templates keep Supabase's required variables in place:

```text
{{ .ConfirmationURL }}
{{ .Token }}
{{ .Email }}
{{ .NewEmail }}
```

Do not replace or remove those placeholders in Supabase.
