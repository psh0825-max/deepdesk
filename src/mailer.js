// 이메일 발송 — SMTP 환경변수(SMTP_USER/SMTP_PASS)가 있을 때만 활성화.
// Gmail 기준: 2단계 인증 + 앱 비밀번호(https://myaccount.google.com/apppasswords) 필요.
import nodemailer from 'nodemailer';

function transporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const FROM = () => process.env.MAIL_FROM || `DeepDesk <${process.env.SMTP_USER}>`;
// 로컬 개발 서버가 만든 리포트는 프로드에 없다 — 배포 환경(K_SERVICE)에서만 공개 URL 사용
const BASE = () => (process.env.K_SERVICE && process.env.PUBLIC_BASE_URL) || `http://localhost:${process.env.PORT || 8080}`;

export async function sendPaidEmail(order) {
  const t = transporter();
  if (!t) return { skipped: true };
  return t.sendMail({
    from: FROM(),
    to: order.email,
    subject: `[DeepDesk] 결제 확인 — 조사를 시작했습니다 (주문 ${order.id})`,
    text: `주문이 접수되어 AI 리서치 에이전트가 조사를 시작했습니다.

주제: ${order.topic}
주문번호: ${order.id}

진행상황 확인: ${BASE()}/?order=${order.id}
완료되면 이 메일로 리포트 링크를 보내드립니다.

— DeepDesk`,
  });
}

export async function sendReportEmail(order) {
  const t = transporter();
  if (!t) return { skipped: true };
  return t.sendMail({
    from: FROM(),
    to: order.email,
    subject: `[DeepDesk] 리서치 리포트 완성 — ${order.topic.slice(0, 40)}${order.topic.length > 40 ? '…' : ''}`,
    text: `의뢰하신 리서치 리포트가 완성되었습니다.

주제: ${order.topic}
주문번호: ${order.id}

리포트 보기: ${BASE()}${order.reportPath}

결과가 기대에 못 미치면 이 메일에 회신해 주세요. 1회 무상 보완해 드립니다.

— DeepDesk`,
  });
}

export async function sendOwnerAlert(subject, body) {
  const t = transporter();
  if (!t || !process.env.OWNER_EMAIL) return { skipped: true };
  return t.sendMail({ from: FROM(), to: process.env.OWNER_EMAIL, subject: `[DeepDesk 알림] ${subject}`, text: body });
}
