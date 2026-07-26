import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sprint3 = readFileSync(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
const sprint4 = readFileSync(new URL('../src/sprint4/Sprint4App.tsx', import.meta.url), 'utf8');
const rescueHub = readFileSync(new URL('../src/screens/RescueHubScreen.tsx', import.meta.url), 'utf8');
const button = readFileSync(new URL('../src/components/ui/Button.tsx', import.meta.url), 'utf8');
const checklist = readFileSync(new URL('../docs/private-beta/BETA_REGRESSION_CHECKLIST.md', import.meta.url), 'utf8');

test('home rescue banner uses live rescue hub data instead of mock counts', () => {
  assert.match(sprint3, /useRescueHub/);
  assert.doesNotMatch(sprint3, /from '..\/data\/mockData'/);
  assert.match(sprint3, /rescueCount=\{rescueHubItems\.length\}/);
  assert.match(sprint3, /wishlistCount=\{wishlistCount\}/);
});

test('rescue hub cards navigate to public rescue profiles', () => {
  assert.match(rescueHub, /onOpenRescueProfile/);
  assert.match(rescueHub, /accessibilityLabel=\{`Open \$\{rescue\.name\} rescue profile`\}/);
  assert.match(sprint4, /\| \{ name: 'rescue-profile'; rescue: RescueOrganization \}/);
  assert.match(sprint4, /<PublicRescueProfileScreen/);
  assert.match(sprint4, /title="Message rescue"/);
});

test('android hardware back uses route history before default exit behavior', () => {
  assert.match(sprint4, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(sprint4, /routeStack\.length > 1 \|\| route\.name !== 'tabs'/);
  assert.match(sprint4, /parentRouteFor/);
});

test('settings renders request errors instead of an endless loading state', () => {
  assert.match(sprint4, /if \(settings\.isError\)/);
  assert.match(sprint4, /ErrorState message=\{handleAppError\(settings\.error\)\.userMessage\}/);
});

test('mobile button labels are guarded against horizontal overflow', () => {
  assert.match(button, /flexShrink: 1/);
  assert.match(button, /textAlign: 'center'/);
  assert.match(sprint3, /numColumns=\{1\}/);
});

test('private beta checklist covers regression areas', () => {
  for (const phrase of [
    'Mobile Layout',
    'Home Rescue Hub counts come from the live Rescue Hub data source',
    'Rescue cards open public rescue profile pages',
    'Message rescue',
    'Android Back Button',
    'Settings opens',
  ]) {
    assert.match(checklist, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
