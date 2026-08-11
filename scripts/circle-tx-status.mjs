// 특정 트랜잭션 상태 확인: node scripts/circle-tx-status.mjs <txId>
import '../src/env.js';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const id = process.argv[2];
if (!id) throw new Error('usage: node scripts/circle-tx-status.mjs <txId>');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const res = await client.getTransaction({ id });
const tx = res.data?.transaction;
console.log(JSON.stringify({
  state: tx?.state,
  txHash: tx?.txHash,
  errorReason: tx?.errorReason,
  errorDetails: tx?.errorDetails,
  networkFee: tx?.networkFee,
  createDate: tx?.createDate,
  updateDate: tx?.updateDate,
}, null, 1));
