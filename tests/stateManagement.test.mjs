import assert from 'node:assert/strict';
import test from 'node:test';
import { cachePolicy } from '../src/lib/cachePolicy.ts';
import { getQueryData, setQueryData } from '../src/lib/queryClient.ts';
import { queryKeys } from '../src/lib/queryKeys.ts';
import { getAuthStoreState, setAuthStoreState } from '../src/store/authStore.ts';
import { getFilterStoreState } from '../src/store/filterStore.ts';
import { getLocationStoreState } from '../src/store/locationStore.ts';
import { handleAppError } from '../src/utils/errorHandler.ts';

test('query keys match the state management contract', () => {
  assert.deepEqual(queryKeys.listings, ['listings']);
  assert.deepEqual(queryKeys.listing('l1'), ['listing', 'l1']);
  assert.deepEqual(queryKeys.favorites('u1'), ['favorites', 'u1']);
  assert.deepEqual(queryKeys.messages('c1'), ['messages', 'c1']);
  assert.deepEqual(queryKeys.savedSearches('u1'), ['saved-searches', 'u1']);
});

test('query cache accepts array query keys', () => {
  setQueryData(queryKeys.listing('l1'), { id: 'l1' });

  assert.deepEqual(getQueryData(queryKeys.listing('l1')), { id: 'l1' });
});

test('cache policies match MVP defaults', () => {
  assert.equal(cachePolicy.listings.pageSize, 20);
  assert.equal(cachePolicy.messages.pageSize, 50);
  assert.equal(cachePolicy.notifications.pageSize, 20);
  assert.equal(cachePolicy.favorites.optimisticUpdates, true);
  assert.equal(cachePolicy.savedSearches.staleTime, 5 * 60 * 1000);
});

test('stores expose required global state fields', () => {
  setAuthStoreState({ user: null, profile: null, session: null, loading: false, isGuest: false });

  assert.equal(getAuthStoreState().isGuest, true);
  assert.equal(getLocationStoreState().radiusMiles, 25);
  assert.equal(getLocationStoreState().permissionStatus, 'manual');
  assert.equal(getFilterStoreState().searchQuery, '');
  assert.equal(getFilterStoreState().sortBy, 'distance');
});

test('handleAppError normalizes unknown errors', () => {
  assert.deepEqual(handleAppError(new Error('Please try again')), {
    code: 'UNKNOWN_ERROR',
    message: 'Please try again',
    userMessage: 'Please try again',
  });
});
