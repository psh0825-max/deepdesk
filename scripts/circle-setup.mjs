// Circle 지갑 셋업 (1회 실행):
// 1) 엔티티 시크릿 생성·등록 (복구파일 .circle/recovery-file.json — 절대 커밋 금지)
// 2) 지갑셋 + 지갑 2개 생성 (BASE-SEPOLIA: [0]=에이전트, [1]=서비스 제공자 역할)
// 3) 테스트넷 파우셋으로 USDC/네이티브 가스 요청
import '../src/env.js';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) throw new Error('CIRCLE_API_KEY missing in .env');
const CHAIN = process.env.USDC_CHAIN || 'BASE-SEPOLIA';

let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!entitySecret) {
  entitySecret = crypto.randomBytes(32).toString('hex');
  const dir = path.resolve('.circle');
  mkdirSync(dir, { recursive: true });
  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: dir, // SDK가 디렉터리 안에 recovery_file_<id>.dat 생성
  });
  console.log('REGISTERED_ENTITY_SECRET=' + entitySecret);
  console.log('recovery file: .circle/recovery-file.json (백업 필수, 커밋 금지)');
} else {
  console.log('entity secret already in .env — skipping registration');
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

if (process.env.CIRCLE_WALLET_ID) {
  console.log('CIRCLE_WALLET_ID already set — skipping wallet creation');
} else {
  const ws = await client.createWalletSet({ name: 'DeepDesk' });
  const walletSetId = ws.data?.walletSet?.id;
  console.log('WALLET_SET_ID=' + walletSetId);

  const created = await client.createWallets({
    accountType: 'SCA',
    blockchains: [CHAIN],
    count: 2,
    walletSetId,
  });
  const wallets = created.data?.wallets ?? [];
  wallets.forEach((w, i) => {
    const role = i === 0 ? 'AGENT' : 'PROVIDER';
    console.log(`${role}_WALLET_ID=${w.id}`);
    console.log(`${role}_ADDRESS=${w.address}`);
  });

  // 파우셋: 에이전트 지갑에 테스트넷 USDC + 가스
  const agent = wallets[0];
  try {
    const r = await fetch('https://api.circle.com/v1/faucet/drips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ blockchain: CHAIN, address: agent.address, usdc: true, native: true }),
    });
    console.log('faucet:', r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.log('faucet request failed:', e.message, '— https://faucet.circle.com 에서 수동 요청 가능');
  }
}
