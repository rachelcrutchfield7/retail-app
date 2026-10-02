// REQUIRED BEFORE DEPLOYMENT: add the live Google Forms URL between the quotes.
// Leave this empty until Rachel supplies the real URL. Never use a placeholder or old form URL.
export const alternateEntryFormUrl = '';

export function getValidAlternateEntryFormUrl(value = alternateEntryFormUrl): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const isGoogleForm = url.hostname === 'forms.gle'
      || (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/'));

    return url.protocol === 'https:' && isGoogleForm ? url.toString() : null;
  } catch {
    return null;
  }
}
