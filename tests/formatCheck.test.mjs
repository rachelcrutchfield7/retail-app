import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const formatScript = join(root, 'scripts', 'format-check.mjs');

function writeFixture(fixtureRoot, path, contents) {
  const filePath = join(fixtureRoot, path);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, contents);
}

function runFormatCheck(fixtureRoot) {
  return spawnSync(process.execPath, [formatScript], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

test('format checker ignores only generated marketing Astro output', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'retail-format-check-'));

  try {
    writeFixture(fixtureRoot, 'src/valid.ts', 'export const source = true;\n');
    writeFixture(fixtureRoot, 'marketing-site/src/valid.ts', 'export const marketing = true;\n');
    writeFixture(fixtureRoot, 'marketing-site/.astro/content.d.ts', 'generated output');

    const generatedOnly = runFormatCheck(fixtureRoot);
    assert.equal(generatedOnly.status, 0, generatedOnly.stderr);

    writeFixture(fixtureRoot, 'src/invalid.ts', 'export const source = false;');
    const normalSource = runFormatCheck(fixtureRoot);
    assert.equal(normalSource.status, 1);
    assert.match(normalSource.stderr, /src\/invalid\.ts/);

    writeFixture(fixtureRoot, 'src/invalid.ts', 'export const source = false;\n');
    writeFixture(fixtureRoot, 'marketing-site/src/invalid.ts', 'export const marketing = false;');
    const marketingSource = runFormatCheck(fixtureRoot);
    assert.equal(marketingSource.status, 1);
    assert.match(marketingSource.stderr, /marketing-site\/src\/invalid\.ts/);

    writeFixture(fixtureRoot, 'marketing-site/src/invalid.ts', 'export const marketing = false;\n');
    writeFixture(fixtureRoot, 'other/.astro/invalid.ts', 'unrelated output');
    const unrelatedAstroDirectory = runFormatCheck(fixtureRoot);
    assert.equal(unrelatedAstroDirectory.status, 1);
    assert.match(unrelatedAstroDirectory.stderr, /other\/\.astro\/invalid\.ts/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
