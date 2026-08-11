// 에이전트 지갑 실결제 테스트: premium-data 서비스에 $0.10 USDC 지불
import '../src/env.js';
import { pay, getLedger } from '../src/agent/wallet.js';

const res = await pay({
  service: 'premium-data',
  amountUsd: 0.1,
  orderId: 'pay-test',
  memo: 'first on-chain agent payment',
});
console.log(JSON.stringify(res, null, 1));
if (res.ok && res.explorerUrl) {
  console.log('\nEXPLORER:', res.explorerUrl);
}
