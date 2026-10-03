import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

function loadAppConfig() {
  const sandbox = {
    module: { exports: {} },
    process: { env: {} },
  };

  runInNewContext(read('app.config.js'), sandbox);
  return sandbox.module.exports;
}

function functionSection(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  assert.notEqual(startIndex, -1, `Expected to find ${start}`);
  assert.notEqual(endIndex, -1, `Expected to find ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertIosOnlyPermissionRequest(section) {
  assert.match(
    section,
    /if \(Platform\.OS === 'ios'\) \{[\s\S]*?ImagePicker\.requestMediaLibraryPermissionsAsync\(\)[\s\S]*?if \(!permission\.granted\)[\s\S]*?\}\s*\n\s*const result = await ImagePicker\.launchImageLibraryAsync\(\{/,
  );
  assert.equal(
    section.match(/ImagePicker\.requestMediaLibraryPermissionsAsync\(\)/g)?.length,
    1,
  );
}

test('Android app config blocks broad photo and video permissions', () => {
  const appConfig = loadAppConfig();
  const android = appConfig.expo.android;

  assert.equal(android.permissions.includes('READ_MEDIA_IMAGES'), false);
  assert.equal(android.permissions.includes('READ_MEDIA_VIDEO'), false);
  assert.deepEqual(
    [...android.blockedPermissions],
    [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
    ],
  );
  assert.equal(android.permissions.includes('CAMERA'), true);
});

test('shared listing and ISO picker requests library permission only on iOS', () => {
  const uploader = read('src/components/forms/ImageUploader.tsx');
  const section = functionSection(uploader, 'const chooseImages = async () => {', 'const removeImage');
  const sprint3 = read('src/sprint3/Sprint3App.tsx');

  assertIosOnlyPermissionRequest(section);
  assert.match(section, /mediaTypes: \['images'\]/);
  assert.match(section, /allowsMultipleSelection: true/);
  assert.match(section, /selectionLimit: remainingSlots/);

  assert.equal(sprint3.match(/<ListingForm/g)?.length, 2);
  assert.match(sprint3, /<ImageUploader[\s\S]*images=\{form\.images\}/);
  assert.match(read('src/screens/iso/IsoScreens.tsx'), /<ImageUploader[\s\S]*maxImages=\{1\}/);
  assert.match(read('src/screens/iso/EditIsoScreen.tsx'), /<ImageUploader[\s\S]*maxImages=\{1\}/);
});

test('profile picker requests library permission only on iOS', () => {
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const section = functionSection(sprint3, 'const chooseAvatar = async () => {', 'const save = async () => {');

  assertIosOnlyPermissionRequest(section);
  assert.match(section, /mediaTypes: \['images'\]/);
  assert.match(section, /allowsEditing: true/);
  assert.match(section, /aspect: \[1, 1\]/);
});

test('chat picker requests library permission only on iOS', () => {
  const sprint4 = read('src/sprint4/Sprint4App.tsx');
  const section = functionSection(sprint4, 'const chooseImage = async () => {', 'const send = async () => {');

  assertIosOnlyPermissionRequest(section);
  assert.match(section, /mediaTypes: \['images'\]/);
  assert.doesNotMatch(section, /mediaTypes: \['videos'\]/);
});
