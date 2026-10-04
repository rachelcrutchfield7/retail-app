#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv, reconcilePromotionEntries } from './100-listings-promotion-utils.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const options = parseArguments(process.argv.slice(2));

if (!options.retail || !options.amoe || !options.output) {
  fail('Usage: reconcile-100-listings-promotion.mjs --retail <csv> --amoe <csv> --output <json> [--overwrite]');
}

const retailPath = secureExternalPath(options.retail, 'Retail export');
const amoePath = secureExternalPath(options.amoe, 'Google Form export');
const outputPath = secureExternalPath(options.output, 'Output');
const result = reconcilePromotionEntries({
  retailRows: parseCsv(readFileSync(retailPath, 'utf8')),
  amoeRows: parseCsv(readFileSync(amoePath, 'utf8')),
});

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
  encoding: 'utf8',
  flag: options.overwrite ? 'w' : 'wx',
  mode: 0o600,
});

console.log(`Reconciled ${result.eligibleEntrants} eligible entrants and ${result.eligibleEntries} eligible entries.`);
console.log(`Rejected records: ${result.rejectedRecords.length}. Cross-method matches: ${result.crossMethodMatches}.`);
console.log(`Private output written to ${outputPath}.`);

function parseArguments(args) {
  const parsed = { overwrite: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--overwrite') parsed.overwrite = true;
    else if (argument.startsWith('--')) {
      const name = argument.slice(2);
      const value = args[index + 1];
      if (!value || value.startsWith('--')) fail(`Missing value for ${argument}.`);
      parsed[name] = value;
      index += 1;
    } else fail(`Unexpected argument: ${argument}`);
  }
  return parsed;
}

function secureExternalPath(input, label) {
  const absolutePath = resolve(input);
  const repositoryRelative = relative(repositoryRoot, absolutePath);
  if (!isAbsolute(repositoryRelative) && !repositoryRelative.startsWith('..')) {
    fail(`${label} must be stored outside the repository to prevent participant data from being committed.`);
  }
  return absolutePath;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
