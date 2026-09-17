import type { Listing, ListingSort } from '../types';

export type HomeListingSort = 'recent' | 'nearby' | 'price-low' | 'price-high';

export function homeListingSortQueryValue(sort: HomeListingSort): ListingSort {
  if (sort === 'nearby') {
    return 'distance';
  }

  if (sort === 'price-low') {
    return 'price_asc';
  }

  if (sort === 'price-high') {
    return 'price_desc';
  }

  return 'recent';
}

export function sortHomeListings(listings: Listing[], sort: HomeListingSort): Listing[] {
  const sortedListings = [...listings];

  if (sort === 'price-low') {
    return sortedListings.sort(
      (first, second) => listingPriceLowValue(first) - listingPriceLowValue(second) || newestFirst(first, second)
    );
  }

  if (sort === 'price-high') {
    return sortedListings.sort(
      (first, second) => listingPriceHighValue(second) - listingPriceHighValue(first) || newestFirst(first, second)
    );
  }

  if (sort === 'nearby') {
    return sortedListings;
  }

  return sortedListings.sort(newestFirst);
}

function listingPriceLowValue(listing: Listing): number {
  return listing.listingType === 'sale' ? listing.priceAmount ?? 0 : 0;
}

function listingPriceHighValue(listing: Listing): number {
  return listing.listingType === 'sale' ? listing.priceAmount ?? 0 : -1;
}

function newestFirst(first: Listing, second: Listing): number {
  const timestampDifference = listingRecencyValue(second) - listingRecencyValue(first);
  return timestampDifference || first.id.localeCompare(second.id);
}

function listingRecencyValue(listing: Listing): number {
  const timestamp = new Date(listing.publishedAt ?? listing.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
