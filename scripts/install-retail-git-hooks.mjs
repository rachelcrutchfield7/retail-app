import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { runGit } from './beta-guardrail-utils.mjs';

const gitDirectory = runGit(['rev-parse', '--git-dir']).trim();
const hookPath = resolve(process.cwd(), gitDirectory, 'hooks', 'pre-push');

if (existsSync(hookPath)) {
  console.error(`A pre-push hook already exists at ${hookPath}. It was not overwritten.`);
  process.exit(1);
}

mkdirSync(dirname(hookPath), { recursive: true });
writeFileSync(hookPath, '#!/bin/sh\n\npnpm check:protected-ui\n', 'utf8');
chmodSync(hookPath, 0o755);
console.info(`Installed optional ReTail pre-push guard at ${hookPath}.`);
