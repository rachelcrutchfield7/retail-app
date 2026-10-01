import { supabase } from '../lib/supabase';

export const DEFAULT_USER_MARKETPLACE_PREFERENCES = {
  petInterests: ['Dogs', 'Cats'],
  showRescueDonationMatches: true,
  savedSearchAlertsDefault: true,
} as const;

export type UserMarketplacePreferences = {
  petInterests: string[];
  showRescueDonationMatches: boolean;
  savedSearchAlertsDefault: boolean;
};

export type UpdateUserMarketplacePreferencesInput = UserMarketplacePreferences;

type UserMarketplacePreferencesRow = {
  user_id: string;
  pet_interests: string[];
  show_rescue_donation_matches: boolean;
  saved_search_alerts_default: boolean;
};

function mapPreferenceRow(
  row: UserMarketplacePreferencesRow
): UserMarketplacePreferences {
  return {
    petInterests: row.pet_interests,
    showRescueDonationMatches: row.show_rescue_donation_matches,
    savedSearchAlertsDefault: row.saved_search_alerts_default,
  };
}

async function requireAuthenticatedUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error('You must be signed in to manage marketplace preferences.');
  }

  return user.id;
}

export async function getUserMarketplacePreferences(): Promise<UserMarketplacePreferences> {
  const userId = await requireAuthenticatedUserId();

  const { data, error } = await supabase
    .from('user_marketplace_preferences')
    .select(
      'user_id, pet_interests, show_rescue_donation_matches, saved_search_alerts_default'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      petInterests: [...DEFAULT_USER_MARKETPLACE_PREFERENCES.petInterests],
      showRescueDonationMatches:
        DEFAULT_USER_MARKETPLACE_PREFERENCES.showRescueDonationMatches,
      savedSearchAlertsDefault:
        DEFAULT_USER_MARKETPLACE_PREFERENCES.savedSearchAlertsDefault,
    };
  }

  return mapPreferenceRow(data as UserMarketplacePreferencesRow);
}

export async function updateUserMarketplacePreferences(
  input: UpdateUserMarketplacePreferencesInput
): Promise<UserMarketplacePreferences> {
  const userId = await requireAuthenticatedUserId();

  const { data, error } = await supabase
    .from('user_marketplace_preferences')
    .upsert(
      {
        user_id: userId,
        pet_interests: input.petInterests,
        show_rescue_donation_matches: input.showRescueDonationMatches,
        saved_search_alerts_default: input.savedSearchAlertsDefault,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select(
      'user_id, pet_interests, show_rescue_donation_matches, saved_search_alerts_default'
    )
    .single();

  if (error) {
    throw error;
  }

  return mapPreferenceRow(data as UserMarketplacePreferencesRow);
}
