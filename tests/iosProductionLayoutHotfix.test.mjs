import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  applyBoundedTextScaling,
  IOS_MAX_FONT_SIZE_MULTIPLIER,
} from '../src/utils/iosTextScalingPolicy.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('iOS text scaling is bounded without changing Android component defaults', () => {
  const androidText = { defaultProps: { testMarker: 'android-text' } };
  const androidInput = { defaultProps: { testMarker: 'android-input' } };

  assert.equal(applyBoundedTextScaling('android', {
    TextComponent: androidText,
    TextInputComponent: androidInput,
  }), false);
  assert.deepEqual(androidText.defaultProps, { testMarker: 'android-text' });
  assert.deepEqual(androidInput.defaultProps, { testMarker: 'android-input' });

  const iosText = { defaultProps: { testMarker: 'ios-text' } };
  const iosInput = { defaultProps: { testMarker: 'ios-input' } };

  assert.equal(applyBoundedTextScaling('ios', {
    TextComponent: iosText,
    TextInputComponent: iosInput,
  }), true);
  assert.equal(iosText.defaultProps.maxFontSizeMultiplier, IOS_MAX_FONT_SIZE_MULTIPLIER);
  assert.equal(iosInput.defaultProps.maxFontSizeMultiplier, IOS_MAX_FONT_SIZE_MULTIPLIER);
  assert.equal(iosText.defaultProps.testMarker, 'ios-text');
  assert.equal(iosInput.defaultProps.testMarker, 'ios-input');
});

test('active iOS tab and Google labels stay on one line while Android keeps its existing branch', () => {
  const sprint4 = read('src/sprint4/Sprint4App.tsx');
  const googleButton = read('src/components/feedback/GoogleSignInButton.tsx');

  assert.match(sprint4, /Platform\.OS === 'ios'[\s\S]*IOS_COMPACT_FONT_SIZE_MULTIPLIER[\s\S]*numberOfLines: 1/);
  assert.match(googleButton, /Platform\.OS === 'ios'[\s\S]*adjustsFontSizeToFit: true[\s\S]*numberOfLines: 1/);
  assert.match(sprint4, /: \{\}\)\}\s*style=\{\[styles\.tabLabel/);
  assert.match(googleButton, /: \{\}\)\}\s*style=\{styles\.label\}/);
});

test('marketplace heading and grid remain width-contained on iOS', () => {
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const supportedWidths = [320, 375, 390, 393, 402, 414, 430];
  const horizontalScreenPadding = 24 * 2;
  const interCardGap = 16;

  assert.match(sprint3, /Platform\.OS === 'ios' && styles\.iosSectionTitleRow/);
  assert.match(sprint3, /iosSectionTitle:\s*\{\s*flex: 1,\s*minWidth: 0,/);
  assert.match(sprint3, /marketplaceGridItem:\s*\{\s*width: '50%',\s*minWidth: 0,/);

  for (const width of supportedWidths) {
    const contentWidth = width - horizontalScreenPadding;
    const cardWidth = contentWidth / 2 - interCardGap / 2;
    assert.ok(cardWidth >= 128, `${width}px viewport keeps each listing card usable`);
    assert.ok(cardWidth * 2 + interCardGap <= contentWidth, `${width}px grid does not overflow its content width`);
  }
});

test('iOS uses an opaque dedicated icon while Android icon configuration is unchanged', () => {
  const config = read('app.config.js');
  const icon = readFileSync(join(root, 'assets/ios-app-icon.png'));

  assert.match(config, /icon:\s*'\.\/assets\/app-icon\.png'/);
  assert.match(config, /ios:\s*\{[\s\S]*?icon:\s*'\.\/assets\/ios-app-icon\.png'/);
  assert.match(config, /android:\s*\{[\s\S]*?adaptiveIcon:\s*\{[\s\S]*?foregroundImage:\s*'\.\/assets\/adaptive-icon\.png'[\s\S]*?backgroundColor:\s*'#F8FAF6'/);
  assert.equal(icon.toString('ascii', 1, 4), 'PNG');
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  assert.equal(icon[25], 2, 'iOS icon must be opaque RGB without an alpha channel');
});
