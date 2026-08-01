import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const templates = {
  'confirm-signup.html': ['{{ .ConfirmationURL }}'],
  'reset-password.html': ['{{ .ConfirmationURL }}', '{{ .Email }}'],
  'change-email.html': ['{{ .ConfirmationURL }}', '{{ .Email }}', '{{ .NewEmail }}'],
  'magic-link.html': ['{{ .ConfirmationURL }}', '{{ .Email }}'],
  'invite-user.html': ['{{ .ConfirmationURL }}', '{{ .Email }}'],
  'reauthentication.html': ['{{ .Token }}', '{{ .Email }}'],
};

test('supabase auth email templates keep ReTail branding and required placeholders', () => {
  for (const [fileName, placeholders] of Object.entries(templates)) {
    const source = readFileSync(new URL(`../docs/email-templates/${fileName}`, import.meta.url), 'utf8');

    assert.match(source, /ReTail/);
    assert.match(source, /retailpetapp\.com/);
    assert.match(source, /support@retailpetapp\.com/);
    assert.match(source, /#0F8A83/);
    assert.match(source, /#F26B4F/);
    assert.doesNotMatch(source, /example\.com|Sample Connect Business/);

    for (const placeholder of placeholders) {
      assert.ok(source.includes(placeholder), `${fileName} is missing ${placeholder}`);
    }
  }
});

test('welcome email uses the hosted ReTail logo asset without exposing template email text', () => {
  const source = readFileSync(new URL('../docs/email-templates/confirm-signup.html', import.meta.url), 'utf8');
  const logoPath = new URL('../assets/email/retail-logo-email.png', import.meta.url);

  assert.ok(existsSync(logoPath), 'Missing ReTail email logo asset');
  assert.match(source, /https:\/\/www\.retailpetapp\.com\/assets\/email\/retail-logo-email\.png/);
  assert.match(source, /alt="ReTail"/);
  assert.doesNotMatch(source, /\{\{ \.Email \}\}/);
});

test('email template setup docs list every branded Supabase email', () => {
  const readme = readFileSync(new URL('../docs/email-templates/README.md', import.meta.url), 'utf8');

  for (const fileName of Object.keys(templates)) {
    assert.match(readme, new RegExp(fileName.replace('.', '\\.')));
  }
  assert.match(readme, /Confirm your ReTail account/);
  assert.match(readme, /Reset your ReTail password/);
  assert.match(readme, /Confirm your ReTail email change/);
  assert.match(readme, /Sign in to ReTail/);
  assert.match(readme, /You have been invited to ReTail/);
  assert.match(readme, /Your ReTail verification code/);
});
