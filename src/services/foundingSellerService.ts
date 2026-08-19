import { supabase } from '../lib/supabase';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';

export type FoundingSellerBenefitState = {
  active: boolean;
  freeSalesLimit: number;
  appliedSalesCount: number;
  reservedSalesCount: number;
  remainingFeeFreeSales: number;
};

export async function getMyFoundingSellerBenefitState(): Promise<FoundingSellerBenefitState> {
  const profile = await ensureCurrentProfile();
  const { data: benefit, error: benefitError } = await supabase
    .from('founding_seller_benefits')
    .select('id,free_sales_limit,status')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  if (benefitError) {
    throwSupabaseError(benefitError, 'We could not load your Founding Seller benefit.');
  }

  if (!benefit) {
    return {
      active: false,
      freeSalesLimit: 3,
      appliedSalesCount: 0,
      reservedSalesCount: 0,
      remainingFeeFreeSales: 0,
    };
  }

  const benefitId = String((benefit as Record<string, unknown>).id);
  const freeSalesLimit = Number((benefit as Record<string, unknown>).free_sales_limit ?? 3);
  const { data: uses, error: usesError } = await supabase
    .from('founding_seller_benefit_uses')
    .select('status,expires_at')
    .eq('benefit_id', benefitId)
    .in('status', ['reserved', 'applied']);

  if (usesError) {
    throwSupabaseError(usesError, 'We could not load your Founding Seller benefit.');
  }

  const now = Date.now();
  const activeUses = (uses ?? []).filter((row) => {
    const status = String((row as Record<string, unknown>).status);
    const expiresAt = String((row as Record<string, unknown>).expires_at ?? '');
    return status === 'applied' || (status === 'reserved' && (!expiresAt || Date.parse(expiresAt) > now));
  });
  const appliedSalesCount = activeUses.filter((row) => String((row as Record<string, unknown>).status) === 'applied').length;
  const reservedSalesCount = activeUses.filter((row) => String((row as Record<string, unknown>).status) === 'reserved').length;

  return {
    active: true,
    freeSalesLimit,
    appliedSalesCount,
    reservedSalesCount,
    remainingFeeFreeSales: Math.max(freeSalesLimit - appliedSalesCount - reservedSalesCount, 0),
  };
}
