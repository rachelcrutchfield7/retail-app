import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL(
    '../supabase/migrations/20260920235500_iso_expiry_window_alignment_v1.sql',
    import.meta.url
  ),
  'utf8'
);

test('ISO expiry constraint follows the latest update window', () => {
  assert.match(
    sql,
    /expires_at <= updated_at \+ interval '90 days'/i
  );

  assert.doesNotMatch(
    sql,
    /expires_at <= created_at \+ interval '90 days'/i
  );
});
