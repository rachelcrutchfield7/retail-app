import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sprint4Source = readFileSync(new URL('../src/sprint4/Sprint4App.tsx', import.meta.url), 'utf8');

test('mobile web shell uses a compact closed navigation menu instead of desktop nav', () => {
  assert.match(sprint4Source, /window\.innerWidth/);
  assert.match(sprint4Source, /window\.addEventListener\('resize', updateViewportWidth\)/);
  assert.match(sprint4Source, /const \[webMenuOpen, setWebMenuOpen\] = useState\(false\)/);
  assert.match(sprint4Source, /const useMobileWebHeader = isWeb && viewportWidth <= 768/);
  assert.match(sprint4Source, /if \(useMobileWebHeader\)/);
  assert.match(sprint4Source, /styles\.webMobileHeader/);
  assert.match(sprint4Source, /styles\.webMobileMenuButton/);
  assert.match(sprint4Source, /webMenuOpen \? <X/);
  assert.match(sprint4Source, /<Menu size=\{24\}/);
  assert.match(sprint4Source, /webMenuOpen \? \(\s*<View style=\{\[styles\.webMobileMenu/);
  assert.match(sprint4Source, /styles\.webMobileDownloadLink/);

  const mobileBranchIndex = sprint4Source.indexOf('if (useMobileWebHeader)');
  const desktopHeaderIndex = sprint4Source.indexOf('style={styles.webHeader}', mobileBranchIndex);
  const desktopNavIndex = sprint4Source.indexOf('style={styles.webNav}', desktopHeaderIndex);
  assert.ok(mobileBranchIndex > 0, 'mobile web branch should exist');
  assert.ok(desktopHeaderIndex > mobileBranchIndex, 'desktop web header should remain after mobile branch');
  assert.ok(desktopNavIndex > desktopHeaderIndex, 'desktop nav should stay in the desktop web header branch');
});
