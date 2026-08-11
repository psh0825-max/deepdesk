// 에이전트 지갑 잔액 확인 (입금 대기 폴링)
import '../src/env.js';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 20; i++) {
  const bal = await client.getWalletTokenBalance({ id: process.env.CIRCLE_WALLET_ID });
  const tokens = bal.data?.tokenBalances ?? [];
  if (tokens.length > 0) {
    for (const t of tokens) console.log(`${t.token?.symbol}: ${t.amount} (tokenId ${t.token?.id})`);
    process.exit(0);
  }
  console.log(`waiting for deposit... (${i + 1}/20)`);
  await sleep(10000);
}
console.log('no balance yet after 200s');
