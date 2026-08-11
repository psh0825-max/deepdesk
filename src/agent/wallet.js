// 에이전트 지갑 계층.
// 현재: 모의 원장(mock ledger) — 결제 흐름/지출 한도 로직을 먼저 완성.
// 다음: Circle Developer-Controlled Wallets(USDC, 테스트넷)로 교체.
//       pay()의 시그니처는 유지되므로 호출부 수정 없음.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LEDGER_FILE = path.resolve('data', 'ledger.json');

// 지출 가드레일 (웨비나에서 강조된 패턴: 한도·허용목록·시간제한)
const LIMITS = {
  perCallMaxUsd: 0.5,      // 1회 결제 상한
  perOrderMaxUsd: 2.0,     // 주문 1건당 상한
  dailyMaxUsd: 20.0,       // 일일 상한
};
const ALLOWLIST = new Set([
  'search.premium.example', // 결제 허용된 서비스 식별자만
]);

async function loadLedger() {
  try {
    return JSON.parse(await fs.readFile(LEDGER_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function saveLedger(entries) {
  await fs.mkdir(path.dirname(LEDGER_FILE), { recursive: true });
  await fs.writeFile(LEDGER_FILE, JSON.stringify(entries, null, 2));
}

export function getAddress() {
  return process.env.USDC_ADDRESS || null;
}

export async function getSpentToday() {
  const today = new Date().toISOString().slice(0, 10);
  const ledger = await loadLedger();
  return ledger
    .filter((e) => e.at.startsWith(today))
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

export async function getSpentForOrder(orderId) {
  const ledger = await loadLedger();
  return ledger
    .filter((e) => e.orderId === orderId)
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

/**
 * 에이전트가 서비스 이용료를 지불한다.
 * 가드레일 위반 시 결제를 거부하고 이유를 반환한다 (throw하지 않음 — 에이전트는 결제 실패 시 무료 경로로 폴백).
 */
export async function pay({ service, amountUsd, orderId, memo }) {
  if (!ALLOWLIST.has(service)) {
    return { ok: false, reason: `service not in allowlist: ${service}` };
  }
  if (amountUsd > LIMITS.perCallMaxUsd) {
    return { ok: false, reason: `per-call limit exceeded (${amountUsd} > ${LIMITS.perCallMaxUsd})` };
  }
  if ((await getSpentForOrder(orderId)) + amountUsd > LIMITS.perOrderMaxUsd) {
    return { ok: false, reason: 'per-order limit exceeded' };
  }
  if ((await getSpentToday()) + amountUsd > LIMITS.dailyMaxUsd) {
    return { ok: false, reason: 'daily limit exceeded' };
  }

  // TODO(Circle): developer-controlled wallet로 실제 USDC 전송, txHash/explorer URL 기록
  const entry = {
    txId: `mock-${crypto.randomUUID().slice(0, 12)}`,
    service,
    amountUsd,
    orderId,
    memo: memo || '',
    at: new Date().toISOString(),
    chain: process.env.USDC_CHAIN || 'BASE-SEPOLIA',
    explorerUrl: null,
  };
  const ledger = await loadLedger();
  ledger.push(entry);
  await saveLedger(ledger);
  return { ok: true, ...entry };
}

export async function getLedger() {
  return loadLedger();
}
