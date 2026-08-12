// SMTP 발송 검증: 소유자 메일로 테스트 발송
import '../src/env.js';
import { sendOwnerAlert } from '../src/mailer.js';

const res = await sendOwnerAlert('SMTP 테스트', `발송 시각: ${new Date().toISOString()}\n이 메일이 보이면 이메일 발송이 정상 동작합니다.`);
console.log(res.skipped ? 'SKIPPED (SMTP 미설정)' : `SENT: ${res.messageId || 'ok'}`);
