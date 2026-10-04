#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectPotentialWinner } from './100-listings-promotion-utils.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const options = parseArguments(process.argv.slice(2));

if (!options.pool || !options.audit) {
  fail('Usage: select-100-listings-winner.mjs --pool <json> --audit <json> [--seed <64-hex>] [--draw-number <n>] [--exclude <entrant-ref>] [--overwrite]');
}

const poolPath = secureExternalPath(options.pool, 'Reconciled pool');
const auditPath = secureExternalPath(options.audit, 'Audit output');
const reconciled = JSON.parse(readFileSync(poolPath, 'utf8'));
const audit = selectPotentialWinner({
  pool: reconciled.pool,
  seedHex: options.seed,
  excludedEntrantRefs: options.exclude,
  drawNumber: options.drawNumber ? Number(options.drawNumber) : 1,
});

writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, {
  encoding: 'utf8',
  flag: options.overwrite ? 'w' : 'wx',
  mode: 0o600,
});

console.log(`Completed draw ${audit.drawNumber} from ${audit.eligibleEntrants} entrants and ${audit.eligibleEntries} entries.`);
console.log(`Private audit record written to ${auditPath}.`);

function parseArguments(args) {
  const parsed = { exclude: [], overwrite: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--overwrite') parsed.overwrite = true;
    else if (argument.startsWith('--')) {
      const name = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = args[index + 1];
      if (!value || value.startsWith('--')) fail(`Missing value for ${argument}.`);
      if (name === 'exclude') parsed.exclude.push(value);
      else parsed[name] = value;
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
