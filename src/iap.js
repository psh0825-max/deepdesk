import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export const PRODUCT_TO_TIER = {
  deepdesk_light: 'light',
  deepdesk_standard: 'standard',
  deepdesk_deep: 'deep',
};

export const iapDeps = { fetch: (...args) => globalThis.fetch(...args) };

export function tierForProduct(productId) {
  return PRODUCT_TO_TIER[productId] || null;
}

let cachedToken = null;

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadServiceAccount() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  const encoded = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64?.trim();
  if (!raw && !encoded) return null;
  const parsed = JSON.parse(raw || Buffer.from(encoded, 'base64').toString('utf8'));
  if (!parsed.client_email || !parsed.private_key) throw new Error('invalid service account');
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key.replace(/\\n/g, '\n') };
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const account = loadServiceAccount();
  if (!account) return null;
  const iat = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: account.clientEmail, scope: PLAY_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${base64url(signer.sign(account.privateKey))}`;
  const response = await iapDeps.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Play access token failed');
  const expiresIn = Number(data.expires_in) || 3600;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return cachedToken.value;
}

export function __resetTokenCache() {
  cachedToken = null;
}

export async function verifyAndroidPurchase({ productId, purchaseToken }) {
  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim() && !process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64?.trim()) {
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const token = await getAccessToken();
    const pkg = process.env.ANDROID_PACKAGE_NAME || 'com.lightonpluslab.deepdesk';
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const response = await iapDeps.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    return data.purchaseState === 0 ? { ok: true } : { ok: false, reason: 'rejected' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

async function verifyAppleEndpoint(endpoint, receipt) {
  const password = process.env.APPLE_SHARED_SECRET;
  // 소모성 상품은 비밀번호 없이 검증되며, 이를 강제한 것은 Songbit의 실제 운영 버그였다.
  const response = await iapDeps.fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receipt,
      'exclude-old-transactions': true,
      ...(password ? { password } : {}),
    }),
  });
  return response.json();
}

export async function verifyApplePurchase({ receipt }) {
  try {
    let data = await verifyAppleEndpoint('https://buy.itunes.apple.com/verifyReceipt', receipt);
    if (data.status === 21007) data = await verifyAppleEndpoint('https://sandbox.itunes.apple.com/verifyReceipt', receipt);
    if (data.status !== 0) return { ok: false, status: data.status, reason: 'rejected' };
    const bundleId = process.env.APPLE_BUNDLE_ID || 'com.lightonpluslab.deepdesk';
    if (data.receipt?.bundle_id !== bundleId) return { ok: false, reason: 'bundle_mismatch' };
    const items = data.latest_receipt_info || data.receipt?.in_app || [];
    const matches = items.filter((item) => tierForProduct(item.product_id));
    const latest = matches.sort((a, b) => Number(b.purchase_date_ms) - Number(a.purchase_date_ms))[0];
    if (!latest) return { ok: false, reason: 'no_product' };
    return { ok: true, productId: latest.product_id, transactionId: latest.transaction_id, status: data.status };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
