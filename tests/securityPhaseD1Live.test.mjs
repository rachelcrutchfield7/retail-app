import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

const liveSupabaseEnabled = process.env.RUN_LIVE_SUPABASE_TESTS === '1';

const liveTest = liveSupabaseEnabled ? test : test.skip;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const buyerEmail = process.env.RETAIL_LIVE_BUYER_EMAIL;
const buyerPassword = process.env.RETAIL_LIVE_BUYER_PASSWORD;
const sellerEmail = process.env.RETAIL_LIVE_SELLER_EMAIL;
const sellerPassword = process.env.RETAIL_LIVE_SELLER_PASSWORD;
const listingId = process.env.RETAIL_LIVE_LISTING_ID;
const unrelatedEmail = process.env.RETAIL_LIVE_UNRELATED_EMAIL;
const unrelatedPassword = process.env.RETAIL_LIVE_UNRELATED_PASSWORD;

const pngBytes = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2,
  0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0,
  3, 3, 2, 0, 239, 191, 167, 219, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

function requireLiveEnv() {
  const missing = Object.entries({
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
    RETAIL_LIVE_BUYER_EMAIL: buyerEmail,
    RETAIL_LIVE_BUYER_PASSWORD: buyerPassword,
    RETAIL_LIVE_SELLER_EMAIL: sellerEmail,
    RETAIL_LIVE_SELLER_PASSWORD: sellerPassword,
    RETAIL_LIVE_LISTING_ID: listingId,
    RETAIL_LIVE_UNRELATED_EMAIL: unrelatedEmail,
    RETAIL_LIVE_UNRELATED_PASSWORD: unrelatedPassword,
  }).filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing live D.1 test env vars: ${missing.map(([key]) => key).join(', ')}`);
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

  return { supabase, userId: data.user.id };
}

liveTest('Phase D.1 valid image attachment upload, send, signed read, and cleanup', async () => {
  requireLiveEnv();

  const buyer = await signIn(buyerEmail, buyerPassword);
  const seller = await signIn(sellerEmail, sellerPassword);
  const unrelated = await signIn(unrelatedEmail, unrelatedPassword);
  let objectPath = '';
  let messageId = '';

  try {
    const { data: conversation, error: conversationError } = await buyer.supabase.rpc('create_or_get_conversation', {
      target_listing_id: listingId,
    });
    assert.ifError(conversationError);

    objectPath = `${conversation.id}/${buyer.userId}/00000000-0000-4000-8000-000000000001.png`;
    const upload = await buyer.supabase.storage
      .from('message-images')
      .upload(objectPath, new Blob([pngBytes], { type: 'image/png' }), {
        contentType: 'image/png',
        upsert: false,
      });
    assert.ifError(upload.error);

    const { data: imageMessage, error: imageError } = await buyer.supabase.rpc('send_message', {
      target_conversation_id: conversation.id,
      requested_message_type: 'image',
      requested_body: 'Generated D.1 attachment test',
      requested_attachment_bucket: 'message-images',
      requested_attachment_path: objectPath,
      requested_attachment_mime_type: 'image/png',
      requested_attachment_size_bytes: pngBytes.byteLength,
      requested_attachment_width: 1,
      requested_attachment_height: 1,
    });
    assert.ifError(imageError);
    messageId = imageMessage.id;
    assert.equal(imageMessage.sender_id, buyer.userId);
    assert.equal(imageMessage.attachment_path, objectPath);
    assert.equal(imageMessage.image_url ?? null, null);

    const signed = await seller.supabase.storage.from('message-images').createSignedUrl(objectPath, 60);
    assert.ifError(signed.error);
    assert.match(signed.data.signedUrl, /token=/);

    const unrelatedSigned = await unrelated.supabase.storage.from('message-images').createSignedUrl(objectPath, 60);
    assert.ok(unrelatedSigned.error, 'unrelated users must not receive signed attachment URLs');

    const system = await buyer.supabase.rpc('send_message', {
      target_conversation_id: conversation.id,
      requested_message_type: 'system',
      requested_body: 'Forged system notice',
    });
    assert.match(system.error?.message ?? '', /RETAIL_SYSTEM_MESSAGE_FORBIDDEN/);
  } finally {
    if (messageId) {
      await buyer.supabase.rpc('soft_delete_own_message', { target_message_id: messageId });
    }

    if (objectPath) {
      await buyer.supabase.storage.from('message-images').remove([objectPath]);
    }

    await buyer.supabase.auth.signOut();
    await seller.supabase.auth.signOut();
    await unrelated.supabase.auth.signOut();
  }
});
