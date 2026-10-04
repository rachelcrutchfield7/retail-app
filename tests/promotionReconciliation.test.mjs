import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseCsv,
  reconcilePromotionEntries,
  selectPotentialWinner,
} from '../scripts/100-listings-promotion-utils.mjs';

const fixedGeneratedAt = '2026-10-12T14:00:00.000Z';

test('promotion CSV parsing preserves quoted commas and escaped quotes', () => {
  const rows = parseCsv('full_name,email\n"Doe, Alex","alex""tag@example.com"\n');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNumber, 2);
  assert.equal(rows[0].values.full_name, 'Doe, Alex');
  assert.equal(rows[0].values.email, 'alex"tag@example.com');
});

test('reconciliation detects cross-method matches and enforces the five-entry cap', () => {
  const retailRows = parseCsv([
    'seller_id,account_email,entry_count,contact_reference',
    'seller-1,owner@example.com,2,retail-account-1',
    'seller-2,second@example.com,3,retail-account-2',
  ].join('\n'));
  const amoeRows = parseCsv([
    'Timestamp,Email Address,"ReTail username or account email, if applicable",Full name,State of residence,Are you 18 years of age or older?,Official Rules acknowledgment',
    '2026-10-10T15:00:00Z,alternate@example.com,OWNER@example.com,Avery Example,IL,Yes,I have read and agree to the Official Rules.',
    '2026-10-11T15:00:00Z,alternate@example.com,,Avery Example,IL,Yes,I agree to the Official Rules.',
  ].join('\n'));

  const result = reconcilePromotionEntries({ retailRows, amoeRows, generatedAt: fixedGeneratedAt });

  assert.equal(result.eligibleEntrants, 2);
  assert.equal(result.eligibleEntries, 8);
  assert.equal(result.crossMethodMatches, 1);
  assert.equal(result.rejectedRecords.length, 0);

  const matched = result.pool.find((entrant) => entrant.sources.length === 2);
  assert.equal(matched.listingEntries, 2);
  assert.equal(matched.amoeEntries, 5);
  assert.equal(matched.entryCount, 5);
  assert.equal(matched.relatedAmoeRecords, 2);
});

test('reconciliation rejects ineligible AMOE rows without returning personal information', () => {
  const amoeRows = parseCsv([
    'Timestamp,Email Address,Full name,State of residence,Are you 18 years of age or older?,Official Rules acknowledgment',
    '2026-10-12T13:00:00Z,outside@example.com,Outside Example,IL,Yes,I agree to the Official Rules.',
    '2026-10-10T15:00:00Z,minor@example.com,Minor Example,IL,No,I agree to the Official Rules.',
    '2026-10-10T15:00:00Z,norules@example.com,No Rules Example,IL,Yes,',
  ].join('\n'));

  const result = reconcilePromotionEntries({ retailRows: [], amoeRows, generatedAt: fixedGeneratedAt });

  assert.equal(result.eligibleEntrants, 0);
  assert.equal(result.rejectedRecords.length, 3);
  assert.match(result.rejectedRecords[0].reasons.join(' '), /outside the Promotion Period/);
  assert.match(result.rejectedRecords[1].reasons.join(' '), /age eligibility/);
  assert.match(result.rejectedRecords[2].reasons.join(' '), /Official Rules agreement/);
  assert.doesNotMatch(JSON.stringify(result.rejectedRecords), /@example\.com/);
});

test('winner selection is deterministic, weighted, auditable, and supports alternates', () => {
  const pool = [
    { entrantRef: 'promotion:alpha', entryCount: 1, contactEmail: 'alpha@example.test' },
    { entrantRef: 'promotion:bravo', entryCount: 5, contactEmail: 'bravo@example.test' },
    { entrantRef: 'promotion:charlie', entryCount: 2, contactEmail: 'charlie@example.test' },
  ];
  const seedHex = 'ab'.repeat(32);
  const first = selectPotentialWinner({
    pool,
    seedHex,
    drawNumber: 1,
    selectedAt: fixedGeneratedAt,
  });
  const repeated = selectPotentialWinner({
    pool,
    seedHex,
    drawNumber: 1,
    selectedAt: fixedGeneratedAt,
  });

  assert.deepEqual(repeated, first);
  assert.equal(first.eligibleEntrants, 3);
  assert.equal(first.eligibleEntries, 8);
  assert.match(first.poolSha256, /^[a-f0-9]{64}$/);
  assert.match(first.seedSha256, /^[a-f0-9]{64}$/);
  assert.ok(first.selectedTicket >= 1 && first.selectedTicket <= 8);

  const alternate = selectPotentialWinner({
    pool,
    seedHex: 'cd'.repeat(32),
    excludedEntrantRefs: [first.selectedEntrant.entrantRef],
    drawNumber: 2,
    selectedAt: '2026-10-15T14:00:00.000Z',
  });

  assert.equal(alternate.drawNumber, 2);
  assert.notEqual(alternate.selectedEntrant.entrantRef, first.selectedEntrant.entrantRef);
  assert.deepEqual(alternate.excludedEntrantRefs, [first.selectedEntrant.entrantRef]);
});

test('administrative utilities keep participant files outside the repository', () => {
  const reconcileCli = readFileSync(new URL('../scripts/reconcile-100-listings-promotion.mjs', import.meta.url), 'utf8');
  const drawCli = readFileSync(new URL('../scripts/select-100-listings-winner.mjs', import.meta.url), 'utf8');
  const operationsGuide = readFileSync(new URL('../docs/operations/100-listings-promotion-drawing.md', import.meta.url), 'utf8');

  assert.match(reconcileCli, /must be stored outside the repository/);
  assert.match(drawCli, /must be stored outside the repository/);
  assert.match(operationsGuide, /Never commit entrant exports/);
  assert.match(operationsGuide, /72 hours/);
  assert.match(operationsGuide, /cross-method/);
});
