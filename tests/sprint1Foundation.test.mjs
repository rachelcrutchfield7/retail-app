import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  validateForgotPasswordInput,
  validateLoginInput,
  validateRegisterInput,
} from '../src/validation/auth.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

function listFiles(dir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test('Sprint 1 Expo Router app tree exists', () => {
  for (const file of [
    'app/_layout.tsx',
    'app/index.tsx',
    'app/(auth)/welcome.tsx',
    'app/(auth)/login.tsx',
    'app/(auth)/register.tsx',
    'app/(auth)/forgot-password.tsx',
    'app/(auth)/verify-email.tsx',
    'app/(tabs)/_layout.tsx',
    'app/(tabs)/home.tsx',
    'app/(tabs)/search.tsx',
    'app/(tabs)/sell.tsx',
    'app/(tabs)/favorites.tsx',
    'app/(tabs)/profile.tsx',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
  }
});

test('Sprint 1 root architecture folders expose the foundation modules', () => {
  for (const file of [
    'components/ui/Button.tsx',
    'components/ui/Card.tsx',
    'components/ui/Avatar.tsx',
    'components/ui/Badge.tsx',
    'components/ui/LoadingSpinner.tsx',
    'components/ui/EmptyState.tsx',
    'components/ui/ErrorState.tsx',
    'components/forms/TextInput.tsx',
    'constants/theme.ts',
    'hooks/useAuth.ts',
    'hooks/useSupabaseStatus.ts',
    'lib/supabase.ts',
    'lib/queryClient.ts',
    'services/authService.ts',
    'store/authStore.ts',
    'types/auth.ts',
    'utils/errorHandler.ts',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
  }
});

test('Sprint 1 dependency plan is documented for installation', () => {
  const foundationNotes = readFileSync(join(root, 'docs/sprint-1-foundation.md'), 'utf8');

  for (const dependency of [
    'expo-router',
    '@supabase/supabase-js',
    'zustand',
    '@tanstack/react-query',
    'react-hook-form',
    'zod',
    'lucide-react-native',
  ]) {
    assert.match(foundationNotes, new RegExp(dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Sprint 1 auth validation enforces required fields', () => {
  assert.equal(validateLoginInput('bad-email', 'short').isValid, false);
  assert.equal(validateForgotPasswordInput('bad-email').isValid, false);

  const registerResult = validateRegisterInput('person@example.com', 'Password1!', '', '');
  assert.equal(registerResult.isValid, false);
  assert.equal(registerResult.errors.displayName, 'Display name is required.');
  assert.equal(registerResult.errors.username, 'Username is required.');
});

test('Sprint 1 route files do not contain raw Supabase calls', () => {
  for (const file of listFiles(join(root, 'app')).filter((path) => path.endsWith('.tsx'))) {
    const contents = readFileSync(file, 'utf8');
    assert.doesNotMatch(contents, /supabase\./i, `${file} should not call Supabase directly`);
    assert.doesNotMatch(contents, /from ['"].*supabase/i, `${file} should not import Supabase directly`);
  }
});

test('Sprint 1 app shell remains available and theme-driven', () => {
  const sprintApp = readFileSync(join(root, 'src/sprint1/Sprint1App.tsx'), 'utf8');

  assert.match(sprintApp, /Sprint1App/);
  assert.doesNotMatch(sprintApp, /#[0-9A-Fa-f]{3,8}/, 'Sprint 1 screens should use theme color tokens');
});
