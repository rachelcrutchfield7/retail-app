export type MarketplaceResolutionLevel = 'postal_code' | 'city';

export type MarketplaceGeocodeRequest = {
  countryCode: 'US';
  stateCode: string;
  city?: string;
  postalCode?: string;
  resolutionLevel: MarketplaceResolutionLevel;
};

export type MarketplaceGeocodeResult = {
  countryCode: string;
  stateCode: string;
  city: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  resolutionLevel: MarketplaceResolutionLevel;
  provider: string;
  providerLocationId?: string;
  providerAttribution?: string;
};

export interface MarketplaceGeocoder {
  resolve(request: MarketplaceGeocodeRequest): Promise<MarketplaceGeocodeResult>;
}

export type MarketplaceGeocoderErrorCode =
  | 'NO_MATCHING_LOCATION'
  | 'PROVIDER_LOCATION_MISMATCH'
  | 'PROVIDER_MALFORMED_RESPONSE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE';

export class MarketplaceGeocoderError extends Error {
  readonly code: MarketplaceGeocoderErrorCode;

  constructor(code: MarketplaceGeocoderErrorCode) {
    super(code);
    this.name = 'MarketplaceGeocoderError';
    this.code = code;
  }
}
