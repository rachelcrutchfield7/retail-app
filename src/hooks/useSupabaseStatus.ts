import { getSupabaseRuntimeConfig } from '../lib/supabase';

export function useSupabaseStatus() {
  const config = getSupabaseRuntimeConfig();

  return {
    configured: config.configured,
    label: config.configured ? 'Connected' : 'Add environment keys later',
  };
}
