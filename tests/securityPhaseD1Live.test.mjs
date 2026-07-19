import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

import { resetSupabaseClientForTests, supabase as appSupabase } from '../src/lib/supabase.ts';
import { sendImageMessage } from '../src/services/messageService.ts';

const liveSupabaseEnabled = process.env.RUN_LIVE_SUPABASE_TESTS === '1';
const liveTest = liveSupabaseEnabled ? test : test.skip;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;
const sellerEmail = process.env.RETAIL_LIVE_SELLER_EMAIL;
const sellerPassword = process.env.RETAIL_LIVE_SELLER_PASSWORD;
const buyerEmail = process.env.RETAIL_LIVE_BUYER_EMAIL;
const buyerPassword = process.env.RETAIL_LIVE_BUYER_PASSWORD;
const unrelatedEmail = process.env.RETAIL_LIVE_UNRELATED_EMAIL;
const unrelatedPassword = process.env.RETAIL_LIVE_UNRELATED_PASSWORD;
const listingId = process.env.RETAIL_LIVE_LISTING_ID;

const storageBucket = 'message-images';
const orphanCleanupUuid = '00000000-0000-4000-8000-00000000d200';

const pngBytes = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2,
  0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0,
  3, 3, 2, 0, 239, 191, 167, 219, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

const jpegBytes = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUTEhMWFhUVFRUVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lICUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAABf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAa//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64'
));

const webpBytes = Uint8Array.from(Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'base64'
));

const imageCases = [
  { extension: 'jpg', mimeType: 'image/jpeg', bytes: jpegBytes, fileUuid: '00000000-0000-4000-8000-0000000000a1' },
  { extension: 'jpeg', mimeType: 'image/jpeg', bytes: jpegBytes, fileUuid: '00000000-0000-4000-8000-0000000000a2' },
  { extension: 'png', mimeType: 'image/png', bytes: pngBytes, fileUuid: '00000000-0000-4000-8000-0000000000a3' },
  { extension: 'webp', mimeType: 'image/webp', bytes: webpBytes, fileUuid: '00000000-0000-4000-8000-0000000000a4' },
];

function requireLiveEnv() {
  const missing = Object.entries({
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
    RETAIL_LIVE_SELLER_EMAIL: sellerEmail,
    RETAIL_LIVE_SELLER_PASSWORD: sellerPassword,
    RETAIL_LIVE_BUYER_EMAIL: buyerEmail,
    RETAIL_LIVE_BUYER_PASSWORD: buyerPassword,
    RETAIL_LIVE_UNRELATED_EMAIL: unrelatedEmail,
    RETAIL_LIVE_UNRELATED_PASSWORD: unrelatedPassword,
    RETAIL_LIVE_LISTING_ID: listingId,
  }).filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing live D.2 test env vars: ${missing.map(([key]) => key).join(', ')}`);
  }
}

function client() {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signIn(email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  return { supabase, userId: data.user.id, accessToken: data.session.access_token };
}

function attachmentPath(conversationId, userId, fileUuid, extension) {
  return `${conversationId}/${userId}/${fileUuid}.${extension}`;
}

async function uploadObject(actor, path, bytes, mimeType) {
  const { error } = await actor.supabase
    .storage
    .from(storageBucket)
    .upload(path, new Blob([bytes], { type: mimeType }), {
      contentType: mimeType,
      upsert: false,
    });

  assert.ifError(error);
}

async function removeObject(actor, path) {
  const { error } = await actor.supabase.storage.from(storageBucket).remove([path]);

  assert.ifError(error);
}

async function sendImage(actor, conversationId, path, mimeType, sizeBytes) {
  const { data, error } = await actor.supabase.rpc('send_message', {
    target_conversation_id: conversationId,
    requested_message_type: 'image',
    requested_body: `Phase D.2 ${mimeType} attachment test`,
    requested_attachment_bucket: storageBucket,
    requested_attachment_path: path,
    requested_attachment_mime_type: mimeType,
    requested_attachment_size_bytes: sizeBytes,
    requested_attachment_width: 1,
    requested_attachment_height: 1,
  });

  assert.ifError(error);
  return data;
}

async function messageCount(actor, conversationId) {
  const { count, error } = await actor.supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .is('deleted_at', null);

  assert.ifError(error);
  return count ?? 0;
}

async function expectSendFailure(actor, conversationId, params, expectedMessage) {
  const before = await messageCount(actor, conversationId);
  const { error } = await actor.supabase.rpc('send_message', {
    target_conversation_id: conversationId,
    requested_message_type: params.messageType ?? 'image',
    requested_body: params.body ?? 'Phase D.2 invalid send test',
    requested_attachment_bucket: params.bucket ?? storageBucket,
    requested_attachment_path: params.path ?? null,
    requested_attachment_mime_type: params.mimeType ?? 'image/png',
    requested_attachment_size_bytes: params.sizeBytes ?? pngBytes.byteLength,
    requested_attachment_width: 1,
    requested_attachment_height: 1,
  });
  const after = await messageCount(actor, conversationId);

  assert.ok(error, 'expected send_message to fail');
  assert.match(error.message, expectedMessage);
  assert.equal(after, before, 'failed send should not create a message row');
  return error;
}

async function createSignedUrl(actor, path) {
  const { data, error } = await actor.supabase.storage.from(storageBucket).createSignedUrl(path, 60);

  assert.ifError(error);
  assert.ok(data?.signedUrl, 'expected a signed URL');
  return data.signedUrl;
}

async function expectSignedUrlDenied(actor, path) {
  const { error } = await actor.supabase.storage.from(storageBucket).createSignedUrl(path, 60);

  assert.ok(error, 'expected signed URL creation to be denied');
}

async function fetchSignedUrlWithoutLogging(url) {
  const response = await fetch(url);

  assert.ok(response.ok, 'expected signed URL download to succeed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.byteLength > 0, 'downloaded signed URL should contain image bytes');
}

async function expectAuthenticatedDownloadDenied(actor, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${storageBucket}/${encodedPath}`, {
    headers: {
      Authorization: `Bearer ${actor.accessToken}`,
    },
  });

  assert.equal(response.ok, false, 'unrelated authenticated download should be denied');
}

async function expectUnrelatedMessageReadDenied(unrelated, messageId) {
  const { data, error } = await unrelated.supabase
    .from('messages')
    .select('id')
    .eq('id', messageId);

  assert.ifError(error);
  assert.equal((data ?? []).length, 0, 'unrelated user must not read participant messages');
}

async function sendText(actor, conversationId, body = 'Phase D.2 text message') {
  const { data, error } = await actor.supabase.rpc('send_message', {
    target_conversation_id: conversationId,
    requested_message_type: 'text',
    requested_body: body,
  });

  assert.ifError(error);
  return data;
}

async function expectUploadDenied(actor, conversationId, extension = 'png') {
  const userHex = actor.userId.replaceAll('-', '').slice(0, 12).padEnd(12, '0');
  const path = attachmentPath(conversationId, actor.userId, `00000000-0000-4000-8000-${userHex}`, extension);
  const { error } = await actor.supabase.storage.from(storageBucket).upload(
    path,
    new Blob([pngBytes], { type: 'image/png' }),
    { contentType: 'image/png', upsert: false }
  );

  assert.ok(error, 'blocked participant upload should be denied');
}

async function withFixedRandomUuid(uuid, callback) {
  const cryptoRef = globalThis.crypto;
  const original = cryptoRef?.randomUUID;

  if (!cryptoRef || typeof original !== 'function') {
    return callback();
  }

  Object.defineProperty(cryptoRef, 'randomUUID', {
    configurable: true,
    value: () => uuid,
  });

  try {
    return await callback();
  } finally {
    Object.defineProperty(cryptoRef, 'randomUUID', {
      configurable: true,
      value: original,
    });
  }
}

async function verifyOrphanCleanup(conversationId, buyer) {
  resetSupabaseClientForTests();
  const signInResult = await appSupabase.auth.signInWithPassword({
    email: buyerEmail,
    password: buyerPassword,
  });
  assert.ifError(signInResult.error);

  const expectedPath = attachmentPath(conversationId, buyer.userId, orphanCleanupUuid, 'png');
  const dataUrl = `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`;
  const tooLongCaption = 'x'.repeat(2001);

  await withFixedRandomUuid(orphanCleanupUuid, async () => {
    await assert.rejects(
      () => sendImageMessage(conversationId, dataUrl, tooLongCaption),
      (error) => {
        const userMessage = typeof error === 'object' && error !== null && 'userMessage' in error
          ? String(error.userMessage)
          : String(error);

        assert.doesNotMatch(userMessage, /token=|message-images|storage\/v1|00000000-0000-4000-8000-00000000d200/);
        return true;
      }
    );
  });

  const probeUpload = await appSupabase
    .storage
    .from(storageBucket)
    .upload(expectedPath, new Blob([pngBytes], { type: 'image/png' }), {
      contentType: 'image/png',
      upsert: false,
    });

  assert.ifError(probeUpload.error);
  await appSupabase.storage.from(storageBucket).remove([expectedPath]);
  await appSupabase.auth.signOut();
  return expectedPath;
}

liveTest('Phase D.2 message attachment storage, system-message, blocking, and cleanup verification', async () => {
  requireLiveEnv();

  const seller = await signIn(sellerEmail, sellerPassword);
  const buyer = await signIn(buyerEmail, buyerPassword);
  const unrelated = await signIn(unrelatedEmail, unrelatedPassword);
  const uploadedPaths = [];
  const validMessages = [];

  try {
    const conversationResult = await buyer.supabase.rpc('create_or_get_conversation', {
      target_listing_id: listingId,
    });
    assert.ifError(conversationResult.error);
    const conversation = conversationResult.data;
    assert.equal(conversation.buyer_id, buyer.userId);
    assert.equal(conversation.seller_id, seller.userId);

    for (const imageCase of imageCases) {
      const path = attachmentPath(conversation.id, buyer.userId, imageCase.fileUuid, imageCase.extension);
      await uploadObject(buyer, path, imageCase.bytes, imageCase.mimeType);
      uploadedPaths.push({ owner: buyer, path });

      const message = await sendImage(buyer, conversation.id, path, imageCase.mimeType, imageCase.bytes.byteLength);
      validMessages.push(message);
      assert.equal(message.sender_id, buyer.userId);
      assert.equal(message.conversation_id, conversation.id);
      assert.equal(message.attachment_bucket, storageBucket);
      assert.equal(message.attachment_path, path);
      assert.equal(message.image_url ?? null, null);

      const sellerRead = await seller.supabase.from('messages').select('id, attachment_path').eq('id', message.id);
      assert.ifError(sellerRead.error);
      assert.equal(sellerRead.data?.[0]?.attachment_path, path);

      const sellerSignedUrl = await createSignedUrl(seller, path);
      await createSignedUrl(buyer, path);
      await fetchSignedUrlWithoutLogging(sellerSignedUrl);
      await expectUnrelatedMessageReadDenied(unrelated, message.id);
      await expectSignedUrlDenied(unrelated, path);
      await expectAuthenticatedDownloadDenied(unrelated, path);
    }

    const missingPath = attachmentPath(conversation.id, buyer.userId, '00000000-0000-4000-8000-0000000000b1', 'png');
    await expectSendFailure(buyer, conversation.id, { path: missingPath }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    const sellerOwnedPath = attachmentPath(conversation.id, seller.userId, '00000000-0000-4000-8000-0000000000b2', 'png');
    await uploadObject(seller, sellerOwnedPath, pngBytes, 'image/png');
    uploadedPaths.push({ owner: seller, path: sellerOwnedPath });
    await expectSendFailure(buyer, conversation.id, { path: sellerOwnedPath }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    const wrongConversationPath = attachmentPath('00000000-0000-4000-8000-00000000c123', buyer.userId, '00000000-0000-4000-8000-0000000000b3', 'png');
    await expectSendFailure(buyer, conversation.id, { path: wrongConversationPath }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    const sizeMismatchPath = attachmentPath(conversation.id, buyer.userId, '00000000-0000-4000-8000-0000000000b4', 'png');
    await uploadObject(buyer, sizeMismatchPath, pngBytes, 'image/png');
    uploadedPaths.push({ owner: buyer, path: sizeMismatchPath });
    await expectSendFailure(buyer, conversation.id, { path: sizeMismatchPath, sizeBytes: pngBytes.byteLength + 1 }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    const mimeMismatchPath = attachmentPath(conversation.id, buyer.userId, '00000000-0000-4000-8000-0000000000b5', 'png');
    await uploadObject(buyer, mimeMismatchPath, pngBytes, 'image/png');
    uploadedPaths.push({ owner: buyer, path: mimeMismatchPath });
    await expectSendFailure(buyer, conversation.id, { path: mimeMismatchPath, mimeType: 'image/jpeg' }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    await expectSendFailure(buyer, conversation.id, {
      path: attachmentPath(conversation.id, buyer.userId, '00000000-0000-4000-8000-0000000000b6', 'gif'),
      mimeType: 'image/gif',
    }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    await expectSendFailure(buyer, conversation.id, {
      path: 'https://example.com/image.jpg',
    }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    const signedPath = validMessages[0].attachment_path;
    const signedUrl = await createSignedUrl(buyer, signedPath);
    await expectSendFailure(buyer, conversation.id, {
      path: signedUrl,
    }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    await expectSendFailure(buyer, conversation.id, {
      path: `${attachmentPath(conversation.id, buyer.userId, '00000000-0000-4000-8000-0000000000b7', 'png')}/extra`,
    }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    await expectSendFailure(buyer, conversation.id, {
      path: `${conversation.id}/${buyer.userId}/00000000-0000-4000-8000-0000000000b8.jpg.png`,
    }, /RETAIL_INVALID_MESSAGE_ATTACHMENT/);

    await sendText(buyer, conversation.id, 'Phase D.2 normal text succeeds');
    await expectSendFailure(buyer, conversation.id, {
      messageType: 'system',
      body: 'Forged system notice',
      bucket: null,
      path: null,
      mimeType: null,
      sizeBytes: null,
    }, /RETAIL_SYSTEM_MESSAGE_FORBIDDEN/);

    const anonymousSystem = await client().rpc('send_message', {
      target_conversation_id: conversation.id,
      requested_message_type: 'text',
      requested_body: 'anonymous send attempt',
    });
    assert.ok(anonymousSystem.error, 'anonymous callers must not execute send_message successfully');

    const unrelatedSend = await unrelated.supabase.rpc('send_message', {
      target_conversation_id: conversation.id,
      requested_message_type: 'text',
      requested_body: 'unrelated send attempt',
    });
    assert.ok(unrelatedSend.error, 'unrelated account must not send into participant conversation');

    const missingSystemRpc = await buyer.supabase.rpc('send_system_message', {
      target_conversation_id: conversation.id,
      requested_body: 'system helper probe',
    });
    assert.ok(missingSystemRpc.error, 'public send_system_message RPC must not exist');

    await seller.supabase.rpc('block_user', { target_user_id: buyer.userId }).then(({ error }) => assert.ifError(error));

    const sellerBlockedSend = await seller.supabase.rpc('send_message', {
      target_conversation_id: conversation.id,
      requested_message_type: 'text',
      requested_body: 'blocked seller send attempt',
    });
    assert.match(sellerBlockedSend.error?.message ?? '', /RETAIL_MESSAGE_BLOCKED/);

    const buyerBlockedSend = await buyer.supabase.rpc('send_message', {
      target_conversation_id: conversation.id,
      requested_message_type: 'text',
      requested_body: 'blocked buyer send attempt',
    });
    assert.match(buyerBlockedSend.error?.message ?? '', /RETAIL_MESSAGE_BLOCKED/);

    await expectUploadDenied(seller, conversation.id);
    await expectUploadDenied(buyer, conversation.id);

    const historicalPath = validMessages[0].attachment_path;
    const sellerHistoricalRead = await seller.supabase.from('messages').select('id').eq('id', validMessages[0].id);
    const buyerHistoricalRead = await buyer.supabase.from('messages').select('id').eq('id', validMessages[0].id);
    assert.ifError(sellerHistoricalRead.error);
    assert.ifError(buyerHistoricalRead.error);
    assert.equal(sellerHistoricalRead.data?.length, 1);
    assert.equal(buyerHistoricalRead.data?.length, 1);
    await createSignedUrl(seller, historicalPath);
    await createSignedUrl(buyer, historicalPath);
    await expectSignedUrlDenied(unrelated, historicalPath);

    await seller.supabase.rpc('unblock_user', { target_user_id: buyer.userId }).then(({ error }) => assert.ifError(error));
    await sendText(buyer, conversation.id, 'Phase D.2 messaging works again after unblock');

    await verifyOrphanCleanup(conversation.id, buyer);
  } finally {
    for (const { owner, path } of uploadedPaths.reverse()) {
      await removeObject(owner, path);
    }

    await seller.supabase.auth.signOut();
    await buyer.supabase.auth.signOut();
    await unrelated.supabase.auth.signOut();
  }
});
