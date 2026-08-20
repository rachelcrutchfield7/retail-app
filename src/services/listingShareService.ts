import { Platform, Share } from 'react-native';
import { appLinks } from '../constants/links';
import { trackEvent } from '../lib/analytics';
import type { Listing } from '../types';
import { createServiceError } from './errors';

export type ListingShareSource = 'listing_detail' | 'post_publish';

type ListingShareContent = {
  title: string;
  message: string;
  url: string;
};

const publicListingStatuses = new Set(['Active']);
const listingDeepLinkPrefix = 'retail://listing/';

export function getCanonicalListingUrl(listingId: string): string {
  return appLinks.listingUrl(listingId);
}

export function getListingIdFromSharedUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  const webMatch = trimmed.match(/^https:\/\/(?:www\.)?retailpetapp\.com\/listing\/([^/?#]+)/i);
  const deepLinkId = trimmed.toLowerCase().startsWith(listingDeepLinkPrefix)
    ? trimmed.slice(listingDeepLinkPrefix.length).split(/[/?#]/)[0]
    : null;
  const rawId = webMatch?.[1] ?? deepLinkId;

  if (!rawId) {
    return null;
  }

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
}

export function isListingShareable(listing: Pick<Listing, 'status'>): boolean {
  return publicListingStatuses.has(String(listing.status));
}

export function buildListingShareContent(listing: Pick<Listing, 'id' | 'title' | 'price' | 'listingType' | 'status'>): ListingShareContent {
  if (!isListingShareable(listing)) {
    throw createServiceError(
      'LISTING_NOT_SHAREABLE',
      `Listing ${listing.id} with status ${listing.status} is not public-share eligible`,
      'This listing is not available to share.'
    );
  }

  const url = getCanonicalListingUrl(listing.id);
  const title = listing.title.trim() || 'pet supply listing';
  const price = listing.listingType === 'sale' && listing.price ? ` for ${listing.price}` : '';

  return {
    title: `${title} on ReTail`,
    message: `Check out this ${title}${price} on ReTail!`,
    url,
  };
}

export async function shareListing(listing: Listing, source: ListingShareSource = 'listing_detail') {
  const content = buildListingShareContent(listing);

  trackEvent('listing_share_opened', {
    listingId: listing.id,
    source,
  });

  const result = await Share.share(
    Platform.OS === 'ios'
      ? {
          title: content.title,
          message: content.message,
          url: content.url,
        }
      : {
          title: content.title,
          message: `${content.message}\n${content.url}`,
        }
  );

  if (result.action !== Share.dismissedAction) {
    trackEvent('listing_shared', {
      listingId: listing.id,
      source,
    });
  }

  return result;
}
