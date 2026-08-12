// KOSIS·DART 연동 단독 테스트
import '../src/env.js';
import { officialDataAvailable, kosisLookup, dartFinancials } from '../src/agent/datasources.js';

console.log('available:', officialDataAvailable());

const kosis = await kosisLookup('자영업자');
console.log('\n[KOSIS "자영업자"]');
if (kosis) {
  console.log('표:', kosis.table, '/', kosis.org);
  console.log('행:', kosis.rows.slice(0, 3));
} else {
  console.log('실패 또는 결과 없음');
}

const dart = await dartFinancials('삼성전자');
console.log('\n[DART "삼성전자"]');
if (dart) {
  console.log('기업:', dart.corp, dart.year + '년');
  console.log(dart.rows.slice(0, 4));
} else {
  console.log('실패 또는 결과 없음');
}
