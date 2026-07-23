import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { validateBetaBuildConfig } from './validate-beta-build-config.mjs';

const approvedSupabaseUrl = 'https://ycwgsdigvpmprqreoqiz.supabase.co';
const bundleFilePattern = /\.(js|hbc)$/;

export function findBundleFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      findBundleFiles(fullPath, files);
      continue;
    }

    if (bundleFilePattern.test(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

export function verifyBundleConfigInDirectory(dir, env = process.env) {
  const bundleFiles = findBundleFiles(dir);
  const publicKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const appEnv = env.EXPO_PUBLIC_APP_ENV ?? '';
  const usesHermesBytecode = bundleFiles.some((file) => file.endsWith('.hbc'));
  const configSource = readFileSync(join(process.cwd(), 'src/constants/config.ts'), 'utf8');
  const sourceUsesStaticPublicKeyReference = /process\.env\.EXPO_PUBLIC_SUPABASE_ANON_KEY/.test(configSource);
  let bundledText = '';

  for (const file of bundleFiles) {
    bundledText += readFileSync(file, 'utf8');
  }

  const supabasePublicKeyPlaintextPresent = Boolean(publicKey) && bundledText.includes(publicKey);

  return {
    bundleFileCount: bundleFiles.length,
    supabaseUrlPresent: bundledText.includes(approvedSupabaseUrl),
    supabasePublicKeyPresent: supabasePublicKeyPlaintextPresent || (usesHermesBytecode && sourceUsesStaticPublicKeyReference),
    supabasePublicKeyPlaintextPresent,
    supabasePublicKeyVerifiedBySource: !supabasePublicKeyPlaintextPresent && usesHermesBytecode && sourceUsesStaticPublicKeyReference,
    appEnvironmentBetaPresent: appEnv === 'beta' && bundledText.includes('beta'),
  };
}

function redactOutput(value) {
  const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!publicKey) {
    return value;
  }

  return value.replaceAll(publicKey, '[redacted]');
}

function printResult(result) {
  console.info(`Bundled Supabase URL present: ${result.supabaseUrlPresent ? 'yes' : 'no'}`);
  console.info(`Bundled Supabase public key present: ${result.supabasePublicKeyPresent ? 'yes' : 'no'}`);
  if (result.supabasePublicKeyVerifiedBySource) {
    console.info('Bundled Supabase public key verified by static Expo env reference for Hermes bytecode.');
  }
  console.info(`Bundled app environment beta: ${result.appEnvironmentBetaPresent ? 'yes' : 'no'}`);
}

function run() {
  const environmentResult = validateBetaBuildConfig();

  if (!environmentResult.ok) {
    console.error(`Bundle configuration verification failed before export: ${environmentResult.failures[0]}`);
    process.exit(1);
  }

  const outputDir = mkdtempSync(join(tmpdir(), 'retail-android-bundle-check-'));

  try {
    const exportResult = spawnSync(
      'pnpm',
      ['exec', 'expo', 'export', '--platform', 'android', '--output-dir', outputDir],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EXPO_NO_DOTENV: '1',
        },
        encoding: 'utf8',
      }
    );

    if (exportResult.status !== 0) {
      console.error('Android bundle export failed.');
      console.error(redactOutput(exportResult.stdout));
      console.error(redactOutput(exportResult.stderr));
      process.exit(exportResult.status ?? 1);
    }

    const result = verifyBundleConfigInDirectory(outputDir);
    printResult(result);

    if (!result.supabaseUrlPresent || !result.supabasePublicKeyPresent || !result.appEnvironmentBetaPresent) {
      console.error('Android bundle configuration verification failed.');
      process.exit(1);
    }

    console.info('Android bundle configuration verification passed.');
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run();
}
