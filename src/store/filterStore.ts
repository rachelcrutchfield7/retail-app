import type { ListingCondition } from '../types.ts';
import type { ListingType } from '../services/types';

export type FilterStoreState = {
  searchQuery: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: ListingCondition;
  listingType?: ListingType;
  sortBy: 'distance' | 'recent' | 'price_low' | 'price_high';
};

let filterState: FilterStoreState = {
  searchQuery: '',
  sortBy: 'distance',
};

export function setFilterStoreState(nextState: FilterStoreState): void {
  filterState = nextState;
}

export function getFilterStoreState(): FilterStoreState {
  return filterState;
}
