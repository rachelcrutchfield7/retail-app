import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('golden build 94d61284 remains the documented mobile layout contract', () => {
  const contract = read('docs/private-beta/GOLDEN_LAYOUT_BUILD.md');

  assert.match(contract, /94d61284-47d9-4ae2-ad24-5e148462feaf/);
  assert.match(contract, /f45afcb65d8e3c3d787fad5c9460badca7091a61/);
  assert.match(contract, /canonical visual reference/);
});

test('golden home and navigation landmarks remain in place', () => {
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(sprint4, /\{ key: 'messages', label: 'Messages', icon: MessageCircle \}/);
  assert.doesNotMatch(sprint4, /\{ key: 'favorites', label: 'Favorites'/);
  assert.match(sprint3, /label="Favorites"/);
  assert.match(sprint3, /unreadNotificationTotal > 0/);
  assert.match(sprint3, /icon=\{Bell\}/);
  assert.match(sprint3, /Looking for something specific\?/);
  assert.match(sprint3, /title="Set Alert"/);
  assert.match(sprint4, /backgroundColor: colors\.navBase/);
  assert.match(sprint4, /style=\{\[styles\.tabButton, selected && styles\.tabButtonActive\]\}/);
});

test('golden Rescue Hub and card elevation remain protected', () => {
  const banner = read('src/components/marketplace/RescueHubBanner.tsx');
  const card = read('src/components/ui/Card.tsx');

  assert.match(banner, /backgroundColor: themeColors\.logoOrangeSoft/);
  assert.match(banner, /borderColor: themeColors\.logoOrange/);
  assert.match(card, /shadowOpacity: 0\.10/);
  assert.match(card, /elevation: 4/);
});
