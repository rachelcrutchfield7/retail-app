import { easyPostProvider } from './easypost.ts';
import { shipStationProvider } from './shipstation.ts';
import { shippingProviderName, type ShippingProvider, type ShippingProviderName } from './shippingProvider.ts';

export function getShippingProvider(name: ShippingProviderName = shippingProviderName()): ShippingProvider {
  return name === 'easypost' ? easyPostProvider : shipStationProvider;
}

export function mapProviderTrackingStatus(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase() ?? '';

  if (['label_created', 'unknown', 'accepted'].includes(normalized)) return 'label_created';
  if (['pre_transit', 'in_transit', 'it', 'ac'].includes(normalized)) return 'in_transit';
  if (['out_for_delivery', 'of'].includes(normalized)) return 'out_for_delivery';
  if (['delivered', 'de'].includes(normalized)) return 'delivered';
  if (['exception', 'ex', 'attempted_delivery'].includes(normalized)) return 'exception';
  if (['return_to_sender', 'returned', 'return'].includes(normalized)) return 'return_to_sender';
  if (['cancelled', 'voided'].includes(normalized)) return 'cancelled';

  return 'pending';
}
