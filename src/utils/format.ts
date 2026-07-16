import type { Listing } from '../types.ts';

export function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .replace('.', '')
    .slice(0, 2)
    .toUpperCase();
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function listingLocationLabel(listing: Pick<Listing, 'distance' | 'location'>): string {
  const normalizedDistance = listing.distance.trim().toLowerCase();
  const distanceIsUseful = normalizedDistance.length > 0 && !normalizedDistance.startsWith('distance ');

  if (distanceIsUseful && listing.location) {
    return `${listing.distance} - ${listing.location}`;
  }

  if (listing.location) {
    return listing.location;
  }

  return distanceIsUseful ? listing.distance : 'Location unavailable';
}
