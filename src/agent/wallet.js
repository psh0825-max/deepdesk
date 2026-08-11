// 에이전트 지갑 계층.
// CIRCLE_* 환경변수가 있으면 실제 Circle Developer-Controlled Wallet(USDC, 테스트넷)로 결제하고,
// 없으면 모의 원장으로 동작한다. 두 경로 모두 동일한 지출 가드레일을 통과해야 한다.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LEDGER_FILE = path.resolve('data', 'ledger.json');

// 지출 가드레일: 1회/주문당/일일 한도 + 서비스 허용목록 (+시간제한은 주문 수명으로 갈음)
const LIMITS = {
  perCallMaxUsd: 0.5,
  perOrderMaxUsd: 2.0,
  dailyMaxUsd: 20.0,
};

// 에이전트가 결제할 수 있는 서비스 목록 — 목록 밖 결제는 무조건 거부
// (지금은 유료 데이터 제공자 역할의 자체 지갑 하나. 실제 외부 유료 API 추가 시 여기 등록)
const SERVICES = {
  'premium-data': {
    label: 'Premium data source',
    destination: () => process.env.PROVIDER_ADDRESS,
  },
};

const EXPLORERS = {
  'BASE-SEPOLIA': (tx) => `https://sepolia.basescan.org/tx/${tx}`,
  'ETH-SEPOLIA': (tx) => `https://sepolia.etherscan.io/tx/${tx}`,
};

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

function circleConfigured() {
  return !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID);
}

export async function getSpentToday() {
  const today = new Date().toISOString().slice(0, 10);
  return (await loadLedger())
    .filter((e) => e.at.startsWith(today))
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

export async function getSpentForOrder(orderId) {
  return (await loadLedger())
    .filter((e) => e.orderId === orderId)
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

async function circleClient() {
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets');
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function circleTransfer({ amountUsd, destination }) {
  const client = await circleClient();
  const walletId = process.env.CIRCLE_WALLET_ID;

  const bal = await client.getWalletTokenBalance({ id: walletId });
  const usdc = (bal.data?.tokenBalances ?? []).find((t) => (t.token?.symbol || '').toUpperCase().includes('USDC'));
  if (!usdc) return { ok: false, reason: 'agent wallet has no USDC (faucet 필요)' };
  if (Number(usdc.amount) < amountUsd) return { ok: false, reason: `insufficient USDC: ${usdc.amount}` };

  const created = await client.createTransaction({
    walletId,
    tokenId: usdc.token.id,
    destinationAddress: destination,
    amounts: [amountUsd.toFixed(2)],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  const txId = created.data?.id;
  if (!txId) return { ok: false, reason: 'createTransaction returned no id' };

  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const st = await client.getTransaction({ id: txId });
    const tx = st.data?.transaction;
    // CONFIRMED = 온체인 채굴 완료, COMPLETE = Circle 최종 처리 완료 — 둘 다 성공
    if (tx?.state === 'COMPLETE' || tx?.state === 'CONFIRMED') {
      return { ok: true, txId, txHash: tx.txHash, state: tx.state };
    }
    if (['FAILED', 'DENIED', 'CANCELLED'].includes(tx?.state)) {
      return { ok: false, reason: `transaction ${tx.state}`, txId };
    }
  }
  return { ok: false, reason: 'transaction timeout (아직 confirm 안 됨)', txId };
}

/**
 * 에이전트가 서비스 이용료를 지불한다.
 * 가드레일 위반 시 결제를 거부하고 이유를 반환한다 (throw하지 않음 — 호출부는 무료 경로로 폴백).
 */
export async function pay({ service, amountUsd, orderId, memo }) {
  const svc = SERVICES[service];
  if (!svc) return { ok: false, reason: `service not in allowlist: ${service}` };
  if (amountUsd > LIMITS.perCallMaxUsd) {
    return { ok: false, reason: `per-call limit exceeded (${amountUsd} > ${LIMITS.perCallMaxUsd})` };
  }
  if ((await getSpentForOrder(orderId)) + amountUsd > LIMITS.perOrderMaxUsd) {
    return { ok: false, reason: 'per-order limit exceeded' };
  }
  if ((await getSpentToday()) + amountUsd > LIMITS.dailyMaxUsd) {
    return { ok: false, reason: 'daily limit exceeded' };
  }

  const chain = process.env.USDC_CHAIN || 'BASE-SEPOLIA';
  let entry;
  if (circleConfigured()) {
    const destination = svc.destination();
    if (!destination) return { ok: false, reason: 'service destination address missing' };
    const res = await circleTransfer({ amountUsd, destination });
    if (!res.ok) return res;
    entry = {
      txId: res.txId,
      txHash: res.txHash,
      service,
      amountUsd,
      orderId,
      memo: memo || '',
      at: new Date().toISOString(),
      chain,
      explorerUrl: EXPLORERS[chain] ? EXPLORERS[chain](res.txHash) : null,
    };
  } else {
    entry = {
      txId: `mock-${crypto.randomUUID().slice(0, 12)}`,
      txHash: null,
      service,
      amountUsd,
      orderId,
      memo: memo || '',
      at: new Date().toISOString(),
      chain,
      explorerUrl: null,
    };
  }

  const ledger = await loadLedger();
  ledger.push(entry);
  await saveLedger(ledger);
  return { ok: true, ...entry };
}

export async function getLedger() {
  return loadLedger();
}
