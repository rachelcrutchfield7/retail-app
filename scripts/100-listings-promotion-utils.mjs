import { createHash, randomBytes } from 'node:crypto';

export const PROMOTION_START = '2026-10-09T13:00:00.000Z';
export const PROMOTION_END = '2026-10-12T13:00:00.000Z';
export const MAX_ENTRIES = 5;

export function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value !== '')) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error('CSV contains an empty header.');
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate headers.');

  return rows.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])),
  }));
}

export function reconcilePromotionEntries({ retailRows, amoeRows, generatedAt = new Date().toISOString() }) {
  const accepted = [];
  const rejected = [];

  for (const row of retailRows) {
    const record = normalizeRecord(row);
    const sellerId = value(record, ['seller_id', 'entrant_id', 'retail_user_id']);
    const accountEmail = normalizeEmail(value(record, ['account_email', 'retail_account_email', 'email']));
    const entryCount = Number(value(record, ['entry_count', 'entries']));
    const reasons = [];

    if (!sellerId) reasons.push('missing entrant identifier');
    if (!Number.isInteger(entryCount) || entryCount < 1 || entryCount > MAX_ENTRIES) {
      reasons.push('entry_count must be an integer from 1 through 5');
    }

    if (reasons.length) {
      rejected.push({ source: 'retail', rowNumber: row.rowNumber, reasons });
      continue;
    }

    accepted.push({
      source: 'retail',
      rowNumber: row.rowNumber,
      keys: compact([`retail:${normalizeIdentifier(sellerId)}`, accountEmail && `email:${accountEmail}`]),
      entries: entryCount,
      contactEmail: accountEmail,
      contactName: value(record, ['full_name', 'name']),
      contactReference: value(record, ['contact_reference']) || sellerId,
    });
  }

  for (const row of amoeRows) {
    const record = normalizeRecord(row);
    const submittedAt = parseTimestamp(value(record, ['timestamp', 'submitted_at', 'submission_time']));
    const contactEmail = normalizeEmail(value(record, ['email_address', 'email', 'your_email']));
    const retailEmail = normalizeEmail(value(record, [
      'retail_username_or_account_email_if_applicable',
      'retail_account_email',
      'account_email',
    ]));
    const fullName = value(record, ['full_name', 'name']);
    const state = value(record, ['state_of_residence', 'state']);
    const ageConfirmation = value(record, ['are_you_18_years_of_age_or_older', 'age_confirmation']);
    const rulesAgreement = value(record, ['official_rules_acknowledgment', 'official_rules_agreement']);
    const reasons = [];

    if (!submittedAt || submittedAt < Date.parse(PROMOTION_START) || submittedAt >= Date.parse(PROMOTION_END)) {
      reasons.push('submission timestamp is outside the Promotion Period');
    }
    if (!contactEmail) reasons.push('missing or invalid contact email');
    if (!fullName) reasons.push('missing full name');
    if (!state) reasons.push('missing state of residence');
    if (!/^yes\b/i.test(ageConfirmation)) reasons.push('age eligibility was not confirmed');
    if (!/(agree|read)/i.test(rulesAgreement)) reasons.push('Official Rules agreement was not confirmed');

    if (reasons.length) {
      rejected.push({ source: 'amoe', rowNumber: row.rowNumber, reasons });
      continue;
    }

    accepted.push({
      source: 'amoe',
      rowNumber: row.rowNumber,
      keys: compact([contactEmail && `email:${contactEmail}`, retailEmail && `email:${retailEmail}`]),
      entries: MAX_ENTRIES,
      contactEmail,
      contactName: fullName,
      contactReference: `AMOE row ${row.rowNumber}`,
    });
  }

  const groups = unionRelatedRecords(accepted);
  const pool = groups.map((records) => {
    const retailRecords = records.filter((record) => record.source === 'retail');
    const amoeRecords = records.filter((record) => record.source === 'amoe');
    const allKeys = [...new Set(records.flatMap((record) => record.keys))].sort();
    const preferredContact = amoeRecords[0] ?? retailRecords[0];
    const listingEntries = retailRecords.reduce((maximum, record) => Math.max(maximum, record.entries), 0);
    const amoeEntries = amoeRecords.length > 0 ? MAX_ENTRIES : 0;

    return {
      entrantRef: `promotion:${sha256(allKeys.join('|')).slice(0, 24)}`,
      contactEmail: preferredContact?.contactEmail || '',
      contactName: preferredContact?.contactName || '',
      contactReference: preferredContact?.contactReference || '',
      listingEntries,
      amoeEntries,
      entryCount: Math.min(MAX_ENTRIES, Math.max(listingEntries, amoeEntries)),
      sources: compact([retailRecords.length > 0 && 'retail', amoeRecords.length > 0 && 'amoe']),
      relatedRetailRecords: retailRecords.length,
      relatedAmoeRecords: amoeRecords.length,
    };
  }).sort((left, right) => left.entrantRef.localeCompare(right.entrantRef));

  return {
    promotion: 'ReTail 100 Listings in 72 Hours',
    promotionStart: PROMOTION_START,
    promotionEnd: PROMOTION_END,
    generatedAt,
    eligibleEntrants: pool.length,
    eligibleEntries: pool.reduce((sum, entrant) => sum + entrant.entryCount, 0),
    crossMethodMatches: pool.filter((entrant) => entrant.sources.length === 2).length,
    rejectedRecords: rejected,
    pool,
  };
}

export function selectPotentialWinner({
  pool,
  seedHex = randomBytes(32).toString('hex'),
  excludedEntrantRefs = [],
  drawNumber = 1,
  selectedAt = new Date().toISOString(),
}) {
  if (!/^[a-f0-9]{64}$/i.test(seedHex)) throw new Error('Seed must be exactly 32 bytes encoded as 64 hexadecimal characters.');
  if (!Number.isInteger(drawNumber) || drawNumber < 1) throw new Error('Draw number must be a positive integer.');

  const excluded = new Set(excludedEntrantRefs);
  const eligiblePool = pool
    .filter((entrant) => !excluded.has(entrant.entrantRef))
    .map((entrant) => ({ ...entrant, entryCount: Number(entrant.entryCount) }))
    .filter((entrant) => Number.isInteger(entrant.entryCount) && entrant.entryCount >= 1 && entrant.entryCount <= MAX_ENTRIES)
    .sort((left, right) => left.entrantRef.localeCompare(right.entrantRef));

  if (eligiblePool.length === 0) throw new Error('No eligible entrants remain for selection.');

  const canonicalPool = eligiblePool.map(({ entrantRef, entryCount }) => ({ entrantRef, entryCount }));
  const poolSha256 = sha256(JSON.stringify(canonicalPool));
  const totalEntries = eligiblePool.reduce((sum, entrant) => sum + entrant.entryCount, 0);
  const ticketIndex = unbiasedTicketIndex(seedHex, poolSha256, drawNumber, totalEntries);
  let cursor = 0;
  let selectedEntrant = eligiblePool[0];

  for (const entrant of eligiblePool) {
    cursor += entrant.entryCount;
    if (ticketIndex < cursor) {
      selectedEntrant = entrant;
      break;
    }
  }

  return {
    promotion: 'ReTail 100 Listings in 72 Hours',
    selectedAt,
    drawNumber,
    selectionMethod: 'SHA-256 seeded, deterministic weighted ticket selection with rejection sampling',
    seedHex: seedHex.toLowerCase(),
    seedSha256: sha256(seedHex.toLowerCase()),
    poolSha256,
    eligibleEntrants: eligiblePool.length,
    eligibleEntries: totalEntries,
    excludedEntrantRefs: [...excluded].sort(),
    selectedTicket: ticketIndex + 1,
    selectedEntrant: {
      entrantRef: selectedEntrant.entrantRef,
      contactEmail: selectedEntrant.contactEmail || '',
      contactName: selectedEntrant.contactName || '',
      contactReference: selectedEntrant.contactReference || '',
      entryCount: selectedEntrant.entryCount,
    },
  };
}

function normalizeRecord(row) {
  return Object.fromEntries(
    Object.entries(row.values).map(([header, fieldValue]) => [normalizeHeader(header), String(fieldValue).trim()]),
  );
}

function normalizeHeader(value) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeIdentifier(value) {
  return value.normalize('NFKC').trim().toLowerCase();
}

function normalizeEmail(value) {
  const normalized = normalizeIdentifier(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function parseTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function value(record, aliases) {
  for (const alias of aliases) {
    if (record[alias]) return record[alias];
  }
  return '';
}

function compact(values) {
  return values.filter(Boolean);
}

function unionRelatedRecords(records) {
  const parent = records.map((_, index) => index);
  const keyOwner = new Map();
  const find = (index) => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  records.forEach((record, index) => {
    for (const key of record.keys) {
      if (keyOwner.has(key)) union(index, keyOwner.get(key));
      else keyOwner.set(key, index);
    }
  });

  const groups = new Map();
  records.forEach((record, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(record);
    groups.set(root, group);
  });
  return [...groups.values()];
}

function unbiasedTicketIndex(seedHex, poolSha256, drawNumber, totalEntries) {
  const range = 1n << 256n;
  const total = BigInt(totalEntries);
  const limit = range - (range % total);

  for (let counter = 0; counter < 1000; counter += 1) {
    const digest = sha256(`${seedHex.toLowerCase()}:${poolSha256}:${drawNumber}:${counter}`);
    const value = BigInt(`0x${digest}`);
    if (value < limit) return Number(value % total);
  }

  throw new Error('Unable to derive an unbiased ticket index.');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
