# ReTail Supabase Email Templates

Supabase email templates are edited in the Supabase dashboard:

Authentication -> Email Templates -> Confirm signup

Use:

Subject:

```text
Confirm your ReTail account
```

Message body:

Paste the HTML from `confirm-signup.html`.

The template uses Supabase's built-in `{{ .ConfirmationURL }}` value so the confirmation button verifies the user's email address.
