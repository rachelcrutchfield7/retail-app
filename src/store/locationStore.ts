export type LocationStoreState = {
  latitude?: number;
  longitude?: number;
  city: string;
  state: string;
  zipCode?: string;
  radiusMiles: number;
  permissionStatus: 'unknown' | 'prompt' | 'granted' | 'denied' | 'manual';
};

export const defaultLocationState: LocationStoreState = {
  latitude: 30.2672,
  longitude: -97.7431,
  city: 'Austin',
  state: 'TX',
  radiusMiles: 25,
  permissionStatus: 'manual',
};

let locationState: LocationStoreState = defaultLocationState;

export function setLocationStoreState(nextState: LocationStoreState): void {
  locationState = nextState;
}

export function getLocationStoreState(): LocationStoreState {
  return locationState;
}
