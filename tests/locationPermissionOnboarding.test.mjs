import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Expo location dependency and native foreground config are present', () => {
  const packageJson = read('package.json');
  const config = read('app.config.js');

  assert.match(packageJson, /"expo-location":\s*"~57\.0\.11"/);
  assert.match(config, /'expo-location'/);
  assert.match(config, /NSLocationWhenInUseUsageDescription/);
  assert.match(config, /ACCESS_COARSE_LOCATION/);
  assert.doesNotMatch(config, /ACCESS_BACKGROUND_LOCATION/);
  assert.doesNotMatch(config, /NSLocationAlways/);
});

test('location hook requests foreground location only and preserves manual fallback', () => {
  const hook = read('src/hooks/useLocation.ts');

  assert.match(hook, /getForegroundPermissionsAsync\(\)/);
  assert.match(hook, /requestForegroundPermissionsAsync\(\)/);
  assert.match(hook, /getCurrentPositionAsync/);
  assert.match(hook, /reverseGeocodeAsync/);
  assert.match(hook, /permissionStatus: 'denied'/);
  assert.match(hook, /permissionStatus: 'manual'/);
  assert.doesNotMatch(hook, /requestBackgroundPermissionsAsync/);
});

test('location pre-prompt is non-mandatory and settings expose manual fallback', () => {
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(sprint4, /Find items near you/);
  assert.match(sprint4, /Use My Location/);
  assert.match(sprint4, /Not Now/);
  assert.match(sprint4, /permissionPromptStorageKey\('location'/);
  assert.match(sprint4, /Choose Area Manually/);
  assert.match(sprint4, /onPreferences/);
});
