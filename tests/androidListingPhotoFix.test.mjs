import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { getLogEntries } from '../src/lib/logger.ts';
import { readLocalImageBinary } from '../src/services/localImageFile.ts';
import { reconcileListingImages } from '../src/services/listingService.ts';
import { uploadListingImageBinary } from '../src/services/storageService.ts';
import { validateCreateListingInput } from '../src/validation/createListing.ts';

const listingImage = (id, imageUrl, sortOrder = 0) => ({
  id,
  listing_id: 'listing-1',
  image_url: imageUrl,
  thumbnail_url: imageUrl,
  sort_order: sortOrder,
  created_at: '2026-08-08T00:00:00.000Z',
});

test('native file and content URIs use native file bytes without network fetch', async () => {
  for (const uri of ['file:///photos/listing.jpg', 'content://media/external/images/42']) {
    const nativeReads = [];
    const fetches = [];
    const result = await readLocalImageBinary(uri, 'IMAGE_UPLOAD_FAILED', 'Could not read listing image', {
      readNativeBytes: async (fileUri) => {
        nativeReads.push(fileUri);
        return { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg' };
      },
      fetchFile: async (fileUri) => {
        fetches.push(fileUri);
        throw new Error('Network fetch should not run');
      },
    });

    assert.deepEqual(nativeReads, [uri]);
    assert.deepEqual(fetches, []);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.extension, 'jpg');
    assert.equal(result.size, 3);
    assert.ok(result.arrayBuffer instanceof ArrayBuffer);
    assert.equal('blob' in result, false);
    assert.deepEqual([...new Uint8Array(result.arrayBuffer)], [0xff, 0xd8, 0xff]);
  }
});

for (const [mimeType, extension] of [
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]) {
  test(`legacy ${mimeType} data URI decodes locally as .${extension}`, async () => {
    const fetches = [];
    const result = await readLocalImageBinary(
      `data:${mimeType};base64,AQIDBA==`,
      'IMAGE_UPLOAD_FAILED',
      'Could not read listing image',
      {
        fetchFile: async (fileUri) => {
          fetches.push(fileUri);
          throw new Error('Data URI must not be fetched');
        },
      }
    );

    assert.deepEqual(fetches, []);
    assert.equal(result.mimeType, mimeType);
    assert.equal(result.extension, extension);
    assert.equal(result.size, 4);
    assert.ok(result.arrayBuffer instanceof ArrayBuffer);
    assert.equal('blob' in result, false);
    assert.deepEqual([...new Uint8Array(result.arrayBuffer)], [1, 2, 3, 4]);
  });
}

test('web blob URI is fetched and normalized into an ArrayBuffer', async () => {
  const expected = new Uint8Array([9, 8, 7]).buffer;
  const fetches = [];
  const result = await readLocalImageBinary('blob:https://retailpetapp.com/photo', 'IMAGE_UPLOAD_FAILED', 'Could not read listing image', {
    fetchFile: async (fileUri) => {
      fetches.push(fileUri);
      return {
        ok: true,
        arrayBuffer: async () => expected,
        headers: { get: () => 'image/png' },
      };
    },
  });

  assert.deepEqual(fetches, ['blob:https://retailpetapp.com/photo']);
  assert.equal(result.arrayBuffer, expected);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.extension, 'png');
  assert.equal('blob' in result, false);
});

test('malformed and unsupported data URIs fail with the friendly upload message', async () => {
  for (const uri of ['data:image/jpeg,not-base64', 'data:image/gif;base64,AQIDBA==', 'data:image/png;base64,%%%']) {
    await assert.rejects(
      readLocalImageBinary(uri, 'IMAGE_UPLOAD_FAILED', 'Could not read listing image'),
      (error) => error?.message === 'We could not upload that photo.'
    );
  }
});

test('native picker keeps asset URIs and does not request Base64', async () => {
  const source = await readFile(new URL('../src/components/forms/ImageUploader.tsx', import.meta.url), 'utf8');

  assert.match(source, /\.map\(\(asset\) => asset\.uri\)/);
  assert.doesNotMatch(source, /base64:\s*true/);
  assert.doesNotMatch(source, /data:\$\{.*base64/);
});

test('create listing starts with no photos while edit listing waits for hydrated listing images', async () => {
  const source = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
  const editListingScreen = source.slice(
    source.indexOf('export function EditListingScreen'),
    source.indexOf('function EditListingForm')
  );

  assert.match(source, /const emptyCreateListing: CreateListingInput = \{[\s\S]*?images:\s*\[\]/);
  assert.match(editListingScreen, /if \(listing\.isLoading \|\| listing\.isFetching\)/);
  assert.match(source, /images:\s*detail\.images\.map\(\(image\) => image\.image_url\)/);
});

function completeListingInput(overrides = {}) {
  return {
    title: 'Rabbit starter kit',
    description: 'Water bottle, hay feeder, and ceramic bowls.',
    category: 'Small Pets',
    condition: 'Good',
    listing_type: 'sale',
    price: '35',
    images: ['https://retail.test/existing.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    pickup_available: true,
    porch_pickup_available: false,
    meetup_available: true,
    shipping_available: false,
    shipping_payer: 'buyer',
    safety_confirmed: true,
    ...overrides,
  };
}

test('hosted edit photos count toward minimum listing photo validation', () => {
  const result = validateCreateListingInput(completeListingInput());

  assert.equal(result.isValid, true);
  assert.equal(result.errors.images, undefined);
});

test('removing every listing photo still fails minimum photo validation', () => {
  const result = validateCreateListingInput(completeListingInput({ images: [] }));

  assert.equal(result.isValid, false);
  assert.equal(result.errors.images, 'Add at least one photo.');
});

test('Supabase Storage receives ArrayBuffer image data instead of Blob data', async () => {
  const calls = [];
  const binary = new Uint8Array([1, 2, 3, 4]).buffer;

  await uploadListingImageBinary(
    {
      async upload(path, body, options) {
        calls.push({ path, body, options });
        return { error: null };
      },
    },
    'profile/listing/photo.jpg',
    binary,
    'image/jpeg',
    'content'
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].body instanceof ArrayBuffer);
  assert.equal(calls[0].body instanceof Blob, false);
  assert.equal(calls[0].body, binary);
  assert.deepEqual(calls[0].options, { contentType: 'image/jpeg', upsert: false });
});

test('failed Storage upload records safe binary diagnostics and keeps a friendly error', async () => {
  const binary = new Uint8Array([1, 2, 3]).buffer;

  await assert.rejects(
    uploadListingImageBinary(
      {
        async upload() {
          return {
            error: {
              name: 'StorageApiError',
              code: '403',
              statusCode: 403,
              message: 'new row violates row-level security policy',
            },
          };
        },
      },
      'profile/listing/photo.jpg',
      binary,
      'image/jpeg',
      'content'
    ),
    /We could not upload that photo\./
  );

  const diagnostic = getLogEntries().at(-2);
  assert.equal(diagnostic?.message, 'Listing image upload failed.');
  assert.equal(diagnostic?.context?.operation, 'listing image upload');
  assert.equal(diagnostic?.context?.bucket, 'listings');
  assert.equal(diagnostic?.context?.mimeType, 'image/jpeg');
  assert.equal(diagnostic?.context?.byteSize, 3);
  assert.equal(diagnostic?.context?.uriScheme, 'content');
  assert.equal(diagnostic?.context?.reason, 'new row violates row-level security policy');
  assert.equal(diagnostic?.context?.storageErrorName, 'StorageApiError');
  assert.equal(diagnostic?.context?.storageErrorCode, '403');
  assert.equal(diagnostic?.context?.storageStatus, 403);
  assert.equal(JSON.stringify(diagnostic?.context).includes('profile/listing/photo.jpg'), false);
});

function reconciliationHarness({ failUploadUri } = {}) {
  const uploadedUris = [];
  const removedIds = [];
  const sortUpdates = [];
  let uploadNumber = 0;

  return {
    uploadedUris,
    removedIds,
    sortUpdates,
    dependencies: {
      async uploadImage(uri) {
        uploadedUris.push(uri);
        if (uri === failUploadUri) throw new Error('Upload failed');
        uploadNumber += 1;
        return listingImage(`new-${uploadNumber}`, `https://retail.test/${uploadNumber}.jpg`, 10 + uploadNumber);
      },
      async removeImage(image) {
        removedIds.push(image.id);
      },
      async updateSortOrder(image, sortOrder) {
        sortUpdates.push([image.id, sortOrder]);
      },
    },
  };
}

test('unchanged hosted listing image is preserved without upload or duplicate record', async () => {
  const existing = listingImage(
    'existing-1',
    'https://ycwgsdigvpmprqreoqiz.supabase.co/storage/v1/object/public/listings/user/listing/photo.jpg'
  );
  const harness = reconciliationHarness();

  await reconcileListingImages([existing.image_url, existing.image_url], [existing], harness.dependencies);

  assert.deepEqual(harness.uploadedUris, []);
  assert.deepEqual(harness.removedIds, []);
  assert.deepEqual(harness.sortUpdates, []);
});

test('price-only edit preserves hosted listing photos without reupload', async () => {
  const existing = listingImage('existing-1', 'https://retail.test/existing.jpg');
  const harness = reconciliationHarness();

  await reconcileListingImages([existing.image_url], [existing], harness.dependencies);

  assert.deepEqual(harness.uploadedUris, []);
  assert.deepEqual(harness.removedIds, []);
  assert.deepEqual(harness.sortUpdates, []);
});

test('description-only edit preserves hosted listing photos without reupload', async () => {
  const existing = listingImage('existing-1', 'https://retail.test/existing.jpg');
  const harness = reconciliationHarness();

  await reconcileListingImages([existing.image_url], [existing], harness.dependencies);

  assert.deepEqual(harness.uploadedUris, []);
  assert.deepEqual(harness.removedIds, []);
  assert.deepEqual(harness.sortUpdates, []);
});

test('adding one photo preserves the hosted image and uploads the local image once', async () => {
  const existing = listingImage('existing-1', 'https://retail.test/existing.jpg');
  const harness = reconciliationHarness();

  await reconcileListingImages([existing.image_url, 'content://media/external/images/42'], [existing], harness.dependencies);

  assert.deepEqual(harness.uploadedUris, ['content://media/external/images/42']);
  assert.deepEqual(harness.removedIds, []);
  assert.deepEqual(harness.sortUpdates, [['new-1', 1]]);
});

test('removing one photo removes only that existing image', async () => {
  const first = listingImage('existing-1', 'https://retail.test/first.jpg', 0);
  const second = listingImage('existing-2', 'https://retail.test/second.jpg', 1);
  const harness = reconciliationHarness();

  await reconcileListingImages([second.image_url], [first, second], harness.dependencies);

  assert.deepEqual(harness.uploadedUris, []);
  assert.deepEqual(harness.removedIds, ['existing-1']);
  assert.deepEqual(harness.sortUpdates, [['existing-2', 0]]);
});

test('failed new upload preserves all existing image records', async () => {
  const existing = listingImage('existing-1', 'https://retail.test/existing.jpg');
  const harness = reconciliationHarness({ failUploadUri: 'file:///photos/broken.jpg' });

  await assert.rejects(
    reconcileListingImages(
      [existing.image_url, 'file:///photos/good.jpg', 'file:///photos/broken.jpg'],
      [existing],
      harness.dependencies
    ),
    /Upload failed/
  );

  assert.deepEqual(harness.uploadedUris, ['file:///photos/good.jpg', 'file:///photos/broken.jpg']);
  assert.deepEqual(harness.removedIds, ['new-1']);
  assert.equal(harness.removedIds.includes(existing.id), false);
});

test('listing image reconciliation enforces the 15-photo limit', async () => {
  const harness = reconciliationHarness();

  await assert.rejects(
    reconcileListingImages(
      Array.from({ length: 16 }, (_, index) => `file:///photos/${index}.jpg`),
      [],
      harness.dependencies
    ),
    /You can add up to 15 photos\./
  );

  assert.deepEqual(harness.uploadedUris, []);
  assert.deepEqual(harness.removedIds, []);
});

test('failed replacement at the 15-photo limit cannot delete all old image records', async () => {
  const existingImages = Array.from({ length: 15 }, (_, index) =>
    listingImage(`existing-${index}`, `https://retail.test/existing-${index}.jpg`, index)
  );
  const retainedUris = existingImages.slice(1).map((image) => image.image_url);
  const harness = reconciliationHarness({ failUploadUri: 'content://media/external/images/replacement' });

  await assert.rejects(
    reconcileListingImages(
      [...retainedUris, 'content://media/external/images/replacement'],
      existingImages,
      harness.dependencies
    ),
    /Upload failed/
  );

  assert.deepEqual(harness.removedIds, ['existing-0']);
  assert.equal(existingImages.some((image) => !harness.removedIds.includes(image.id)), true);
});
