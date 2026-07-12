import { useCallback, useState } from 'react';
import { getLocationStoreState, setLocationStoreState } from '../store/locationStore';
import type { LocationStoreState } from '../store/locationStore';

type GeolocationPositionLike = {
  coords: {
    latitude: number;
    longitude: number;
  };
};

type GeolocationErrorLike = {
  code?: number;
  message?: string;
};

type PermissionStatusLike = {
  state: 'granted' | 'denied' | 'prompt';
};

type PermissionsLike = {
  query: (descriptor: { name: 'geolocation' }) => Promise<PermissionStatusLike>;
};

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
    const geolocation = globalThis.navigator?.geolocation;

    if (!geolocation) {
      updateLocation({ ...getLocationStoreState(), permissionStatus: 'denied' });
      setError('This browser preview does not provide location access. Choose a nearby area below to keep testing distance sorting.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const permissions = globalThis.navigator?.permissions as PermissionsLike | undefined;
      const permission = permissions ? await permissions.query({ name: 'geolocation' }) : null;

      if (permission?.state === 'denied') {
        updateLocation({ ...getLocationStoreState(), permissionStatus: 'denied' });
        setError('Location access is blocked for this browser. Allow location for this site, then tap Use Current Location again.');
        return;
      }

      if (permission?.state === 'prompt') {
        updateLocation({ ...getLocationStoreState(), permissionStatus: 'prompt' });
      }

      await new Promise<void>((resolve) => {
      geolocation.getCurrentPosition(
        (position: GeolocationPositionLike) => {
          updateLocation({
            ...getLocationStoreState(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            city: 'Current Location',
            state: '',
            permissionStatus: 'granted',
          });
          setError(null);
          resolve();
        },
        (locationError: GeolocationErrorLike) => {
          updateLocation({ ...getLocationStoreState(), permissionStatus: 'denied' });
          setError(getGeolocationErrorMessage(locationError));
          resolve();
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
      });
    } catch {
      updateLocation({ ...getLocationStoreState(), permissionStatus: 'denied' });
      setError('We could not ask for location access in this browser. Choose a nearby area below to keep testing.');
    } finally {
      setLoading(false);
    }
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

function getGeolocationErrorMessage(error: GeolocationErrorLike): string {
  if (error.code === 1) {
    return 'Location access was denied. Allow location for this site in your browser settings, then try again.';
  }

  if (error.code === 2) {
    return 'Your device could not provide a location right now. Check location services, or choose a nearby area below.';
  }

  if (error.code === 3) {
    return 'Location took too long to respond. Try again, or choose a nearby area below.';
  }

  return 'We could not access your location. Choose a nearby area below to keep testing distance sorting.';
}
