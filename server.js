import './src/env.js';
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createOrder, getOrder, listOrders, updateOrder, markPaidOnce, getReport, saveReport, appendProgress, claimIapToken } from './src/store.js';
import { enqueueRun, queueStats } from './src/queue.js';
import { getAddress, getLedger } from './src/agent/wallet.js';
import { sendPaidEmail, sendOwnerAlert } from './src/mailer.js';
import { PRODUCT_TO_TIER, tierForProduct, verifyAndroidPurchase, verifyApplePurchase } from './src/iap.js';
import { needsSourceEnrichment, parseSourcesSection, renderSourcesSection, replaceSourcesSection, resolveSources } from './src/agent/sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function stripAgentFooter(html) {
  return html.replace(
    /<footer>[\s\S]*?<\/footer>/,
    '<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다.</footer>',
  );
}

const enrichingReports = new Set();

async function enrichLegacyReport(id, html) {
  const sources = await resolveSources(parseSourcesSection(html));
  const enriched = replaceSourcesSection(html, renderSourcesSection(sources));
  await saveReport(id, enriched);
  console.log(`report enriched ${id} sources=${sources.length}`);
  return enriched;
}

function enrichAfterSend(id, html) {
  if (!needsSourceEnrichment(html) || enrichingReports.has(id)) return;
  enrichingReports.add(id);
  enrichLegacyReport(id, html).catch((error) => {
    console.error(`report enrich failed ${id}: ${error.message}`);
  }).finally(() => enrichingReports.delete(id));
}

// 리포트는 저장 계층(Firestore/파일)에서 서빙 — 재배포에도 링크가 살아있다
app.get('/reports/:file', async (req, res) => {
  const id = String(req.params.file).replace(/\.html$/, '');
  if (!/^[0-9a-f-]{4,40}$/i.test(id)) return res.status(400).send('bad id');
  const html = await getReport(id);
  if (!html) return res.status(404).send('리포트를 찾을 수 없습니다');
  const isApp = req.query.app === '1' || req.get('x-deepdesk-client') === 'app';
  res.type('html').send(isApp ? stripAgentFooter(html) : html);
  enrichAfterSend(id, html);
});

// 런칭 프로모션가 (krwOrig/usdOrig = 정가, 랜딩에 병기)
const TIERS = {
  light: { krw: 4900, krwOrig: 9900, usd: 3.5, usdOrig: 7, label: '라이트', pages: 'A4 7~8쪽', hours: 24 },
  standard: { krw: 14900, krwOrig: 29000, usd: 10, usdOrig: 19, label: '스탠다드', pages: 'A4 10~13쪽', hours: 48 },
  deep: { krw: 29900, krwOrig: 59000, usd: 20, usdOrig: 39, label: '딥', pages: 'A4 20쪽+ · 차트 포함', hours: 72 },
};

// ---- 주문 생성 속도 제한 (IP당 시간당 10건) ----
const orderHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (orderHits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (hits.length >= 10) return true;
  hits.push(now);
  orderHits.set(ip, hits);
  if (orderHits.size > 5000) orderHits.clear(); // 메모리 보호
  return false;
}

app.get('/api/config', (req, res) => {
  res.json({
    tiers: TIERS,
    pay: {
      card: !!process.env.TOSS_CLIENT_KEY,
      paypalMe: process.env.PAYPAL_ME || null,
      tossId: process.env.TOSS_ID || null,
      usdcAddress: getAddress(),
      usdcChain: process.env.USDC_CHAIN || 'BASE-SEPOLIA',
    },
    iap: { products: { light: 'deepdesk_light', standard: 'deepdesk_standard', deep: 'deepdesk_deep' } },
  });
});

app.post('/api/orders', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  if (rateLimited(ip)) {
    return res.status(429).json({ error: '주문이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' });
  }
  const { topic, brief, email, tier, language, payMethod } = req.body || {};
  if (!topic || typeof topic !== 'string' || topic.trim().length < 5) {
    return res.status(400).json({ error: '조사 주제를 5자 이상 입력해 주세요.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '리포트를 받을 이메일을 확인해 주세요.' });
  }
  if (!TIERS[tier]) {
    return res.status(400).json({ error: '요금제를 선택해 주세요.' });
  }
  const order = await createOrder({
    topic: topic.trim().slice(0, 300),
    brief: (brief || '').trim().slice(0, 2000),
    email: email.trim(),
    tier,
    language,
    payMethod,
  });
  res.json({ id: order.id, status: order.status });
});

// 주문 상태 조회 (고객용)
app.get('/api/orders/:id', async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  const { id, status, tier, createdAt, progress, reportPath, topic } = order;
  const t = TIERS[tier];
  res.json({
    id, status, tier, createdAt, topic, reportPath,
    tierLabel: t?.label, price: t?.krw,
    progress: (progress || []).slice(-6),
  });
});

// ---- 토스페이먼츠 (카드/간편결제, 자동 승인 → 자동 실행) ----
app.get('/api/pay/config', (req, res) => {
  res.json({ clientKey: process.env.TOSS_CLIENT_KEY || null, tossId: process.env.TOSS_ID || null });
});

app.get('/pay/:id', (req, res, next) => {
  if (req.params.id === 'success' || req.params.id === 'fail') return next(); // 예약 경로는 아래 핸들러로
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

function payResultHtml(ok, msg, id) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${ok ? '결제 완료' : '결제 실패'} — DeepDesk</title><style>body{font-family:'Segoe UI',Pretendard,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0}main{text-align:center;padding:24px;max-width:440px}h1{font-size:3rem;margin:0}p{color:#475569;line-height:1.7}.oid{font-family:Consolas,monospace;font-weight:700;color:#1d4ed8}a{display:inline-block;margin-top:16px;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700}</style></head><body><main><h1>${ok ? '✅' : '⚠️'}</h1><p>${msg}</p>${id ? `<p>주문번호: <span class="oid">${id}</span></p>` : ''}<a href="${id ? `/?order=${id}` : '/'}">진행상황 보러 가기</a></main></body></html>`;
}

async function tossApi(pathname, body) {
  const resp = await fetch(`https://api.tosspayments.com${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: 'Basic ' + Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64'),
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, data };
}

// 결제 확정 공통 경로: 원자적 상태 전이 → 접수 메일 → 실행 큐
async function settlePaidOrder(id, patch) {
  const result = await markPaidOnce(id, patch);
  if (!result.ok) return result;
  sendPaidEmail(result.order).catch((e) => console.error('paid email failed:', e.message));
  await enqueueRun(result.order);
  return result;
}

function iapLog(level, platform, orderId, reason) {
  console[level](`iap confirm platform=${platform} orderId=${orderId || '-'} reason=${reason}`);
}

app.post('/api/iap/confirm', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  if (rateLimited(ip)) {
    iapLog('warn', '-', '-', 'rate_limited');
    return res.status(429).json({ error: 'rate_limited' });
  }
  const { orderId, platform, productId, purchaseToken, receipt } = req.body || {};
  const invalid = !orderId || typeof orderId !== 'string' || !['android', 'ios'].includes(platform)
    || !PRODUCT_TO_TIER[productId] || (platform === 'android' && (!purchaseToken || typeof purchaseToken !== 'string'))
    || (platform === 'ios' && (!receipt || typeof receipt !== 'string'));
  if (invalid) {
    iapLog('warn', platform, orderId, 'bad_request');
    return res.status(400).json({ error: 'bad_request' });
  }
  const order = await getOrder(orderId);
  if (!order) {
    iapLog('warn', platform, orderId, 'not_found');
    return res.status(404).json({ error: 'not_found' });
  }
  const tier = tierForProduct(productId);
  if (order.tier !== tier) {
    iapLog('warn', platform, orderId, 'tier_mismatch');
    return res.status(400).json({ error: 'tier_mismatch' });
  }
  if (order.status !== 'awaiting_payment') {
    iapLog('log', platform, orderId, 'already_processed');
    return res.json({ status: order.status, already: true });
  }
  const verification = platform === 'android'
    ? await verifyAndroidPurchase({ productId, purchaseToken })
    : await verifyApplePurchase({ receipt });
  if (!verification.ok) {
    iapLog('warn', platform, orderId, verification.reason || 'verification_failed');
    return res.status(402).json({ error: 'verification_failed', reason: verification.reason });
  }
  if (platform === 'ios' && verification.productId !== productId) {
    iapLog('warn', platform, orderId, 'product_mismatch');
    return res.status(402).json({ error: 'verification_failed', reason: 'product_mismatch' });
  }
  const tokenValue = platform === 'android' ? purchaseToken : verification.transactionId;
  const tokenHash = crypto.createHash('sha256').update(`${platform}:${tokenValue}`).digest('hex');
  const claim = await claimIapToken(tokenHash, orderId);
  if (!claim.ok) {
    iapLog('warn', platform, orderId, 'token_reused');
    return res.status(409).json({ error: 'token_reused' });
  }
  const iapRef = platform === 'ios'
    ? verification.transactionId
    : crypto.createHash('sha256').update(purchaseToken).digest('hex').slice(0, 16);
  const result = await settlePaidOrder(orderId, {
    payMethod: `iap_${platform}`, iapProductId: productId, iapRef, paidAmount: TIERS[tier].krw,
  });
  if (!result.ok) {
    iapLog('log', platform, orderId, 'already_processed');
    return res.json({ status: result.order?.status || 'paid', already: true });
  }
  iapLog('log', platform, orderId, 'paid');
  return res.json({ status: 'paid' });
});

app.get('/pay/success', async (req, res) => {
  const { paymentKey, orderId, amount } = req.query;
  const id = String(orderId || '').replace(/^dd-/, '');
  const order = await getOrder(id);
  const expected = TIERS[order?.tier]?.krw;
  if (!order || !paymentKey || Number(amount) !== expected) {
    return res.status(400).send(payResultHtml(false, '결제 정보가 주문과 일치하지 않습니다. 결제는 승인되지 않았으니 다시 시도해 주세요.', id));
  }
  if (order.status === 'awaiting_payment') {
    if (!process.env.TOSS_SECRET_KEY) {
      return res.status(500).send(payResultHtml(false, '결제 모듈 설정 오류입니다. 관리자에게 문의해 주세요.', id));
    }
    const { ok, data } = await tossApi('/v1/payments/confirm', { paymentKey, orderId, amount: Number(amount) });
    if (!ok || data.status !== 'DONE') {
      return res.status(400).send(payResultHtml(false, `결제 승인에 실패했습니다: ${data.message || data.code || '알 수 없는 오류'}`, id));
    }
    await settlePaidOrder(id, { payMethod: 'tosspayments', paymentKey, paidAmount: Number(amount) });
  }
  res.send(payResultHtml(true, '결제가 완료되었습니다! 에이전트가 곧바로 조사를 시작했어요. 완료되면 이메일로 리포트 링크를 보내드립니다.', id));
});

app.get('/pay/fail', (req, res) => {
  res.send(payResultHtml(false, `결제가 진행되지 않았습니다${req.query.message ? ` (${req.query.message})` : ''}. 다시 시도해 주세요.`, ''));
});

// 웹훅(선택 등록): 고객이 승인 후 창을 닫아 successUrl을 못 탄 경우의 보루.
// 페이로드를 신뢰하지 않고 토스 API로 재조회해 검증한다.
app.post('/api/pay/webhook', async (req, res) => {
  res.status(200).end(); // 토스에는 즉시 200
  try {
    const orderIdRaw = req.body?.data?.orderId || req.body?.orderId;
    if (!orderIdRaw || !String(orderIdRaw).startsWith('dd-')) return;
    await reconcileOrder(String(orderIdRaw).replace(/^dd-/, ''));
  } catch (e) {
    console.error('webhook handling failed:', e.message);
  }
});

// 미확정 결제 대사: 토스에서 주문 상태를 직접 조회해 DONE이면 확정 처리
async function reconcileOrder(id) {
  const order = await getOrder(id);
  if (!order || order.status !== 'awaiting_payment' || !process.env.TOSS_SECRET_KEY) return;
  const { ok, data } = await tossApi(`/v1/payments/orders/dd-${id}`);
  if (ok && data.status === 'DONE' && data.totalAmount === TIERS[order.tier]?.krw) {
    console.log(`reconcile: order ${id} confirmed via sweep`);
    await settlePaidOrder(id, { payMethod: 'tosspayments', paymentKey: data.paymentKey, paidAmount: data.totalAmount });
  }
}

async function reconcileSweep() {
  try {
    const pending = await listOrders({ status: 'awaiting_payment', limit: 50 });
    const dayAgo = Date.now() - 24 * 3600_000;
    for (const o of pending) {
      if (new Date(o.createdAt).getTime() < dayAgo) continue;
      await reconcileOrder(o.id);
    }
  } catch (e) {
    console.error('reconcile sweep failed:', e.message);
  }
}
if (process.env.DEEPDESK_NO_LISTEN !== '1') setInterval(reconcileSweep, 3 * 60_000).unref();

// ---- 관리자 ----
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.get('x-admin-token') !== token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  res.json(await listOrders({ limit: 200 }));
});

app.get('/api/admin/ledger', requireAdmin, async (req, res) => {
  res.json(await getLedger());
});

app.get('/api/admin/health', requireAdmin, async (req, res) => {
  res.json({ queue: queueStats(), store: process.env.K_SERVICE ? 'firestore' : 'file', uptimeSec: Math.round(process.uptime()) });
});

// 입금 확인 후 실행 (계좌/토스송금·PayPal·USDC 수동 확인용)
app.post('/api/admin/orders/:id/run', requireAdmin, async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (['running', 'queued'].includes(order.status)) return res.status(409).json({ error: 'already in progress' });
  if (order.status === 'awaiting_payment') {
    const r = await markPaidOnce(order.id, { payMethod: order.payMethod, manualConfirm: true });
    if (r.ok) {
      sendPaidEmail(r.order).catch(() => {});
      await enqueueRun(r.order);
      return res.json({ ok: true, id: order.id });
    }
  }
  await enqueueRun(order); // failed/done 재실행 (보완 요청 등)
  res.json({ ok: true, id: order.id, rerun: true });
});

// 환불 (토스페이먼츠 결제 건)
app.post('/api/admin/orders/:id/refund', requireAdmin, async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (!order.paymentKey) return res.status(400).json({ error: 'no card payment on this order' });
  const { ok, data } = await tossApi(`/v1/payments/${order.paymentKey}/cancel`, {
    cancelReason: req.body?.reason || '고객 요청 환불',
  });
  if (!ok) return res.status(400).json({ error: data.message || data.code || 'cancel failed' });
  await updateOrder(order.id, { status: 'refunded', refundedAt: new Date().toISOString() });
  sendOwnerAlert(`환불 처리됨 — 주문 ${order.id}`, `주제: ${order.topic}\n금액: ${order.paidAmount}원`).catch(() => {});
  res.json({ ok: true, id: order.id });
});

// 크래시/재배포로 끊긴 주문 복구: paid(실행 직전)·queued·running 상태를 재큐잉
async function recoverInterrupted() {
  try {
    const stuck = [];
    for (const status of ['paid', 'queued', 'running']) {
      stuck.push(...(await listOrders({ status, limit: 50 })));
    }
    for (const o of stuck) {
      await appendProgress(o.id, '서버 재시작 감지 — 조사를 처음부터 다시 시작합니다');
      await enqueueRun(o);
    }
    if (stuck.length) console.log(`recovered ${stuck.length} interrupted order(s)`);
  } catch (e) {
    console.error('recovery failed:', e.message);
  }
}

const port = process.env.PORT || 8080;
if (process.env.DEEPDESK_NO_LISTEN !== '1') {
  app.listen(port, () => {
    console.log(`DeepDesk listening on :${port} (store: ${process.env.K_SERVICE ? 'firestore' : 'file'})`);
    recoverInterrupted();
  });
}

export { app, enrichLegacyReport, stripAgentFooter };
