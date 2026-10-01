import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

const migration = read(
  'supabase/migrations/20260930203000_user_marketplace_preferences.sql'
);
const service = read(
  'src/services/userMarketplacePreferencesService.ts'
);
const hook = read(
  'src/hooks/useUserMarketplacePreferences.ts'
);
const queryKeys = read('src/lib/queryKeys.ts');

test('marketplace preferences persist only the new user-level preference fields', () => {
  assert.match(
    migration,
    /create table if not exists public\.user_marketplace_preferences/
  );

  assert.match(
    migration,
    /pet_interests text\[\] not null default array\['Dogs', 'Cats'\]::text\[\]/
  );

  assert.match(
    migration,
    /show_rescue_donation_matches boolean not null default true/
  );

  assert.match(
    migration,
    /saved_search_alerts_default boolean not null default true/
  );

  const tableDefinition = migration.match(
    /create table if not exists public\.user_marketplace_preferences \(([\s\S]*?)\n\);/
  )?.[1] ?? '';

  assert.doesNotMatch(
    tableDefinition,
    /\bradius(_miles)?\b/
  );
});

test('marketplace preference storage is restricted to the authenticated owner', () => {
  assert.match(
    migration,
    /alter table public\.user_marketplace_preferences enable row level security/
  );

  assert.match(
    migration,
    /for select[\s\S]*?to authenticated[\s\S]*?auth\.uid\(\)\) = user_id/
  );

  assert.match(
    migration,
    /for insert[\s\S]*?to authenticated[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/
  );

  assert.match(
    migration,
    /for update[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/
  );

  assert.match(
    migration,
    /revoke all on table public\.user_marketplace_preferences from anon/
  );
});

test('client defaults match database defaults and do not duplicate Location V2 radius', () => {
  assert.match(
    service,
    /petInterests: \['Dogs', 'Cats'\]/
  );

  assert.match(
    service,
    /showRescueDonationMatches: true/
  );

  assert.match(
    service,
    /savedSearchAlertsDefault: true/
  );

  assert.doesNotMatch(
    service,
    /radiusMiles|radius_miles|defaultRadius|default_distance/
  );

  assert.match(
    service,
    /\.from\('user_marketplace_preferences'\)/
  );

  assert.match(
    service,
    /\.maybeSingle\(\)/
  );

  assert.match(
    service,
    /\.upsert\(/
  );
});

test('preference client requires authentication and scopes reads and writes to the current user', () => {
  assert.match(
    service,
    /supabase\.auth\.getUser\(\)/
  );

  assert.match(
    service,
    /\.eq\('user_id', userId\)/
  );

  assert.match(
    service,
    /user_id: userId/
  );

  assert.match(
    service,
    /You must be signed in to manage marketplace preferences/
  );
});

test('preference query contract has a dedicated cache identity', () => {
  assert.match(
    queryKeys,
    /userMarketplacePreferences: \['user-marketplace-preferences'\] as const/
  );

  assert.match(
    hook,
    /queryKeys\.userMarketplacePreferences/
  );

  assert.match(
    hook,
    /getUserMarketplacePreferences/
  );

  assert.match(
    hook,
    /updateUserMarketplacePreferences/
  );
});

test('Preferences UI loads and saves persistent marketplace preferences', () => {
  const sprint4App = read('src/sprint4/Sprint4App.tsx');

  assert.match(
    sprint4App,
    /const preferences = useUserMarketplacePreferences\(\);/
  );

  assert.match(
    sprint4App,
    /const preferencesUpdate = useUpdateUserMarketplacePreferences\(\);/
  );

  assert.match(
    sprint4App,
    /setSelectedPets\(preferences\.data\.petInterests\)/
  );

  assert.match(
    sprint4App,
    /setShowRescueMatches\(preferences\.data\.showRescueDonationMatches\)/
  );

  assert.match(
    sprint4App,
    /setSearchAlerts\(preferences\.data\.savedSearchAlertsDefault\)/
  );

  assert.match(
    sprint4App,
    /preferencesUpdate\.mutateAsync\(\{[\s\S]*petInterests: selectedPets,[\s\S]*showRescueDonationMatches: showRescueMatches,[\s\S]*savedSearchAlertsDefault: searchAlerts,[\s\S]*\}\)/
  );
});

test('Preferences UI keeps marketplace radius owned by Location Architecture V2', () => {
  const sprint4App = read('src/sprint4/Sprint4App.tsx');

  assert.match(
    sprint4App,
    /const searchLocationPreference = useMarketplaceSearchLocationPreference\(\);/
  );

  assert.match(
    sprint4App,
    /const searchLocationUpdate = useSetMarketplaceSearchLocation\(\);/
  );

  assert.match(
    sprint4App,
    /searchLocationPreference\.data\?\.radiusMiles/
  );

  assert.match(
    sprint4App,
    /searchLocationUpdate\.setRadius\([\s\S]*marketplaceLocationId,[\s\S]*parsedRadius as MarketplaceSearchRadius[\s\S]*\)/
  );

  assert.match(
    sprint4App,
    /parsedRadius === 10[\s\S]*parsedRadius === 25[\s\S]*parsedRadius === 50[\s\S]*parsedRadius === 100/
  );
});

test('Preferences UI exposes save state and prevents unsupported radius persistence', () => {
  const sprint4App = read('src/sprint4/Sprint4App.tsx');

  assert.match(
    sprint4App,
    /title=\{isSaving \? 'Saving\.\.\.' : 'Save Preferences'\}/
  );

  assert.match(
    sprint4App,
    /disabled=\{isSaving \|\| preferences\.isLoading\}/
  );

  assert.match(
    sprint4App,
    /Choose a default distance of 10, 25, 50, or 100 miles\./
  );

  assert.match(
    sprint4App,
    /Preferences saved/
  );

  assert.match(
    sprint4App,
    /Preferences not saved/
  );
});
