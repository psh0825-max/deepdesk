// 파일 기반 주문 저장소. Cloud Run 배포 시 Firestore 구현으로 교체 예정
// (인터페이스 유지: createOrder/getOrder/listOrders/updateOrder)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve('data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

let queue = Promise.resolve();

async function load() {
  try {
    return JSON.parse(await fs.readFile(ORDERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function save(orders) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// 모든 쓰기를 직렬화해 파일 경합 방지
function serialized(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

export function createOrder({ topic, brief, email, tier, language, payMethod }) {
  return serialized(async () => {
    const orders = await load();
    const id = crypto.randomUUID().slice(0, 8);
    orders[id] = {
      id,
      topic,
      brief: brief || '',
      email,
      tier,
      language: language || 'ko',
      payMethod: payMethod || 'unknown',
      status: 'awaiting_payment', // awaiting_payment → paid → running → done | failed
      progress: [],
      costs: { llmTokens: 0, paidApiUsd: 0 },
      reportPath: null,
      createdAt: new Date().toISOString(),
    };
    await save(orders);
    return orders[id];
  });
}

export function getOrder(id) {
  return serialized(async () => (await load())[id] || null);
}

export function listOrders() {
  return serialized(async () => Object.values(await load()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export function updateOrder(id, patch) {
  return serialized(async () => {
    const orders = await load();
    if (!orders[id]) return null;
    Object.assign(orders[id], patch);
    await save(orders);
    return orders[id];
  });
}

export function appendProgress(id, message) {
  return serialized(async () => {
    const orders = await load();
    if (!orders[id]) return null;
    orders[id].progress.push({ at: new Date().toISOString(), message });
    await save(orders);
    return orders[id];
  });
}
