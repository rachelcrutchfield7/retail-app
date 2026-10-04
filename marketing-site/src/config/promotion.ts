export const promotion = {
  startUtc: '2026-10-09T13:00:00Z',
  endUtc: '2026-10-12T13:00:00Z',
  startDisplay: 'October 9, 2026 at 8:00 AM CT',
  endDisplay: 'October 12, 2026 at 8:00 AM CT',
  startDisplayLong: 'October 9, 2026 at 8:00 AM Central Time',
  endDisplayLong: 'October 12, 2026 at 8:00 AM Central Time',
  targetListingCount: 100,
} as const;

export const alternateEntryFormUrl = 'https://forms.gle/rXzXM4TGuoRUNBfcA';

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
