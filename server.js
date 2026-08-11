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

const TIERS = {
  light: { krw: 9900, usd: 7, label: '라이트', pages: '5~8p', hours: 24 },
  standard: { krw: 29000, usd: 19, label: '스탠다드', pages: '12~20p', hours: 48 },
  deep: { krw: 59000, usd: 39, label: '딥', pages: '20p+', hours: 72 },
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

// 주문 상태 조회 (고객용 — 이메일 일치 시에만 상세)
app.get('/api/orders/:id', async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  const { id, status, tier, createdAt, progress, reportPath, topic } = order;
  res.json({ id, status, tier, createdAt, topic, reportPath, progress: progress.slice(-5) });
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
