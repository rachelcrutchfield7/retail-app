export const SITE_ORIGIN = 'https://www.retailpetapp.com';
export const SITE_NAME = 'ReTail Pet App';
export const SOCIAL_IMAGE_PATH = '/og-image.png';
export const APP_STORE_URL = 'https://apps.apple.com/us/app/retail-pet-marketplace/id6801206660';
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.raecrutchfield.retail';

export const INDEXABLE_PATHS = [
  '/',
  '/download/',
  '/100-listings/',
  '/how-it-works/',
  '/rescue-hub/',
  '/safety/',
  '/about/',
  '/contact/',
  '/privacy/',
  '/terms/',
  '/community-guidelines/',
  '/refunds-and-disputes/',
  '/shipping-and-fulfillment/',
  '/prohibited-items/',
] as const;

export function getCanonicalUrl(path: string): string {
  const normalizedPath = path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}/`;
  return new URL(normalizedPath, SITE_ORIGIN).toString();
}

export function getSocialImageUrl(): string {
  return new URL(SOCIAL_IMAGE_PATH, SITE_ORIGIN).toString();
}
