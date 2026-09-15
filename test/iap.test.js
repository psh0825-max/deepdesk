import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

process.env.DEEPDESK_NO_LISTEN = '1';
process.env.DEEPDESK_TEST_NO_RUN = '1';
delete process.env.K_SERVICE;
delete process.env.DEEPDESK_STORE;
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'deepdesk-iap-')));
process.env.APPLE_BUNDLE_ID = 'com.lightonpluslab.deepdesk';
process.env.ANDROID_PACKAGE_NAME = 'com.lightonpluslab.deepdesk';

const { app } = await import('../server.js');
const { iapDeps, __resetTokenCache } = await import('../src/iap.js');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' });
let server;
let baseUrl;
let requestNumber = 0;

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function nextHeaders() {
  requestNumber += 1;
  return { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${requestNumber}` };
}

async function request(pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST', headers: nextHeaders(), body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function createOrder(tier = 'light') {
  const result = await request('/api/orders', {
    topic: 'IAP 결제 테스트 주제', brief: '', email: 'test@example.com', tier, language: 'ko', payMethod: 'iap_android',
  });
  assert.equal(result.status, 200);
  return result.body.id;
}

async function getOrder(id) {
  const res = await fetch(`${baseUrl}/api/orders/${id}`);
  return res.json();
}

function androidStub(purchaseState = 0) {
  return async (url) => (String(url) === 'https://oauth2.googleapis.com/token'
    ? response({ access_token: 't', expires_in: 3600 })
    : response({ purchaseState }));
}

function applePayload(productId = 'deepdesk_light', transactionId = 'tx1') {
  return {
    status: 0,
    receipt: {
      bundle_id: 'com.lightonpluslab.deepdesk',
      in_app: [{ product_id: productId, transaction_id: transactionId, purchase_date_ms: '1' }],
    },
  };
}

before(async () => {
  server = http.createServer(app).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 't@t.iam.gserviceaccount.com', private_key: privateKeyPem,
  });
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64;
  __resetTokenCache();
  iapDeps.fetch = androidStub();
});

test('Android happy', async () => {
  const id = await createOrder();
  const result = await request('/api/iap/confirm', { orderId: id, platform: 'android', productId: 'deepdesk_light', purchaseToken: 'android-happy' });
  assert.deepEqual(result, { status: 200, body: { status: 'paid' } });
  assert.equal((await getOrder(id)).status, 'queued');
});

test('iOS happy', async () => {
  iapDeps.fetch = async () => response(applePayload());
  const id = await createOrder();
  const result = await request('/api/iap/confirm', { orderId: id, platform: 'ios', productId: 'deepdesk_light', receipt: 'ios-happy' });
  assert.deepEqual(result, { status: 200, body: { status: 'paid' } });
});

test('iOS sandbox retry', async () => {
  const urls = [];
  iapDeps.fetch = async (url) => {
    urls.push(String(url));
    return response(urls.length === 1 ? { status: 21007 } : applePayload('deepdesk_light', 'tx-sandbox'));
  };
  const id = await createOrder();
  const result = await request('/api/iap/confirm', { orderId: id, platform: 'ios', productId: 'deepdesk_light', receipt: 'ios-sandbox' });
  assert.equal(result.status, 200);
  assert.deepEqual(urls, ['https://buy.itunes.apple.com/verifyReceipt', 'https://sandbox.itunes.apple.com/verifyReceipt']);
});

test('iOS bundle mismatch leaves order awaiting payment', async () => {
  iapDeps.fetch = async () => response({ ...applePayload(), receipt: { bundle_id: 'wrong.bundle', in_app: [] } });
  const id = await createOrder();
  const result = await request('/api/iap/confirm', { orderId: id, platform: 'ios', productId: 'deepdesk_light', receipt: 'ios-wrong-bundle' });
  assert.deepEqual(result, { status: 402, body: { error: 'verification_failed', reason: 'bundle_mismatch' } });
  assert.equal((await getOrder(id)).status, 'awaiting_payment');
});

test('Android rejected purchase leaves order awaiting payment', async () => {
  iapDeps.fetch = androidStub(1);
  const id = await createOrder();
  const result = await request('/api/iap/confirm', { orderId: id, platform: 'android', productId: 'deepdesk_light', purchaseToken: 'android-rejected' });
  assert.deepEqual(result, { status: 402, body: { error: 'verification_failed', reason: 'rejected' } });
  assert.equal((await getOrder(id)).status, 'awaiting_payment');
});

test('replay rejects a token used by another order', async () => {
  const first = await createOrder();
  const second = await createOrder();
  const payload = { platform: 'android', productId: 'deepdesk_light', purchaseToken: 'android-replay' };
  assert.equal((await request('/api/iap/confirm', { orderId: first, ...payload })).status, 200);
  assert.deepEqual(await request('/api/iap/confirm', { orderId: second, ...payload }), { status: 409, body: { error: 'token_reused' } });
  assert.equal((await getOrder(second)).status, 'awaiting_payment');
});

test('idempotent retry returns already', async () => {
  const id = await createOrder();
  const payload = { orderId: id, platform: 'android', productId: 'deepdesk_light', purchaseToken: 'android-idempotent' };
  assert.equal((await request('/api/iap/confirm', payload)).status, 200);
  assert.deepEqual(await request('/api/iap/confirm', payload), { status: 200, body: { status: 'queued', already: true } });
});

test('tier mismatch is rejected', async () => {
  const id = await createOrder('deep');
  assert.deepEqual(await request('/api/iap/confirm', {
    orderId: id, platform: 'android', productId: 'deepdesk_light', purchaseToken: 'android-tier',
  }), { status: 400, body: { error: 'tier_mismatch' } });
});

test('unknown order and unknown product are rejected', async () => {
  assert.deepEqual(await request('/api/iap/confirm', {
    orderId: 'missing-order', platform: 'android', productId: 'deepdesk_light', purchaseToken: 'android-missing',
  }), { status: 404, body: { error: 'not_found' } });
  assert.deepEqual(await request('/api/iap/confirm', {
    orderId: 'anything', platform: 'android', productId: 'not-a-product', purchaseToken: 'android-product',
  }), { status: 400, body: { error: 'bad_request' } });
});

test('missing Google credentials report not configured', async () => {
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64;
  const id = await createOrder();
  assert.deepEqual(await request('/api/iap/confirm', {
    orderId: id, platform: 'android', productId: 'deepdesk_light', purchaseToken: 'android-no-config',
  }), { status: 402, body: { error: 'verification_failed', reason: 'not_configured' } });
});
