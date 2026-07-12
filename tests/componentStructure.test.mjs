import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const componentRoot = join(root, 'src/components');

const requiredFolders = ['ui', 'marketplace', 'forms', 'profile', 'messaging', 'navigation', 'feedback'];

test('component library folders exist', () => {
  for (const folder of requiredFolders) {
    assert.equal(existsSync(join(componentRoot, folder)), true, `${folder} folder should exist`);
  }
});

test('core reusable components are exported from the component barrel', () => {
  const barrel = readFileSync(join(componentRoot, 'index.ts'), 'utf8');
  const exportedNames = [
    'Button',
    'Card',
    'Avatar',
    'Badge',
    'ListingCard',
    'SearchBar',
    'RescueHubBanner',
    'TextField',
    'ConversationCard',
    'ProfileHeader',
    'TabBar',
    'EmptyState',
    'ErrorState',
    'ReportListingModal',
  ];

  for (const name of exportedNames) {
    assert.match(barrel, new RegExp(`export \\{[^}]*${name}[^}]*\\}`), `${name} should be exported`);
  }
});

test('component catalog tracks the reusable component groups', () => {
  const catalog = readFileSync(join(componentRoot, 'previews/componentCatalog.ts'), 'utf8');

  for (const folder of requiredFolders) {
    assert.match(catalog, new RegExp(`${folder}: \\[`), `${folder} should be represented in the catalog`);
  }
});
