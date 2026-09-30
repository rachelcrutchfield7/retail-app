import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getConversationProfileTargetId } from '../src/utils/conversationProfileNavigation.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/sprint4/Sprint4App.tsx');
const conversationService = read('src/services/conversationService.ts');
const conversationList = read('src/components/messaging/ConversationList.tsx');
const publicProfile = read('src/sprint3/Sprint3App.tsx');

const profile = (id, username = `user_${id}`) => ({ id, username });

test('conversation profile target is symmetric and never resolves to the current user', () => {
  assert.equal(getConversationProfileTargetId(profile('user-b'), 'user-a'), 'user-b');
  assert.equal(getConversationProfileTargetId(profile('user-a'), 'user-b'), 'user-a');
  assert.equal(getConversationProfileTargetId(profile('user-a'), 'user-a'), null);
  assert.match(
    conversationService,
    /row\.buyer_id === currentUserId \? row\.seller_id : row\.buyer_id/
  );
});

test('unavailable conversation profiles remain visible but are not navigation targets', () => {
  assert.equal(getConversationProfileTargetId(profile('missing-user', 'profile_unavailable'), 'user-a'), null);
  assert.match(conversationService, /display_name: 'Profile unavailable'/);
  assert.match(app, /otherProfileTargetId \? \([\s\S]*?<Pressable[\s\S]*?: \([\s\S]*?<View style=\{styles\.conversationIdentity\}>/);
});

test('conversation header identity opens the existing public profile route', () => {
  assert.match(app, /onOpenProfile=\{\(userId\) => openPublicProfile\(userId, undefined, route\.conversationId\)\}/);
  assert.match(app, /<Avatar[\s\S]*?conversationDetail\.otherUser\.avatar_url/);
  assert.match(app, /conversationDetail\.otherUser\.display_name/);
  assert.match(app, /onPress=\{\(\) => onOpenProfile\(otherProfileTargetId\)\}/);
  assert.match(app, /accessibilityLabel=\{`View \$\{conversationDetail\.otherUser\.display_name\}'s public profile`\}/);
  assert.match(app, /accessibilityHint="Opens this user's public profile"/);
});

test('public profile back navigation returns to the originating conversation', () => {
  assert.match(app, /returnConversationId\?: string/);
  assert.match(app, /route\.returnConversationId[\s\S]*?openConversation\(route\.returnConversationId\)/);
  assert.match(app, /route\.name === 'public-profile'[\s\S]*?conversationId: route\.returnConversationId/);
  assert.match(app, /<PublicProfileScreen/);
});

test('blocked conversation behavior keeps the established public profile and block contract', () => {
  assert.match(app, /const messagingBlocked = Boolean\(conversationDetail\.messagingBlocked\)/);
  assert.match(app, /getConversationProfileTargetId\(conversationDetail\.otherUser, auth\.user\?\.id\)/);
  assert.match(publicProfile, /const isBlocked = blockedAccounts\.blockedUsers\.some/);
  assert.match(publicProfile, /title=\{isBlocked \? 'Unblock User' : 'Block User'\}/);
});

test('conversation list rows still open conversations rather than profiles', () => {
  assert.match(conversationList, /onPress=\{\(\) => onOpenConversation\(item\.id\)\}/);
  assert.doesNotMatch(conversationList, /onOpenProfile/);
});
