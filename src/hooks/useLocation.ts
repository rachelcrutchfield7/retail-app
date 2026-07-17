import { useCallback, useState } from 'react';
import { getLocationStoreState, setLocationStoreState } from '../store/locationStore';
import type { LocationStoreState } from '../store/locationStore';

export function useLocation() {
  const [location, setLocation] = useState<LocationStoreState>(getLocationStoreState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLocation = useCallback((nextLocation: LocationStoreState) => {
    setLocationStoreState(nextLocation);
    setLocation(nextLocation);
  }, []);

  const setRadiusMiles = useCallback((radiusMiles: number) => {
    updateLocation({ ...getLocationStoreState(), radiusMiles });
  }, [updateLocation]);

  const setManualLocation = useCallback((nextLocation: Partial<LocationStoreState>) => {
    updateLocation({ ...getLocationStoreState(), ...nextLocation, permissionStatus: 'manual' });
    setError(null);
  }, [updateLocation]);

  const requestCurrentLocation = useCallback(async () => {
    setLoading(true);
    updateLocation({ ...getLocationStoreState(), permissionStatus: 'manual' });
    setError('Choose a marketplace area instead of using exact device location.');
    setLoading(false);
  }, [updateLocation]);

  return {
    location,
    loading,
    error,
    updateLocation,
    setManualLocation,
    setRadiusMiles,
    requestCurrentLocation,
  };
}
