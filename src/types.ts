import type {
  CATEGORIES,
  CATEGORY_FILTERS,
  CONDITIONS,
  LISTING_STATUSES,
} from './constants/categories';
import type { ComponentType } from 'react';

export type Category = (typeof CATEGORIES)[number];
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];
export type ListingCondition = (typeof CONDITIONS)[number];
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export type TabKey = 'browse' | 'favorites' | 'create' | 'messages' | 'profile';
export type AccountType = 'regular' | 'rescue';
export type ShippingPayer = 'buyer' | 'seller' | 'discuss';
export type MarketplaceSearchRadius = 10 | 25 | 50 | 100;

export type MarketplaceSearchArea = {
  id: string;
  slug: string;
  label: string;
  city?: string;
  state?: string;
  region_name?: string;
};

export type MarketplaceSearchPreference = {
  search_area_id: string;
  radius_miles: MarketplaceSearchRadius;
  label: string;
  city?: string;
  state?: string;
  region_name?: string;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: string;
  category: Category;
  condition: ListingCondition;
  image: string;
  city?: string;
  state?: string;
  location: string;
  zipCode?: string;
  distance: string;
  latitude?: number;
  longitude?: number;
  distanceMiles?: number;
  status: ListingStatus;
  sellerId?: string;
  seller: string;
  sellerRating: number;
  sellerReviews: number;
  posted: string;
  brand?: string;
  itemDimensions?: string;
  petSize?: string;
  conditionNotes?: string;
  availabilityNotes?: string;
  reasonForListing?: string;
  safetyConfirmed?: boolean;
  pickup: boolean;
  porchPickup: boolean;
  meetup: boolean;
  shipping: boolean;
  shippingPayer?: ShippingPayer;
  shippingCostEstimate?: string;
  handlingTime?: string;
  shipFromZipCode?: string;
  favoritedBy: number;
};

export type Conversation = {
  id: string;
  name: string;
  listing: string;
  preview: string;
  unread: boolean;
  time: string;
};

export type RescueNeedUrgency = 'High' | 'Medium' | 'Low';

export type RescueNeed = {
  id: string;
  item: string;
  quantity: string;
  urgency: RescueNeedUrgency;
  notes?: string;
};

export type RescueWishlistItem = {
  id: string;
  item: string;
  quantity: string;
  priority: RescueNeedUrgency;
  notes?: string;
};

export type RescueOrganizationType = 'Foster-based' | 'Physical location' | 'Hybrid';

export type RescueOrganization = {
  id: string;
  name: string;
  location: string;
  distance: string;
  distanceMiles?: number;
  latitude?: number;
  longitude?: number;
  verified: boolean;
  verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  summary: string;
  animalsRescued: string[];
  organizationType: RescueOrganizationType;
  has501c3: boolean;
  urgentNeeds: RescueNeed[];
  wishlistItems: RescueWishlistItem[];
  contactHint: string;
  contactPerson?: string;
  websiteUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  zipCode?: string;
};

export type ListingReportReason =
  | 'Spam'
  | 'Fraud'
  | 'Prohibited Item'
  | 'Harassment'
  | 'Inappropriate Content'
  | 'Duplicate Listing'
  | 'Other';

export type ListingReportSubmission = {
  listingId: string;
  reason: ListingReportReason;
  details?: string;
  reportedAt: string;
};

export type ListingForm = {
  title: string;
  price: string;
  description: string;
  category: Category;
  condition: ListingCondition;
  donation: boolean;
  pickup: boolean;
};

export type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
}>;
