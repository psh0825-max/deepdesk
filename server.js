import './src/env.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrder, getOrder, listOrders, updateOrder } from './src/store.js';
import { runResearch } from './src/agent/researcher.js';
import { getAddress, getLedger } from './src/agent/wallet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// 런칭 프로모션가 (krwOrig/usdOrig = 정가, 랜딩에 병기)
const TIERS = {
  light: { krw: 4900, krwOrig: 9900, usd: 3.5, usdOrig: 7, label: '라이트', pages: 'A4 7~8쪽', hours: 24 },
  standard: { krw: 14900, krwOrig: 29000, usd: 10, usdOrig: 19, label: '스탠다드', pages: 'A4 10~13쪽', hours: 48 },
  deep: { krw: 29900, krwOrig: 59000, usd: 20, usdOrig: 39, label: '딥', pages: 'A4 15쪽+ · 차트 포함', hours: 72 },
};

// 랜딩에서 쓸 결제 안내/가격 정보
app.get('/api/config', (req, res) => {
  res.json({
    tiers: TIERS,
    pay: {
      paypalMe: process.env.PAYPAL_ME || null,
      tossId: process.env.TOSS_ID || null,
      usdcAddress: getAddress(),
      usdcChain: process.env.USDC_CHAIN || 'BASE-SEPOLIA',
    },
  });
});

app.post('/api/orders', async (req, res) => {
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
    progress: progress.slice(-5),
  });
});

// ---- 토스페이먼츠 (카드/간편결제, 자동 승인 → 자동 실행) ----
app.get('/api/pay/config', (req, res) => {
  res.json({ clientKey: process.env.TOSS_CLIENT_KEY || null, tossId: process.env.TOSS_ID || null });
});

app.get('/pay/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

function payResultHtml(ok, msg, id) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${ok ? '결제 완료' : '결제 실패'} — DeepDesk</title><style>body{font-family:'Segoe UI',Pretendard,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0}main{text-align:center;padding:24px;max-width:440px}h1{font-size:3rem;margin:0}p{color:#475569;line-height:1.7}.oid{font-family:Consolas,monospace;font-weight:700;color:#1d4ed8}a{display:inline-block;margin-top:16px;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700}</style></head><body><main><h1>${ok ? '✅' : '⚠️'}</h1><p>${msg}</p>${id ? `<p>주문번호: <span class="oid">${id}</span></p>` : ''}<a href="/">홈으로 — 주문 조회에서 진행상황 확인</a></main></body></html>`;
}

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
    const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });
    const data = await resp.json();
    if (!resp.ok || data.status !== 'DONE') {
      return res.status(400).send(payResultHtml(false, `결제 승인에 실패했습니다: ${data.message || data.code || '알 수 없는 오류'}`, id));
    }
    const paid = await updateOrder(id, { status: 'paid', payMethod: 'tosspayments', paymentKey });
    runResearch(paid); // 결제 확인 즉시 에이전트 자동 시작 — 사람 개입 없음
  }
  res.send(payResultHtml(true, '결제가 완료되었습니다! 에이전트가 곧바로 조사를 시작했어요. 완료되면 리포트 링크가 열립니다.', id));
});

app.get('/pay/fail', (req, res) => {
  res.send(payResultHtml(false, `결제가 진행되지 않았습니다${req.query.message ? ` (${req.query.message})` : ''}. 다시 시도해 주세요.`, ''));
});

// ---- 관리자 ----
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.get('x-admin-token') !== token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  res.json(await listOrders());
});

app.get('/api/admin/ledger', requireAdmin, async (req, res) => {
  res.json(await getLedger());
});

// 입금 확인 후 실행 (결제 자동감지 전까지 수동 트리거)
app.post('/api/admin/orders/:id/run', requireAdmin, async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (order.status === 'running') return res.status(409).json({ error: 'already running' });
  await updateOrder(order.id, { status: 'paid' });
  runResearch(order); // 비동기 실행 — 진행상황은 progress로 추적
  res.json({ ok: true, id: order.id });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`DeepDesk listening on :${port}`));
