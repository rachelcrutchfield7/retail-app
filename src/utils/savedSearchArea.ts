import type { SavedSearch } from '../services/types';
import type { MarketplaceSearchArea, MarketplaceSearchPreference, MarketplaceSearchRadius } from '../types';

const allowedRadii: MarketplaceSearchRadius[] = [10, 25, 50, 100];

export async function applySavedSearchArea({
  savedSearch,
  areas,
  preference,
  setSearchArea,
}: {
  savedSearch: SavedSearch;
  areas: MarketplaceSearchArea[];
  preference: MarketplaceSearchPreference | null;
  setSearchArea: (input: { searchAreaId: string; radiusMiles: MarketplaceSearchRadius }) => Promise<MarketplaceSearchPreference>;
}): Promise<MarketplaceSearchPreference> {
  const city = savedSearch.city?.trim().toLowerCase();
  const state = savedSearch.state?.trim().toLowerCase();
  const matches = city && state
    ? areas.filter((area) => area.city?.trim().toLowerCase() === city && area.state?.trim().toLowerCase() === state)
    : [];

  if (matches.length !== 1) {
    throw new Error('This saved search area is no longer available. Choose a marketplace area and save a new search.');
  }

  const radius = savedSearch.radius_miles;
  if (!allowedRadii.includes(radius as MarketplaceSearchRadius)) {
    throw new Error('This saved search distance is no longer supported. Choose 10, 25, 50, or 100 miles.');
  }

  const target = matches[0];
  if (preference?.search_area_id === target.id && preference.radius_miles === radius) {
    return preference;
  }

  const updated = await setSearchArea({ searchAreaId: target.id, radiusMiles: radius as MarketplaceSearchRadius });
  if (updated.search_area_id !== target.id || updated.radius_miles !== radius) {
    throw new Error('The saved marketplace area was not confirmed. Refresh your search and try again.');
  }

  return updated;
}
