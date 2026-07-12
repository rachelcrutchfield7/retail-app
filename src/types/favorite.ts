import type { ListingSummary } from '../services/types';

export type Favorite = {
  id: string;
  user_id: string;
  listing_id: string;
  created_at: string;
};

export type FavoriteListing = ListingSummary;
