import type { Listing, ListingSort, ListingType } from '../types';

export const listingTypeOptions: Array<{
  value: ListingType;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    value: 'sale',
    title: 'Sell',
    description: 'Set a price and sell this item to another ReTail user.',
    badge: 'For Sale',
  },
  {
    value: 'free',
    title: 'Give away',
    description: 'Offer this item free to any nearby ReTail user.',
    badge: 'Free',
  },
  {
    value: 'donation',
    title: 'Donate to a rescue',
    description: 'Offer this item free to a verified animal rescue organization.',
    badge: 'Rescue Donation',
  },
];

export const listingSortOptions: Array<{ value: ListingSort; label: string }> = [
  { value: 'recent', label: 'Recently added' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'distance', label: 'Distance: nearest' },
  { value: 'favorites', label: 'Most favorited' },
];

export function listingTypeBadgeLabel(listingType: ListingType): string {
  return listingTypeOptions.find((option) => option.value === listingType)?.badge ?? 'For Sale';
}

export function listingTypeFilterLabel(listingType: ListingType): string {
  return listingType === 'sale' ? 'For Sale' : listingTypeBadgeLabel(listingType);
}

export function listingSortLabel(sort: ListingSort): string {
  return listingSortOptions.find((option) => option.value === sort)?.label ?? 'Recently added';
}

export function sortListingsForPreview(listings: Listing[], sort: ListingSort): Listing[] {
  return [...listings].sort((first, second) => compareListings(first, second, sort));
}

function compareListings(first: Listing, second: Listing, sort: ListingSort): number {
  if (sort === 'price_asc') {
    return priceLowValue(first) - priceLowValue(second) || newestFirst(first, second);
  }

  if (sort === 'price_desc') {
    return priceHighValue(second) - priceHighValue(first) || newestFirst(first, second);
  }

  if (sort === 'distance') {
    return distanceValue(first) - distanceValue(second) || newestFirst(first, second);
  }

  if (sort === 'favorites') {
    return second.favoritedBy - first.favoritedBy || newestFirst(first, second);
  }

  return newestFirst(first, second);
}

function priceLowValue(listing: Listing): number {
  return listing.listingType === 'sale' ? listing.priceAmount ?? 0 : 0;
}

function priceHighValue(listing: Listing): number {
  return listing.listingType === 'sale' ? listing.priceAmount ?? 0 : -1;
}

function distanceValue(listing: Listing): number {
  return listing.distanceMiles ?? Number.MAX_SAFE_INTEGER;
}

function newestFirst(first: Listing, second: Listing): number {
  return new Date(second.publishedAt ?? second.createdAt).getTime() - new Date(first.publishedAt ?? first.createdAt).getTime();
}
