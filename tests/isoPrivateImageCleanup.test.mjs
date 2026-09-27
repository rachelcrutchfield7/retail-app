import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  deleteRegisteredIsoImage,
  replaceRegisteredIsoImage,
} from '../src/services/isoImageLifecycle.ts';

const storageService = fs.readFileSync(
  new URL('../src/services/storageService.ts', import.meta.url),
  'utf8'
);

function image(overrides = {}) {
  return {
    id: 'image-old',
    isoPostId: 'post-1',
    imageUrl: 'signed-old-url',
    sortOrder: 0,
    createdAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

test('standalone removal deletes Storage before deleting the database row', async () => {
  const events = [];
  let exists = true;

  await deleteRegisteredIsoImage('image-1', 'owner/post/image.png', {
    objectExists: async () => {
      events.push(`exists:${exists}`);
      return exists;
    },
    removeObject: async () => {
      events.push('storage:remove');
      exists = false;
    },
    deleteImageRow: async () => {
      events.push('database:delete');
      return true;
    },
  });

  assert.deepEqual(events, [
    'exists:true',
    'storage:remove',
    'exists:false',
    'database:delete',
  ]);
});

test('Storage failure preserves the database authorization row', async () => {
  const events = [];

  await assert.rejects(
    deleteRegisteredIsoImage('image-1', 'owner/post/image.png', {
      objectExists: async () => true,
      removeObject: async () => {
        events.push('storage:remove');
        throw new Error('storage unavailable');
      },
      deleteImageRow: async () => {
        events.push('database:delete');
        return true;
      },
    }),
    /storage unavailable/
  );

  assert.deepEqual(events, ['storage:remove']);
});

test('silent zero-row Storage deletion is rejected before database deletion', async () => {
  const events = [];

  await assert.rejects(
    deleteRegisteredIsoImage('image-1', 'owner/post/image.png', {
      objectExists: async () => true,
      removeObject: async () => events.push('storage:no-op'),
      deleteImageRow: async () => {
        events.push('database:delete');
        return true;
      },
    }),
    (error) => error?.appError?.code === 'ISO_IMAGE_STORAGE_DELETE_UNCONFIRMED'
  );

  assert.deepEqual(events, ['storage:no-op']);
});

test('database failure after Storage success is surfaced and can be retried', async () => {
  const events = [];
  let exists = true;

  await assert.rejects(
    deleteRegisteredIsoImage('image-1', 'owner/post/image.png', {
      objectExists: async () => exists,
      removeObject: async () => {
        events.push('storage:remove');
        exists = false;
      },
      deleteImageRow: async () => {
        events.push('database:failure');
        throw new Error('database unavailable');
      },
    }),
    /database unavailable/
  );

  await deleteRegisteredIsoImage('image-1', 'owner/post/image.png', {
    objectExists: async () => exists,
    removeObject: async () => events.push('storage:unexpected-second-remove'),
    deleteImageRow: async () => {
      events.push('database:retry');
      return true;
    },
  });

  assert.deepEqual(events, ['storage:remove', 'database:failure', 'database:retry']);
});

test('unconfirmed database deletion is surfaced after Storage cleanup', async () => {
  let exists = true;

  await assert.rejects(
    deleteRegisteredIsoImage('image-1', 'owner/post/image.png', {
      objectExists: async () => exists,
      removeObject: async () => { exists = false; },
      deleteImageRow: async () => false,
    }),
    (error) => error?.appError?.code === 'ISO_IMAGE_DATABASE_DELETE_UNCONFIRMED'
  );
});

test('replacement registers the new image before removing the old image', async () => {
  const events = [];
  const replacement = image({ id: 'image-new', imageUrl: 'local-file-uri' });

  const result = await replaceRegisteredIsoImage(
    'post-1',
    image(),
    'local-file-uri',
    {
      addImage: async () => {
        events.push('replacement:registered');
        return replacement;
      },
      removeImage: async () => events.push('old:removed'),
    }
  );

  assert.equal(result, replacement);
  assert.deepEqual(events, ['replacement:registered', 'old:removed']);
});

test('failed replacement upload or registration preserves the old image', async () => {
  const events = [];

  await assert.rejects(
    replaceRegisteredIsoImage('post-1', image(), 'local-file-uri', {
      addImage: async () => {
        events.push('replacement:failed');
        throw new Error('replacement failed');
      },
      removeImage: async () => events.push('old:removed'),
    }),
    /replacement failed/
  );

  assert.deepEqual(events, ['replacement:failed']);
});

test('failed new database registration preserves the old image and documents best-effort orphan cleanup', async () => {
  const events = [];

  await assert.rejects(
    replaceRegisteredIsoImage('post-1', image(), 'local-file-uri', {
      addImage: async () => {
        events.push('replacement:uploaded');
        events.push('replacement:registration-failed');
        events.push('replacement:orphan-cleanup-attempted');
        throw new Error('database registration failed');
      },
      removeImage: async () => events.push('old:removed'),
    }),
    /database registration failed/
  );

  assert.deepEqual(events, [
    'replacement:uploaded',
    'replacement:registration-failed',
    'replacement:orphan-cleanup-attempted',
  ]);
  assert.match(
    storageService,
    /if \(error\) \{[\s\S]*?storage\.from\('iso-posts'\)\.remove\(\[storagePath\]\)[\s\S]*?Preserve the original database error/
  );
});

test('old cleanup failure is surfaced after the replacement is established', async () => {
  const events = [];

  await assert.rejects(
    replaceRegisteredIsoImage('post-1', image(), 'local-file-uri', {
      addImage: async () => {
        events.push('replacement:registered');
        return image({ id: 'image-new', imageUrl: 'local-file-uri' });
      },
      removeImage: async () => {
        events.push('old:cleanup-failed');
        throw new Error('old cleanup failed');
      },
    }),
    /old cleanup failed/
  );

  assert.deepEqual(events, ['replacement:registered', 'old:cleanup-failed']);
});

test('production wiring verifies Storage effect and database row count', () => {
  const deleteStart = storageService.indexOf('export async function deleteIsoPostImage');
  const deleteFlow = storageService.slice(deleteStart);

  assert.match(deleteFlow, /deleteRegisteredIsoImage/);
  assert.match(deleteFlow, /bucket\.exists\(objectPath\)/);
  assert.ok(
    deleteFlow.indexOf('if (error)') < deleteFlow.indexOf("typeof exists === 'boolean'"),
    'Storage existence errors must be handled before a false result is trusted'
  );
  assert.match(deleteFlow, /bucket\.remove\(\[objectPath\]\)/);
  assert.match(deleteFlow, /\.delete\(\)[\s\S]*\.select\('id'\)/);
  assert.doesNotMatch(deleteFlow, /cleanup failed after its database row was removed/i);
});
