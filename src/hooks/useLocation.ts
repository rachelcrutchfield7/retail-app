import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { getLocationStoreState, setLocationStoreState } from '../store/locationStore';
import type { LocationStoreState } from '../store/locationStore';

export type ForegroundLocationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getForegroundLocationPermissionStatus(): Promise<ForegroundLocationPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  const existing = await Location.getForegroundPermissionsAsync();

  if (existing.status === 'granted') {
    return 'granted';
  }

  if (existing.status === 'denied' || existing.canAskAgain === false) {
    return 'denied';
  }

  return 'undetermined';
}

function stateAbbreviation(region?: string | null): string {
  const normalized = region?.trim().toUpperCase() ?? '';
  return normalized.length === 2 ? normalized : '';
}

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
    setError(null);

    try {
      if (Platform.OS === 'web') {
        const next = { ...getLocationStoreState(), permissionStatus: 'manual' as const };
        updateLocation(next);
        setError('Choose a marketplace area manually on this device.');
        return next;
      }

      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        const next = { ...getLocationStoreState(), permissionStatus: 'denied' as const };
        updateLocation(next);
        setError('Location access is off. You can still choose a marketplace area manually.');
        return next;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync(position.coords).catch(() => []);
      const place = places[0];
      const city = place?.city || place?.subregion || getLocationStoreState().city;
      const state = stateAbbreviation(place?.region) || getLocationStoreState().state;
      const zipCode = place?.postalCode || getLocationStoreState().zipCode;

      const next = {
        ...getLocationStoreState(),
        city: city || 'Current Area',
        state,
        zipCode,
        permissionStatus: 'granted' as const,
      };
      updateLocation(next);
      return next;
    } catch {
      const next = { ...getLocationStoreState(), permissionStatus: 'manual' as const };
      updateLocation(next);
      setError('We could not use your current location. Choose a marketplace area manually.');
      return next;
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
