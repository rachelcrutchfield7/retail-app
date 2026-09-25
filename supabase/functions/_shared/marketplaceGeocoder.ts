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
  localitySource?: 'provider' | 'server_candidate_fallback';
  providerLocationId?: string;
  providerAttribution?: string;
};

export type MarketplaceGeocoderRequestDiagnostics = {
  countryHintPresent: boolean;
  stateHintPresent: boolean;
  postalHintPresent: boolean;
  cityHintPresent: boolean;
  endpointModeValid: boolean;
  encodingValid: boolean;
  credentialMechanismValid: boolean;
};

export interface MarketplaceGeocoder {
  resolve(request: MarketplaceGeocodeRequest): Promise<MarketplaceGeocodeResult>;
  inspectRequest?(request: MarketplaceGeocodeRequest): MarketplaceGeocoderRequestDiagnostics;
}

export type MarketplaceGeocoderErrorCode =
  | 'NO_MATCHING_LOCATION'
  | 'PROVIDER_LOCATION_MISMATCH'
  | 'PROVIDER_MALFORMED_RESPONSE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE';

export type MarketplaceGeocoderDiagnosticCode =
  | 'PROVIDER_RESPONSE_JSON_INVALID'
  | 'PROVIDER_RESPONSE_NOT_OBJECT'
  | 'PROVIDER_RESULTS_MISSING'
  | 'PROVIDER_RESULTS_NOT_ARRAY'
  | 'PROVIDER_RESULTS_EMPTY'
  | 'PROVIDER_RESULT_NOT_OBJECT'
  | 'PROVIDER_LOCALITY_MISSING'
  | 'PROVIDER_LOCALITY_TOO_LONG'
  | 'PROVIDER_LATITUDE_INVALID'
  | 'PROVIDER_LONGITUDE_INVALID'
  | 'PROVIDER_RESULT_TYPE_MISSING';

export class MarketplaceGeocoderError extends Error {
  readonly code: MarketplaceGeocoderErrorCode;
  readonly diagnosticCode?: MarketplaceGeocoderDiagnosticCode;

  constructor(
    code: MarketplaceGeocoderErrorCode,
    diagnosticCode?: MarketplaceGeocoderDiagnosticCode
  ) {
    super(code);
    this.name = 'MarketplaceGeocoderError';
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}
