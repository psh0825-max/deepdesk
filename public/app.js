const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let CONFIG = null;
let pollTimer = null;

// ---------- i18n ----------
const I18N = {
  ko: {
    nav_cta: '의뢰하기',
    hero_h1: '궁금한 건 뭐든,<br>AI 애널리스트가 <em>조사해서 보고</em>합니다',
    hero_sub: '주제만 던지세요. DeepDesk의 리서치 에이전트가 수십 개 출처를 검증하며 조사하고,<br>전문가급 리포트를 <strong>24시간 안에</strong> 이메일로 보내드립니다.',
    hero_cta: '지금 의뢰하기 — 런칭가 4,900원부터',
    hero_note: '시장조사 · 경쟁사 분석 · 창업 아이템 검증 · 구매 전 비교 · 투자 전 실사 · 학술 배경조사',
    how_h2: '사람이 아니라, <em>지갑을 가진 에이전트</em>가 일합니다',
    how_1t: '의뢰 접수', how_1p: '주제와 요구사항을 적으면 에이전트가 조사 계획을 세웁니다.',
    how_2t: '자율 조사', how_2p: '세부 질문별로 웹을 검색·교차검증합니다. 유료 데이터가 필요하면 <strong>에이전트가 자기 USDC 지갑으로 직접 결제</strong>합니다 (지출 한도·허용목록 내에서만).',
    how_3t: '리포트 발송', how_3p: '요약·핵심 지표 카드·차트·출처까지 갖춘 리포트가 이메일로 도착합니다.',
    pricing_h2: '요금', pricing_note: '결제 확인 후 조사가 시작됩니다. 결과가 기대에 못 미치면 1회 무상 보완.',
    order_h2: '의뢰하기',
    f_topic: '조사 주제 *', f_topic_ph: '예: 2026년 국내 무인 사진관 시장 규모와 주요 업체 비교',
    f_brief: '상세 요구사항 (선택)', f_brief_ph: '알고 싶은 것, 용도, 꼭 포함할 항목 등',
    f_tier: '요금제 *', f_lang: '리포트 언어', f_email: '받을 이메일 *', f_pay: '결제 방법', f_submit: '의뢰 접수',
    st_h2: '주문 조회', st_ph: '주문번호 (예: 3f2a9c1b)', st_btn: '조회',
    faq_1q: '얼마나 걸리나요?', faq_1a: '라이트는 보통 몇 시간 안에, 늦어도 24시간 안에 발송됩니다. 스탠다드 48시간, 딥 72시간이 최대 기한이며 대부분 훨씬 빠릅니다.',
    faq_2q: '품질이 마음에 안 들면요?', faq_2a: '의뢰 취지와 다르면 1회 무상 보완해 드립니다. 조사 시작 전에는 전액 환불됩니다. 자세한 기준은 이용약관을 참고하세요.',
    faq_3q: '출처는 믿을 수 있나요?', faq_3a: '리포트 하단에 참고한 모든 출처 링크(보통 수십~수백 건)를 그대로 공개합니다. 수치에는 연도를 함께 표기하고, 확인이 어려운 내용은 "확인 필요"로 표시합니다.',
    faq_4q: '영어 리포트도 되나요?', faq_4a: '네. 주문 시 리포트 언어를 English로 선택하면 됩니다.',
    faq_5q: '에이전트가 결제한다는 게 무슨 뜻인가요?', faq_5a: '조사에 유료 데이터가 필요하면 AI 에이전트가 자기 USDC 지갑에서 직접 결제합니다. 지출 한도와 허용목록 안에서만 결제할 수 있고, 모든 결제는 블록체인에 공개 기록되어 리포트 하단에서 확인할 수 있습니다.',
    ft_stack: 'Gemini 기반 리서치 에이전트 · Google Cloud에서 운영 · 에이전트 지갑은 Circle USDC (지출 한도·허용목록 적용)',
    ft_terms: '이용약관·환불규정', ft_privacy: '개인정보처리방침', ft_contact: '문의: psh0825@gmail.com',
    tier_desc: { light: '간단한 비교·검증. 핵심만 빠르게.', standard: '시장·경쟁사 분석 수준. 가장 인기.', deep: '의사결정용 심층 조사 + 권고안.' },
    tier_pages: { light: 'A4 7~8쪽', standard: 'A4 10~13쪽', deep: 'A4 20쪽+ · 차트 포함' },
    tier_opt: (t, l) => `${l} — ${t.krw.toLocaleString()}원`,
    hours: (h) => `${h}시간 내 발송`, popular: '인기', sale: '런칭 50%',
    pay_opts: [['toss', '카드·간편결제'], ['paypal', 'PayPal'], ['usdc', 'USDC']],
    tier_labels: { light: '라이트', standard: '스탠다드', deep: '딥' },
    status: { awaiting_payment: '입금 대기 중', paid: '결제 확인 — 곧 시작', queued: '대기열 등록 — 곧 시작', running: '조사 진행 중', done: '완료', failed: '오류 — 문의해 주세요', refunded: '환불 완료' },
    msg_created: (id) => `✅ 접수 완료! 주문번호: <span class="oid">${esc(id)}</span>`,
    msg_next: '결제가 확인되면 에이전트가 조사를 시작하고, 완료되면 이메일로 리포트를 보내드립니다.',
    msg_track: "아래 '주문 조회'에서 진행상황을 볼 수 있어요.",
    msg_paypal: (h, usd) => `<a href="https://paypal.me/${esc(h)}/${usd}" target="_blank" rel="noopener">PayPal로 $${usd} 결제하기</a>`,
    msg_usdc: (chain, usd, addr) => `USDC(${esc(chain)}) <strong>$${usd}</strong> → <code>${esc(addr)}</code>`,
    msg_toss: (tid, krw) => `토스 아이디 <strong>${esc(tid)}</strong>로 ₩${krw.toLocaleString()} 송금`,
    msg_mail: '결제 안내를 이메일로 보내드립니다.',
    open_report: '📄 리포트 열기', autorefresh: '⟳ 자동 갱신 중',
  },
  en: {
    nav_cta: 'Order now',
    hero_h1: 'Ask anything.<br>An AI analyst <em>researches and reports back</em>',
    hero_sub: "Just drop a topic. DeepDesk's research agent investigates across dozens of verified sources<br>and emails you an expert-grade report <strong>within 24 hours</strong>.",
    hero_cta: 'Order now — launch price from ₩4,900 (~$3.5)',
    hero_note: 'Market research · Competitor analysis · Startup validation · Purchase comparison · Due diligence · Academic background',
    how_h2: 'Not a human — <em>an agent with its own wallet</em> does the work',
    how_1t: 'Order', how_1p: 'Describe your topic and requirements; the agent drafts a research plan.',
    how_2t: 'Autonomous research', how_2p: 'It searches and cross-checks the web per sub-question. When paid data is needed, <strong>the agent pays from its own USDC wallet</strong> — within spending caps and an allowlist.',
    how_3t: 'Report delivery', how_3p: 'A report with executive summary, KPI cards, charts, and full source list arrives by email.',
    pricing_h2: 'Pricing', pricing_note: 'Research starts after payment confirmation. One free revision if the result misses the brief.',
    order_h2: 'Place an order',
    f_topic: 'Research topic *', f_topic_ph: 'e.g. Korea unmanned photo-studio market size and key players, 2026',
    f_brief: 'Details (optional)', f_brief_ph: 'What you want to learn, intended use, must-have items',
    f_tier: 'Plan *', f_lang: 'Report language', f_email: 'Email for delivery *', f_pay: 'Payment method', f_submit: 'Submit order',
    st_h2: 'Track order', st_ph: 'Order ID (e.g. 3f2a9c1b)', st_btn: 'Check',
    faq_1q: 'How long does it take?', faq_1a: 'Light usually ships within hours, 24h at most. Standard within 48h, Deep within 72h — typically much faster.',
    faq_2q: 'What if the quality disappoints?', faq_2a: 'One free revision if the report misses your brief. Full refund before research starts. See Terms for details.',
    faq_3q: 'Can I trust the sources?', faq_3a: 'Every report lists all consulted sources (usually dozens to hundreds of links). Figures carry their year; unverifiable claims are marked as such.',
    faq_4q: 'Do you write reports in English?', faq_4a: 'Yes — choose English as the report language when ordering.',
    faq_5q: 'What does "the agent pays" mean?', faq_5a: 'When research needs paid data, the AI agent pays from its own USDC wallet — only within spending caps and a service allowlist. Every payment is recorded on-chain and linked at the bottom of your report.',
    ft_stack: 'Gemini-powered research agent · Runs on Google Cloud · Agent wallet on Circle USDC (spend caps + allowlist)',
    ft_terms: 'Terms & refunds', ft_privacy: 'Privacy policy', ft_contact: 'Contact: psh0825@gmail.com',
    tier_desc: { light: 'Quick comparison & validation. Essentials fast.', standard: 'Market & competitor analysis grade. Most popular.', deep: 'Decision-grade deep dive + recommendations.' },
    tier_pages: { light: 'A4 7–8 pages', standard: 'A4 10–13 pages', deep: 'A4 20+ pages · with charts' },
    tier_opt: (t, l) => `${l} — ₩${t.krw.toLocaleString()} (~$${t.usd})`,
    hours: (h) => `delivered within ${h}h`, popular: 'Popular', sale: 'Launch 50%',
    pay_opts: [['toss', 'Card (Toss Payments)'], ['paypal', 'PayPal'], ['usdc', 'USDC']],
    tier_labels: { light: 'Light', standard: 'Standard', deep: 'Deep' },
    status: { awaiting_payment: 'Awaiting payment', paid: 'Paid — starting soon', queued: 'Queued — starting soon', running: 'Research in progress', done: 'Done', failed: 'Failed — please contact us', refunded: 'Refunded' },
    msg_created: (id) => `✅ Order received! Order ID: <span class="oid">${esc(id)}</span>`,
    msg_next: 'Research starts once payment is confirmed; the report link will be emailed to you.',
    msg_track: 'Track progress in "Track order" below.',
    msg_paypal: (h, usd) => `<a href="https://paypal.me/${esc(h)}/${usd}" target="_blank" rel="noopener">Pay $${usd} via PayPal</a>`,
    msg_usdc: (chain, usd, addr) => `USDC (${esc(chain)}) <strong>$${usd}</strong> → <code>${esc(addr)}</code>`,
    msg_toss: (tid, krw) => `Send ₩${krw.toLocaleString()} to Toss ID <strong>${esc(tid)}</strong>`,
    msg_mail: 'Payment instructions will be emailed to you.',
    open_report: '📄 Open report', autorefresh: '⟳ auto-refreshing',
  },
};

let LANG = localStorage.getItem('dd-lang') || ((navigator.language || 'ko').startsWith('ko') ? 'ko' : 'en');
const T = () => I18N[LANG];

function applyLang() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = T()[el.dataset.i18n];
    if (typeof v === 'string') el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = T()[el.dataset.i18nPh];
    if (typeof v === 'string') el.placeholder = v;
  });
  $('#lang-btn').textContent = LANG === 'ko' ? 'EN' : '한국어';
  renderTiers();
}

$('#lang-btn').addEventListener('click', () => {
  LANG = LANG === 'ko' ? 'en' : 'ko';
  localStorage.setItem('dd-lang', LANG);
  applyLang();
});

// ---------- 요금/결제수단 렌더 ----------
function renderTiers() {
  if (!CONFIG) return;
  const t = T();
  $('#tier-cards').innerHTML = Object.entries(CONFIG.tiers)
    .map(([key, tier]) => `
      <div class="card">
        ${key === 'standard' ? `<span class="tag">${t.popular}</span> ` : ''}<span class="tag sale">${t.sale}</span>
        <h3>${t.tier_labels[key] || esc(tier.label)}</h3>
        <div class="price">₩${tier.krw.toLocaleString()} <small><s>₩${tier.krwOrig.toLocaleString()}</s> / $${tier.usd} USDC</small></div>
        <p>${t.tier_desc[key] || ''}</p>
        <p>${t.tier_pages[key] || esc(tier.pages)} · ${t.hours(tier.hours)}</p>
      </div>`)
    .join('');
  const tierSel = $('#tier-select');
  const keep = tierSel.value;
  tierSel.innerHTML = Object.entries(CONFIG.tiers)
    .map(([key, tier]) => `<option value="${key}">${t.tier_opt(tier, t.tier_labels[key] || tier.label)}</option>`)
    .join('');
  if (keep) tierSel.value = keep;
  const paySel = $('#pay-select');
  const keepPay = paySel.value;
  paySel.innerHTML = t.pay_opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  if (keepPay) paySel.value = keepPay;
}

async function loadConfig() {
  try {
    CONFIG = await (await fetch('/api/config')).json();
  } catch {
    CONFIG = null;
  }
  applyLang();
}

// ---------- 주문 ----------
$('#order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button');
  btn.disabled = true;
  const body = Object.fromEntries(new FormData(form).entries());
  const box = $('#order-result');
  box.hidden = false;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'failed');
    if (body.payMethod === 'toss') {
      location.href = `/pay/${data.id}`;
      return;
    }
    const t = T();
    const tier = CONFIG?.tiers?.[body.tier];
    const payLines = [];
    if (body.payMethod === 'paypal' && CONFIG?.pay?.paypalMe) payLines.push(t.msg_paypal(CONFIG.pay.paypalMe, tier.usd));
    if (body.payMethod === 'usdc' && CONFIG?.pay?.usdcAddress) payLines.push(t.msg_usdc(CONFIG.pay.usdcChain, tier.usd, CONFIG.pay.usdcAddress));
    if (payLines.length === 0 && CONFIG?.pay?.tossId) payLines.push(t.msg_toss(CONFIG.pay.tossId, tier.krw));
    if (payLines.length === 0) payLines.push(t.msg_mail);
    box.innerHTML = `<p>${t.msg_created(data.id)}</p><p>${t.msg_next}</p><p>${payLines.join('<br>')}</p><p>${t.msg_track}</p>`;
    form.reset();
  } catch (err) {
    box.innerHTML = `<p class="err">⚠️ ${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- 주문 조회 (진행 중이면 5초마다 자동 갱신) ----------
async function lookupOrder(id, { silent } = {}) {
  const box = $('#status-result');
  if (!id) return;
  box.hidden = false;
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'failed');
    const t = T();
    box.innerHTML = `
      <p><strong>${esc(data.topic)}</strong></p>
      <p>${LANG === 'ko' ? '상태' : 'Status'}: <strong>${t.status[data.status] || esc(data.status)}</strong>${['paid', 'queued', 'running', 'awaiting_payment'].includes(data.status) ? ` <span class="spin">${t.autorefresh}</span>` : ''}</p>
      ${data.progress.map((p) => `<p>· ${esc(p.message)}</p>`).join('')}
      ${data.reportPath ? `<p><a href="${esc(data.reportPath)}" target="_blank" rel="noopener"><strong>${t.open_report}</strong></a></p>` : ''}`;
    clearInterval(pollTimer);
    if (['paid', 'queued', 'running', 'awaiting_payment'].includes(data.status)) {
      pollTimer = setInterval(() => lookupOrder(id, { silent: true }), 5000);
    }
  } catch (err) {
    if (!silent) box.innerHTML = `<p class="err">⚠️ ${esc(err.message)}</p>`;
  }
}

$('#status-btn').addEventListener('click', () => {
  clearInterval(pollTimer);
  lookupOrder($('#status-id').value.trim());
});

loadConfig().then(() => {
  const orderId = new URLSearchParams(location.search).get('order');
  if (orderId) {
    $('#status-id').value = orderId;
    lookupOrder(orderId);
    document.querySelector('.status').scrollIntoView({ behavior: 'smooth' });
  }
});
