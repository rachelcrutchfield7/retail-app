import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { liveSupabaseTest } from './liveSupabaseTest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

liveSupabaseTest('Phase E live Supabase authorization and cleanup checks pass', () => {
  const result = spawnSync(
    'pnpm',
    [
      'dlx',
      'supabase@latest',
      'db',
      'query',
      '--linked',
      '--file',
      join(root, 'tests/security_phase_e_live.sql'),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
      maxBuffer: 1024 * 1024 * 8,
    }
  );

  assert.equal(
    result.status,
    0,
    [
      'Phase E live Supabase SQL check failed.',
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n')
  );
  assert.match(result.stdout, /phase_e_live_tests_passed/);
});
