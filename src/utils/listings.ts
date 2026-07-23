import { listingImages } from '../data/mockData';
import type { Listing, ListingForm } from '../types.ts';
import { normalizeListingPrice } from '../validation/listings';

type CreateLocalListingParams = {
  form: ListingForm;
  listingCount: number;
};

export function createLocalListing({ form, listingCount }: CreateLocalListingParams): Listing {
  const listingType = form.donation ? 'free' : 'sale';
  const priceAmount = listingType === 'sale' ? Number(form.price.replace(/[^0-9.]/g, '')) || 0 : null;
  const createdAt = new Date().toISOString();

  return {
    id: `l${Date.now()}`,
    title: form.title.trim(),
    description: form.description.trim(),
    price: normalizeListingPrice(form),
    listingType,
    priceAmount,
    category: form.category,
    condition: form.condition,
    image: listingImages[listingCount % listingImages.length],
    location: 'Austin, TX',
    distance: '0.4 mi',
    status: 'Active',
    seller: 'Rachel C.',
    sellerRating: 4.9,
    sellerReviews: 8,
    posted: 'Just now',
    createdAt,
    publishedAt: createdAt,
    pickup: form.pickup,
    porchPickup: false,
    meetup: form.pickup,
    shipping: false,
    favoritedBy: 0,
  };
}
