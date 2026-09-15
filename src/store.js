// 저장 계층 — 이중 백엔드:
//  · Cloud Run(K_SERVICE) 또는 DEEPDESK_STORE=firestore → Firestore (재배포에도 영속)
//  · 로컬 개발 → 파일 (data/orders.json, data/ledger.json, reports/*.html)
// 컬렉션: orders(주문), ledger(에이전트 지출 원장), reports(리포트 HTML)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const USE_FIRESTORE = !!process.env.K_SERVICE || process.env.DEEPDESK_STORE === 'firestore';

// ---------- Firestore 백엔드 ----------
let db = null;
async function firestore() {
  if (!db) {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore();
  }
  return db;
}

// ---------- 파일 백엔드 ----------
const DATA_DIR = path.resolve('data');
const REPORTS_DIR = path.resolve('reports');
let queue = Promise.resolve();

function serialized(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

async function loadJson(file) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

async function saveJson(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ---------- 주문 ----------
export async function createOrder({ topic, brief, email, tier, language, payMethod }) {
  const id = crypto.randomUUID().slice(0, 8);
  const order = {
    id,
    topic,
    brief: brief || '',
    email,
    tier,
    language: language || 'ko',
    payMethod: payMethod || 'unknown',
    status: 'awaiting_payment', // awaiting_payment → paid → queued → running → done | failed
    progress: [],
    costs: { llmTokens: 0, paidApiUsd: 0 },
    reportPath: null,
    createdAt: new Date().toISOString(),
  };
  if (USE_FIRESTORE) {
    await (await firestore()).collection('orders').doc(id).set(order);
    return order;
  }
  return serialized(async () => {
    const orders = (await loadJson('orders.json')) || {};
    orders[id] = order;
    await saveJson('orders.json', orders);
    return order;
  });
}

export async function getOrder(id) {
  if (USE_FIRESTORE) {
    const snap = await (await firestore()).collection('orders').doc(String(id)).get();
    return snap.exists ? snap.data() : null;
  }
  return serialized(async () => ((await loadJson('orders.json')) || {})[id] || null);
}

export async function listOrders({ status, limit = 100 } = {}) {
  if (USE_FIRESTORE) {
    let q = (await firestore()).collection('orders');
    if (status) q = q.where('status', '==', status);
    const snap = await q.get();
    return snap.docs.map((d) => d.data())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  return serialized(async () => Object.values((await loadJson('orders.json')) || {})
    .filter((o) => !status || o.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit));
}

export async function updateOrder(id, patch) {
  if (USE_FIRESTORE) {
    const ref = (await firestore()).collection('orders').doc(String(id));
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return snap.exists ? snap.data() : null;
  }
  return serialized(async () => {
    const orders = (await loadJson('orders.json')) || {};
    if (!orders[id]) return null;
    Object.assign(orders[id], patch);
    await saveJson('orders.json', orders);
    return orders[id];
  });
}

// 결제 확정 전이의 원자성: awaiting_payment일 때만 paid로 바꾼다 (중복 승인/실행 방지)
export async function markPaidOnce(id, patch) {
  if (USE_FIRESTORE) {
    const fdb = await firestore();
    const ref = fdb.collection('orders').doc(String(id));
    return fdb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, reason: 'not_found' };
      const order = snap.data();
      if (order.status !== 'awaiting_payment') return { ok: false, reason: 'already_processed', order };
      const next = { ...order, ...patch, status: 'paid' };
      tx.set(ref, next);
      return { ok: true, order: next };
    });
  }
  return serialized(async () => {
    const orders = (await loadJson('orders.json')) || {};
    const order = orders[id];
    if (!order) return { ok: false, reason: 'not_found' };
    if (order.status !== 'awaiting_payment') return { ok: false, reason: 'already_processed', order };
    Object.assign(order, patch, { status: 'paid' });
    await saveJson('orders.json', orders);
    return { ok: true, order };
  });
}

// IAP 영수증/토큰은 한 주문에만 연결한다.
export async function claimIapToken(key, orderId) {
  if (USE_FIRESTORE) {
    const fdb = await firestore();
    const ref = fdb.collection('iap_tokens').doc(String(key));
    return fdb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, { orderId, at: new Date().toISOString() });
        return { ok: true };
      }
      const owner = snap.data().orderId;
      return owner === orderId ? { ok: true, already: true } : { ok: false, orderId: owner };
    });
  }
  return serialized(async () => {
    const tokens = (await loadJson('iap_tokens.json')) || {};
    if (!tokens[key]) {
      tokens[key] = { orderId, at: new Date().toISOString() };
      await saveJson('iap_tokens.json', tokens);
      return { ok: true };
    }
    return tokens[key].orderId === orderId
      ? { ok: true, already: true }
      : { ok: false, orderId: tokens[key].orderId };
  });
}

export async function appendProgress(id, message) {
  const entry = { at: new Date().toISOString(), message };
  if (USE_FIRESTORE) {
    const { FieldValue } = await import('@google-cloud/firestore');
    await (await firestore()).collection('orders').doc(String(id))
      .update({ progress: FieldValue.arrayUnion(entry) });
    return;
  }
  return serialized(async () => {
    const orders = (await loadJson('orders.json')) || {};
    if (!orders[id]) return null;
    orders[id].progress.push(entry);
    await saveJson('orders.json', orders);
    return orders[id];
  });
}

// ---------- 리포트 ----------
export async function saveReport(id, html) {
  if (USE_FIRESTORE) {
    await (await firestore()).collection('reports').doc(String(id))
      .set({ id, html, createdAt: new Date().toISOString() });
    return;
  }
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORTS_DIR, `${id}.html`), html);
}

export async function getReport(id) {
  if (USE_FIRESTORE) {
    const snap = await (await firestore()).collection('reports').doc(String(id)).get();
    return snap.exists ? snap.data().html : null;
  }
  try {
    return await fs.readFile(path.join(REPORTS_DIR, `${id}.html`), 'utf8');
  } catch {
    return null;
  }
}

// ---------- 지출 원장 ----------
export async function addLedgerEntry(entry) {
  if (USE_FIRESTORE) {
    await (await firestore()).collection('ledger').doc(entry.txId).set(entry);
    return;
  }
  return serialized(async () => {
    const ledger = (await loadJson('ledger.json')) || [];
    ledger.push(entry);
    await saveJson('ledger.json', ledger);
  });
}

export async function getLedgerEntries() {
  if (USE_FIRESTORE) {
    const snap = await (await firestore()).collection('ledger').get();
    return snap.docs.map((d) => d.data()).sort((a, b) => a.at.localeCompare(b.at));
  }
  return serialized(async () => (await loadJson('ledger.json')) || []);
}
