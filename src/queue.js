// 조사 실행 큐 — 동시 실행을 제한해 메모리/레이트리밋을 보호한다.
// 주문은 queued 상태로 들어와 슬롯이 나면 running으로 전이된다.
import { updateOrder, appendProgress } from './store.js';
import { runResearch } from './agent/researcher.js';
import { sendReportEmail } from './mailer.js';

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_RUNS || 2);
const waiting = [];
let active = 0;

export async function enqueueRun(order) {
  // 테스트 전용 — 실제 조사/메일 실행 차단
  if (process.env.DEEPDESK_TEST_NO_RUN === '1') return updateOrder(order.id, { status: 'queued' });
  await updateOrder(order.id, { status: 'queued' });
  await appendProgress(order.id, '결제 확인 — 조사 대기열에 등록');
  waiting.push(order.id);
  pump();
}

async function pump() {
  while (active < MAX_CONCURRENT && waiting.length > 0) {
    const id = waiting.shift();
    active++;
    run(id).finally(() => {
      active--;
      pump();
    });
  }
}

async function run(id) {
  try {
    const { getOrder } = await import('./store.js');
    const order = await getOrder(id);
    if (!order || ['done', 'running'].includes(order.status)) return;
    const result = await runResearch(order);
    if (result.ok) {
      const fresh = await getOrder(id);
      sendReportEmail(fresh).catch((e) => console.error('report email failed:', e.message));
    }
  } catch (e) {
    console.error(`run ${id} crashed:`, e);
    await updateOrder(id, { status: 'failed' }).catch(() => {});
  }
}

export function queueStats() {
  return { active, waiting: waiting.length, max: MAX_CONCURRENT };
}
