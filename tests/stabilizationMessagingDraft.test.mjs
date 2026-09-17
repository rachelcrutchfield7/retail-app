import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  clearListingDraft,
  hasMeaningfulListingDraft,
  listingDraftStorageKey,
  loadListingDraft,
  saveListingDraft,
} from '../src/services/listingDraftService.ts';

const messageService = await readFile(new URL('../src/services/messageService.ts', import.meta.url), 'utf8');
const messageHook = await readFile(new URL('../src/hooks/useMessages.ts', import.meta.url), 'utf8');
const sprint3 = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
const sprint4 = await readFile(new URL('../src/sprint4/Sprint4App.tsx', import.meta.url), 'utf8');

function draftForm(overrides = {}) {
  return {
    title: '',
    description: '',
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'sale',
    price: '',
    images: [],
    city: 'Edwardsville',
    state: 'IL',
    zip_code: '62025',
    pickup_available: true,
    shipping_available: false,
    shipping_payer: 'buyer',
    safety_confirmed: false,
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

test('message images upload ArrayBuffer data and never create a React Native Blob', () => {
  assert.match(messageService, /readLocalImageBinary\(/);
  assert.match(messageService, /upload\(path, arrayBuffer,/);
  assert.doesNotMatch(messageService, /upload\(path, blob,/);
  assert.doesNotMatch(messageService, /readLocalImageFile/);
});

test('native message picker keeps the local URI and does not request Base64', () => {
  const chooseImage = sprint4.slice(sprint4.indexOf('const chooseImage = async'), sprint4.indexOf('const send = async'));
  assert.match(chooseImage, /setImageUri\(selectedAsset\.uri\)/);
  assert.doesNotMatch(chooseImage, /base64:\s*true/);
  assert.doesNotMatch(chooseImage, /selectedAsset\.base64/);
});

test('image mutation participates in pending state to prevent duplicate sends', () => {
  assert.match(messageHook, /const imageMutation = useMutation/);
  assert.match(messageHook, /const isPending = mutation\.isPending \|\| imageMutation\.isPending/);
  assert.match(messageHook, /const sendImage = useCallback\([\s\S]*imageMutation\.mutateAsync/);
  assert.match(messageHook, /sendImage,\s*loading: isPending,\s*isLoading: isPending,\s*isPending,/);
});

test('listing drafts are user-scoped, durable, and clearable', async () => {
  const storage = memoryStorage();
  const form = draftForm({
    title: 'Travel crate',
    description: 'Used twice and cleaned.',
    images: ['content://media/external/images/42'],
    package_weight_oz: '48',
  });

  const saved = await saveListingDraft('buyer-a', form, {
    storage,
    persistImage: async () => 'file:///documents/retail-listing-drafts/buyer-a/photo.jpg',
  });

  assert.equal(saved.form.title, 'Travel crate');
  assert.deepEqual(saved.form.images, ['file:///documents/retail-listing-drafts/buyer-a/photo.jpg']);
  assert.ok(storage.values.has(listingDraftStorageKey('buyer-a')));
  assert.equal(await loadListingDraft('buyer-b', { storage }), null);
  assert.equal((await loadListingDraft('buyer-a', { storage }))?.form.package_weight_oz, '48');

  await clearListingDraft('buyer-a', { storage, removeImage: async () => undefined });
  assert.equal(await loadListingDraft('buyer-a', { storage }), null);
});

test('profile location alone does not create a draft, but seller-entered data does', () => {
  assert.equal(hasMeaningfulListingDraft(draftForm()), false);
  assert.equal(hasMeaningfulListingDraft(draftForm({ title: 'Bird perch' })), true);
  assert.equal(hasMeaningfulListingDraft(draftForm({ shipping_available: true })), true);
  assert.equal(hasMeaningfulListingDraft(draftForm({ images: ['file:///photo.jpg'] })), true);
});

test('create listing restores and autosaves a draft without changing edit listing', () => {
  const createScreen = sprint3.slice(
    sprint3.indexOf('export function CreateListingScreen'),
    sprint3.indexOf('export function ListingDetailScreen')
  );
  assert.match(createScreen, /new ListingDraftSession\(userId/);
  assert.match(createScreen, /void session\.hydrate\(\)/);
  assert.match(createScreen, /session\.dispose\(\)/);
  assert.match(createScreen, /await draftSessionRef\.current\?\.clear\(\)/);
  assert.match(createScreen, /AppState\.addEventListener\('change'/);
  assert.match(createScreen, /nextState !== 'active'[\s\S]*session\.flush\(\)/);
  assert.match(createScreen, /title="Discard Draft"/);
  assert.match(sprint4, /loadListingDraft\(userId\)[\s\S]*name: 'create-listing'/);
});
