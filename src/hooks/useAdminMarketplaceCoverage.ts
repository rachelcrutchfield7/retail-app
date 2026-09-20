import { useQuery } from '@tanstack/react-query';

import {
  getAdminMarketplaceCoverage,
  getAdminMarketplaceListings,
} from '../services/adminService';
import { getCategories } from '../services/categoryService';

import type {
  AdminMarketplaceCoverageArea,
  AdminMarketplaceListingFilters,
  AdminMarketplaceListingPage,
} from '../services/adminService';

import { handleAppError } from '../utils/errorHandler';

export function useAdminMarketplaceCoverage(
  enabled: boolean,
  filters: AdminMarketplaceListingFilters = {}
) {
  const coverageQuery = useQuery<AdminMarketplaceCoverageArea[]>({
    queryKey: ['admin-marketplace-coverage'],
    queryFn: getAdminMarketplaceCoverage,
    enabled,
  });

  const listingsQuery = useQuery<AdminMarketplaceListingPage>({
    queryKey: ['admin-marketplace-listings', filters],
    queryFn: () => getAdminMarketplaceListings(filters),
    enabled,
  });

  const categoriesQuery = useQuery({
    queryKey: ['admin-marketplace-categories'],
    queryFn: getCategories,
    enabled,
  });

  return {
    coverage: coverageQuery.data ?? [],
    coverageLoading: coverageQuery.isLoading,
    coverageError: coverageQuery.error
      ? handleAppError(coverageQuery.error).userMessage
      : null,
    refreshCoverage: coverageQuery.refetch,

    listings: listingsQuery.data?.items ?? [],
    listingTotal: listingsQuery.data?.total ?? 0,
    page: listingsQuery.data?.page ?? filters.page ?? 1,
    pageSize: listingsQuery.data?.pageSize ?? filters.pageSize ?? 50,
    listingsLoading: listingsQuery.isLoading,
    listingsError: listingsQuery.error
      ? handleAppError(listingsQuery.error).userMessage
      : null,
    refreshListings: listingsQuery.refetch,

    categories: categoriesQuery.data ?? [],
    categoriesLoading: categoriesQuery.isLoading,
    categoriesError: categoriesQuery.error
      ? handleAppError(categoriesQuery.error).userMessage
      : null,

    refreshAll: async () => {
      await Promise.all([
        coverageQuery.refetch(),
        listingsQuery.refetch(),
      ]);
    },
  };
}
