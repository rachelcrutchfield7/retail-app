export type LocationStoreState = {
  city: string;
  state: string;
  zipCode?: string;
  radiusMiles: number;
  permissionStatus: 'unknown' | 'prompt' | 'granted' | 'denied' | 'manual';
};

export const defaultLocationState: LocationStoreState = {
  city: 'Marketplace Area',
  state: '',
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
